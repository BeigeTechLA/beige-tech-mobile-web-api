const db = require('../src/models');
const bookingPaymentSummaryService = require('../src/services/booking-payment-summary.service');

const round2 = (value) => Number(Number(value || 0).toFixed(2));

async function main() {
  const bookingId = Number(process.argv[2]);
  const explicitPaymentId = Number(process.argv[3]);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    throw new Error('Usage: node scripts/repair-partial-payment-summary.js <booking_id> [payment_id]');
  }

  const transaction = await db.sequelize.transaction();

  try {
    const booking = await db.stream_project_booking.findByPk(bookingId, {
      include: [{ model: db.quotes, as: 'primary_quote' }],
      transaction
    });

    if (!booking) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    const quoteTotal = round2(
      booking.primary_quote?.total ||
      booking.primary_quote?.price_after_discount ||
      booking.primary_quote?.subtotal ||
      booking.budget ||
      0
    );

    if (!(quoteTotal > 0)) {
      throw new Error(`Booking ${bookingId} does not have a quote total`);
    }

    const paymentIds = Array.from(new Set([
      Number.isFinite(explicitPaymentId) && explicitPaymentId > 0 ? explicitPaymentId : null,
      booking.payment_id ? Number(booking.payment_id) : null
    ].filter(Boolean)));

    const bookingPayments = paymentIds.length
      ? await db.payment_transactions.findAll({
          where: {
            payment_id: paymentIds,
            status: 'succeeded'
          },
          transaction
        })
      : [];

    const existingSummary = await bookingPaymentSummaryService.getBookingPaymentSummary(bookingId, transaction);
    const repairedPaidAmount = round2(
      bookingPayments.reduce((sum, payment) => sum + Number(payment.total_amount || 0), 0)
    );
    const paidAmount = repairedPaidAmount > 0
      ? repairedPaidAmount
      : round2(existingSummary?.paid_amount || 0);
    const dueAmount = round2(Math.max(quoteTotal - paidAmount, 0));
    const paymentStatus = dueAmount <= 0 ? 'paid' : (paidAmount > 0 ? 'partially_paid' : 'pending');

    await bookingPaymentSummaryService.upsertBookingPaymentSummary({
      bookingId,
      quoteTotal,
      paidAmount,
      creditUsedAmount: 0,
      transaction
    });

    if (dueAmount > 0) {
      await db.stream_project_booking.update(
        {
          payment_id: null,
          payment_completed_at: null,
          is_completed: 0
        },
        { where: { stream_project_booking_id: bookingId }, transaction }
      );

      await db.sales_leads.update(
        { lead_status: paidAmount > 0 ? 'partially_paid' : 'payment_link_sent' },
        { where: { booking_id: bookingId }, transaction }
      );
    }

    if (bookingPayments.length > 0 && db.invoice_send_history && db.finance_invoice_payments) {
      let invoice = await db.invoice_send_history.findOne({
        where: { booking_id: bookingId },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']],
        transaction
      });

      if (!invoice) {
        const lead = await db.sales_leads.findOne({
          where: { booking_id: bookingId },
          attributes: ['lead_id', 'client_name', 'guest_email', 'assigned_sales_rep_id'],
          transaction
        });

        invoice = await db.invoice_send_history.create({
          booking_id: bookingId,
          quote_id: null,
          lead_id: lead?.lead_id || null,
          client_lead_id: null,
          assigned_sales_rep_id: lead?.assigned_sales_rep_id || null,
          client_name: lead?.client_name || null,
          client_email: lead?.guest_email || booking.guest_email || null,
          invoice_number: `INVBEIGE-M-${String(bookingId).padStart(4, '0')}`,
          invoice_url: null,
          invoice_pdf: null,
          payment_status: dueAmount <= 0 ? 'paid' : 'pending',
          sent_by_user_id: null,
          sent_at: new Date()
        }, { transaction });
      }

      for (const payment of bookingPayments) {
        const payload = {
          invoice_send_history_id: invoice.invoice_send_history_id,
          payment_id: payment.payment_id,
          finance_transaction_id: null,
          booking_id: bookingId,
          amount: round2(payment.total_amount || 0),
          status: 'paid',
          paid_at: payment.created_at || new Date(),
          metadata_json: JSON.stringify({
            source: 'partial_payment_repair',
            stripe_payment_intent_id: payment.stripe_payment_intent_id || null,
            stripe_charge_id: payment.stripe_charge_id || null
          }),
          updated_at: new Date()
        };

        const [invoicePayment] = await db.finance_invoice_payments.findOrCreate({
          where: {
            booking_id: bookingId,
            payment_id: payment.payment_id
          },
          defaults: payload,
          transaction
        });

        if (!invoicePayment.isNewRecord) {
          await invoicePayment.update(payload, { transaction });
        }
      }
    }

    await transaction.commit();

    console.log(JSON.stringify({
      booking_id: bookingId,
      quote_total: quoteTotal,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      payment_status: paymentStatus,
      linked_payment_ids: bookingPayments.map((payment) => payment.payment_id)
    }, null, 2));
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await db.sequelize.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await db.sequelize.close();
  } catch (_) {}
  process.exit(1);
});
