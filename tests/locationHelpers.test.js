/**
 * Location Helpers Test Suite
 * Tests for Mapbox location parsing and distance calculations
 */

const {
  parseLocation,
  calculateDistance,
  isValidCoordinate,
  filterByProximity,
  formatLocationResponse
} = require('../src/utils/locationHelpers');

describe('Location Helpers', () => {
  describe('parseLocation', () => {
    test('should parse Mapbox JSON string', () => {
      const input = '{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}';
      const result = parseLocation(input);

      expect(result).toEqual({
        lat: 34.0522,
        lng: -118.2437,
        address: 'Los Angeles, CA'
      });
    });

    test('should parse Mapbox object', () => {
      const input = { lat: 34.0522, lng: -118.2437, address: 'Los Angeles, CA' };
      const result = parseLocation(input);

      expect(result).toEqual({
        lat: 34.0522,
        lng: -118.2437,
        address: 'Los Angeles, CA'
      });
    });

    test('should handle plain string address', () => {
      const input = 'Los Angeles, CA';
      const result = parseLocation(input);

      expect(result).toEqual({
        lat: null,
        lng: null,
        address: 'Los Angeles, CA'
      });
    });

    test('should handle latitude/longitude variants', () => {
      const input = '{"latitude":34.0522,"longitude":-118.2437,"address":"LA"}';
      const result = parseLocation(input);

      expect(result.lat).toBe(34.0522);
      expect(result.lng).toBe(-118.2437);
    });

    test('should handle null/undefined', () => {
      expect(parseLocation(null)).toBeNull();
      expect(parseLocation(undefined)).toBeNull();
      expect(parseLocation('')).toBeNull();
    });

    test('should handle malformed JSON', () => {
      const input = '{"broken json}';
      const result = parseLocation(input);

      expect(result).toEqual({
        lat: null,
        lng: null,
        address: '{"broken json}'
      });
    });
  });

  describe('isValidCoordinate', () => {
    test('should validate correct coordinates', () => {
      expect(isValidCoordinate(34.0522, -118.2437)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(90, 180)).toBe(true);
      expect(isValidCoordinate(-90, -180)).toBe(true);
    });

    test('should reject invalid coordinates', () => {
      expect(isValidCoordinate(91, 0)).toBe(false); // lat > 90
      expect(isValidCoordinate(-91, 0)).toBe(false); // lat < -90
      expect(isValidCoordinate(0, 181)).toBe(false); // lng > 180
      expect(isValidCoordinate(0, -181)).toBe(false); // lng < -180
      expect(isValidCoordinate(NaN, 0)).toBe(false);
      expect(isValidCoordinate(0, NaN)).toBe(false);
      expect(isValidCoordinate('34', '118')).toBe(false); // strings
    });
  });

  describe('calculateDistance', () => {
    test('should calculate distance between Los Angeles and San Francisco', () => {
      // Los Angeles: 34.0522, -118.2437
      // San Francisco: 37.7749, -122.4194
      const distance = calculateDistance(34.0522, -118.2437, 37.7749, -122.4194);

      // Approximate distance is ~347 miles
      expect(distance).toBeGreaterThan(340);
      expect(distance).toBeLessThan(360);
    });

    test('should calculate distance between nearby points', () => {
      // Two points about 1 mile apart
      const distance = calculateDistance(34.0522, -118.2437, 34.0407, -118.2468);

      expect(distance).toBeGreaterThan(0.5);
      expect(distance).toBeLessThan(1.5);
    });

    test('should return 0 for same location', () => {
      const distance = calculateDistance(34.0522, -118.2437, 34.0522, -118.2437);
      expect(distance).toBe(0);
    });

    test('should return null for invalid coordinates', () => {
      expect(calculateDistance(999, -118.2437, 34.0522, -118.2437)).toBeNull();
      expect(calculateDistance(34.0522, -999, 34.0522, -118.2437)).toBeNull();
    });

    test('should round to 1 decimal place', () => {
      const distance = calculateDistance(34.0522, -118.2437, 34.0523, -118.2438);
      expect(distance.toString()).toMatch(/^\d+\.\d{1}$/);
    });
  });

  describe('filterByProximity', () => {
    const testItems = [
      { id: 1, name: 'Item 1', location: '{"lat":34.0522,"lng":-118.2437,"address":"LA"}' },
      { id: 2, name: 'Item 2', location: '{"lat":34.0407,"lng":-118.2468,"address":"Near LA"}' },
      { id: 3, name: 'Item 3', location: '{"lat":37.7749,"lng":-122.4194,"address":"SF"}' },
      { id: 4, name: 'Item 4', location: 'Plain string location' }
    ];

    test('should filter items by proximity', () => {
      const targetLocation = { lat: 34.0522, lng: -118.2437 };
      const result = filterByProximity(testItems, targetLocation, 10);

      // Should include items 1 and 2 (within 10 miles of LA), exclude item 3 (SF)
      expect(result.length).toBeLessThanOrEqual(2);
      expect(result[0].id).toBe(1); // Exact match should be first
    });

    test('should add distance property to items', () => {
      const targetLocation = { lat: 34.0522, lng: -118.2437 };
      const result = filterByProximity(testItems, targetLocation, 500);

      expect(result[0]).toHaveProperty('distance');
      expect(result[0]).toHaveProperty('distanceText');
      expect(result[0].distance).toBe(0); // Exact match
    });

    test('should sort by distance', () => {
      const targetLocation = { lat: 34.0522, lng: -118.2437 };
      const result = filterByProximity(testItems, targetLocation, 500);

      // Distances should be in ascending order
      for (let i = 1; i < result.length; i++) {
        if (result[i].distance !== null && result[i - 1].distance !== null) {
          expect(result[i].distance).toBeGreaterThanOrEqual(result[i - 1].distance);
        }
      }
    });

    test('should return all items when no maxDistance specified', () => {
      const targetLocation = { lat: 34.0522, lng: -118.2437 };
      const result = filterByProximity(testItems, targetLocation, null);

      expect(result.length).toBe(testItems.length);
    });

    test('should handle items without coordinates', () => {
      const targetLocation = { lat: 34.0522, lng: -118.2437 };
      const result = filterByProximity(testItems, targetLocation, 500);

      const plainStringItem = result.find(item => item.id === 4);
      expect(plainStringItem.distance).toBeNull();
      expect(plainStringItem.distanceText).toBeNull();
    });

    test('should return all items when no target location', () => {
      const result = filterByProximity(testItems, null, 10);
      expect(result.length).toBe(testItems.length);
    });
  });

  describe('formatLocationResponse', () => {
    test('should format Mapbox location with coordinates', () => {
      const input = '{"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}';
      const result = formatLocationResponse(input);

      expect(result).toEqual({
        address: 'Los Angeles, CA',
        coordinates: {
          lat: 34.0522,
          lng: -118.2437
        },
        hasCoordinates: true
      });
    });

    test('should format plain string address', () => {
      const input = 'Los Angeles, CA';
      const result = formatLocationResponse(input);

      expect(result).toEqual({
        address: 'Los Angeles, CA',
        coordinates: null,
        hasCoordinates: false
      });
    });

    test('should handle null/undefined', () => {
      const result = formatLocationResponse(null);

      expect(result).toEqual({
        address: null,
        coordinates: null,
        hasCoordinates: false
      });
    });

    test('should handle location with address but no coordinates', () => {
      const input = '{"address":"Los Angeles, CA"}';
      const result = formatLocationResponse(input);

      expect(result.address).toBe('Los Angeles, CA');
      expect(result.coordinates).toBeNull();
      expect(result.hasCoordinates).toBe(false);
    });
  });
});
