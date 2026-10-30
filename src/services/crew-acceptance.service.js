const db = require('../models');
const { getCrewRequirements, matchCrewToRequirements } = require('../utils/crew-requirements');
const { Op } = db.Sequelize;
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

// Callers must lock the booking row first. That lock serializes every response
// for a shoot, including requests from different CPs for the last position.
async function getAcceptedCrew(bookingId, transaction) {
  const rows = await db.assigned_crew.findAll({
    where: { project_id: bookingId, is_active: 1, crew_accept: 1 },
    include: [{ model: db.crew_members, as: 'crew_member', attributes: ['crew_member_id', 'primary_role'] }],
    order: [['responded_at', 'ASC'], ['id', 'ASC']],
    transaction, lock: transaction.LOCK.UPDATE
  });
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(Number(row.crew_member_id))) return false;
    seen.add(Number(row.crew_member_id));
    return true;
  });
}

async function assertCrewPositionAvailable(booking, creatorId, transaction) {
  if (Number(booking.is_cancelled) === 1 || Number(booking.is_completed) === 1) {
    throw conflict('This shoot is no longer accepting requests');
  }
  const required = getCrewRequirements(booking).total;
  if (!required) throw conflict('The shoot CP requirements must be set before a request can be accepted');
  const accepted = await getAcceptedCrew(booking.stream_project_booking_id, transaction);
  if (accepted.some((row) => Number(row.crew_member_id) === Number(creatorId))) return;
  const creator = await db.crew_members.findByPk(creatorId, { transaction });
  const candidates = [...accepted.map((row) => row.crew_member || {}), creator || {}];
  if (!creator || !matchCrewToRequirements(booking, candidates).fits) {
    throw conflict(accepted.length >= required
      ? 'All required CP positions have been filled. This request is no longer available.'
      : 'There is no remaining position matching your skills. This request is no longer available.');
  }
}

async function closeUnavailableCrewRequests(booking, transaction) {
  const accepted = await getAcceptedCrew(booking.stream_project_booking_id, transaction);
  const pending = await db.assigned_crew.findAll({
    where: { project_id: booking.stream_project_booking_id, is_active: 1, crew_accept: 0 },
    include: [{ model: db.crew_members, as: 'crew_member', attributes: ['crew_member_id', 'primary_role'] }],
    transaction, lock: transaction.LOCK.UPDATE
  });
  const acceptedCreators = accepted.map((row) => row.crew_member || {});
  const closed = pending.filter((row) => !matchCrewToRequirements(booking, [...acceptedCreators, row.crew_member || {}]).fits);
  if (!closed.length) return;
  const now = new Date();
  const assignmentIds = closed.map((row) => row.id);
  const documents = await db.agreement_documents.findAll({
    where: { assignment_id: { [Op.in]: assignmentIds }, status: { [Op.in]: ['draft', 'pending_acceptance'] } },
    transaction, lock: transaction.LOCK.UPDATE
  });
  for (const document of documents) {
    await document.update({ status: 'cancelled', is_current: 0, cancelled_at: now }, { transaction });
    await db.agreement_events.create({
      agreement_document_id: document.agreement_document_id,
      event_type: 'crew_requirement_filled',
      metadata_json: JSON.stringify({ reason: 'Required CP positions matching this request have been filled' }),
      occurred_at: now
    }, { transaction });
  }
  await db.assigned_crew.update({ is_active: 0, updated_at: now }, {
    where: { id: { [Op.in]: assignmentIds }, crew_accept: 0 }, transaction
  });
  await db.creator_earnings.update({ status: 'cancelled', approval_status: 'draft', updated_at: now }, {
    where: {
      booking_id: booking.stream_project_booking_id,
      creator_id: { [Op.in]: closed.map((row) => row.crew_member_id) },
      approval_status: { [Op.in]: ['draft', 'pending_approval'] }, status: 'pending'
    }, transaction
  });
}

module.exports = { assertCrewPositionAvailable, closeUnavailableCrewRequests };
