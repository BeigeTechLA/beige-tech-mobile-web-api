const db = require('../models');
const businessNotifications = require('./business-notification.service');

let running = false;
let leadJobRunning = false;
let upcomingJobRunning = false;
let revisionJobRunning = false;
let deliveryJobRunning = false;

function dateOnlyOffset(days, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function runUpcomingNotifications(now = new Date()) {
  if (upcomingJobRunning) return { skipped: true };
  upcomingJobRunning = true;
  try {
    const tomorrow = dateOnlyOffset(1, now);
    let sent = 0;
    const quotes = await db.sales_quotes.findAll({
      where: { valid_until: tomorrow, status: { [db.Sequelize.Op.in]: ['sent', 'viewed'] } },
      attributes: ['sales_quote_id', 'quote_number', 'client_user_id', 'assigned_sales_rep_id', 'created_by_user_id', 'valid_until']
    });
    for (const quote of quotes) {
      const quoteId = String(quote.sales_quote_id);
      const referenceId = `${quoteId}:${tomorrow}`;
      const recipients = new Set([quote.client_user_id, quote.assigned_sales_rep_id || quote.created_by_user_id]);
      for (const userId of recipients) {
        if (!userId) continue;
        const existing = await db.app_notifications.findOne({ where: {
          user_id: userId, type: 'quote_expiring_soon', reference_type: 'quote_expiry_reminder', reference_id: referenceId,
          delivery_surface: 'web_app'
        }, attributes: ['notification_id'] });
        if (existing) continue;
        const isClient = Number(userId) === Number(quote.client_user_id);
        const notification = await businessNotifications.notify({
          userId,
          title: isClient ? 'Your quote expires tomorrow' : 'Client quote expires tomorrow',
          message: isClient
            ? `Quote ${quote.quote_number || quoteId} expires tomorrow. Please review it before the deadline.`
            : `Quote ${quote.quote_number || quoteId} expires tomorrow without a response.`,
          topic: 'shoots', category: 'proposals', type: 'quote_expiring_soon',
          referenceType: 'quote_expiry_reminder', referenceId,
          payload: { sales_quote_id: quoteId, valid_until: tomorrow }
        });
        if (notification) sent += 1;
      }
    }

    const bookings = await db.stream_project_booking.findAll({
      where: { event_date: tomorrow, is_active: 1, is_draft: 0, is_cancelled: 0, is_completed: 0,
        payment_id: { [db.Sequelize.Op.ne]: null } },
      attributes: ['stream_project_booking_id']
    });
    for (const booking of bookings) {
      const bookingId = String(booking.stream_project_booking_id);
      // Audience resolution remains in the notification service; only actual
      // confirmed, active assignments and the linked client are addressed.
      const clientBooking = await db.stream_project_booking.findByPk(bookingId, { attributes: ['user_id'] });
      const assignments = await db.assigned_crew.findAll({ where: {
        project_id: bookingId, is_active: 1, crew_accept: 1
      }, attributes: ['crew_member_id'] });
      const creators = assignments.length ? await db.crew_members.findAll({ where: {
        crew_member_id: assignments.map((assignment) => assignment.crew_member_id)
      }, attributes: ['user_id'] }) : [];
      const recipients = new Set([clientBooking?.user_id, ...creators.map((creator) => creator.user_id)]);
      for (const userId of recipients) {
        if (!userId) continue;
        const referenceId = `${bookingId}:${tomorrow}`;
        const existing = await db.app_notifications.findOne({ where: {
          user_id: userId, type: 'shoot_approaching', reference_type: 'shoot_reminder', reference_id: referenceId,
          delivery_surface: 'web_app'
        }, attributes: ['notification_id'] });
        if (existing) continue;
        const notification = await businessNotifications.notify({
          userId, title: 'Your shoot is tomorrow',
          message: `Shoot ${bookingId} is scheduled for tomorrow. Please review its latest details.`,
          topic: 'shoots', category: 'shoots', type: 'shoot_approaching',
          referenceType: 'shoot_reminder', referenceId,
          payload: { booking_id: bookingId, event_date: tomorrow }
        });
        if (notification) sent += 1;
      }
    }
    return { sent };
  } finally {
    upcomingJobRunning = false;
  }
}

async function runOverdueRevisionNotifications(now = new Date()) {
  if (revisionJobRunning) return { skipped: true };
  revisionJobRunning = true;
  try {
    const today = dateOnlyOffset(0, now);
    // A revision deadline is explicitly supplied when the revision request is
    // recorded. A newer delivery or a newer dated request supersedes it.
    const requests = await db.sequelize.query(`
      SELECT a.activity_id, a.lead_id, l.booking_id, l.assigned_sales_rep_id,
        JSON_UNQUOTE(JSON_EXTRACT(a.activity_data, '$.revision_delivery_date')) AS due_date
      FROM sales_lead_activities a
      JOIN sales_leads l ON l.lead_id = a.lead_id
      WHERE l.is_active = 1 AND l.assigned_sales_rep_id IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(a.activity_data, '$.email_event')) = 'revision_request_received'
        AND JSON_UNQUOTE(JSON_EXTRACT(a.activity_data, '$.revision_delivery_date')) < :today
        AND NOT EXISTS (
          SELECT 1 FROM sales_lead_activities newer
          WHERE newer.lead_id = a.lead_id AND newer.activity_id > a.activity_id
            AND JSON_UNQUOTE(JSON_EXTRACT(newer.activity_data, '$.email_event')) IN
              ('revision_request_received', 'revised_content_delivered', 'final_assets_delivered_with_revision')
        )
    `, { replacements: { today }, type: db.Sequelize.QueryTypes.SELECT });
    let sent = 0;
    for (const request of requests) {
      if (!request.booking_id) continue;
      const referenceId = String(request.activity_id);
      const existing = await db.app_notifications.findOne({ where: {
        user_id: request.assigned_sales_rep_id, type: 'revision_delivery_overdue',
        reference_type: 'revision_deadline', reference_id: referenceId,
        delivery_surface: 'web_app'
      }, attributes: ['notification_id'] });
      if (existing) continue;
      const notification = await businessNotifications.notify({
        userId: request.assigned_sales_rep_id,
        title: 'Revision delivery overdue',
        message: `The revision for shoot ${request.booking_id} has not been marked delivered by ${request.due_date}. Please follow up.`,
        topic: 'shoots', category: 'files', type: 'revision_delivery_overdue',
        referenceType: 'revision_deadline', referenceId,
        payload: { booking_id: String(request.booking_id), lead_id: String(request.lead_id), due_date: request.due_date },
        priority: 'high'
      });
      if (notification) sent += 1;
    }
    return { sent };
  } finally {
    revisionJobRunning = false;
  }
}

async function runDeliveryFollowUpNotifications(now = new Date()) {
  if (deliveryJobRunning) return { skipped: true };
  deliveryJobRunning = true;
  try {
    const today = dateOnlyOffset(0, now);
    let sent = 0;
    let offset = 0;
    while (true) {
      const bookings = await db.stream_project_booking.findAll({
        where: {
          estimated_delivery_date: { [db.Sequelize.Op.lt]: today },
          is_active: 1, is_draft: 0, is_cancelled: 0,
          // Final deliverables transition to completed; revision has its own
          // explicit deadline and alert above.
          status: 2
        },
        attributes: ['stream_project_booking_id', 'estimated_delivery_date'],
        order: [['estimated_delivery_date', 'ASC'], ['stream_project_booking_id', 'ASC']],
        limit: 100, offset
      });
      if (!bookings.length) break;
      offset += bookings.length;
      for (const booking of bookings) {
        const bookingId = String(booking.stream_project_booking_id);
        const ownerId = await businessNotifications.bookingOwner(bookingId);
        if (!ownerId) continue;
        const date = String(booking.estimated_delivery_date).slice(0, 10);
        const referenceId = `${bookingId}:${date}`;
        const existing = await db.app_notifications.findOne({ where: {
          user_id: ownerId, type: 'delivery_follow_up', reference_type: 'delivery_estimate',
          reference_id: referenceId, delivery_surface: 'web_app'
        }, attributes: ['notification_id'] });
        if (existing) continue;
        const notification = await businessNotifications.notify({
          userId: ownerId,
          title: 'Deliverables need follow-up',
          message: `Shoot ${bookingId} is still in post-production after its estimated delivery date (${date}). Please check the files and update the client.`,
          topic: 'shoots', category: 'files', type: 'delivery_follow_up',
          referenceType: 'delivery_estimate', referenceId,
          payload: { booking_id: bookingId, estimated_delivery_date: date },
          priority: 'high'
        });
        if (notification) sent += 1;
      }
    }
    return { sent };
  } finally {
    deliveryJobRunning = false;
  }
}

async function runOverdueLeadNotifications() {
  if (leadJobRunning) return { skipped: true };
  leadJobRunning = true;
  try {
    let sent = 0;
    let offset = 0;
    while (true) {
      const leads = await db.sales_leads.findAll({
        where: {
          is_active: 1,
          owner_responded_at: null,
          assigned_sales_rep_id: { [db.Sequelize.Op.ne]: null },
          response_due_at: { [db.Sequelize.Op.lte]: new Date() },
          lead_status: { [db.Sequelize.Op.notIn]: ['booked', 'abandoned', 'cancelled', 'rejected'] }
        },
        order: [['response_due_at', 'ASC'], ['lead_id', 'ASC']],
        limit: 100,
        offset
      });
      if (!leads.length) break;
      offset += leads.length;
      for (const lead of leads) {
        const leadId = String(lead.lead_id);
        const existing = await db.app_notifications.findOne({
          where: { user_id: lead.assigned_sales_rep_id, type: 'lead_response_overdue', reference_type: 'sales_lead', reference_id: leadId, delivery_surface: 'web_app' },
          attributes: ['notification_id']
        });
        if (existing) continue;
        const notification = await businessNotifications.notify({
          userId: lead.assigned_sales_rep_id,
          title: 'Lead response overdue',
          message: `Book a Shoot lead ${leadId} has not been contacted by its response deadline.`,
          topic: 'shoots', category: 'leads', type: 'lead_response_overdue',
          referenceType: 'sales_lead', referenceId: leadId,
          payload: { lead_id: leadId, booking_id: String(lead.booking_id || '') },
          priority: 'high'
        });
        if (notification) sent += 1;
      }
    }
    return { sent };
  } finally {
    leadJobRunning = false;
  }
}

async function runOverdueAgreementNotifications() {
  if (running) return { skipped: true };
  running = true;
  try {
    // Only the explicit agreement due_at counts as a deadline. A lead has no
    // equivalent due-date field today, so no arbitrary lead timer is used.
    let sent = 0;
    let offset = 0;
    while (true) {
      const agreements = await db.agreement_documents.findAll({
        where: {
          agreement_type: 'shoot', status: 'pending_acceptance', is_current: 1,
          due_at: { [db.Sequelize.Op.lte]: new Date() }
        },
        order: [['due_at', 'ASC'], ['agreement_document_id', 'ASC']],
        limit: 100,
        offset
      });
      if (!agreements.length) break;
      offset += agreements.length;
      for (const agreement of agreements) {
        const agreementId = String(agreement.agreement_document_id);
        const ownerId = await businessNotifications.bookingOwner(agreement.booking_id)
          || agreement.sent_by_user_id || agreement.created_by_user_id;
        if (!ownerId) continue;
        const existing = await db.app_notifications.findOne({
          where: { user_id: ownerId, type: 'shoot_agreement_overdue', reference_type: 'agreement_document', reference_id: agreementId, delivery_surface: 'web_app' },
          attributes: ['notification_id']
        });
        if (existing) continue;
        const notification = await businessNotifications.notify({
          userId: ownerId,
          title: 'Creator response overdue',
          message: `The creator has not responded to the shoot agreement for booking ${agreement.booking_id} by its due date.`,
          topic: 'shoots', category: 'agreements', type: 'shoot_agreement_overdue',
          referenceType: 'agreement_document', referenceId: agreementId,
          payload: { booking_id: String(agreement.booking_id), agreement_document_id: agreementId },
          priority: 'high'
        });
        if (notification) sent += 1;
      }
    }
    return { sent };
  } finally {
    running = false;
  }
}

module.exports = { runOverdueAgreementNotifications, runOverdueLeadNotifications, runUpcomingNotifications, runOverdueRevisionNotifications, runDeliveryFollowUpNotifications };
