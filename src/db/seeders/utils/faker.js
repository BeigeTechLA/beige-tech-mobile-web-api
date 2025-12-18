/**
 * Data generation utilities for database seeding
 * Provides realistic test data for revure-v2-backend
 */

// US Cities with coordinates for geographic distribution
const US_CITIES = [
  // NYC area (25%)
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.0060 },
  { city: 'Brooklyn', state: 'NY', lat: 40.6782, lng: -73.9442 },
  { city: 'Queens', state: 'NY', lat: 40.7282, lng: -73.7949 },
  { city: 'Manhattan', state: 'NY', lat: 40.7831, lng: -73.9712 },
  { city: 'Bronx', state: 'NY', lat: 40.8448, lng: -73.8648 },

  // LA area (20%)
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'Santa Monica', state: 'CA', lat: 34.0195, lng: -118.4912 },
  { city: 'Pasadena', state: 'CA', lat: 34.1478, lng: -118.1445 },
  { city: 'Burbank', state: 'CA', lat: 34.1808, lng: -118.3090 },

  // Chicago area (15%)
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Evanston', state: 'IL', lat: 42.0451, lng: -87.6877 },
  { city: 'Oak Park', state: 'IL', lat: 41.8850, lng: -87.7845 },

  // Austin area (10%)
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Round Rock', state: 'TX', lat: 30.5083, lng: -97.6789 },

  // Others (30%)
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { city: 'Atlanta', state: 'GA', lat: 33.7490, lng: -84.3880 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { city: 'Portland', state: 'OR', lat: 45.5152, lng: -122.6784 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
  { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.0740 }
];

// First names pool
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Cameron',
  'Sarah', 'Michael', 'Emma', 'David', 'Jessica', 'James', 'Emily', 'Daniel',
  'Sophia', 'Matthew', 'Isabella', 'Christopher', 'Olivia', 'Andrew', 'Ava', 'Joshua',
  'Mia', 'Ryan', 'Charlotte', 'Nicholas', 'Amelia', 'Brandon', 'Harper', 'Tyler',
  'Evelyn', 'Kevin', 'Abigail', 'Justin', 'Ella', 'Nathan', 'Aria', 'Aaron',
  'Luna', 'Dylan', 'Grace', 'Logan', 'Chloe', 'Ethan', 'Victoria', 'Lucas'
];

// Last names pool
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris',
  'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright',
  'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson',
  'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez'
];

// Company name components
const COMPANY_PREFIXES = [
  'Global', 'Prime', 'Next', 'Digital', 'Smart', 'Blue', 'Red', 'Green',
  'Elite', 'Pro', 'Peak', 'Summit', 'Apex', 'Metro', 'Urban', 'Bright'
];

const COMPANY_SUFFIXES = [
  'Media', 'Productions', 'Studios', 'Group', 'Creative', 'Agency',
  'Films', 'Entertainment', 'Content', 'Digital', 'Collective', 'Lab'
];

// Street name components
const STREET_NAMES = [
  'Main', 'Oak', 'Maple', 'Park', 'Washington', 'Madison', 'Broadway',
  'Market', 'Church', 'Spring', 'Elm', 'Pine', 'Cedar', 'First', 'Second'
];

const STREET_TYPES = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Way', 'Rd', 'Pl'];

/**
 * Random number utilities
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
  const num = Math.random() * (max - min) + min;
  return Number(num.toFixed(decimals));
}

function randomElement(array) {
  return array[randomInt(0, array.length - 1)];
}

function randomElements(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Name generation
 */
function generateFirstName() {
  return randomElement(FIRST_NAMES);
}

function generateLastName() {
  return randomElement(LAST_NAMES);
}

function generateFullName() {
  return `${generateFirstName()} ${generateLastName()}`;
}

/**
 * Contact generation
 */
