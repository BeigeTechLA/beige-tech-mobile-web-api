const db = require('../models');
const emailService = require('../utils/emailService');
const { toAbsoluteBeigeAssetUrl } = require('../utils/common');

const JOB_INTERVAL_MINUTES = parseInt(process.env.SHOOT_REMINDER_JOB_INTERVAL_MINUTES || '30', 10);
const REMINDER_MARKER = 'shoot_reminder_5_days';
const REMINDER_2H_MARKER = 'shoot_reminder_2_hours';
const SHOOT_COMPLETION_MARKER = 'shoot_completion_next_day';
const FINAL_NUDGE_7D_MARKER = 'shoot_final_nudge_7_days';
const REMINDER_2H_WINDOW_MIN = parseInt(process.env.SHOOT_REMINDER_2H_WINDOW_MIN || '115', 10);
const REMINDER_2H_WINDOW_MAX = parseInt(process.env.SHOOT_REMINDER_2H_WINDOW_MAX || '125', 10);
const FINAL_NUDGE_DAYS_AFTER = parseInt(process.env.SHOOT_FINAL_NUDGE_DAYS_AFTER || '7', 10);
const DEFAULT_SHOOT_TIME_ZONE = process.env.SHOOT_REMINDER_TIME_ZONE || process.env.APP_TIME_ZONE || 'Asia/Kolkata';

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

const getDatePartsInTimeZone = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value)
  };
};

const toIsoDateInTimeZone = (date, timeZone = DEFAULT_SHOOT_TIME_ZONE) => {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const addDaysToIsoDate = (isoDate, days) => {
  const [year, month, day] = String(isoDate || '').split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate.toISOString().slice(0, 10);
};

const getTimeZoneOffsetMs = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour'),
    lookup('minute'),
    lookup('second')
  );

  return asUtc - date.getTime();
};

