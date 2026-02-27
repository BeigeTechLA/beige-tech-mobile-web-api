const db = require('../models');
const emailService = require('../utils/emailService');

const JOB_INTERVAL_MINUTES = parseInt(process.env.SHOOT_REMINDER_JOB_INTERVAL_MINUTES || '30', 10);
const REMINDER_MARKER = 'shoot_reminder_5_days';
const REMINDER_2H_MARKER = 'shoot_reminder_2_hours';
const SHOOT_COMPLETION_MARKER = 'shoot_completion_next_day';
const FINAL_NUDGE_7D_MARKER = 'shoot_final_nudge_7_days';
const REMINDER_2H_WINDOW_MIN = parseInt(process.env.SHOOT_REMINDER_2H_WINDOW_MIN || '115', 10);
const REMINDER_2H_WINDOW_MAX = parseInt(process.env.SHOOT_REMINDER_2H_WINDOW_MAX || '125', 10);
const FINAL_NUDGE_DAYS_AFTER = parseInt(process.env.SHOOT_FINAL_NUDGE_DAYS_AFTER || '7', 10);

let isRunning5d = false;
let isRunning2h = false;
let isRunningCompletion = false;
let isRunningFinalNudge = false;

const toIsoDateLocal = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime = (value) => {
  if (!value) return '';
  const txt = String(value);
  const [hh, mm] = txt.split(':');
  if (hh === undefined || mm === undefined) return txt;
  const h = Number(hh);
  if (Number.isNaN(h)) return txt;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
};

const formatLocation = (location) => {
  if (!location) return 'TBD';
  if (typeof location !== 'string') {
    if (location && typeof location === 'object') {
      return location.address || location.full_address || location.formatted_address || location.place_name || location.name || 'TBD';
    }
    return String(location);
  }

  const trimmed = location.trim();
  if (!trimmed) return 'TBD';
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      return parsed.address || parsed.full_address || parsed.formatted_address || parsed.place_name || parsed.name || trimmed;
    }
  } catch (_) {
    // keep raw string
  }
  return trimmed;
};

const deriveFirstName = (userName, leadClientName, guestEmail) => {
  const fromName = (userName || leadClientName || '').trim();
  if (fromName) return fromName.split(/\s+/)[0];

  if (guestEmail && guestEmail.includes('@')) {
    const local = guestEmail.split('@')[0];
    const normalized = local.replace(/[._-]+/g, ' ').trim();
    if (normalized) return normalized.split(/\s+/)[0];
  }

  return 'there';
};

const parseActivityData = (activityData) => {
  if (!activityData) return {};
  if (typeof activityData === 'object') return activityData;
  if (typeof activityData === 'string') {
    try {
      return JSON.parse(activityData);
    } catch (_) {
      return {};
    }
  }
  return {};
};

const alreadySentReminder = async (leadId, targetDate) => {
  if (!leadId) return false;

  const activities = await db.sales_lead_activities.findAll({
    where: {
      lead_id: leadId,
      activity_type: 'status_changed'
    },
    attributes: ['activity_data']
  });

  return activities.some((row) => {
    const data = parseActivityData(row.activity_data);
    return data.email_event === REMINDER_MARKER && data.target_date === targetDate;
  });
};

const alreadySentReminder2h = async (leadId, bookingStartIso) => {
  if (!leadId) return false;

  const activities = await db.sales_lead_activities.findAll({
    where: {
      lead_id: leadId,
      activity_type: 'status_changed'
    },
    attributes: ['activity_data']
  });

  return activities.some((row) => {
    const data = parseActivityData(row.activity_data);
    return data.email_event === REMINDER_2H_MARKER && data.target_start_at === bookingStartIso;
  });
};

const alreadySentShootCompletion = async (leadId, targetDate) => {
  if (!leadId) return false;

  const activities = await db.sales_lead_activities.findAll({
    where: {
      lead_id: leadId,
      activity_type: 'status_changed'
    },
    attributes: ['activity_data']
  });

  return activities.some((row) => {
    const data = parseActivityData(row.activity_data);
    return data.email_event === SHOOT_COMPLETION_MARKER && data.target_date === targetDate;
  });
};

const alreadySentFinalNudge7d = async (leadId, targetDate) => {
  if (!leadId) return false;

  const activities = await db.sales_lead_activities.findAll({
    where: {
      lead_id: leadId,
      activity_type: 'status_changed'
    },
    attributes: ['activity_data']
  });

  return activities.some((row) => {
    const data = parseActivityData(row.activity_data);
    return data.email_event === FINAL_NUDGE_7D_MARKER && data.target_date === targetDate;
  });
};

