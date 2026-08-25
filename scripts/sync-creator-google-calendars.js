require('dotenv').config();

const db = require('../src/models');
const { syncGoogleBusyBlocks } = require('../src/services/creator-calendar.service');
const { Op } = require('sequelize');

const run = async () => {
  const connections = await db.creator_calendar_connections.findAll({
    where: {
      provider: 'google',
      disconnected_at: { [Op.is]: null },
      sync_status: { [Op.ne]: 'revoked' },
    },
    attributes: ['crew_member_id'],
  });

  let successCount = 0;
  let failureCount = 0;

  for (const connection of connections) {
    try {
      const result = await syncGoogleBusyBlocks(connection.crew_member_id);
      successCount += 1;
      console.log(
        `Synced crew_member_id=${connection.crew_member_id}, imported_blocks=${result.imported_blocks}`
      );
    } catch (error) {
      failureCount += 1;
      console.error(
        `Failed to sync crew_member_id=${connection.crew_member_id}: ${error.message}`
      );
    }
  }

  console.log(
    `Google Calendar sync complete. success=${successCount}, failed=${failureCount}`
  );
};

run()
  .then(() => db.sequelize.close())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('Google Calendar sync job failed:', error);
    await db.sequelize.close();
    process.exit(1);
  });
