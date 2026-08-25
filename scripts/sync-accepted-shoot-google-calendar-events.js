require('dotenv').config();

const { Op } = require('sequelize');
const db = require('../src/models');
const {
  syncAcceptedShootToGoogleCalendar,
} = require('../src/services/creator-calendar.service');

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const run = async () => {
  const crewMemberId = Number(getArgValue('crew-member-id') || 0);
  const projectId = Number(getArgValue('project-id') || 0);

  const connectedCrewRows = await db.creator_calendar_connections.findAll({
    where: {
      provider: 'google',
      disconnected_at: { [Op.is]: null },
      sync_status: { [Op.ne]: 'revoked' },
      ...(crewMemberId ? { crew_member_id: crewMemberId } : {}),
    },
    attributes: ['crew_member_id'],
    raw: true,
  });

  const connectedCrewIds = connectedCrewRows
    .map((row) => Number(row.crew_member_id))
    .filter(Boolean);

  if (!connectedCrewIds.length) {
    console.log('No connected Google Calendar creators found.');
    return;
  }

  const assignments = await db.assigned_crew.findAll({
    where: {
      crew_accept: 1,
      is_active: 1,
      crew_member_id: { [Op.in]: connectedCrewIds },
      ...(projectId ? { project_id: projectId } : {}),
    },
    attributes: ['crew_member_id', 'project_id'],
    order: [['project_id', 'ASC'], ['crew_member_id', 'ASC']],
    raw: true,
  });

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const assignment of assignments) {
    try {
      const result = await syncAcceptedShootToGoogleCalendar({
        crewMemberId: assignment.crew_member_id,
        projectId: assignment.project_id,
      });

      if (result?.synced) {
        syncedCount += 1;
        console.log(
          `Synced project_id=${assignment.project_id}, crew_member_id=${assignment.crew_member_id}, event_id=${result.event_id}`
        );
      } else {
        skippedCount += 1;
        console.log(
          `Skipped project_id=${assignment.project_id}, crew_member_id=${assignment.crew_member_id}, reason=${result?.reason || 'unknown'}`
        );
      }
    } catch (error) {
      failedCount += 1;
      console.error(
        `Failed project_id=${assignment.project_id}, crew_member_id=${assignment.crew_member_id}: ${error.message}`
      );
    }
  }

  console.log(
    `Google shoot event sync complete. synced=${syncedCount}, skipped=${skippedCount}, failed=${failedCount}`
  );
};

run()
  .then(() => db.sequelize.close())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('Google shoot event sync job failed:', error);
    await db.sequelize.close();
    process.exit(1);
  });