const buildZonedDateTime = (eventDate, startTime, timeZone = DEFAULT_SHOOT_TIME_ZONE) => {
  if (!eventDate || !startTime) return null;

  const [year, month, day] = String(eventDate).slice(0, 10).split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = String(startTime)
    .slice(0, 8)
    .split(':')
    .map((value) => Number(value));

  if (!year || !month || !day || [hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  let resolved = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(resolved, timeZone);

  if (secondOffset !== firstOffset) {
    resolved = new Date(utcGuess.getTime() - secondOffset);
  }

  return resolved;
};

const buildReminderCandidateDates = (now = new Date()) => {
  const dates = new Set();

  for (const timeZone of ['UTC', DEFAULT_SHOOT_TIME_ZONE]) {
    const baseIsoDate = toIsoDateInTimeZone(now, timeZone);
    dates.add(addDaysToIsoDate(baseIsoDate, -1));
    dates.add(baseIsoDate);
    dates.add(addDaysToIsoDate(baseIsoDate, 1));
  }

  return Array.from(dates).filter(Boolean);
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

const runShootReminder2HoursJob = async () => {
  if (isRunning2h) return;
  isRunning2h = true;

  try {
    const now = new Date();
    const candidateDates = buildReminderCandidateDates(now);
    const bookingDaysForCandidates = await db.stream_project_booking_days.findAll({
      where: {
        event_date: { [db.Sequelize.Op.in]: candidateDates }
      },
      attributes: ['stream_project_booking_id']
    });

    const bookingIdsFromDays = Array.from(
      new Set(
        bookingDaysForCandidates
          .map((row) => row.stream_project_booking_id)
          .filter(Boolean)
      )
    );

    const bookings = await db.stream_project_booking.findAll({
      where: {
        is_active: 1,
        is_cancelled: 0,
        is_draft: 0,
        payment_id: { [db.Sequelize.Op.ne]: null },
        [db.Sequelize.Op.or]: [
          { event_date: { [db.Sequelize.Op.in]: candidateDates } },
          { stream_project_booking_id: { [db.Sequelize.Op.in]: bookingIdsFromDays.length ? bookingIdsFromDays : [-1] } }
        ]
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
              attributes: ['first_name', 'last_name'],
              include: [
                {
                  model: db.crew_member_files,
                  as: 'crew_member_files',
                  required: false,
                  attributes: ['file_type', 'file_path', 'created_at', 'is_active']
                }
              ]
            }
          ]
        },
        {
          model: db.stream_project_booking_days,
          as: 'booking_days',
          required: false,
          where: {
            event_date: { [db.Sequelize.Op.in]: candidateDates }
          },
          attributes: [
            'stream_project_booking_day_id',
            'event_date',
            'start_time',
            'end_time',
            'time_zone'
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
      console.log(
        `[Email Job] 2-hour reminder: no eligible bookings for candidate dates ${candidateDates.join(', ')}`
      );
      return;
    }

    let windowMatchedCount = 0;
    let sentCount = 0;

    for (const booking of bookings) {
      try {
        const lead = await db.sales_leads.findOne({
          where: { booking_id: booking.stream_project_booking_id },
          attributes: ['lead_id', 'client_name', 'guest_email']
        });

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
        const cpFiles = Array.isArray(selectedAssignment?.crew_member?.crew_member_files)
          ? [...selectedAssignment.crew_member.crew_member_files]
              .filter(f => f?.is_active === 1 || f?.is_active === true || typeof f?.is_active === 'undefined')
              .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
          : [];
        const cpPhoto =
          cpFiles.find(f => String(f?.file_type || '').toLowerCase() === 'profile_photo') ||
          cpFiles.find(f => String(f?.file_type || '').toLowerCase() === 'profile_image') ||
          cpFiles.find(f => String(f?.file_type || '').toLowerCase().includes('image')) ||
          null;
        const cpImageUrl =
          toAbsoluteBeigeAssetUrl(cpPhoto?.file_path) ||
          'https://d2jhn32fsulyac.cloudfront.net/assets/Top_CP_images/Cornelius+M..png';
        const shootTime = [formatTime(booking.start_time), formatTime(booking.end_time)]
          .filter(Boolean)
          .join(' - ');
        const location = formatLocation(booking.event_location);
        const firstName = deriveFirstName(booking.user?.name, lead?.client_name, toEmail);
        const bookingDayEntries = Array.isArray(booking.booking_days) && booking.booking_days.length
          ? booking.booking_days
          : [{
              stream_project_booking_day_id: null,
              event_date: booking.event_date,
              start_time: booking.start_time,
              end_time: booking.end_time,
              time_zone: DEFAULT_SHOOT_TIME_ZONE
            }];

        for (const bookingDay of bookingDayEntries) {
          const eventDate = bookingDay?.event_date || booking.event_date;
          const startTime = bookingDay?.start_time || booking.start_time;
          const endTime = bookingDay?.end_time || booking.end_time;
          const timeZone = bookingDay?.time_zone || DEFAULT_SHOOT_TIME_ZONE;

          if (!eventDate || !startTime) {
            console.log(
              `[Email Job] 2-hour reminder skipped booking ${booking.stream_project_booking_id} day ${bookingDay?.stream_project_booking_day_id || 'main'}: missing event date or start time`
            );
            continue;
          }

          const bookingLocalToday = toIsoDateInTimeZone(now, timeZone);
          if (eventDate !== bookingLocalToday) {
            continue;
          }

          const bookingStart = buildZonedDateTime(eventDate, startTime, timeZone);
          if (!bookingStart) {
            console.warn(
              `[Email Job] 2-hour reminder skipped booking ${booking.stream_project_booking_id} day ${bookingDay?.stream_project_booking_day_id || 'main'}: invalid start datetime`
            );
            continue;
          }

          const diffMinutes = Math.round((bookingStart.getTime() - now.getTime()) / (60 * 1000));
          if (diffMinutes < REMINDER_2H_WINDOW_MIN || diffMinutes > REMINDER_2H_WINDOW_MAX) {
            console.log(
              `[Email Job] 2-hour reminder skipped booking ${booking.stream_project_booking_id} day ${bookingDay?.stream_project_booking_day_id || 'main'}: diff=${diffMinutes}m, event_date=${eventDate}, start_time=${startTime}, tz=${timeZone}`
            );
            continue;
          }

          windowMatchedCount += 1;

          const bookingStartIso = bookingStart.toISOString();
          const hasAlreadySent = await alreadySentReminder2h(lead?.lead_id, bookingStartIso);
          if (hasAlreadySent) {
            console.log(
              `[Email Job] 2-hour reminder already sent for booking ${booking.stream_project_booking_id} day ${bookingDay?.stream_project_booking_day_id || 'main'} at ${bookingStartIso}`
            );
            continue;
          }

          const dayShootTime = [formatTime(startTime), formatTime(endTime)]
            .filter(Boolean)
            .join(' - ');

          const emailResult = await emailService.sendShootReminder2HoursEmail({
            to_email: toEmail,
            booking_id: booking.stream_project_booking_id,
            first_name: firstName,
            start_time: formatTime(startTime),
            end_time: formatTime(endTime),
            shoot_time: dayShootTime || shootTime,
            shoot_location_address: location,
            location,
            cp_name: cpName,
            cp_image_url: cpImageUrl
          });

          if (!emailResult?.success) {
            console.error(
              `[Email Job] 2-hour reminder failed for booking ${booking.stream_project_booking_id} day ${bookingDay?.stream_project_booking_day_id || 'main'}:`,
              emailResult?.error || 'unknown error'
            );
            continue;
          }

          await markReminder2hSent(lead?.lead_id, booking.stream_project_booking_id, bookingStartIso);
          sentCount += 1;
        }
      } catch (bookingError) {
        console.error('[Email Job] 2-hour reminder booking processing error:', bookingError.message);
      }
    }

    if (windowMatchedCount === 0) {
      console.log(
        `[Email Job] 2-hour reminder: found ${bookings.length} booking(s) across ${candidateDates.join(', ')}, but none within ${REMINDER_2H_WINDOW_MIN}-${REMINDER_2H_WINDOW_MAX} minutes of start time in their configured timezone`
      );
      return;
    }

    if (sentCount === 0) {
      console.log(
        `[Email Job] 2-hour reminder: ${windowMatchedCount} booking-day record(s) matched the time window, but no reminder was sent`
      );
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
