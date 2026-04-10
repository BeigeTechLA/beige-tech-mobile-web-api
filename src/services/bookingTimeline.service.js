const db = require('../models');

const BOOKING_STATUS = Object.freeze({
  INITIATED: 0,
  PRE_PRODUCTION: 1,
  POST_PRODUCTION: 2,
  REVISION: 3,
  COMPLETED: 4,
  CANCELLED: 5,
});

const TIMELINE_STAGE = Object.freeze({
  INITIATED: 0,
  PRE_PRODUCTION: 1,
  SHOOT_DAY: 2,
  POST_PRODUCTION: 3,
  REVISION: 4,
  COMPLETED: 5,
  ASSETS_DELIVERED: 6,
  CANCELLED: 7,
});

const TIMELINE_LABELS = Object.freeze({
  [TIMELINE_STAGE.INITIATED]: 'Initiated',
  [TIMELINE_STAGE.PRE_PRODUCTION]: 'Pre Production',
  [TIMELINE_STAGE.SHOOT_DAY]: 'Shoot Day',
  [TIMELINE_STAGE.POST_PRODUCTION]: 'Post Production',
  [TIMELINE_STAGE.REVISION]: 'Revision',
  [TIMELINE_STAGE.COMPLETED]: 'Completed',
  [TIMELINE_STAGE.ASSETS_DELIVERED]: 'Assets Delivered',
  [TIMELINE_STAGE.CANCELLED]: 'Cancelled',
});

const toDateOnly = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizePath = (filepath) =>
  String(filepath || '')
    .trim()
    .toLowerCase();

const parseBookingIdFromFilepath = (filepath) => {
  const normalized = String(filepath || '').trim();
  const hashMatch = normalized.match(/#(\d+)/);
  return hashMatch?.[1] ? Number(hashMatch[1]) : null;
};

const isPreProductionPath = (filepath) => /(^|\/)pre-production(\/|$)/i.test(filepath || '');
const isPostProductionPath = (filepath) => /(^|\/)post-production(\/|$)/i.test(filepath || '');

const isEditedFootagePath = (filepath) => {
  const normalized = normalizePath(filepath);
  return normalized.includes('/edited footage/') ||
    normalized.includes('/edited footages/') ||
    normalized.includes('/edited-footage/');
};

const isFinalDeliverablesPath = (filepath) => {
  const normalized = normalizePath(filepath);
  return normalized.includes('/final deliverables/') ||
    normalized.includes('/final-deliverables/');
};

const toNumberStatus = (value) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? BOOKING_STATUS.INITIATED : parsed;
};

const getTimelineStage = (booking, now = new Date()) => {
  const status = toNumberStatus(booking?.status);

  if (status === BOOKING_STATUS.CANCELLED || Number(booking?.is_cancelled) === 1) {
    return TIMELINE_STAGE.CANCELLED;
  }

  let stage = TIMELINE_STAGE.INITIATED;

  if (status >= BOOKING_STATUS.PRE_PRODUCTION) {
    stage = Math.max(stage, TIMELINE_STAGE.PRE_PRODUCTION);
  }

  const today = toDateOnly(now);
  const eventDate = booking?.event_date ? String(booking.event_date).slice(0, 10) : null;

  if (eventDate && today) {
    if (eventDate === today) {
      stage = Math.max(stage, TIMELINE_STAGE.SHOOT_DAY);
    } else if (eventDate < today) {
      stage = Math.max(stage, TIMELINE_STAGE.POST_PRODUCTION);
    }
  }

  if (status >= BOOKING_STATUS.POST_PRODUCTION) {
    stage = Math.max(stage, TIMELINE_STAGE.POST_PRODUCTION);
  }

  if (status >= BOOKING_STATUS.REVISION) {
    stage = Math.max(stage, TIMELINE_STAGE.REVISION);
  }

  if (status >= BOOKING_STATUS.COMPLETED) {
    stage = Math.max(stage, TIMELINE_STAGE.COMPLETED);
    // In current workflow, final deliverable upload marks project complete and delivered.
    stage = Math.max(stage, TIMELINE_STAGE.ASSETS_DELIVERED);
  }

  return stage;
};

const getTimelineLabel = (stage) => TIMELINE_LABELS[stage] || 'Unknown';

const getStatusTargetFromUploadPath = (filepath) => {
  if (!filepath) return null;
  if (isFinalDeliverablesPath(filepath)) return BOOKING_STATUS.COMPLETED;
  if (isEditedFootagePath(filepath)) return BOOKING_STATUS.REVISION;
  if (isPostProductionPath(filepath)) return BOOKING_STATUS.POST_PRODUCTION;
  if (isPreProductionPath(filepath)) return BOOKING_STATUS.PRE_PRODUCTION;
  return null;
};

const applyUploadDrivenStatusTransition = async ({ bookingId, filepath }) => {
  const normalizedBookingId = Number(bookingId) || parseBookingIdFromFilepath(filepath);
  if (!normalizedBookingId) {
    return { updated: false, reason: 'booking_id_not_found' };
  }

  const targetStatus = getStatusTargetFromUploadPath(filepath);
  if (targetStatus == null) {
    return { updated: false, reason: 'path_not_mapped' };
  }

  const booking = await db.stream_project_booking.findOne({
    where: { stream_project_booking_id: normalizedBookingId },
    attributes: ['stream_project_booking_id', 'status', 'is_cancelled'],
  });

  if (!booking) {
    return { updated: false, reason: 'booking_not_found' };
  }

  const currentStatus = toNumberStatus(booking.status);
  if (Number(booking.is_cancelled) === 1 || currentStatus === BOOKING_STATUS.CANCELLED) {
    return { updated: false, reason: 'booking_cancelled' };
  }

  if (targetStatus <= currentStatus) {
    return {
      updated: false,
      reason: 'already_at_or_ahead',
      current_status: currentStatus,
      target_status: targetStatus,
    };
  }

  await db.stream_project_booking.update(
    { status: targetStatus },
    { where: { stream_project_booking_id: normalizedBookingId } }
  );

  return {
    updated: true,
    booking_id: normalizedBookingId,
    previous_status: currentStatus,
    status: targetStatus,
  };
};

module.exports = {
  BOOKING_STATUS,
  TIMELINE_STAGE,
  getTimelineStage,
  getTimelineLabel,
  applyUploadDrivenStatusTransition,
};
