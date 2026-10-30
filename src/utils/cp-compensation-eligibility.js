const db = require('../models');

// Use the same predicate for lists, totals and reports. Filtering in SQL also
// keeps invitation offers out of pagination counts. Paid history is retained.
function acceptedCompensationWhere() {
  return {
    [db.Sequelize.Op.and]: [
      { status: { [db.Sequelize.Op.ne]: 'cancelled' } },
      db.Sequelize.literal(`(
        creator_earnings.status = 'paid' OR EXISTS (
          SELECT 1 FROM assigned_crew AS accepted_cp
          WHERE accepted_cp.project_id = creator_earnings.booking_id
            AND accepted_cp.crew_member_id = creator_earnings.creator_id
            AND accepted_cp.crew_accept = 1 AND accepted_cp.is_active = 1
        )
      )`)
    ]
  };
}

async function requireAcceptedCompensation(earning, transaction) {
  const assignment = await db.assigned_crew.findOne({
    where: { project_id: earning.booking_id, crew_member_id: earning.creator_id, is_active: 1, crew_accept: 1 },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  if (!assignment) {
    throw Object.assign(new Error('The CP must accept the shoot before finance can review or pay compensation'), { statusCode: 409 });
  }
  return assignment;
}

module.exports = { acceptedCompensationWhere, requireAcceptedCompensation };
