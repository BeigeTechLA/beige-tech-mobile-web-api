const { google } = require('googleapis');

// --- DEBUG LOGS ---
console.log("--- GOOGLE SHEETS AUTH DEBUG ---");
console.log("SHEET_ID exists:", !!process.env.GOOGLE_SHEET_ID);
console.log("EMAIL exists:", !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
console.log("EMAIL value:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

const rawKey = process.env.GOOGLE_PRIVATE_KEY;
console.log("PRIVATE_KEY exists:", !!rawKey);

if (rawKey) {
  console.log("Key Length:", rawKey.length);
  console.log("Key Starts with:", rawKey.substring(0, 30));
  console.log("Key Ends with:", rawKey.substring(rawKey.length - 30));
  console.log("Contains \\n (escaped):", rawKey.includes('\\n'));
}
console.log("---------------------------------");

// Format the key correctly
const formattedKey = rawKey ? rawKey.replace(/\\n/g, '\n') : undefined;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: formattedKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

async function appendToSheet(dataArray) {
  try {
    console.log("Attempting to append data to sheet...");
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:Z',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [dataArray] },
    });
    console.log("Successfully appended to sheet!");
    return response;
  } catch (error) {
    console.error("--- SHEETS APPEND ERROR DETAIL ---");
    console.error("Message:", error.message);
    if (error.message.includes("DECODER")) {
      console.error("CRITICAL: Your private key format is still invalid.");
    }
    throw error;
  }
}

async function updateSheetRow(crew_member_id, updatedDataMap) {
  try {
    console.log(`Searching for Row ID: ${crew_member_id}`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:A',
    });
    const rows = response.data.values;
    if (!rows) {
      console.log("Sheet is empty.");
      return;
    }

    const rowIndex = rows.findIndex(row => row[0] == crew_member_id);
    if (rowIndex === -1) {
      console.log("Crew Member ID not found in sheet.");
      return;
    }

    const rowNum = rowIndex + 1;
    for (const [column, value] of Object.entries(updatedDataMap)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!${column}${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[value]] },
      });
    }
    console.log("Successfully updated sheet row!");
  } catch (error) {
    console.error("--- SHEETS UPDATE ERROR DETAIL ---");
    console.error(error.message);
    throw error;
  }
}

module.exports = { appendToSheet, updateSheetRow };