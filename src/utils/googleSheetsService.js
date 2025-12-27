const { google } = require('googleapis');

/**
 * Google Sheets Service for appending investor data
 * 
 * Setup Instructions:
 * 1. Create a Google Cloud project at https://console.cloud.google.com/
 * 2. Enable the Google Sheets API
 * 3. Create a Service Account and download the JSON credentials
 * 4. Share your target spreadsheet with the service account email (found in credentials JSON)
 * 5. Set the following environment variables:
 *    - GOOGLE_SHEETS_CREDENTIALS: Base64-encoded JSON credentials OR path to credentials file
 *    - INVESTOR_SPREADSHEET_ID: The ID from your Google Sheet URL
 *    - INVESTOR_SHEET_NAME: (optional) Sheet tab name, defaults to 'Investors'
 */

let sheetsClient = null;

/**
 * Initialize the Google Sheets client
 * @returns {Object|null} Google Sheets API client or null if not configured
 */
const initSheetsClient = async () => {
  if (sheetsClient) return sheetsClient;

  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
  
  if (!credentials) {
    console.log('Google Sheets: GOOGLE_SHEETS_CREDENTIALS not set, skipping integration');
    return null;
  }

  try {
    let credentialsJson;
    
    // Check if it's base64-encoded JSON or a file path
    if (credentials.startsWith('{')) {
      // Direct JSON string
      credentialsJson = JSON.parse(credentials);
    } else if (credentials.includes('.json')) {
      // File path
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(credentials);
      credentialsJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      // Base64-encoded
      credentialsJson = JSON.parse(Buffer.from(credentials, 'base64').toString('utf8'));
    }

    const auth = new google.auth.GoogleAuth({
      credentials: credentialsJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('Google Sheets: Client initialized successfully');
    return sheetsClient;
  } catch (error) {
    console.error('Google Sheets: Failed to initialize client:', error.message);
    return null;
  }
};

/**
 * Append investor data to Google Sheets
 * @param {Object} investorData - Investor form data
 * @returns {Object} Result object with success status
 */
const appendInvestorToSheet = async (investorData) => {
  const spreadsheetId = process.env.INVESTOR_SPREADSHEET_ID;
  const sheetName = process.env.INVESTOR_SHEET_NAME || 'Investors';

  if (!spreadsheetId) {
    console.log('Google Sheets: INVESTOR_SPREADSHEET_ID not set, skipping');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const sheets = await initSheetsClient();
    
    if (!sheets) {
      return { success: false, reason: 'client_not_initialized' };
    }

    // Format the row data
    const timestamp = new Date().toISOString();
    const rowData = [
      timestamp,
      investorData.firstName || '',
      investorData.lastName || '',
      investorData.email || '',
      investorData.phoneNumber || '',
      investorData.country || '',
      investorData.investmentRounds || '',
      investorData.investmentTiming || '',
      investorData.investmentAmount || '',
      'pending', // status
    ];

    // Append the row to the sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:J`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowData],
      },
    });

    console.log('Google Sheets: Row appended successfully', {
      updatedRange: response.data.updates?.updatedRange,
      updatedRows: response.data.updates?.updatedRows,
    });

    return { success: true, updatedRange: response.data.updates?.updatedRange };
  } catch (error) {
    console.error('Google Sheets: Failed to append row:', error.message);
    return { success: false, reason: 'api_error', error: error.message };
  }
};

/**
 * Create headers in the sheet if they don't exist
 * Call this once during setup
 */
