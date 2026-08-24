const db = require('../models');

const BLOCKING_STUDIO_BOOKING_STATUSES = ['confirmed', 'completed'];

class StudioBookingConflictError extends Error {
  constructor(conflicts = []) {
    super('Studio is already booked for one or more selected dates');
    this.name = 'StudioBookingConflictError';
    this.statusCode = 409;
    this.conflicts = conflicts;
  }
}

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

function normalizeDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10);
}

function getStudioBookingKeys(studioId) {
  return [...new Set([String(studioId || '').trim()].filter(Boolean))];
}

async function resolveStudioBookingKeys(studioIds = [], transaction = null) {
  const baseKeys = [...new Set((Array.isArray(studioIds) ? studioIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))];

  if (!baseKeys.length || !db.studios) return baseKeys;

  const numericStudioIds = baseKeys
    .filter((id) => /^\d+$/.test(id))
    .map(Number);
  const studioRows = await db.studios.findAll({
    where: {
      [db.Sequelize.Op.or]: [
        { slug: { [db.Sequelize.Op.in]: baseKeys } },
        ...(numericStudioIds.length
          ? [{ studio_id: { [db.Sequelize.Op.in]: numericStudioIds } }]
          : []),
      ],
    },
    attributes: ['studio_id', 'slug'],
    transaction,
  });

  const resolvedKeys = new Set(baseKeys);
  studioRows.forEach((studio) => {
    const plain = studio.get ? studio.get({ plain: true }) : studio;
    if (plain.studio_id !== null && plain.studio_id !== undefined) {
      resolvedKeys.add(String(plain.studio_id));
    }
    if (plain.slug) {
      resolvedKeys.add(String(plain.slug));
    }
  });

  return [...resolvedKeys];
}

function getStudioItemBookingDates(studio = {}) {
  const days = Array.isArray(studio.bookingDays) ? studio.bookingDays : [];
  const dates = days
    .map((day) => normalizeDateOnly(day?.date))
    .filter(Boolean);

  if (!dates.length) {
    const selectedDate = normalizeDateOnly(studio.selectedDate);
    if (selectedDate) dates.push(selectedDate);
  }

  return [...new Set(dates)];
}

async function findConfirmedStudioBookingConflicts({
  studioItems = [],
  excludeBookingId = null,
  transaction = null,
}) {
  if (!db.studio_bookings) return [];

  const selectedItems = (Array.isArray(studioItems) ? studioItems : [])
    .map((studio) => ({
      studio,
      studioId: String(studio?.studioId || studio?.studio_id || '').trim(),
      dates: getStudioItemBookingDates(studio),
    }))
    .filter((item) => item.studioId && item.dates.length);

  if (!selectedItems.length) return [];

  const studioIds = await resolveStudioBookingKeys(
    [...new Set(selectedItems.flatMap((item) => getStudioBookingKeys(item.studioId)))],
    transaction
  );
  const dates = [...new Set(selectedItems.flatMap((item) => item.dates))];
  const where = {
    studio_id: { [db.Sequelize.Op.in]: studioIds },
    booking_date: { [db.Sequelize.Op.in]: dates },
    status: { [db.Sequelize.Op.in]: BLOCKING_STUDIO_BOOKING_STATUSES },
  };

  const normalizedExcludeBookingId = Number(excludeBookingId || 0);
  if (Number.isFinite(normalizedExcludeBookingId) && normalizedExcludeBookingId > 0) {
    where.stream_project_booking_id = { [db.Sequelize.Op.ne]: normalizedExcludeBookingId };
  }

  const rows = await db.studio_bookings.findAll({
    where,
    attributes: [
      'studio_booking_id',
      'stream_project_booking_id',
      'studio_id',
      'booking_date',
      'start_time',
      'end_time',
      'status',
    ],
    transaction,
  });

  return rows.map((row) => {
    const plain = row.get ? row.get({ plain: true }) : row;
    return {
      studio_booking_id: plain.studio_booking_id,
      stream_project_booking_id: plain.stream_project_booking_id,
      studio_id: plain.studio_id,
      date: plain.booking_date,
      start_time: plain.start_time,
      end_time: plain.end_time,
      status: plain.status,
    };
  });
}

async function assertNoConfirmedStudioBookingConflicts(options = {}) {
  const conflicts = await findConfirmedStudioBookingConflicts(options);
  if (conflicts.length) {
    throw new StudioBookingConflictError(conflicts);
  }
  return conflicts;
}

async function confirmStudioBookingsForPaidBooking({ bookingId, transaction = null }) {
  if (!bookingId || !db.studio_bookings) return { updated: 0 };

  const studioBookings = await db.studio_bookings.findAll({
    where: {
      stream_project_booking_id: bookingId,
      status: { [db.Sequelize.Op.notIn]: ['cancelled', 'rejected'] },
    },
    transaction,
  });

  if (!studioBookings.length) return { updated: 0 };

  const studioItems = studioBookings.map((booking) => {
    const plain = booking.get ? booking.get({ plain: true }) : booking;
    return {
      studioId: plain.studio_id,
      selectedDate: plain.booking_date,
      bookingDays: plain.booking_date ? [{ date: plain.booking_date }] : [],
    };
  });

  await assertNoConfirmedStudioBookingConflicts({
    studioItems,
    excludeBookingId: bookingId,
    transaction,
  });

  const [updated] = await db.studio_bookings.update(
    { status: 'confirmed' },
    {
      where: {
        stream_project_booking_id: bookingId,
        status: 'requested',
      },
      transaction,
    }
  );

  return { updated };
}

async function assertNoConfirmedStudioBookingConflictsForBooking({ bookingId, transaction = null }) {
  if (!bookingId || !db.studio_bookings) return [];

  const studioBookings = await db.studio_bookings.findAll({
    where: {
      stream_project_booking_id: bookingId,
      status: { [db.Sequelize.Op.notIn]: ['cancelled', 'rejected'] },
    },
    transaction,
  });

  const studioItems = studioBookings.map((booking) => {
    const plain = booking.get ? booking.get({ plain: true }) : booking;
    return {
      studioId: plain.studio_id,
      selectedDate: plain.booking_date,
      bookingDays: plain.booking_date ? [{ date: plain.booking_date }] : [],
    };
  });

  return assertNoConfirmedStudioBookingConflicts({
    studioItems,
    excludeBookingId: bookingId,
    transaction,
  });
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
  BLOCKING_STUDIO_BOOKING_STATUSES,
  StudioBookingConflictError,
  assertNoConfirmedStudioBookingConflicts,
  assertNoConfirmedStudioBookingConflictsForBooking,
  confirmStudioBookingsForPaidBooking,
  findConfirmedStudioBookingConflicts,
  replaceBookAShootStudioBookings,
};