const markReminderSent = async (leadId, bookingId, targetDate, performedBy = null) => {
  if (!leadId) return;
  await db.sales_lead_activities.create({
    lead_id: leadId,
    activity_type: 'status_changed',
    activity_data: {
      email_event: REMINDER_MARKER,
      booking_id: bookingId,
      target_date: targetDate
    },
    performed_by_user_id: performedBy
  });
};

const markReminder2hSent = async (leadId, bookingId, bookingStartIso, performedBy = null) => {
  if (!leadId) return;
  await db.sales_lead_activities.create({
    lead_id: leadId,
    activity_type: 'status_changed',
    activity_data: {
      email_event: REMINDER_2H_MARKER,
      booking_id: bookingId,
      target_start_at: bookingStartIso
    },
    performed_by_user_id: performedBy
  });
};

const markShootCompletionSent = async (leadId, bookingId, targetDate, performedBy = null) => {
  if (!leadId) return;
  await db.sales_lead_activities.create({
    lead_id: leadId,
    activity_type: 'status_changed',
    activity_data: {
      email_event: SHOOT_COMPLETION_MARKER,
      booking_id: bookingId,
      target_date: targetDate
    },
    performed_by_user_id: performedBy
  });
};

const markFinalNudge7dSent = async (leadId, bookingId, targetDate, performedBy = null) => {
  if (!leadId) return;
  await db.sales_lead_activities.create({
    lead_id: leadId,
    activity_type: 'status_changed',
    activity_data: {
      email_event: FINAL_NUDGE_7D_MARKER,
      booking_id: bookingId,
      target_date: targetDate
    },
    performed_by_user_id: performedBy
  });
};

const runShootReminder5DaysJob = async () => {
  if (isRunning5d) return;
  isRunning5d = true;

  try {
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + 5);
    const targetDate = toIsoDateLocal(target);

    const bookings = await db.stream_project_booking.findAll({
      where: {
        event_date: targetDate,
        is_active: 1,
        is_cancelled: 0,
        is_draft: 0,
        payment_id: { [db.Sequelize.Op.ne]: null }
      },
      include: [
        {
          model: db.users,
          as: 'user',
          required: false,
          attributes: ['id', 'name', 'email']
        }
      ],
      attributes: [
        'stream_project_booking_id',
        'user_id',
        'guest_email',
        'event_date',
        'start_time',
        'end_time',
        'event_location'
      ]
    });

    if (!bookings.length) {
      console.log(`[Email Job] 5-day reminder: no eligible bookings for ${targetDate}`);
      return;
    }

    for (const booking of bookings) {
      try {
        const lead = await db.sales_leads.findOne({
          where: { booking_id: booking.stream_project_booking_id },
          attributes: ['lead_id', 'client_name', 'guest_email']
        });

        const hasAlreadySent = await alreadySentReminder(lead?.lead_id, targetDate);
        if (hasAlreadySent) {
          continue;
        }

        const toEmail = booking.user?.email || booking.guest_email || lead?.guest_email;
        if (!toEmail) {
          console.warn(`[Email Job] 5-day reminder skipped booking ${booking.stream_project_booking_id}: missing recipient email`);
          continue;
        }

        const firstName = deriveFirstName(booking.user?.name, lead?.client_name, toEmail);
        const emailResult = await emailService.sendShootReminder5DaysEmail({
          to_email: toEmail,
          booking_id: booking.stream_project_booking_id,
          first_name: firstName,
          shoot_date: formatDate(booking.event_date),
          start_time: formatTime(booking.start_time),
          end_time: formatTime(booking.end_time),
          shoot_location_address: formatLocation(booking.event_location)
        });

        if (!emailResult?.success) {
          console.error(
            `[Email Job] 5-day reminder failed for booking ${booking.stream_project_booking_id}:`,
            emailResult?.error || 'unknown error'
          );
          continue;
        }

        await markReminderSent(
          lead?.lead_id,
          booking.stream_project_booking_id,
          targetDate
        );
      } catch (bookingError) {
        console.error('[Email Job] 5-day reminder booking processing error:', bookingError.message);
      }
    }
  } catch (error) {
    console.error('[Email Job] 5-day reminder run failed:', error);
  } finally {
    isRunning5d = false;
  }
};

