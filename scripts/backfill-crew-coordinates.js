const fs = require('fs');
const path = require('path');
const https = require('https');
const models = require('../src/models');
const { Op } = require('sequelize');
const { parseLocation } = require('../src/utils/locationHelpers');

const { crew_members: CrewMember } = models;

function parseArgs() {
  const args = process.argv.slice(2);

  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const offsetArg = args.find((arg) => arg.startsWith('--offset='));

  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  const offset = offsetArg ? Number(offsetArg.split('=')[1]) : 0;

  return {
    apply: args.includes('--apply'),
    dryRun: !args.includes('--apply'),
    limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
    offset: Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0,
  };
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function resolveAddress(locationValue) {
  const parsed = parseLocation(locationValue);
  if (!parsed) return null;

  const directLat = Number(parsed.lat ?? parsed.latitude);
  const directLng = Number(parsed.lng ?? parsed.longitude);
  if (isValidCoordinate(directLat, directLng)) {
    return {
      address: parsed.address || null,
      coordinates: { latitude: directLat, longitude: directLng },
      source: 'location_payload',
    };
  }

  const address = String(parsed.address || '').trim();
  if (!address) return null;

  return {
    address,
    coordinates: null,
    source: 'geocoded',
  };
}

function geocodeWithMapbox(address, token) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?limit=1&access_token=${encodeURIComponent(token)}`;

    https
      .get(url, (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            return reject(new Error(`Mapbox geocode failed (${response.statusCode})`));
          }

          try {
            const parsed = JSON.parse(body);
            const feature = parsed?.features?.[0];
            const center = feature?.center;

            if (!Array.isArray(center) || center.length < 2) {
              return resolve(null);
            }

            const longitude = Number(center[0]);
            const latitude = Number(center[1]);

            if (!isValidCoordinate(latitude, longitude)) {
              return resolve(null);
            }

            resolve({
              latitude,
              longitude,
              formattedAddress: feature?.place_name || address,
            });
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', (error) => reject(error));
  });
}

async function backfillCrewCoordinates({ dryRun, limit, offset }) {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MAPBOX_ACCESS_TOKEN (or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) in environment.');
  }

  const where = {
    is_active: 1,
    location: { [Op.ne]: null },
    [Op.or]: [
      { latitude: null },
      { longitude: null },
    ],
  };

  const queryOptions = {
    where,
    attributes: ['crew_member_id', 'first_name', 'last_name', 'email', 'location', 'latitude', 'longitude'],
    order: [['crew_member_id', 'ASC']],
    raw: true,
    offset,
  };

  if (limit) {
    queryOptions.limit = limit;
  }

  const crewRows = await CrewMember.findAll(queryOptions);

  const stats = {
    scanned: crewRows.length,
    alreadyHadCoordsInLocationPayload: 0,
    geocodedSuccess: 0,
    updated: 0,
    skippedNoAddress: 0,
    failedGeocode: 0,
    failedUpdate: 0,
  };

  const failures = [];
  const txn = dryRun ? null : await models.sequelize.transaction();

  try {
    for (const row of crewRows) {
      const resolved = resolveAddress(row.location);

      if (!resolved) {
        stats.skippedNoAddress += 1;
        failures.push({
          crew_member_id: row.crew_member_id,
          reason: 'missing_or_invalid_location',
          location: row.location,
        });
        continue;
      }

      let latitude = null;
      let longitude = null;
      let source = resolved.source;

      if (resolved.coordinates) {
        latitude = resolved.coordinates.latitude;
        longitude = resolved.coordinates.longitude;
        stats.alreadyHadCoordsInLocationPayload += 1;
      } else {
        try {
          const geocoded = await geocodeWithMapbox(resolved.address, token);
          if (!geocoded) {
            stats.failedGeocode += 1;
            failures.push({
              crew_member_id: row.crew_member_id,
              reason: 'geocode_not_found',
              location: row.location,
              address: resolved.address,
            });
            continue;
          }
          latitude = geocoded.latitude;
          longitude = geocoded.longitude;
          source = 'mapbox';
          stats.geocodedSuccess += 1;
        } catch (error) {
          stats.failedGeocode += 1;
          failures.push({
            crew_member_id: row.crew_member_id,
            reason: 'geocode_error',
            error: error.message,
            location: row.location,
            address: resolved.address,
          });
          continue;
        }
      }

      if (!isValidCoordinate(latitude, longitude)) {
        stats.failedGeocode += 1;
        failures.push({
          crew_member_id: row.crew_member_id,
          reason: 'invalid_coordinates',
          location: row.location,
          latitude,
          longitude,
        });
        continue;
      }

      if (!dryRun) {
        try {
          await CrewMember.update(
            { latitude, longitude },
            {
              where: { crew_member_id: row.crew_member_id },
              transaction: txn,
            }
          );
        } catch (error) {
          stats.failedUpdate += 1;
          failures.push({
            crew_member_id: row.crew_member_id,
            reason: 'update_error',
            error: error.message,
            location: row.location,
          });
          continue;
        }
      }

      stats.updated += 1;
      console.log(
        `[${dryRun ? 'DRY-RUN' : 'UPDATED'}] crew_member_id=${row.crew_member_id} lat=${latitude} lng=${longitude} source=${source}`
      );
    }

    if (txn) {
      await txn.commit();
    }
  } catch (error) {
    if (txn) {
      await txn.rollback();
    }
    throw error;
  }

  const reportPath = path.join(
    __dirname,
    `crew-coordinate-backfill-failures-${Date.now()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2), 'utf8');

  return { stats, reportPath };
}

async function main() {
  const { dryRun, limit, offset } = parseArgs();

  try {
    console.log(`Starting crew coordinate backfill ${dryRun ? '(dry-run)' : '(apply mode)'}...`);
    await models.sequelize.authenticate();
    console.log('Database connection established.');

    const { stats, reportPath } = await backfillCrewCoordinates({ dryRun, limit, offset });

    console.log('Backfill complete.');
    console.log('Summary:');
    console.log(`- Records scanned: ${stats.scanned}`);
    console.log(`- Coordinates found in location payload: ${stats.alreadyHadCoordsInLocationPayload}`);
    console.log(`- Geocoded successfully: ${stats.geocodedSuccess}`);
    console.log(`- ${dryRun ? 'Would update' : 'Updated'} rows: ${stats.updated}`);
    console.log(`- Skipped (no usable address): ${stats.skippedNoAddress}`);
    console.log(`- Failed geocoding: ${stats.failedGeocode}`);
    console.log(`- Failed DB updates: ${stats.failedUpdate}`);
    console.log(`- Failure report: ${reportPath}`);
    console.log(dryRun ? 'No database changes were written.' : 'Changes were committed.');
  } catch (error) {
    console.error('Crew coordinate backfill failed:', error.message);
    process.exitCode = 1;
  } finally {
    await models.sequelize.close();
  }
}

main();
