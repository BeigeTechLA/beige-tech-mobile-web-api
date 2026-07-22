const db = require('../models');

function firstStudioDay(studio = {}) {
  const days = Array.isArray(studio.bookingDays) ? studio.bookingDays : [];
  return days[0] || null;
}

function resolveStudioBookingDate(studio = {}) {
  return studio.selectedDate || firstStudioDay(studio)?.date || null;
}

function resolveStudioStartTime(studio = {}) {
  return studio.startTime || firstStudioDay(studio)?.startTime || null;
}

function resolveStudioEndTime(studio = {}) {
  return studio.endTime || firstStudioDay(studio)?.endTime || null;
}

function resolveStudioTimeZone(studio = {}) {
  return studio.timeZone || firstStudioDay(studio)?.timeZone || null;
}

function resolveStudioDurationHours(studio = {}) {
  const days = Array.isArray(studio.bookingDays) ? studio.bookingDays : [];
  const dayTotal = days.reduce((sum, day) => {
    const hours = Number(day?.durationHours || 0);
    return sum + (Number.isFinite(hours) ? hours : 0);
  }, 0);

  if (dayTotal > 0) return Number(dayTotal.toFixed(2));

  const quantity = Number(studio.quantity || 0);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function normalizeStudioBookingSource(source) {
  return source === 'create_new_deal' ? 'create_new_deal' : 'book_a_shoot';
}

function buildStudioBookingRow({ bookingId, userId = null, guestEmail = null, studio, source = 'book_a_shoot' }) {
  const totalPrice = Number(studio.totalPrice || 0);
  const normalizedSource = normalizeStudioBookingSource(source);

  return {
    stream_project_booking_id: bookingId,
    studio_id: String(studio.studioId),
    user_id: userId || null,
    guest_email: guestEmail || null,
    booking_date: resolveStudioBookingDate(studio),
    start_time: resolveStudioStartTime(studio),
    end_time: resolveStudioEndTime(studio),
    duration_hours: resolveStudioDurationHours(studio),
    time_zone: resolveStudioTimeZone(studio),
    status: 'requested',
    base_amount: Number.isFinite(totalPrice) ? totalPrice : 0,
    overtime_amount: 0,
    platform_fee: 0,
    net_amount: Number.isFinite(totalPrice) ? totalPrice : 0,
    source: normalizedSource,
    metadata: studio,
  };
}

async function replaceBookAShootStudioBookings({
  bookingId,
  userId = null,
  guestEmail = null,
  studioItems = [],
  source = 'book_a_shoot',
  transaction = null,
}) {
  if (!bookingId || !db.studio_bookings) {
    return { deleted: 0, created: 0 };
  }

  const normalizedSource = normalizeStudioBookingSource(source);

  const destroyCount = await db.studio_bookings.destroy({
    where: {
      stream_project_booking_id: bookingId,
      source: normalizedSource,
    },
    transaction,
  });

  const rows = (Array.isArray(studioItems) ? studioItems : [])
    .filter((studio) => studio?.studioId && Number(studio?.totalPrice || 0) > 0)
    .map((studio) => buildStudioBookingRow({
      bookingId,
      userId,
      guestEmail,
      studio,
      source: normalizedSource,
    }));

  if (rows.length > 0) {
    await db.studio_bookings.bulkCreate(rows, { transaction });
  }

  return {
    deleted: destroyCount,
    created: rows.length,
  };
}

module.exports = {
  replaceBookAShootStudioBookings,
};
