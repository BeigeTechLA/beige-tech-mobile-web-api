const { Op } = require('sequelize');
const db = require('../models');

const EXPIRABLE_QUOTE_STATUSES = ['draft', 'pending', 'sent', 'viewed'];

function getTodayDateOnly(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function stringifyConfig(config) {
  if (!config) return null;
  try {
    return JSON.stringify(config);
  } catch (_) {
    return null;
  }
}

async function expireQuotesPastValidUntil(options = {}) {
  const today = options.today || getTodayDateOnly();
  const transaction = options.transaction || await db.sequelize.transaction();
  const ownsTransaction = !options.transaction;

  try {
    const expiredCandidates = await db.sales_quotes.findAll({
      where: {
        status: { [Op.in]: EXPIRABLE_QUOTE_STATUSES },
        valid_until: { [Op.lt]: today }
      },
      attributes: ['sales_quote_id', 'status', 'valid_until'],
      transaction
    });

    if (!expiredCandidates.length) {
      if (ownsTransaction) await transaction.commit();
      return { expired_count: 0, expired_quote_ids: [] };
    }

    const expiredQuoteIds = expiredCandidates.map((quote) => quote.sales_quote_id);
    const now = new Date();

    await db.sales_quotes.update({
      status: 'expired',
      updated_at: now
    }, {
      where: {
        sales_quote_id: { [Op.in]: expiredQuoteIds },
        status: { [Op.in]: EXPIRABLE_QUOTE_STATUSES }
      },
      transaction
    });

    await db.sales_quote_activities.bulkCreate(
      expiredCandidates.map((quote) => ({
        sales_quote_id: quote.sales_quote_id,
        activity_type: 'status_changed',
        performed_by_user_id: null,
        message: 'Quote automatically marked as expired',
        metadata_json: stringifyConfig({
          status: 'expired',
          previous_status: quote.status,
          valid_until: quote.valid_until,
          source: 'valid_until_auto_expiration'
        })
      })),
      { transaction }
    );

    if (ownsTransaction) await transaction.commit();
    return {
      expired_count: expiredQuoteIds.length,
      expired_quote_ids: expiredQuoteIds
    };
  } catch (error) {
    if (ownsTransaction) await transaction.rollback();
    throw error;
  }
}

module.exports = {
  EXPIRABLE_QUOTE_STATUSES,
  getTodayDateOnly,
  expireQuotesPastValidUntil
};
