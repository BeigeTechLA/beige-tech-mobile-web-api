const db = require('../models');
const appNotifications = require('./app-notification.service');

// These notifications are addressed to a specific owner, never broadcast to an
// admin role. An unassigned record remains visible in its normal workflow.
async function notify({ userId, ...notification }) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const user = await db.users.findByPk(id, { attributes: ['user_type', 'is_active'] });
    if (!user || Number(user.is_active) !== 1) return null;
    const { appUserType: _requestedAppUserType, ...details } = notification;
    return await appNotifications.createAndPushNotification({
      userId: id,
      deliverySurface: 'web_app',
      deliverySurfaces: ['web_app'],
      appUserType: String(user.user_type),
      actionLabel: 'View details',
      dedupeWindowSeconds: notification.dedupeWindowSeconds || 0,
      ...details
    });
  } catch (error) {
    console.error('[BusinessNotification] Delivery failed:', {
      userId: id, type: notification.type, referenceId: notification.referenceId,
      message: error.message
    });
    return null;
  }
}

async function bookingOwner(bookingId) {
  if (!bookingId) return null;
  const lead = await db.sales_leads.findOne({
    where: { booking_id: bookingId, is_active: 1 },
    attributes: ['assigned_sales_rep_id'],
    order: [['lead_id', 'DESC']]
  });
  return Number(lead?.assigned_sales_rep_id || 0) || null;
}

async function notifyBookingOwner(bookingId, notification) {
  try {
    return notify({ userId: await bookingOwner(bookingId), ...notification });
  } catch (error) {
    console.error('[BusinessNotification] Owner lookup failed:', { bookingId, message: error.message });
    return null;
  }
}

async function notifyQuoteClient(quote, notification) {
  // Guest quotes have an email address but no authenticated inbox. Never
  // address an email recipient's push to a different account.
  const userId = Number(quote?.client_user_id || 0);
  if (!userId) return null;
  return notify({ userId, ...notification });
}

async function notifyCreator(creatorId, notification) {
  try {
    const creator = await db.crew_members.findByPk(creatorId, { attributes: ['user_id'] });
    return notify({ userId: creator?.user_id, ...notification });
  } catch (error) {
    console.error('[BusinessNotification] Creator lookup failed:', { creatorId, message: error.message });
    return null;
  }
}

async function notifyShootAudience(bookingId, notification, { excludeUserId = null, includeOwner = false, includePending = false } = {}) {
  try {
    const booking = await db.stream_project_booking.findByPk(bookingId, { attributes: ['user_id'] });
    const assignments = await db.assigned_crew.findAll({
      where: { project_id: bookingId, is_active: 1, ...(includePending ? {} : { crew_accept: 1 }) }, attributes: ['crew_member_id']
    });
    const creators = assignments.length ? await db.crew_members.findAll({
      where: { crew_member_id: assignments.map((row) => row.crew_member_id) }, attributes: ['user_id']
    }) : [];
    const ids = new Set([booking?.user_id, ...creators.map((row) => row.user_id)]);
    if (includeOwner) ids.add(await bookingOwner(bookingId));
    ids.delete(null);
    ids.delete(undefined);
    ids.delete(Number(excludeUserId));
    return Promise.all([...ids].map((userId) => notify({ userId, ...notification })));
  } catch (error) {
    console.error('[BusinessNotification] Shoot audience lookup failed:', { bookingId, message: error.message });
    return [];
  }
}

async function notifyLeadAssigned(lead, userId) {
  return notify({
    userId,
    title: 'New Book a Shoot lead assigned',
    message: `A new Book a Shoot lead${lead.client_name ? ` from ${lead.client_name}` : ''} is assigned to you.`,
    topic: 'shoots', category: 'leads', type: 'lead_assigned',
    referenceType: 'sales_lead', referenceId: String(lead.lead_id),
    payload: { lead_id: String(lead.lead_id), booking_id: String(lead.booking_id || '') },
    dedupeWindowSeconds: 60
  });
}