const buildBookingStartDateTime = (eventDate, startTime) => {
  if (!eventDate || !startTime) return null;
  const datePart = String(eventDate).slice(0, 10);
  const timePart = String(startTime).slice(0, 8);
  const dt = new Date(`${datePart}T${timePart}`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const runShootReminder2HoursJob = async () => {
  if (isRunning2h) return;
  isRunning2h = true;

  try {
    const now = new Date();
    const todayStr = toIsoDateLocal(now);

    const bookings = await db.stream_project_booking.findAll({
      where: {
        event_date: todayStr,
        is_active: 1,
        is_cancelled: 0,
        is_draft: 0,
        payment_id: { [db.Sequelize.Op.ne]: null },
        start_time: { [db.Sequelize.Op.ne]: null }
      },
      include: [
        {
          model: db.users,
          as: 'user',
          required: false,
          attributes: ['id', 'name', 'email']
        },
        {
          model: db.assigned_crew,
          as: 'assigned_crews',
          required: false,
          where: { is_active: 1 },
          attributes: ['crew_member_id', 'crew_accept', 'status', 'updated_at', 'assigned_date'],
          include: [
            {
              model: db.crew_members,
              as: 'crew_member',
              required: false,
              attributes: ['first_name', 'last_name']
            }
          ]
        }
      ],
      attributes: [
        'stream_project_booking_id',
        'user_id',
        'guest_email',
        'event_date',
        'start_time',
        'end_time',
        'event_location'
      ]
    });

    if (!bookings.length) {
      console.log(`[Email Job] 2-hour reminder: no eligible bookings for ${todayStr}`);
      return;
    }

    for (const booking of bookings) {
      try {
        const bookingStart = buildBookingStartDateTime(booking.event_date, booking.start_time);
        if (!bookingStart) continue;

        const diffMinutes = Math.round((bookingStart.getTime() - now.getTime()) / (60 * 1000));
        if (diffMinutes < REMINDER_2H_WINDOW_MIN || diffMinutes > REMINDER_2H_WINDOW_MAX) {
          continue;
        }

        const lead = await db.sales_leads.findOne({
          where: { booking_id: booking.stream_project_booking_id },
          attributes: ['lead_id', 'client_name', 'guest_email']
        });

        const bookingStartIso = bookingStart.toISOString();
        const hasAlreadySent = await alreadySentReminder2h(lead?.lead_id, bookingStartIso);
        if (hasAlreadySent) continue;

        const toEmail = booking.user?.email || booking.guest_email || lead?.guest_email;
        if (!toEmail) {
          console.warn(`[Email Job] 2-hour reminder skipped booking ${booking.stream_project_booking_id}: missing recipient email`);
          continue;
        }

        const assignments = Array.isArray(booking.assigned_crews)
          ? [...booking.assigned_crews].sort((a, b) => {
              const ta = new Date(a?.updated_at || a?.assigned_date || 0).getTime();
              const tb = new Date(b?.updated_at || b?.assigned_date || 0).getTime();
              return tb - ta;
            })
          : [];
        const selectedAssignment =
          assignments.find(a => a?.crew_accept === 1) ||
          assignments.find(a => ['selected', 'assigned', 'confirmed'].includes(String(a?.status || '').toLowerCase())) ||
          assignments[0] ||
          null;
        const cpName = [selectedAssignment?.crew_member?.first_name, selectedAssignment?.crew_member?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || 'your Creative Partner';

        const firstName = deriveFirstName(booking.user?.name, lead?.client_name, toEmail);
        const emailResult = await emailService.sendShootReminder2HoursEmail({
          to_email: toEmail,
          booking_id: booking.stream_project_booking_id,
          first_name: firstName,
          start_time: formatTime(booking.start_time),
          end_time: formatTime(booking.end_time),
          shoot_location_address: formatLocation(booking.event_location),
          cp_name: cpName
        });

        if (!emailResult?.success) {
          console.error(
            `[Email Job] 2-hour reminder failed for booking ${booking.stream_project_booking_id}:`,
            emailResult?.error || 'unknown error'
          );
          continue;
        }

        await markReminder2hSent(lead?.lead_id, booking.stream_project_booking_id, bookingStartIso);
      } catch (bookingError) {
        console.error('[Email Job] 2-hour reminder booking processing error:', bookingError.message);
      }
    }
  } catch (error) {
    console.error('[Email Job] 2-hour reminder run failed:', error);
  } finally {
    isRunning2h = false;
  }
};

const runShootCompletionNextDayJob = async () => {
  if (isRunningCompletion) return;
  isRunningCompletion = true;

  try {
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() - 1);
    const targetDate = toIsoDateLocal(target);

    const bookings = await db.stream_project_booking.findAll({
      where: {
        event_date: targetDate,
        is_active: 1,
        is_cancelled: 0,
        is_draft: 0,
        payment_id: { [db.Sequelize.Op.ne]: null }
      },
      include: [
        {
          model: db.users,
          as: 'user',
          required: false,
          attributes: ['id', 'name', 'email']
        },
        {
          model: db.assigned_crew,
          as: 'assigned_crews',
          required: false,
          where: { is_active: 1 },
          attributes: ['crew_member_id', 'crew_accept', 'status', 'updated_at', 'assigned_date'],
          include: [
            {
              model: db.crew_members,
              as: 'crew_member',
              required: false,
              attributes: ['first_name', 'last_name']
            }
          ]
        }
      ],
      attributes: [
        'stream_project_booking_id',
        'user_id',
        'guest_email',
        'content_type',
        'edits_needed'
      ]
    });

    if (!bookings.length) {
      console.log(`[Email Job] completion-next-day: no eligible bookings for ${targetDate}`);
      return;
    }

    for (const booking of bookings) {
      try {
        const lead = await db.sales_leads.findOne({
          where: { booking_id: booking.stream_project_booking_id },
          attributes: ['lead_id', 'client_name', 'guest_email']
        });

        const hasAlreadySent = await alreadySentShootCompletion(lead?.lead_id, targetDate);
        if (hasAlreadySent) continue;

        const toEmail = booking.user?.email || booking.guest_email || lead?.guest_email;
        if (!toEmail) {
          console.warn(`[Email Job] completion-next-day skipped booking ${booking.stream_project_booking_id}: missing recipient email`);
          continue;
        }

        const assignments = Array.isArray(booking.assigned_crews)
          ? [...booking.assigned_crews].sort((a, b) => {
              const ta = new Date(a?.updated_at || a?.assigned_date || 0).getTime();
              const tb = new Date(b?.updated_at || b?.assigned_date || 0).getTime();
              return tb - ta;
            })
          : [];
        const selectedAssignment =
          assignments.find(a => a?.crew_accept === 1) ||
          assignments.find(a => ['selected', 'assigned', 'confirmed'].includes(String(a?.status || '').toLowerCase())) ||
          assignments[0] ||
          null;
        const cpName = [selectedAssignment?.crew_member?.first_name, selectedAssignment?.crew_member?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || 'your Creative Partner';

        const ct = String(booking.content_type || '').toLowerCase();
        const hasEditing = booking.edits_needed === 1 || booking.edits_needed === true || ct.includes('edit');
        const rawOnly = !hasEditing;

        const firstName = deriveFirstName(booking.user?.name, lead?.client_name, toEmail);
        const emailResult = await emailService.sendShootCompletionEmail({
          to_email: toEmail,
          booking_id: booking.stream_project_booking_id,
          first_name: firstName,
          cp_name: cpName,
          has_editing: hasEditing,
          raw_only: rawOnly
        });

        if (!emailResult?.success) {
          console.error(
            `[Email Job] completion-next-day failed for booking ${booking.stream_project_booking_id}:`,
            emailResult?.error || 'unknown error'
          );
          continue;
        }

        await markShootCompletionSent(lead?.lead_id, booking.stream_project_booking_id, targetDate);
      } catch (bookingError) {
        console.error('[Email Job] completion-next-day booking processing error:', bookingError.message);
      }
    }
  } catch (error) {
    console.error('[Email Job] completion-next-day run failed:', error);
  } finally {
    isRunningCompletion = false;
  }
};

const runFinalNudge7DaysJob = async () => {
  if (isRunningFinalNudge) return;
  isRunningFinalNudge = true;

  try {
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() - FINAL_NUDGE_DAYS_AFTER);
    const targetDate = toIsoDateLocal(target);

    const bookings = await db.stream_project_booking.findAll({
      where: {
        event_date: targetDate,
        is_active: 1,
        is_cancelled: 0,
        is_draft: 0,
        payment_id: { [db.Sequelize.Op.ne]: null }
      },
      include: [
        {
          model: db.users,
          as: 'user',
          required: false,
          attributes: ['id', 'name', 'email']
        },
        {
          model: db.assigned_crew,
          as: 'assigned_crews',
          required: false,
          where: { is_active: 1 },
          attributes: ['crew_member_id', 'crew_accept', 'status', 'updated_at', 'assigned_date'],
          include: [
            {
              model: db.crew_members,
              as: 'crew_member',
              required: false,
              attributes: ['first_name', 'last_name']
            }
          ]
        }
      ],
      attributes: ['stream_project_booking_id', 'user_id', 'guest_email']
    });

    if (!bookings.length) {
      console.log(`[Email Job] final-nudge-7d: no eligible bookings for ${targetDate}`);
      return;
    }

    for (const booking of bookings) {
      try {
        const lead = await db.sales_leads.findOne({
          where: { booking_id: booking.stream_project_booking_id },
          attributes: ['lead_id', 'client_name', 'guest_email']
        });

        const hasAlreadySent = await alreadySentFinalNudge7d(lead?.lead_id, targetDate);
        if (hasAlreadySent) continue;

        const toEmail = booking.user?.email || booking.guest_email || lead?.guest_email;
        if (!toEmail) {
          console.warn(`[Email Job] final-nudge-7d skipped booking ${booking.stream_project_booking_id}: missing recipient email`);
          continue;
        }

        const assignments = Array.isArray(booking.assigned_crews)
          ? [...booking.assigned_crews].sort((a, b) => {
              const ta = new Date(a?.updated_at || a?.assigned_date || 0).getTime();
              const tb = new Date(b?.updated_at || b?.assigned_date || 0).getTime();
              return tb - ta;
            })
          : [];
        const selectedAssignment =
          assignments.find(a => a?.crew_accept === 1) ||
          assignments.find(a => ['selected', 'assigned', 'confirmed'].includes(String(a?.status || '').toLowerCase())) ||
          assignments[0] ||
          null;
        const cpName = [selectedAssignment?.crew_member?.first_name, selectedAssignment?.crew_member?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || 'your Creative Partner';

        const firstName = deriveFirstName(booking.user?.name, lead?.client_name, toEmail);
        const emailResult = await emailService.sendFinalNudge7DaysEmail({
          to_email: toEmail,
          booking_id: booking.stream_project_booking_id,
          first_name: firstName,
          cp_name: cpName
        });

        if (!emailResult?.success) {
          console.error(
            `[Email Job] final-nudge-7d failed for booking ${booking.stream_project_booking_id}:`,
            emailResult?.error || 'unknown error'
          );
          continue;
        }

        await markFinalNudge7dSent(lead?.lead_id, booking.stream_project_booking_id, targetDate);
      } catch (bookingError) {
        console.error('[Email Job] final-nudge-7d booking processing error:', bookingError.message);
      }
    }
  } catch (error) {
    console.error('[Email Job] final-nudge-7d run failed:', error);
  } finally {
    isRunningFinalNudge = false;
  }
};

const startScheduledEmailJobs = () => {
  const enabled = String(process.env.ENABLE_SCHEDULED_EMAIL_JOBS || 'true').toLowerCase() === 'true';
  if (!enabled) {
    console.log('[Email Job] Scheduled email jobs are disabled by config');
    return;
  }

  const intervalMs = Math.max(5, JOB_INTERVAL_MINUTES) * 60 * 1000;
  console.log(`[Email Job] Scheduled email jobs started (every ${Math.max(5, JOB_INTERVAL_MINUTES)} minutes)`);

  runShootReminder5DaysJob().catch((err) => {
    console.error('[Email Job] Initial 5-day reminder run failed:', err.message);
  });
  runShootReminder2HoursJob().catch((err) => {
    console.error('[Email Job] Initial 2-hour reminder run failed:', err.message);
  });
  runShootCompletionNextDayJob().catch((err) => {
    console.error('[Email Job] Initial completion-next-day run failed:', err.message);
  });
  runFinalNudge7DaysJob().catch((err) => {
    console.error('[Email Job] Initial final-nudge-7d run failed:', err.message);
  });

  setInterval(() => {
    runShootReminder5DaysJob().catch((err) => {
      console.error('[Email Job] Interval 5-day reminder run failed:', err.message);
    });
    runShootReminder2HoursJob().catch((err) => {
      console.error('[Email Job] Interval 2-hour reminder run failed:', err.message);
    });
    runShootCompletionNextDayJob().catch((err) => {
      console.error('[Email Job] Interval completion-next-day run failed:', err.message);
    });
    runFinalNudge7DaysJob().catch((err) => {
      console.error('[Email Job] Interval final-nudge-7d run failed:', err.message);
    });
  }, intervalMs);
};

module.exports = {
  startScheduledEmailJobs,
  runShootReminder5DaysJob,
  runShootReminder2HoursJob,
  runShootCompletionNextDayJob,
  runFinalNudge7DaysJob
};