const ensureSheetHeaders = async () => {
  const spreadsheetId = process.env.INVESTOR_SPREADSHEET_ID;
  const sheetName = process.env.INVESTOR_SHEET_NAME || 'Investors';

  if (!spreadsheetId) {
    console.log('Google Sheets: INVESTOR_SPREADSHEET_ID not set');
    return { success: false };
  }

  try {
    const sheets = await initSheetsClient();
    
    if (!sheets) {
      return { success: false };
    }

    // Check if headers already exist
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:J1`,
    });

    if (existingData.data.values && existingData.data.values.length > 0) {
      console.log('Google Sheets: Headers already exist');
      return { success: true, message: 'headers_exist' };
    }

    // Add headers
    const headers = [
      'Timestamp',
      'First Name',
      'Last Name',
      'Email',
      'Phone Number',
      'Country',
      'Investment Rounds',
      'Investment Timing',
      'Investment Amount',
      'Status',
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:J1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log('Google Sheets: Headers created successfully');
    return { success: true, message: 'headers_created' };
  } catch (error) {
    console.error('Google Sheets: Failed to set headers:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Append booking data to Google Sheets
 * @param {Object} bookingData - Booking data from guest booking creation
 * @returns {Object} Result object with success status
 */
const appendBookingToSheet = async (bookingData) => {
  const spreadsheetId = process.env.BOOKING_SPREADSHEET_ID;
  const sheetName = process.env.BOOKING_SHEET_NAME || 'Bookings';

  if (!spreadsheetId) {
    console.log('Google Sheets: BOOKING_SPREADSHEET_ID not set, skipping booking sync');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const sheets = await initSheetsClient();
    
    if (!sheets) {
      return { success: false, reason: 'client_not_initialized' };
    }

    // Format the row data
    const timestamp = new Date().toISOString();
    
    // Parse location if it's JSON
    let locationDisplay = bookingData.event_location || '';
    if (locationDisplay && typeof locationDisplay === 'string') {
      try {
        const locationObj = JSON.parse(locationDisplay);
        locationDisplay = locationObj.place_name || locationObj.text || locationDisplay;
      } catch (e) {
        // Not JSON, use as-is
      }
    }

    const rowData = [
      timestamp,
      bookingData.stream_project_booking_id || bookingData.booking_id || '',
      bookingData.project_name || '',
      bookingData.guest_email || '',
      bookingData.event_type || '',
      bookingData.event_date || '',
      locationDisplay,
      bookingData.budget || '',
      bookingData.crew_size_needed || '',
      bookingData.skills_needed || '',
      bookingData.description || '',
      bookingData.is_draft ? 'Draft' : 'Active',
    ];

    // Append the row to the sheet
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:L`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowData],
      },
    });

    console.log('Google Sheets: Booking row appended successfully', {
      bookingId: bookingData.stream_project_booking_id || bookingData.booking_id,
      updatedRange: response.data.updates?.updatedRange,
    });

    return { success: true, updatedRange: response.data.updates?.updatedRange };
  } catch (error) {
    console.error('Google Sheets: Failed to append booking row:', error.message);
    return { success: false, reason: 'api_error', error: error.message };
  }
};

/**
 * Create booking sheet headers if they don't exist
 * Call this once during setup
 */
const ensureBookingSheetHeaders = async () => {
  const spreadsheetId = process.env.BOOKING_SPREADSHEET_ID;
  const sheetName = process.env.BOOKING_SHEET_NAME || 'Bookings';

  if (!spreadsheetId) {
    console.log('Google Sheets: BOOKING_SPREADSHEET_ID not set');
    return { success: false };
  }

  try {
    const sheets = await initSheetsClient();
    
    if (!sheets) {
      return { success: false };
    }

    // Check if headers already exist
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
    });

    if (existingData.data.values && existingData.data.values.length > 0) {
      console.log('Google Sheets: Booking headers already exist');
      return { success: true, message: 'headers_exist' };
    }

    // Add headers
    const headers = [
      'Timestamp',
      'Booking ID',
      'Project Name',
      'Guest Email',
      'Event Type',
      'Event Date',
      'Location',
      'Budget',
      'Crew Size',
      'Content Types',
      'Description',
      'Status',
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [headers],
      },
    });

    console.log('Google Sheets: Booking headers created successfully');
    return { success: true, message: 'headers_created' };
  } catch (error) {
    console.error('Google Sheets: Failed to set booking headers:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  appendInvestorToSheet,
  appendBookingToSheet,
  ensureSheetHeaders,
  ensureBookingSheetHeaders,
  initSheetsClient,
};

