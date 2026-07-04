const db = require('../src/models');

const STEP3_FILE_TYPES = ['recent_work', 'resume', 'portfolio', 'certifications'];

const hasRealValueSql = (column) => `
  NULLIF(TRIM(COALESCE(${column}, '')), '') IS NOT NULL
  AND LOWER(TRIM(COALESCE(${column}, ''))) NOT IN ('{}', '[]', 'null')
`;

const hasStep3FieldsSql = `
  (${hasRealValueSql('cm.social_media_links')})
  OR (${hasRealValueSql('cm.certifications')})
  OR (${hasRealValueSql('cm.availability')})
`;

const hasStep3EvidenceSql = `
  EXISTS (
    SELECT 1
    FROM crew_member_files cmf
    WHERE cmf.crew_member_id = cm.crew_member_id
      AND cmf.file_type IN (:step3FileTypes)
  )
  OR ${hasStep3FieldsSql}
`;

async function getSingleCount(sql, options = {}) {
  const [rows] = await db.sequelize.query(sql, options);
  return Number(rows?.[0]?.count || 0);
}

async function getCounts(transaction) {
  const options = {
    replacements: { step3FileTypes: STEP3_FILE_TYPES },
    transaction,
  };

  const [totalCrewMembers, currentlyCompleted, willUpdate] = await Promise.all([
    getSingleCount('SELECT COUNT(*) AS count FROM crew_members', { transaction }),
    getSingleCount(
      'SELECT COUNT(*) AS count FROM crew_members WHERE is_completed_registered = 1',
      { transaction }
    ),
    getSingleCount(
      `
        SELECT COUNT(*) AS count
        FROM crew_members cm
        WHERE cm.is_completed_registered = 0
          AND (${hasStep3EvidenceSql})
      `,
      options
    ),
  ]);

  return { totalCrewMembers, currentlyCompleted, willUpdate };
}

async function backfillCompletedCpRegistration({ dryRun = false } = {}) {
  await db.sequelize.authenticate();

  const before = await getCounts();

  console.log('Creative Partner completed-registration backfill');
  console.log('Preview counts:');
  console.log(`- Total crew_members: ${before.totalCrewMembers}`);
  console.log(`- Currently completed: ${before.currentlyCompleted}`);
  console.log(`- Will be updated: ${before.willUpdate}`);

  if (dryRun) {
    console.log('Dry-run mode enabled. No database changes were written.');
    return { before, after: before, updatedCount: 0 };
  }

  if (before.willUpdate === 0) {
    console.log('No matching old CP records found. Nothing to update.');
    return { before, after: before, updatedCount: 0 };
  }

  const transaction = await db.sequelize.transaction();

  try {
    const [, metadata] = await db.sequelize.query(
      `
        UPDATE crew_members cm
        SET cm.is_completed_registered = 1
        WHERE cm.is_completed_registered = 0
          AND (${hasStep3EvidenceSql})
      `,
      {
        replacements: { step3FileTypes: STEP3_FILE_TYPES },
        transaction,
      }
    );

    await transaction.commit();

    const after = await getCounts();
    const updatedCount = Number(metadata?.affectedRows ?? before.willUpdate);

    console.log('Backfill complete.');
    console.log(`- Updated rows: ${updatedCount}`);
    console.log(`- Completed after update: ${after.currentlyCompleted}`);
    console.log(`- Remaining matching incomplete records: ${after.willUpdate}`);

    return { before, after, updatedCount };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await backfillCompletedCpRegistration({ dryRun });
  } catch (error) {
    console.error('Completed CP registration backfill failed:', error.message);
    process.exitCode = 1;
  } finally {
    await db.sequelize.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  backfillCompletedCpRegistration,
};
