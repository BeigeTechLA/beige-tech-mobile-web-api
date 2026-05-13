const db = require('../models');

const DEFAULT_PLATFORM_FEE_PERCENT = Number(process.env.BEIGE_MARGIN_PERCENT || 25);

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function stringifyMetadata(value) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

function buildTransactionCode(paymentId, bookingId) {
  const date = new Date();
  const yyyy = date.getFullYear();
  return `TXN-${yyyy}-${String(paymentId || bookingId).padStart(6, '0')}`;
}

function normalizeStatus(paymentStatus, hasPayment) {
  if (paymentStatus === 'succeeded' || paymentStatus === 'paid' || hasPayment) return 'paid';
  if (paymentStatus === 'failed') return 'failed';
  if (paymentStatus === 'refunded') return 'refunded';
  return 'pending';
}

async function loadBookingFinanceContext(bookingId, transaction = null) {
  const booking = await db.stream_project_booking.findByPk(bookingId, {
    include: [
      {
        model: db.quotes,
        as: 'primary_quote',
        required: false
      },
      {
        model: db.assigned_crew,
        as: 'assigned_crews',
        required: false,
        where: { is_active: 1 },
        include: [
          {
            model: db.crew_members,
            as: 'crew_member',
            required: false
          }
        ]
      },
      {
        model: db.invoice_send_history,
        as: 'invoice_send_history',
        required: false
      }
    ],
    transaction
  });

  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const payment = booking.payment_id
    ? await db.payment_transactions.findByPk(booking.payment_id, { transaction })
    : null;

  return { booking, payment };
}

function calculateCreatorRows({ booking, payment, financeTransactionId = null }) {
  const assigned = Array.isArray(booking.assigned_crews) ? booking.assigned_crews : [];
  const creators = assigned
    .map((assignment) => assignment.crew_member)
    .filter((creator) => creator && creator.crew_member_id);

  if (creators.length === 0 && payment?.creator_id) {
    creators.push({
      crew_member_id: payment.creator_id,
      hourly_rate: payment.hourly_rate || 0
    });
  }

  if (creators.length === 0) return [];

  const hours = roundCurrency(payment?.hours || booking.duration_hours || 0);
  const paymentCpCost = roundCurrency(payment?.cp_cost || 0);
  const equalShare = paymentCpCost > 0 ? roundCurrency(paymentCpCost / creators.length) : 0;

  return creators.map((creator) => {
    const rateBasedAmount = roundCurrency((creator.hourly_rate || 0) * hours);
    const netEarning = paymentCpCost > 0
      ? equalShare
      : rateBasedAmount;

    return {
      booking_id: booking.stream_project_booking_id,
      creator_id: creator.crew_member_id,
      payment_id: payment?.payment_id || null,
      finance_transaction_id: financeTransactionId,
      currency: 'USD',
      gross_amount: netEarning,
      platform_fee_amount: 0,
      net_earning_amount: netEarning,
      status: payment ? 'earned' : 'pending',
      earned_at: payment ? (booking.payment_completed_at || new Date()) : null,
      metadata_json: stringifyMetadata({
        source: paymentCpCost > 0 ? 'payment_cp_cost' : 'creator_hourly_rate',
        hours,
        hourly_rate: roundCurrency(creator.hourly_rate || 0)
      })
    };
  });
}

function calculateBreakdown({ booking, payment, creatorRows }) {
  const quote = booking.primary_quote;
  const totalFromQuote = roundCurrency(quote?.total || quote?.price_after_discount || 0);
  const totalFromPayment = roundCurrency(payment?.total_amount || 0);
  const totalAmount = totalFromPayment || totalFromQuote || roundCurrency(booking.budget || 0);

  const subtotal = roundCurrency(payment?.subtotal || quote?.subtotal || totalAmount);
  const discount = roundCurrency(quote?.discount_amount || 0);
  const tax = roundCurrency(quote?.tax_amount || 0);
  const equipment = roundCurrency(payment?.equipment_cost || 0);
  const platformFeePercent = roundCurrency(payment?.beige_margin_percent ?? DEFAULT_PLATFORM_FEE_PERCENT);
  const platformFee = payment
    ? roundCurrency(payment.beige_margin_amount || 0)
    : roundCurrency(totalAmount * (platformFeePercent / 100));
  const creatorEarnings = roundCurrency(
    creatorRows.reduce((sum, item) => sum + Number(item.net_earning_amount || 0), 0)
  );
  const collected = payment ? totalAmount : 0;
  const outstanding = roundCurrency(Math.max(totalAmount - collected, 0));

  return {
    booking_id: booking.stream_project_booking_id,
    quote_id: booking.quote_id || quote?.quote_id || null,
    client_user_id: booking.user_id || null,
    guest_email: booking.guest_email || null,
    currency: 'USD',
    subtotal_amount: subtotal,
    discount_amount: discount,
    tax_amount: tax,
    equipment_amount: equipment,
    platform_fee_percent: platformFeePercent,
    platform_fee_amount: platformFee,
    creator_earnings_amount: creatorEarnings,
    total_amount: totalAmount,
    collected_amount: collected,
    outstanding_amount: outstanding,
    payment_status: payment ? normalizeStatus(payment.status, true) : (totalAmount > 0 ? 'unpaid' : 'pending'),
    metadata_json: stringifyMetadata({
      source: 'finance_phase_1_sync',
      payment_id: payment?.payment_id || null,
      invoice_count: Array.isArray(booking.invoice_send_history) ? booking.invoice_send_history.length : 0
    }),
    calculated_at: new Date(),
    updated_at: new Date()
  };
}

