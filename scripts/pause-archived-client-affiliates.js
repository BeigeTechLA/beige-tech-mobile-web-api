const db = require('../src/models');

async function run() {
  try {
    const archivedClients = await db.clients.findAll({
      where: {
        is_active: 0,
        user_id: {
          [db.Sequelize.Op.ne]: null
        }
      },
      attributes: ['user_id'],
      raw: true
    });

    const userIds = [...new Set(archivedClients.map((client) => Number(client.user_id)).filter(Boolean))];

    if (!userIds.length) {
      console.log(JSON.stringify({ paused_affiliate_count: 0, user_ids: [] }));
      await db.sequelize.close();
      return;
    }

    const [pausedCount] = await db.affiliates.update(
      {
        status: 'paused',
        is_active: 0
      },
      {
        where: {
          user_id: {
            [db.Sequelize.Op.in]: userIds
          }
        }
      }
    );

    console.log(JSON.stringify({ paused_affiliate_count: pausedCount, user_ids: userIds }));
    await db.sequelize.close();
  } catch (error) {
    console.error('Pause archived client affiliates failed:', error);
    try {
      await db.sequelize.close();
    } catch (_) {}
    process.exit(1);
  }
}

run();
