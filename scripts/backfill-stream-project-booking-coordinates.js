const fs = require('fs');
const path = require('path');
const https = require('https');
const models = require('../src/models');
const { Op } = require('sequelize');
const { parseLocation } = require('../src/utils/locationHelpers');

const { stream_project_booking: StreamProjectBooking } = models;

async function findRecoverableLocation(bookingId) {
  const formSubmission = await models.project_form_submissions.findOne({
    where: {
      project_id: bookingId,
      is_active: 1,
      location_address: { [Op.ne]: null },
    },
    attributes: ['location_address'],
    order: [['created_at', 'DESC']],
    raw: true,
  });
  const formLocation = String(formSubmission?.location_address || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (formLocation) return { location: formLocation, source: 'project_form' };

  const lead = await models.sales_leads.findOne({
    where: { booking_id: bookingId },
    attributes: ['lead_id'],
    order: [['lead_id', 'DESC']],
    raw: true,
  });
  if (!lead?.lead_id) return null;

  const quote = await models.sales_quotes.findOne({
    where: {
      lead_id: lead.lead_id,
      client_address: { [Op.ne]: null },
    },
    attributes: ['client_address'],
    order: [['sales_quote_id', 'DESC']],
    raw: true,
  });
  const quoteLocation = String(quote?.client_address || '').trim();
  return quoteLocation ? { location: quoteLocation, source: 'sales_quote' } : null;
}

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

function resolveLocation(locationValue) {
  const rawLocation = typeof locationValue === 'string' ? locationValue.trim() : '';
  const coordinateMatch = rawLocation.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1]);
    const longitude = Number(coordinateMatch[2]);

    if (isValidCoordinate(latitude, longitude)) {
      return {
        address: rawLocation,
        coordinates: { latitude, longitude },
        source: 'coordinate_string',
      };
    }
  }

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

async function backfillBookingCoordinates({ dryRun, limit, offset }) {
  const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MAPBOX_ACCESS_TOKEN (or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) in environment.');
  }

  const where = {
    [Op.and]: [
      {
        [Op.or]: [
          { event_latitude: null },
          { event_longitude: null },
        ],
      },
      {
        [Op.or]: [
          { event_location: { [Op.ne]: null } },
          { is_draft: false },
        ],
      },
    ],
  };

  const queryOptions = {
    where,
    attributes: [
      'stream_project_booking_id',
      'project_name',
      'event_location',
      'event_latitude',
      'event_longitude',
      'is_draft',
    ],
    order: [['stream_project_booking_id', 'ASC']],
    raw: true,
    offset,
  };

  if (limit) {
    queryOptions.limit = limit;
  }

  const bookings = await StreamProjectBooking.findAll(queryOptions);

  const stats = {
    scanned: bookings.length,
    alreadyHadCoordsInLocationPayload: 0,
    recoveredLocation: 0,
    geocodedSuccess: 0,
    updated: 0,
    skippedNoAddress: 0,
    failedGeocode: 0,
    failedUpdate: 0,
  };

  const failures = [];
  const txn = dryRun ? null : await models.sequelize.transaction();

  try {
    for (const row of bookings) {
      const recoveredLocation = row.event_location
        ? null
        : await findRecoverableLocation(row.stream_project_booking_id);
      const location = row.event_location || recoveredLocation?.location || null;
      const resolved = resolveLocation(location);

      if (!resolved) {
        stats.skippedNoAddress += 1;
        failures.push({
          stream_project_booking_id: row.stream_project_booking_id,
          reason: 'missing_or_invalid_location',
          event_location: location,
        });
        continue;
      }

      let latitude = null;
      let longitude = null;
      let source = recoveredLocation?.source || resolved.source;

      if (recoveredLocation) {
        stats.recoveredLocation += 1;
      }

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
              stream_project_booking_id: row.stream_project_booking_id,
              reason: 'geocode_not_found',
              event_location: location,
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
            stream_project_booking_id: row.stream_project_booking_id,
            reason: 'geocode_error',
            error: error.message,
            event_location: location,
            address: resolved.address,
          });
          continue;
        }
      }

      if (!isValidCoordinate(latitude, longitude)) {
        stats.failedGeocode += 1;
        failures.push({
          stream_project_booking_id: row.stream_project_booking_id,
          reason: 'invalid_coordinates',
          event_location: location,
          latitude,
          longitude,
        });
        continue;
      }

      const nextLatitude = row.event_latitude ?? latitude;
      const nextLongitude = row.event_longitude ?? longitude;

      if (!dryRun) {
        try {
          await StreamProjectBooking.update(
            {
              ...(recoveredLocation ? { event_location: recoveredLocation.location } : {}),
              event_latitude: nextLatitude,
              event_longitude: nextLongitude,
            },
            {
              where: { stream_project_booking_id: row.stream_project_booking_id },
              transaction: txn,
            }
          );
        } catch (error) {
          stats.failedUpdate += 1;
          failures.push({
            stream_project_booking_id: row.stream_project_booking_id,
            reason: 'update_error',
            error: error.message,
            event_location: location,
          });
          continue;
        }
      }

      stats.updated += 1;
      console.log(
        `[${dryRun ? 'DRY-RUN' : 'UPDATED'}] stream_project_booking_id=${row.stream_project_booking_id} lat=${nextLatitude} lng=${nextLongitude} source=${source}`
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
    `booking-coordinate-backfill-failures-${Date.now()}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2), 'utf8');

  return { stats, reportPath };
}

async function main() {
  const { dryRun, limit, offset } = parseArgs();

  try {
    console.log(`Starting stream_project_booking coordinate backfill ${dryRun ? '(dry-run)' : '(apply mode)'}...`);
    await models.sequelize.authenticate();
    console.log('Database connection established.');

    const { stats, reportPath } = await backfillBookingCoordinates({ dryRun, limit, offset });

    console.log('\nBackfill summary:');
    console.log(JSON.stringify(stats, null, 2));
    console.log(`Failures report: ${reportPath}`);
    console.log('\nDone.');
  } catch (error) {
    console.error('Backfill failed:', error.message);
    process.exitCode = 1;
  } finally {
    await models.sequelize.close();
  }
}

main();