function generateEmail(firstName, lastName, domain = null) {
  const domains = domain ? [domain] : ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com'];
  const selectedDomain = randomElement(domains);
  const separator = randomElement(['.', '_', '']);
  const number = Math.random() > 0.7 ? randomInt(1, 99) : '';

  return `${firstName.toLowerCase()}${separator}${lastName.toLowerCase()}${number}@${selectedDomain}`;
}

function generatePhoneNumber() {
  const areaCodes = ['212', '310', '312', '512', '305', '404', '206', '503', '720', '615', '617', '415', '267', '602'];
  const areaCode = randomElement(areaCodes);
  const prefix = randomInt(200, 999);
  const lineNumber = randomInt(1000, 9999);

  return `${areaCode}-${prefix}-${lineNumber}`;
}

/**
 * Location generation
 */
function generateCity() {
  return randomElement(US_CITIES);
}

function generateAddress(cityData = null) {
  const city = cityData || generateCity();
  const streetNumber = randomInt(1, 9999);
  const streetName = randomElement(STREET_NAMES);
  const streetType = randomElement(STREET_TYPES);

  return {
    address: `${streetNumber} ${streetName} ${streetType}`,
    city: city.city,
    state: city.state,
    lat: city.lat + randomFloat(-0.05, 0.05, 4),
    lng: city.lng + randomFloat(-0.05, 0.05, 4)
  };
}

function generateMapboxLocation(cityData = null) {
  const location = generateAddress(cityData);
  return JSON.stringify({
    lat: location.lat,
    lng: location.lng,
    address: `${location.address}, ${location.city}, ${location.state}`
  });
}

/**
 * Company generation
 */
function generateCompanyName() {
  if (Math.random() > 0.5) {
    return `${randomElement(COMPANY_PREFIXES)} ${randomElement(COMPANY_SUFFIXES)}`;
  } else {
    return `${randomElement(LAST_NAMES)} ${randomElement(COMPANY_SUFFIXES)}`;
  }
}

/**
 * Instagram handle generation
 */
function generateInstagramHandle(firstName, lastName) {
  const styles = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}.creates`,
    `${firstName.toLowerCase()}_films`,
    `${firstName.toLowerCase()}.visuals`
  ];

  const handle = randomElement(styles);
  const number = Math.random() > 0.7 ? randomInt(1, 999) : '';
  return `@${handle}${number}`;
}

/**
 * Date utilities
 */
function generateDateRange(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const randomTime = start + Math.random() * (end - start);
  return new Date(randomTime);
}

function generatePastDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(1, daysAgo));
  return date;
}

function generateFutureDate(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + randomInt(1, daysAhead));
  return date;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Text generation
 */
function generateBio(role = 'creator') {
  const bios = {
    creator: [
      'Passionate filmmaker with years of experience in live streaming and event coverage.',
      'Creative professional specializing in multi-camera setups and live production.',
      'Experienced videographer focused on delivering high-quality streaming content.',
      'Technical director with expertise in broadcast technology and live events.',
      'Visual storyteller dedicated to creating engaging live stream experiences.'
    ],
    client: [
      'Building innovative digital experiences for modern audiences.',
      'Creating memorable events that connect and inspire.',
      'Focused on high-quality content production and brand storytelling.',
      'Delivering exceptional live streaming solutions for corporate events.'
    ]
  };

  return randomElement(bios[role] || bios.creator);
}

/**
 * Export all utilities
 */
module.exports = {
  // Random utilities
  randomInt,
  randomFloat,
  randomElement,
  randomElements,

  // Name generation
  generateFirstName,
  generateLastName,
  generateFullName,

  // Contact generation
  generateEmail,
  generatePhoneNumber,

  // Location generation
  generateCity,
  generateAddress,
  generateMapboxLocation,
  US_CITIES,

  // Company generation
  generateCompanyName,

  // Instagram generation
  generateInstagramHandle,

  // Date utilities
  generateDateRange,
  generatePastDate,
  generateFutureDate,
  formatDate,

  // Text generation
  generateBio
};