async function notifyPaymentOwner({ bookingId, paymentId, status, amount }) {
  try {
    const ownerId = await bookingOwner(bookingId);
    if (!ownerId) return null;
    const resolvedPaymentId = String(paymentId || bookingId);
    const type = status === 'failed' ? 'booking_payment_failed'
      : status === 'partial' ? 'booking_payment_partial' : 'booking_payment_succeeded';
    const existing = await db.app_notifications.findOne({
      where: { user_id: ownerId, type, reference_type: 'payment', reference_id: resolvedPaymentId, delivery_surface: 'web_app' },
      attributes: ['notification_id']
    });
    if (existing) return existing;
    const numericAmount = Number(amount);
    const formattedAmount = amount !== undefined && amount !== null && amount !== '' && Number.isFinite(numericAmount)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numericAmount)
      : '';
    const message = status === 'failed' ? `Payment failed for booking #${bookingId}.`
      : `${status === 'partial' ? 'Partial payment' : 'Payment'}${formattedAmount ? ` of ${formattedAmount}` : ''} received for booking #${bookingId}.`;
    return notify({
      userId: ownerId,
      title: status === 'failed' ? 'Booking payment failed' : status === 'partial' ? 'Partial booking payment received' : 'Booking payment received',
      message,
      topic: 'shoots', category: 'payments', type,
      referenceType: 'payment', referenceId: resolvedPaymentId,
      payload: { booking_id: String(bookingId), payment_id: resolvedPaymentId, payment_status: status, ...(formattedAmount ? { amount: numericAmount, currency: 'USD' } : {}) },
      priority: status === 'failed' ? 'high' : 'normal'
    });
  } catch (error) {
    console.error('[BusinessNotification] Payment alert failed:', { bookingId, message: error.message });
    return null;
  }
}

async function notifyDisputeOwner(dispute, type, message) {
  return notifyBookingOwner(dispute.booking_id, {
    title: type === 'dispute_raised' ? 'New finance dispute' : 'Finance dispute updated',
    message,
    topic: 'shoots', category: 'disputes', type,
    referenceType: 'finance_dispute', referenceId: String(dispute.dispute_id),
    payload: { dispute_id: String(dispute.dispute_id), booking_id: String(dispute.booking_id || '') }
  });
}

async function notifyDisputeParticipant(dispute, type, message) {
  try {
    let userId = null;
    let appUserType = null;
    if ((dispute.raised_by?.type === 'creator' || (dispute.raised_by?.type === 'admin' && dispute.creator?.id)) && dispute.creator?.id) {
      const creator = await db.crew_members.findByPk(dispute.creator.id, { attributes: ['user_id'] });
      userId = creator?.user_id;
      appUserType = '2';
    } else if (dispute.raised_by?.type === 'client' || dispute.raised_by?.type === 'admin') {
      userId = dispute.client?.id || dispute.raised_by?.id;
      appUserType = '3';
    }
    return notify({
      userId, appUserType,
      title: type === 'refund_rejected' ? 'Refund request rejected'
        : type === 'refund_approved' ? 'Refund request approved'
          : type === 'refund_completed' ? 'Refund marked completed'
          : type === 'dispute_rejected' ? 'Finance dispute rejected'
            : type === 'dispute_resolved' ? 'Finance dispute resolved' : 'Finance dispute updated',
      message,
      topic: 'shoots', category: 'disputes', type,
      referenceType: 'finance_dispute', referenceId: String(dispute.dispute_id),
      payload: { dispute_id: String(dispute.dispute_id), booking_id: String(dispute.booking_id || '') }
    });
  } catch (error) {
    console.error('[BusinessNotification] Participant lookup failed:', { disputeId: dispute.dispute_id, message: error.message });
    return null;
  }
}

module.exports = { notify, bookingOwner, notifyBookingOwner, notifyQuoteClient, notifyCreator, notifyShootAudience, notifyLeadAssigned, notifyPaymentOwner, notifyDisputeOwner, notifyDisputeParticipant };
