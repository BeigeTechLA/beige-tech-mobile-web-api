const db = require('../models');
const { Op } = db.Sequelize;

async function getCreatorRequestCompensation(creatorId, bookingIds) {
  const ids = [...new Set(bookingIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();

  const [earnings, agreements] = await Promise.all([
    db.creator_earnings.findAll({
      where: {
        creator_id: Number(creatorId), booking_id: { [Op.in]: ids },
        compensation_source: { [Op.in]: ['admin', 'sales_admin'] },
        approval_status: { [Op.in]: ['pending_approval', 'approved', 'rejected'] },
        status: { [Op.ne]: 'cancelled' }
      },
      attributes: ['booking_id', 'net_earning_amount', 'gross_amount', 'currency'],
      order: [['updated_at', 'DESC'], ['creator_earning_id', 'DESC']]
    }),
    db.agreement_documents.findAll({
      where: {
        agreement_type: 'shoot', creator_id: Number(creatorId), booking_id: { [Op.in]: ids },
        is_current: 1, status: { [Op.in]: ['pending_acceptance', 'accepted', 'rejected'] }
      },
      attributes: ['booking_id', 'compensation_amount', 'currency']
    })
  ]);

  const amounts = new Map();
  for (const agreement of agreements) {
    if (agreement.compensation_amount != null && Number.isFinite(Number(agreement.compensation_amount))) {
      amounts.set(Number(agreement.booking_id), {
        compensation_amount: Number(agreement.compensation_amount),
        compensation_currency: agreement.currency || 'USD'
      });
    }
  }
  const financeBookings = new Set();
  for (const earning of earnings) {
    const bookingId = Number(earning.booking_id);
    // The earnings query is newest first. Keep the latest finance amount.
    if (financeBookings.has(bookingId)) continue;
    const rawAmount = earning.net_earning_amount ?? earning.gross_amount;
    if (rawAmount != null && Number.isFinite(Number(rawAmount))) {
      amounts.set(bookingId, {
        compensation_amount: Number(rawAmount),
        compensation_currency: earning.currency || 'USD'
      });
      financeBookings.add(bookingId);
    }
  }
  return amounts;
}

module.exports = { getCreatorRequestCompensation };