async function syncBookingFinance(bookingId, options = {}) {
  const externalTransaction = options.transaction || null;
  const transaction = externalTransaction || await db.sequelize.transaction();

  try {
    const { booking, payment } = await loadBookingFinanceContext(bookingId, transaction);
    const creatorRowsPreview = calculateCreatorRows({ booking, payment });
    const breakdownPayload = calculateBreakdown({ booking, payment, creatorRows: creatorRowsPreview });

    const transactionPayload = {
      transaction_code: buildTransactionCode(payment?.payment_id, booking.stream_project_booking_id),
      booking_id: booking.stream_project_booking_id,
      payment_id: payment?.payment_id || null,
      invoice_send_history_id: null,
      client_user_id: booking.user_id || null,
      guest_email: booking.guest_email || payment?.guest_email || null,
      transaction_type: 'client_payment',
      direction: 'inflow',
      source: payment?.stripe_payment_intent_id ? 'stripe' : 'system',
      payment_method: payment?.stripe_payment_intent_id ? 'stripe' : null,
      status: normalizeStatus(payment?.status, Boolean(payment)),
      currency: 'USD',
      gross_amount: breakdownPayload.collected_amount,
      platform_fee_amount: breakdownPayload.platform_fee_amount,
      creator_earnings_amount: breakdownPayload.creator_earnings_amount,
      gateway_fee_amount: 0,
      net_amount: roundCurrency(
        breakdownPayload.collected_amount - breakdownPayload.platform_fee_amount - breakdownPayload.creator_earnings_amount
      ),
      external_reference: payment?.stripe_payment_intent_id || payment?.stripe_charge_id || null,
      transaction_date: booking.payment_completed_at || payment?.created_at || new Date(),
      metadata_json: stringifyMetadata({
        payment_status: payment?.status || null,
        shoot_type: booking.shoot_type || booking.event_type || null,
        project_name: booking.project_name || null
      }),
      created_by_user_id: options.userId || null,
      updated_at: new Date()
    };

    const [financeTransaction] = await db.finance_transactions.findOrCreate({
      where: { transaction_code: transactionPayload.transaction_code },
      defaults: transactionPayload,
      transaction
    });
    if (!financeTransaction.isNewRecord) {
      await financeTransaction.update(transactionPayload, { transaction });
    }

    const creatorRows = calculateCreatorRows({
      booking,
      payment,
      financeTransactionId: financeTransaction.finance_transaction_id
    });

    const recalculatedBreakdown = calculateBreakdown({ booking, payment, creatorRows });
    const [breakdown] = await db.finance_project_breakdowns.findOrCreate({
      where: { booking_id: booking.stream_project_booking_id },
      defaults: recalculatedBreakdown,
      transaction
    });
    if (!breakdown.isNewRecord) {
      await breakdown.update(recalculatedBreakdown, { transaction });
    }

    await db.creator_earnings.destroy({
      where: { booking_id: booking.stream_project_booking_id },
      transaction
    });
    if (creatorRows.length > 0) {
      await db.creator_earnings.bulkCreate(creatorRows, { transaction });
    }

    const invoiceRows = Array.isArray(booking.invoice_send_history) ? booking.invoice_send_history : [];
    for (const invoice of invoiceRows) {
      const status = invoice.payment_status === 'paid' ? 'paid' : 'pending';
      const invoicePayload = {
        invoice_send_history_id: invoice.invoice_send_history_id,
        payment_id: payment?.payment_id || null,
        finance_transaction_id: financeTransaction.finance_transaction_id,
        booking_id: booking.stream_project_booking_id,
        amount: status === 'paid' ? recalculatedBreakdown.collected_amount : recalculatedBreakdown.outstanding_amount,
        status,
        paid_at: status === 'paid' ? (booking.payment_completed_at || new Date()) : null,
        metadata_json: stringifyMetadata({
          invoice_number: invoice.invoice_number || null,
          invoice_url: invoice.invoice_url || null
        }),
        updated_at: new Date()
      };

      const [invoicePayment] = await db.finance_invoice_payments.findOrCreate({
        where: {
          invoice_send_history_id: invoice.invoice_send_history_id,
          booking_id: booking.stream_project_booking_id
        },
        defaults: invoicePayload,
        transaction
      });
      if (!invoicePayment.isNewRecord) {
        await invoicePayment.update(invoicePayload, { transaction });
      }
    }

    if (!externalTransaction) await transaction.commit();

    return {
      finance_transaction: financeTransaction,
      breakdown,
      creator_earnings_count: creatorRows.length,
      invoice_payments_count: invoiceRows.length
    };
  } catch (error) {
    if (!externalTransaction && transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function listTransactions(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const where = {};

  if (filters.status) where.status = filters.status;
  if (filters.transaction_type) where.transaction_type = filters.transaction_type;
  if (filters.booking_id) where.booking_id = filters.booking_id;
  if (filters.payment_id) where.payment_id = filters.payment_id;
  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    where[Op.or] = [
      { transaction_code: { [Op.like]: term } },
      { guest_email: { [Op.like]: term } },
      { external_reference: { [Op.like]: term } }
    ];
  }
  if (filters.date_from || filters.date_to) {
    where.transaction_date = {};
    if (filters.date_from) where.transaction_date[Op.gte] = new Date(filters.date_from);
    if (filters.date_to) where.transaction_date[Op.lte] = new Date(filters.date_to);
  }

  const result = await db.finance_transactions.findAndCountAll({
    where,
    limit,
    offset,
    order: [['transaction_date', 'DESC'], ['finance_transaction_id', 'DESC']],
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: false,
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'event_date']
      },
      {
        model: db.users,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'email']
      }
    ]
  });

  return {
    rows: result.rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...plain,
        metadata: parseJson(plain.metadata_json, null)
      };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function listShootBreakdowns(filters = {}) {
  const Op = db.Sequelize.Op;
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const where = {};
  const bookingWhere = {};

  if (filters.payment_status) where.payment_status = filters.payment_status;
  if (filters.client_user_id) where.client_user_id = filters.client_user_id;
  if (filters.search) {
    const term = `%${String(filters.search).trim()}%`;
    bookingWhere[Op.or] = [
      { project_name: { [Op.like]: term } },
      { shoot_type: { [Op.like]: term } },
      { event_type: { [Op.like]: term } },
      { guest_email: { [Op.like]: term } }
    ];
  }

  const result = await db.finance_project_breakdowns.findAndCountAll({
    where,
    distinct: true,
    limit,
    offset,
    order: [['calculated_at', 'DESC'], ['finance_project_breakdown_id', 'DESC']],
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: Object.keys(bookingWhere).length > 0,
        where: bookingWhere,
        attributes: ['stream_project_booking_id', 'project_name', 'shoot_type', 'event_type', 'event_date', 'guest_email']
      },
      {
        model: db.users,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'email']
      },
      {
        model: db.creator_earnings,
        as: 'creator_earnings',
        required: false,
        attributes: ['creator_earning_id', 'creator_id', 'net_earning_amount', 'status']
      }
    ]
  });

  return {
    rows: result.rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...plain,
        metadata: parseJson(plain.metadata_json, null)
      };
    }),
    pagination: {
      page,
      limit,
      total: result.count,
      total_pages: Math.ceil(result.count / limit)
    }
  };
}

async function getShootFinance(bookingId) {
  let breakdown = await db.finance_project_breakdowns.findOne({
    where: { booking_id: bookingId },
    include: [
      {
        model: db.stream_project_booking,
        as: 'booking',
        required: false
      },
      {
        model: db.creator_earnings,
        as: 'creator_earnings',
        required: false,
        include: [
          {
            model: db.crew_members,
            as: 'creator',
            required: false
          }
        ]
      }
    ]
  });

  if (!breakdown) {
    await syncBookingFinance(bookingId);
    breakdown = await db.finance_project_breakdowns.findOne({
      where: { booking_id: bookingId },
      include: [
        { model: db.stream_project_booking, as: 'booking', required: false },
        {
          model: db.creator_earnings,
          as: 'creator_earnings',
          required: false,
          include: [{ model: db.crew_members, as: 'creator', required: false }]
        }
      ]
    });
  }

  if (!breakdown) return null;

  const plain = breakdown.get({ plain: true });
  return {
    ...plain,
    metadata: parseJson(plain.metadata_json, null)
  };
}

module.exports = {
  syncBookingFinance,
  listTransactions,
  listShootBreakdowns,
  getShootFinance
};
