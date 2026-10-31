const db = require('../models');
const accountDeletionRequestService = require('./account-deletion-request.service')({ db });

const INTERVAL_MS = 15 * 60 * 1000;

async function runExpirationCheck() {
  try {
    const result = await accountDeletionRequestService.processDueRequests();
    if (result.completed || result.failed) {
      console.log(`[Account Deletion] Completed ${result.completed} accepted request(s); marked ${result.failed} unaccepted request(s) failed.`);
    }
  } catch (error) {
    console.error('[Account Deletion] Expiration check failed:', error.message);
  }
}

function startAccountDeletionExpirationJob() {
  void runExpirationCheck();
  setInterval(() => void runExpirationCheck(), INTERVAL_MS);
  console.log('[Account Deletion] Expiration job started (15-minute interval).');
}

module.exports = { startAccountDeletionExpirationJob };
