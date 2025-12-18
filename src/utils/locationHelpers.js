/**
 * Location Utilities for Mapbox Integration
 * Handles parsing of Mapbox location data and distance calculations
 */

/**
 * Parse location data from various formats
 * Supports:
 * - Mapbox JSON stringified: '{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}'
 * - Plain string addresses: "Los Angeles, CA"
 * - Already parsed objects: {lat: 34.0522, lng: -118.2437, address: "..."}
 *
 * @param {string|object} location - Location data in various formats
 * @returns {object|null} Parsed location object or null if invalid
 */
function parseLocation(location) {
  if (!location) return null;

  try {
    // If already an object, return as-is
    if (typeof location === 'object' && location !== null) {
      return location;
    }

    // Try to parse as JSON (Mapbox format)
    if (typeof location === 'string') {
      try {
        const parsed = JSON.parse(location);

        // Validate it has the expected structure
        if (parsed && typeof parsed === 'object') {
          return {
            lat: parsed.lat || parsed.latitude || null,
            lng: parsed.lng || parsed.longitude || null,
            address: parsed.address || parsed.formatted_address || location
          };
        }
      } catch (e) {
        // Not JSON, treat as plain string address
        return {
          lat: null,
          lng: null,
          address: location
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing location:', error);
    return null;
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 *
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  // Validate inputs
  if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
    return null;
  }

  const R = 3958.8; // Earth's radius in miles (use 6371 for kilometers)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Convert degrees to radians
 * @param {number} degrees
 * @returns {number}
 */
function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Validate latitude and longitude coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean}
 */
function isValidCoordinate(lat, lng) {
  return typeof lat === 'number' &&
         typeof lng === 'number' &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180 &&
         !isNaN(lat) && !isNaN(lng);
}

/**
 * Filter items by proximity to a location
 * @param {Array} items - Array of items with location field
 * @param {object} targetLocation - Target location {lat, lng}
 * @param {number} maxDistance - Maximum distance in miles
 * @param {string} locationField - Name of the location field in items (default: 'location')
 * @returns {Array} Filtered items with distance property added
 */
function filterByProximity(items, targetLocation, maxDistance = null, locationField = 'location') {
  if (!targetLocation || !targetLocation.lat || !targetLocation.lng) {
    return items; // Return all items if no valid target location
  }

  const itemsWithDistance = items.map(item => {
    const itemLocation = parseLocation(item[locationField]);

    if (itemLocation && itemLocation.lat && itemLocation.lng) {
      const distance = calculateDistance(
        targetLocation.lat,
        targetLocation.lng,
        itemLocation.lat,
        itemLocation.lng
      );

      return {
        ...item,
        distance: distance,
        distanceText: distance ? `${distance} mi` : null
      };
    }

    // If no coordinates, can't calculate distance
    return {
      ...item,
      distance: null,
      distanceText: null
    };
  });

  // Filter by max distance if specified
  let filtered = itemsWithDistance;
  if (maxDistance !== null && !isNaN(maxDistance)) {
    filtered = itemsWithDistance.filter(item =>
      item.distance !== null && item.distance <= maxDistance
    );
  }

  // Sort by distance (nulls last)
  filtered.sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });

  return filtered;
}

/**
 * Format location for API response
 * Maintains backward compatibility while adding coordinate data
 *
 * @param {string|object} location - Location data
 * @returns {object} Formatted location object
 */
function formatLocationResponse(location) {
  const parsed = parseLocation(location);

  if (!parsed) {
    return {
      address: null,
      coordinates: null,
      hasCoordinates: false
    };
  }

  return {
    address: parsed.address || null,
    coordinates: (parsed.lat && parsed.lng) ? {
      lat: parsed.lat,
      lng: parsed.lng
    } : null,
    hasCoordinates: Boolean(parsed.lat && parsed.lng)
  };
}

/**
 * Create Sequelize where clause for location-based search
 * Supports both plain text search and coordinate-based filtering
 *
 * @param {string|object} location - Location search parameter
 * @param {object} Op - Sequelize operators
 * @returns {object|null} Sequelize where clause or null
 */
function createLocationWhereClause(location, Op) {
  if (!location) return null;

  const parsed = parseLocation(location);

  // For plain text addresses, use LIKE search
  if (parsed && parsed.address && (!parsed.lat || !parsed.lng)) {
    return {
      [Op.like]: `%${parsed.address}%`
    };
  }

  // For coordinate-based search, we'll need to filter in application layer
  // since we don't have PostGIS or spatial indexes
  // Return LIKE on address as fallback
  if (parsed && parsed.address) {
    return {
      [Op.like]: `%${parsed.address}%`
    };
  }

  return null;
}

module.exports = {
  parseLocation,
  calculateDistance,
  isValidCoordinate,
  filterByProximity,
  formatLocationResponse,
  createLocationWhereClause
};
