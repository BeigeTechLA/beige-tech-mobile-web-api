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

function calculateDurationHours(startTime, endTime) {
  if (!startTime || !endTime) return null;

  const [startHour, startMinute = 0, startSecond = 0] = String(startTime).split(':').map(Number);
  const [endHour, endMinute = 0, endSecond = 0] = String(endTime).split(':').map(Number);

  if ([startHour, startMinute, startSecond, endHour, endMinute, endSecond].some((part) => Number.isNaN(part))) {
    return null;
  }

  const startMinutes = startHour * 60 + startMinute + startSecond / 60;
  const endMinutes = endHour * 60 + endMinute + endSecond / 60;
  const diffMinutes = endMinutes - startMinutes;

  return diffMinutes > 0 ? Number((diffMinutes / 60).toFixed(2)) : null;
}

function normalizeStudioBookingSource(source) {
  return source === 'create_new_deal' ? 'create_new_deal' : 'book_a_shoot';
}

function buildStudioBookingRow({
  bookingId,
  userId = null,
  guestEmail = null,
  studio,
  source = 'book_a_shoot',
  bookingDay = null,
  amount = null,
}) {
  const totalPrice = Number(studio.totalPrice || 0);
  const rowAmount = Number(amount);
  const resolvedAmount = Number.isFinite(rowAmount) ? rowAmount : totalPrice;
  const normalizedSource = normalizeStudioBookingSource(source);

  return {
    stream_project_booking_id: bookingId,
    studio_id: String(studio.studioId),
    user_id: userId || null,
    guest_email: guestEmail || null,
    booking_date: bookingDay?.date || resolveStudioBookingDate(studio),
    start_time: bookingDay?.startTime || resolveStudioStartTime(studio),
    end_time: bookingDay?.endTime || resolveStudioEndTime(studio),
    duration_hours: bookingDay
      ? (bookingDay.durationHours || calculateDurationHours(bookingDay.startTime, bookingDay.endTime))
      : resolveStudioDurationHours(studio),
    time_zone: bookingDay?.timeZone || resolveStudioTimeZone(studio),
    status: 'requested',
    base_amount: Number.isFinite(resolvedAmount) ? resolvedAmount : 0,
    overtime_amount: 0,
    platform_fee: 0,
    net_amount: Number.isFinite(resolvedAmount) ? resolvedAmount : 0,
    source: normalizedSource,
    metadata: bookingDay ? { ...studio, bookingDay } : studio,
  };
}

function buildStudioBookingRows({ bookingId, userId = null, guestEmail = null, studio, source = 'book_a_shoot' }) {
  const bookingDays = Array.isArray(studio.bookingDays) ? studio.bookingDays.filter((day) => day?.date) : [];

  if (!bookingDays.length) {
    return [buildStudioBookingRow({ bookingId, userId, guestEmail, studio, source })];
  }

  const totalPrice = Number(studio.totalPrice || 0);
  const perDayAmount = Number.isFinite(totalPrice) && totalPrice > 0
    ? Number((totalPrice / bookingDays.length).toFixed(2))
    : 0;

  return bookingDays.map((bookingDay, index) => {
    const amount = index === bookingDays.length - 1
      ? Number((totalPrice - perDayAmount * (bookingDays.length - 1)).toFixed(2))
      : perDayAmount;

    return buildStudioBookingRow({
      bookingId,
      userId,
      guestEmail,
      studio,
      source,
      bookingDay,
      amount,
    });
  });
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
    .flatMap((studio) => buildStudioBookingRows({
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
