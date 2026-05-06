const models = require('../src/models');
const { users: User, clients: Client } = models;

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
  };
}

function buildFallbackPhone(userId) {
  // Deterministic placeholder to avoid skipping legacy client users with missing phone.
  return `999${String(userId)}`;
}

async function backfillClients({ dryRun }) {
  const stats = {
    totalClientUsers: 0,
    alreadyLinkedByUserId: 0,
    linkedExistingClientByEmail: 0,
    createdClients: 0,
    skippedMissingName: 0,
    skippedMissingEmail: 0,
    filledMissingPhone: 0,
    failedCreates: 0,
  };

  const clientUsers = await User.scope('all').findAll({
    where: {
      user_type: 3,
      is_active: 1,
    },
    attributes: ['id', 'name', 'email', 'phone_number'],
    order: [['id', 'ASC']],
    raw: true,
  });

  stats.totalClientUsers = clientUsers.length;

  const txn = dryRun ? null : await models.sequelize.transaction();

  try {
    for (const user of clientUsers) {
      const userId = user.id;
      const name = (user.name || '').trim();
      const email = (user.email || '').trim().toLowerCase();
      const rawPhone = (user.phone_number || '').trim();
      const phone = rawPhone || buildFallbackPhone(userId);

      const existingByUserId = await Client.findOne({
        where: { user_id: userId },
        attributes: ['client_id', 'user_id', 'email'],
        transaction: txn,
      });

      if (existingByUserId) {
        stats.alreadyLinkedByUserId += 1;
        continue;
      }

      if (!name) {
        stats.skippedMissingName += 1;
        continue;
      }

      if (!email) {
        stats.skippedMissingEmail += 1;
        continue;
      }

      if (!rawPhone) {
        stats.filledMissingPhone += 1;
      }

      const existingByEmail = await Client.findOne({
        where: { email },
        transaction: txn,
      });

      try {
        if (existingByEmail) {
          if (!dryRun) {
            await existingByEmail.update(
              {
                user_id: userId,
                name,
                phone_number: phone,
                is_active: 1,
              },
              { transaction: txn }
            );
          }
          stats.linkedExistingClientByEmail += 1;
          continue;
        }

        if (!dryRun) {
          await Client.create(
            {
              user_id: userId,
              name,
              email,
              phone_number: phone,
              is_active: 1,
            },
            { transaction: txn }
          );
        }
        stats.createdClients += 1;
      } catch (createError) {
        stats.failedCreates += 1;
        console.error(`Failed for user_id=${userId}:`, createError.message);
      }
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

  return stats;
}

async function main() {
  const { dryRun } = parseArgs();

  try {
    console.log(`Starting client backfill${dryRun ? ' (dry run)' : ''}...`);
    await models.sequelize.authenticate();
    console.log('Database connection established.');

    const stats = await backfillClients({ dryRun });

    console.log('Backfill complete.');
    console.log('Summary:');
    console.log(`- Total active users with user_type=3: ${stats.totalClientUsers}`);
    console.log(`- Already linked in clients by user_id: ${stats.alreadyLinkedByUserId}`);
    console.log(`- Linked existing clients by email: ${stats.linkedExistingClientByEmail}`);
    console.log(`- Newly created client rows: ${stats.createdClients}`);
    console.log(`- Skipped (missing name): ${stats.skippedMissingName}`);
    console.log(`- Skipped (missing email): ${stats.skippedMissingEmail}`);
    console.log(`- Auto-filled missing phone_number: ${stats.filledMissingPhone}`);
    console.log(`- Failed creates: ${stats.failedCreates}`);
    console.log(dryRun ? 'No database changes were written.' : 'Changes were committed.');
  } catch (error) {
    console.error('Client backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await models.sequelize.close();
  }
}

main();
