const { google } = require('googleapis');

// --- AUTH SETUP ---
let rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
  rawKey = rawKey.substring(1, rawKey.length - 1);
}
const formattedKey = rawKey.replace(/\\n/g, '\n');

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: formattedKey,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEET_ID;

/**
 * HELPER: Find the internal numerical ID of a tab by its name
 */
async function getSheetIdByName(tabName) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === tabName);
  return sheet ? sheet.properties.sheetId : null;
}

async function appendToSheet(tabName, dataArray) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [dataArray] },
    });
    console.log(`Successfully appended to ${tabName}`);
  } catch (error) { console.error("Append Error:", error.message); throw error; }
}

async function updateSheetRow(tabName, id, updatedDataMap) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    });
    const rows = response.data.values;
    if (!rows) return;
    const rowIndex = rows.findIndex(row => row[0] == id);
    if (rowIndex === -1) return;

    const rowNum = rowIndex + 1;
    for (const [column, value] of Object.entries(updatedDataMap)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!${column}${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[value]] },
      });
    }
    console.log(`Successfully updated row in ${tabName}`);
  } catch (error) { console.error("Update Error:", error.message); throw error; }
}

/**
 * DELETE A ROW BY ID
 * @param {string} tabName - Tab name
 * @param {string|number} id - ID to find in Column A
 */
async function deleteSheetRow(tabName, id) {
  try {
    // 1. Find the row index
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:A`,
    });
    const rows = response.data.values;
    if (!rows) return;
    const rowIndex = rows.findIndex(row => row[0] == id);
    if (rowIndex === -1) return;

    // 2. Get the numerical sheet ID
    const internalSheetId = await getSheetIdByName(tabName);
    if (internalSheetId === null) throw new Error("Sheet Tab not found");

    // 3. Delete the row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: internalSheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });
    console.log(`Successfully deleted ID ${id} from ${tabName}`);
  } catch (error) {
    console.error("Delete Error:", error.message);
    throw error;
  }
}

module.exports = { appendToSheet, updateSheetRow, deleteSheetRow };