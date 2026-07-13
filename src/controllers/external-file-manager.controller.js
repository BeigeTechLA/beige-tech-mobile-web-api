const DEFAULT_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_API_BASE_URL || 'http://localhost:5002/v1/external-file-manager';
const PUBLIC_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_PUBLIC_BASE_URL || '';
const INTERNAL_KEY = process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../models');
const { users, crew_members, assigned_crew, stream_project_booking, sales_leads, sales_lead_activities } = db;
const bookingTimelineService = require('../services/bookingTimeline.service');
const emailService = require('../utils/emailService');
const otpService = require('../utils/otpService');

const FACE_SCAN_SERVICE_URL = process.env.FACE_SCAN_SERVICE_URL || '';
const FACE_SCAN_PROVIDER_TIMEOUT_MS = Math.max(15000, Number(process.env.FACE_SCAN_PROVIDER_TIMEOUT_MS || 300000));
const FACE_SCAN_MAX_CANDIDATES = Math.max(25, Number(process.env.FACE_SCAN_MAX_CANDIDATES || 80));
const FACE_SCAN_INDEX_CONCURRENCY = Math.max(1, Number(process.env.FACE_SCAN_INDEX_CONCURRENCY || 3));
const EXTERNAL_FILE_MANAGER_PROXY_TIMEOUT_MS = Math.max(
  15000,
  Number(process.env.EXTERNAL_FILE_MANAGER_PROXY_TIMEOUT_MS || 300000)
);
const COMMON_EVENT_ID_PREFIX = 'event_';
let commonEventsTableReadyPromise = null;
let commonEventCreatorFoldersTableReadyPromise = null;
let faceEmbeddingsTableReadyPromise = null;
let fileShareTableReadyPromise = null;
let fileShareOtpTableReadyPromise = null;
let fileShareAccessLogsTableReadyPromise = null;

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'x-internal-key': INTERNAL_KEY,
});

const INTERNAL_FILE_MANAGER_ORIGIN = (() => {
  try {
    return new URL(DEFAULT_BASE_URL).origin.toLowerCase();
  } catch (error) {
    return '';
  }
})();

const PUBLIC_FILE_MANAGER_ORIGIN = (() => {
  try {
    if (!PUBLIC_BASE_URL) return '';
    return new URL(PUBLIC_BASE_URL).origin;
  } catch (error) {
    return '';
  }
})();

const shouldRewriteToPublicOrigin = (origin, hostname) => {
  const normalizedHostname = String(hostname || '').toLowerCase();
  const isLocalHost =
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1';

  if (isLocalHost) return true;
  if (INTERNAL_FILE_MANAGER_ORIGIN && String(origin || '').toLowerCase() === INTERNAL_FILE_MANAGER_ORIGIN) {
    return true;
  }
  return false;
};

const getRequestOrigin = (req) => {
  if (!req) return '';
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers?.host || '').trim();
  const proto = forwardedProto || (req.secure ? 'https' : 'http');
  if (!host) return '';
  return `${proto}://${host}`;
};

const rewriteExternalServiceUrl = (rawUrl, req) => {
  const value = String(rawUrl || '').trim();
  if (!value) return value;

  try {
    const parsed = new URL(value);
    if (!shouldRewriteToPublicOrigin(parsed.origin, parsed.hostname)) {
      return value;
    }
    const targetOrigin = PUBLIC_FILE_MANAGER_ORIGIN || getRequestOrigin(req);
    if (!targetOrigin) return value;
    return `${targetOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return value;
  }
};

const withPublicUrl = (result, req) => {
  const currentUrl = result?.data?.url;
  if (typeof currentUrl !== 'string') return result;

  return {
    ...result,
    data: {
      ...(result.data || {}),
      url: rewriteExternalServiceUrl(currentUrl, req),
    },
  };
};

const getRequestUserId = (req) => req.userId || req.user?.userId || null;
const getRequestUserRole = (req) => req.userRole || req.user?.userRole || null;
const getNormalizedRequestUserRole = (req) => String(getRequestUserRole(req) || '').trim().toLowerCase();
const isAdminRole = (req) => ['admin', 'super_admin', 'superadmin', 'sales_admin'].includes(getNormalizedRequestUserRole(req));
const isClientRole = (req) => getNormalizedRequestUserRole(req) === 'client';
const isCreatorRole = (req) => {
  const role = getNormalizedRequestUserRole(req);
  return ['creator', 'creative', 'Creative'].includes(role);
};
const isCommonEventVisibilityLimitedRole = (req) => ['client', 'creator', 'creative'].includes(getNormalizedRequestUserRole(req));
const isCommonEventExternalId = (value) =>
  String(value || '').trim().toLowerCase().startsWith(COMMON_EVENT_ID_PREFIX);

const extractCommonEventExternalIdFromPath = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/(event_[a-z0-9_]+)/);
  return match?.[1] || null;
};

const normalizeForPathMatch = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseBookingIdFromFilepath = (filepath) => {
  const normalized = String(filepath || '').trim();
  if (!normalized) return null;

  const hashMatch = normalized.match(/#(\d+)/);
  if (hashMatch?.[1]) {
    return Number(hashMatch[1]);
  }

  const normalizedForMatch = normalized.toLowerCase();
  const phaseMatch = normalizedForMatch.match(/\/(pre[-_ ]?production|post[-_ ]?production)\//);
  if (phaseMatch?.index > 0) {
    const prefix = normalizedForMatch.slice(0, phaseMatch.index);
    const digits = prefix.match(/(\d+)(?!.*\d)/);
    if (digits?.[1]) {
      return Number(digits[1]);
    }
  }

  return null;
};

const normalizeEmailAddress = (value) => String(value || '').trim().toLowerCase();

const getFirstName = (value, fallback = 'Client') => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  const [firstName] = normalized.split(/\s+/).filter(Boolean);
  return firstName || fallback;
};

const parseArrayLikeValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (error) {
      // Fall back to comma-separated parsing for legacy string values.
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const parseActivityData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return {};
  }
};

const bookingHasEditingService = (booking) => {
  const editsNeeded = booking?.edits_needed;
  const hasEditsNeededFlag =
    editsNeeded === 1 ||
    editsNeeded === true ||
    String(editsNeeded || '').trim() === '1' ||
    String(editsNeeded || '').trim().toLowerCase() === 'true';

  return (
    hasEditsNeededFlag ||
    parseArrayLikeValue(booking?.video_edit_types).length > 0 ||
    parseArrayLikeValue(booking?.photo_edit_types).length > 0
  );
};

const buildProjectFilesUrl = (bookingId) => {
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (!frontendUrl || !bookingId) return '';
  return `${frontendUrl}/affiliate/dashboard`;
};

const buildAdminDashboardUrl = () => {
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (!frontendUrl) return '';
  return `${frontendUrl}/admin/dashboard`;
};

const buildCreatorDashboardUrl = () => {
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (!frontendUrl) return '';
  return `${frontendUrl}/creator/dashboard`;
};

const formatEditingSubmissionTime = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
};

const isFilesForEditingCopy = ({ phase }) =>
  String(phase || '').trim().toLowerCase() === 'post';

const isRawFootageUploadPath = (filepath) =>
  String(filepath || '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .includes('/post-production/raw-footage/');

const normalizePathSegmentKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const isEditedRevisionVersionPath = (filepath) => {
  const segments = String(filepath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map(normalizePathSegmentKey)
    .filter(Boolean);

  const postProductionIndex = segments.indexOf('postproduction');
  if (postProductionIndex === -1) return false;

  return (
    segments[postProductionIndex + 1] === 'edits' &&
    segments[postProductionIndex + 2] === 'revisions' &&
    /^version0*[1-9]\d*$/.test(segments[postProductionIndex + 3] || '')
  );
};

const getEditedRevisionVersionLabel = (filepath) => {
  const segments = String(filepath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  const versionSegment = segments.find((segment) =>
    /^version\s*0*[1-9]\d*$/i.test(String(segment || '').replace(/[^a-z0-9]+/gi, ''))
  );
  return versionSegment || '';
};

const getFileNameFromPath = (filepath) =>
  String(filepath || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';

const getUploadFolderName = (filepath, phase) => {
  const normalizedPath = String(filepath || '').trim().replace(/\\/g, '/');
  if (!normalizedPath) return '';

  const phaseSegment = phase === 'post' ? '/post-production/' : '/pre-production/';
  const normalizedLower = normalizedPath.toLowerCase();
  const phaseIndex = normalizedLower.indexOf(phaseSegment);

  if (phaseIndex === -1) {
    const segments = normalizedPath.split('/').filter(Boolean);
    return segments.length > 1 ? segments[segments.length - 2] : segments[0] || '';
  }

  const afterPhase = normalizedPath.slice(phaseIndex + phaseSegment.length);
  const afterSegments = afterPhase.split('/').filter(Boolean);
  if (afterSegments.length > 1) return afterSegments[0];
  if (afterSegments.length === 1) return phase === 'post' ? 'post-production' : 'pre-production';
  return phase === 'post' ? 'post-production' : 'pre-production';
};

const getUploadFolderPath = (filepath, phase) => {
  const normalizedPath = String(filepath || '').trim().replace(/\\/g, '/');
  if (!normalizedPath) return '';

  const phaseSegment = phase === 'post' ? '/post-production/' : '/pre-production/';
  const normalizedLower = normalizedPath.toLowerCase();
  const phaseIndex = normalizedLower.indexOf(phaseSegment);

  if (phaseIndex === -1) {
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length <= 1) return normalizedPath;
    return segments.slice(0, -1).join('/');
  }

  const phaseRoot = normalizedPath.slice(0, phaseIndex + phaseSegment.length - 1);
  const afterPhase = normalizedPath.slice(phaseIndex + phaseSegment.length);
  const afterSegments = afterPhase.split('/').filter(Boolean);

  if (!afterSegments.length) return phaseRoot;
  if (afterSegments.length === 1) return phaseRoot;
  return `${phaseRoot}/${afterSegments.slice(0, -1).join('/')}`;
};

const resolveUploadPhase = (filepath) => {
  const normalized = String(filepath || '')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/\s+/g, '-');
  if (normalized.includes('/pre-production/')) return 'pre';
  if (normalized.includes('/post-production/')) return 'post';
  return null;
};

const getBookingForUploadEmail = async (bookingId) => {
  if (!bookingId) return null;
  return stream_project_booking.findOne({
    where: {
      stream_project_booking_id: Number(bookingId),
      is_active: 1,
    },
    include: [
      {
        model: db.users,
        as: 'user',
        required: false,
        attributes: ['id', 'name', 'email'],
      },
      {
        model: sales_leads,
        as: 'sales_leads',
        required: false,
        attributes: ['lead_id'],
      },
    ],
  });
};

const getBookingForEditingInternalEmail = async (bookingId) => {
  if (!bookingId) return null;
  return stream_project_booking.findOne({
    where: {
      stream_project_booking_id: Number(bookingId),
      is_active: 1,
    },
    include: [
      {
        model: db.users,
        as: 'user',
        required: false,
        attributes: ['id', 'name', 'email'],
      },
      {
        model: assigned_crew,
        as: 'assigned_crews',
        required: false,
        where: { is_active: 1 },
        include: [
          {
            model: crew_members,
            as: 'crew_member',
            required: false,
            attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
    ],
  });
};

const parseRecipientEnvList = (...values) =>
  values
    .flatMap((value) => String(value || '').split(','))
    .map((value) => normalizeEmailAddress(value))
    .filter(Boolean);

const buildFilesForEditingInternalRecipients = (booking) => {
  const recipients = [];
  const seenEmails = new Set();
  const pushRecipient = ({ email, name, data = {} }) => {
    const normalizedEmail = normalizeEmailAddress(email);
    if (!normalizedEmail || seenEmails.has(normalizedEmail)) return;
    seenEmails.add(normalizedEmail);
    recipients.push({ email: normalizedEmail, name, data });
  };

  for (const email of parseRecipientEnvList(
    process.env.FILES_FOR_EDITING_INTERNAL_TEAM_EMAIL,
    process.env.POST_PRODUCTION_TEAM_EMAIL,
    process.env.ADMIN_NOTIFICATION_EMAIL,
    process.env.SALES_NOTIFICATION_EMAIL
  )) {
    pushRecipient({
      email,
      name: 'Admin',
      data: {
        recipient_name: 'Admin',
        dashboard_link: buildAdminDashboardUrl(),
      },
    });
  }

  const assignedCrews = Array.isArray(booking?.assigned_crews) ? booking.assigned_crews : [];
  for (const assignment of assignedCrews) {
    const crew = assignment?.crew_member;
    const name = [crew?.first_name, crew?.last_name].filter(Boolean).join(' ').trim() || 'Creative Partner';
    pushRecipient({
      email: crew?.email,
      name,
      data: {
        recipient_name: name,
        dashboard_link: buildCreatorDashboardUrl() || buildAdminDashboardUrl(),
      },
    });
  }

  return recipients;
};

const getAdminNotificationRecipients = () =>
  parseRecipientEnvList(
    process.env.EDITS_DELIVERED_TOCLIENT_ADMIN_EMAIL,
    process.env.FILES_FOR_EDITING_INTERNAL_TEAM_EMAIL,
    process.env.POST_PRODUCTION_TEAM_EMAIL,
    process.env.ADMIN_NOTIFICATION_EMAIL,
    process.env.SALES_NOTIFICATION_EMAIL
  );

const getAssignedCreativePartnerRecipients = (booking) => {
  const seenEmails = new Set();
  const assignedCrews = Array.isArray(booking?.assigned_crews) ? booking.assigned_crews : [];

  return assignedCrews
    .map((assignment) => {
      const crew = assignment?.crew_member;
      const email = normalizeEmailAddress(crew?.email);
      if (!email || seenEmails.has(email)) return null;
      seenEmails.add(email);

      const name = [crew?.first_name, crew?.last_name].filter(Boolean).join(' ').trim() || 'Creative Partner';
      return {
        email,
        name,
        data: {
          recipient_name: name,
          frontend_url: buildCreatorDashboardUrl() || buildAdminDashboardUrl(),
        },
      };
    })
    .filter(Boolean);
};

const sendFilesForEditingInternalEmailForCopy = async ({
  externalId,
  phase,
  targetPath,
  sourcePaths = [],
  submittedByName = 'Client',
}) => {
  try {
    if (!isFilesForEditingCopy({ phase, targetPath })) return;

    const booking = await getBookingForEditingInternalEmail(externalId);
    if (!booking) return;

    const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
    const recipients = buildFilesForEditingInternalRecipients(plainBooking);
    if (!recipients.length) return;

    const bookingReference = String(plainBooking?.stream_project_booking_id || externalId);
    const projectName = String(
      plainBooking?.project_name ||
      plainBooking?.client_name ||
      buildWorkspaceFolderName(plainBooking) ||
      `Booking #${bookingReference}`
    );

    const emailResult = await emailService.sendFilesForEditingInternalTeamEmail({
      recipients,
      data: {
        shoot_name: projectName,
        project_name: projectName,
        booking_id: bookingReference,
        order_id: bookingReference,
        total_files: sourcePaths.length || 1,
        submitted_by: submittedByName || 'Client',
        submission_time: formatEditingSubmissionTime(),
        dashboard_link: buildAdminDashboardUrl(),
      },
    });

    if (!emailResult?.success) {
      console.error(
        'Files for editing internal team email failed:',
        emailResult?.error || emailResult?.failedRecipients || 'Unknown email error'
      );
    }
  } catch (error) {
    console.error('Files for editing internal team email trigger failed:', error?.message || error);
  }
};

const getLinkedLeadIdsFromBooking = (booking) =>
  Array.isArray(booking?.sales_leads)
    ? booking.sales_leads
        .map((lead) => Number(lead?.lead_id))
        .filter((leadId) => Number.isInteger(leadId) && leadId > 0)
    : [];

const hasUploadEmailAlreadyBeenSent = async ({
  linkedLeadIds = [],
  bookingId,
  folderPath,
  emailEvent = '',
}) => {
  if (!linkedLeadIds.length || !bookingId || !folderPath || !emailEvent) return false;

  const priorActivityRows = await sales_lead_activities.findAll({
    where: {
      lead_id: linkedLeadIds,
      activity_type: 'status_changed',
    },
    attributes: ['activity_data'],
  });

  const normalizedBookingId = String(bookingId).trim();
  const normalizedFolderPath = String(folderPath).trim().toLowerCase();

  return priorActivityRows.some((row) => {
    const activityData = parseActivityData(row?.activity_data);
    return (
      String(activityData?.email_event || '').trim().toLowerCase() === String(emailEvent).trim().toLowerCase() &&
      String(activityData?.booking_id || '').trim() === normalizedBookingId &&
      String(activityData?.folder_path || '').trim().toLowerCase() === normalizedFolderPath
    );
  });
};

const recordUploadEmailSent = ({
  linkedLeadIds = [],
  bookingId,
  folderPath,
  filepath,
  emailEvent = '',
}) => {
  if (!linkedLeadIds.length || !bookingId || !folderPath || !emailEvent) return null;

  return sales_lead_activities.create({
    lead_id: linkedLeadIds[0],
    activity_type: 'status_changed',
    activity_data: {
      email_event: String(emailEvent),
      booking_id: String(bookingId),
      folder_path: String(folderPath),
      filepath: String(filepath || ''),
      source: 'external_file_manager_upload',
    },
    performed_by_user_id: null,
  });
};

const sendUploadTemplateEmailForFile = async ({ filepath, fileName, uploadedByName = 'Beige User', uploadedById = '' }) => {
  try {
    const bookingId = parseBookingIdFromFilepath(filepath);
    if (!bookingId) return;

    const phase = resolveUploadPhase(filepath);
    if (!phase) return;

    const booking = await getBookingForUploadEmail(bookingId);
    if (!booking) return;

    const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
    const linkedLeadIds = getLinkedLeadIdsFromBooking(plainBooking);
    const primaryRecipientEmail =
      normalizeEmailAddress(plainBooking?.user?.email) ||
      normalizeEmailAddress(plainBooking?.guest_email);
    const recipientEmails = primaryRecipientEmail ? [primaryRecipientEmail] : [];
    if (!recipientEmails.length) return;

    const recipientName = String(
      plainBooking?.user?.name ||
      plainBooking?.client_name ||
      plainBooking?.project_name ||
      plainBooking?.guest_email ||
      'Client'
    ).trim();
    const bookingReference = String(plainBooking?.stream_project_booking_id || bookingId);
    const projectName = String(plainBooking?.project_name || plainBooking?.client_name || `Project #${bookingId}`);
    const uploadedFileName = String(fileName || String(filepath).split('/').pop() || '');
    const projectFilesUrl = buildProjectFilesUrl(bookingReference);
    const folderPath = getUploadFolderPath(filepath, phase);
    const uploadEmailEvent =
      phase === 'pre'
        ? 'pre_production_brief_uploaded'
        : phase === 'post' && !isRawFootageUploadPath(filepath)
          ? 'post_production_upload'
          : '';

    if (
      uploadEmailEvent &&
      await hasUploadEmailAlreadyBeenSent({
        linkedLeadIds,
        bookingId: bookingReference,
        folderPath,
        emailEvent: uploadEmailEvent,
      })
    ) {
      return;
    }

    const payload = {
      recipient_name: recipientName,
      client_name: getFirstName(recipientName),
      booking_id: bookingReference,
      order_id: bookingReference,
      order_name: projectName,
      project_name: projectName,
      project_type: projectName,
      file_name: uploadedFileName,
      file_path: String(filepath || ''),
      brief_url: projectFilesUrl,
      brief_display_url: projectFilesUrl || String(filepath || ''),
      folder_name: getUploadFolderName(filepath, phase),
      post_production_files_url: projectFilesUrl,
      post_production_files_display_url: projectFilesUrl || String(filepath || ''),
      cp_firstname: String(uploadedByName || 'Beige User'),
      uploaded_by_name: String(uploadedByName || 'Beige User'),
      uploaded_by_id: String(uploadedById || ''),
      uploaded_at: new Date().toISOString(),
    };

    if (phase === 'pre') {
      await emailService.sendPreProductionUploadedTemplateEmail({
        recipients: recipientEmails,
        data: payload,
      });
      await recordUploadEmailSent({
        linkedLeadIds,
        bookingId: bookingReference,
        folderPath,
        filepath,
        emailEvent: uploadEmailEvent,
      });
    } else if (phase === 'post' && !isRawFootageUploadPath(filepath)) {
      await emailService.sendPostProductionUploadedTemplateEmail({
        recipients: recipientEmails,
        data: payload,
      });
      await recordUploadEmailSent({
        linkedLeadIds,
        bookingId: bookingReference,
        folderPath,
        filepath,
        emailEvent: uploadEmailEvent,
      });
    }
  } catch (error) {
    console.error('Upload email trigger failed:', error?.message || error);
  }
};

const sendRawFootageReadyEmailForUploadedFiles = async ({ filepaths = [] }) => {
  try {
    const rawFootagePath = filepaths.find((filepath) => isRawFootageUploadPath(filepath));
    if (!rawFootagePath) return;

    const bookingId = parseBookingIdFromFilepath(rawFootagePath);
    if (!bookingId) return;

    const booking = await getBookingForUploadEmail(bookingId);
    if (!booking) return;

    const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
    // Raw footage ready email is only for raw-footage-only bookings.
    if (bookingHasEditingService(plainBooking)) return;

    const linkedLeadIds = Array.isArray(plainBooking?.sales_leads)
      ? plainBooking.sales_leads
          .map((lead) => Number(lead?.lead_id))
          .filter((leadId) => Number.isInteger(leadId) && leadId > 0)
      : [];

    if (linkedLeadIds.length) {
      const priorActivityRows = await sales_lead_activities.findAll({
        where: {
          lead_id: linkedLeadIds,
          activity_type: 'status_changed',
        },
        attributes: ['lead_id', 'activity_data'],
      });

      const alreadySent = priorActivityRows.some((row) => {
        const activityData = parseActivityData(row?.activity_data);
        return String(activityData?.email_event || '').trim().toLowerCase() === 'raw_footage_ready';
      });

      if (alreadySent) return;
    }

    const toEmail = normalizeEmailAddress(plainBooking?.user?.email || plainBooking?.guest_email);
    if (!toEmail) return;

    const accessFilesLink = buildProjectFilesUrl(plainBooking?.stream_project_booking_id || bookingId);
    if (!accessFilesLink) return;

    const recipientName = String(
      plainBooking?.user?.name ||
      plainBooking?.client_name ||
      plainBooking?.project_name ||
      plainBooking?.guest_email ||
      ''
    ).trim();

    const emailResult = await emailService.sendRawFootageReadyEmail({
      to_email: toEmail,
      booking_id: plainBooking?.stream_project_booking_id || bookingId,
      first_name: getFirstName(recipientName, 'there'),
      access_files_link: accessFilesLink,
    });

    if (!emailResult?.success) {
      console.error(
        'Raw footage ready email trigger failed:',
        emailResult?.error || 'Unknown email error'
      );
      return;
    }

    if (linkedLeadIds.length) {
      const rawFootageLeadId = linkedLeadIds[0];
      await sales_lead_activities.create({
        lead_id: rawFootageLeadId,
        activity_type: 'status_changed',
        activity_data: {
          email_event: 'raw_footage_ready',
          booking_id: plainBooking?.stream_project_booking_id || bookingId,
          access_files_link: accessFilesLink,
          source: 'external_file_manager_upload',
          filepath: rawFootagePath,
        },
        performed_by_user_id: null,
      });
    }
  } catch (error) {
    console.error('Raw footage ready email trigger failed:', error?.message || error);
  }
};

const sendRawFilesUploadedEmailsForUploadedItems = async ({
  items = [],
  uploadedByName = 'Beige User',
  uploadedById = '',
}) => {
  try {
    const rawFootageItemsByBooking = new Map();

    for (const item of items) {
      const filepath = item?.filepath;
      if (!isRawFootageUploadPath(filepath)) continue;

      const bookingId = parseBookingIdFromFilepath(filepath);
      if (!bookingId) continue;

      const bookingKey = String(bookingId);
      const existingItems = rawFootageItemsByBooking.get(bookingKey) || [];
      existingItems.push(item);
      rawFootageItemsByBooking.set(bookingKey, existingItems);
    }

    for (const [bookingId, bookingItems] of rawFootageItemsByBooking.entries()) {
      const booking = await getBookingForUploadEmail(bookingId);
      if (!booking) continue;

      const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
      const toEmail = normalizeEmailAddress(plainBooking?.user?.email || plainBooking?.guest_email);
      const recipientName = String(
        plainBooking?.user?.name ||
        plainBooking?.client_name ||
        plainBooking?.project_name ||
        plainBooking?.guest_email ||
        ''
      ).trim();
      const bookingReference = String(plainBooking?.stream_project_booking_id || bookingId);
      const projectName = String(plainBooking?.project_name || plainBooking?.client_name || `Project #${bookingId}`);
      const dashboardLink = buildProjectFilesUrl(bookingReference);
      const adminDashboardLink = buildAdminDashboardUrl();
      const uploadedAt = new Date().toISOString();
      const totalFiles = bookingItems.length || 1;

      if (toEmail) {
        const clientEmailResult = await emailService.sendRawFilesUploadedClientEmail({
          recipients: [toEmail],
          data: {
            first_name: getFirstName(recipientName, 'there'),
            client_name: getFirstName(recipientName, 'there'),
            shoot_name: projectName,
            project_name: projectName,
            booking_id: bookingReference,
            order_id: bookingReference,
            total_files: totalFiles,
            frontend_url: dashboardLink,
            dashboard_link: dashboardLink,
            uploaded_at: uploadedAt,
          },
        });

        if (!clientEmailResult?.success) {
          console.error(
            'Raw files uploaded client email failed:',
            clientEmailResult?.error || clientEmailResult?.failedRecipients || 'Unknown email error'
          );
        }
      }

      const adminEmailResult = await emailService.sendRawFilesUploadedAdminEmail({
        recipient_name: 'Admin',
        shoot_name: projectName,
        project_name: projectName,
        booking_id: bookingReference,
        order_id: bookingReference,
        Team_member_name: String(uploadedByName || 'Beige User'),
        team_member_name: String(uploadedByName || 'Beige User'),
        uploaded_by: String(uploadedByName || 'Beige User'),
        uploaded_by_id: String(uploadedById || ''),
        total_files: totalFiles,
        upload_time: uploadedAt,
        uploaded_at: uploadedAt,
        dashboard_link: adminDashboardLink,
      });

      if (!adminEmailResult?.success) {
        console.error(
          'Raw files uploaded admin email failed:',
          adminEmailResult?.error || adminEmailResult?.failedRecipients || 'Unknown email error'
        );
      }
    }
  } catch (error) {
    console.error('Raw files uploaded email trigger failed:', error?.message || error);
  }
};

const sendEditsDeliveredEmailsForUploadedItems = async ({ items = [], deliveredByName = 'Production Team' }) => {
  try {
    const editedRevisionItemsByBooking = new Map();

    for (const item of items) {
      const filepath = item?.filepath;
      if (!isEditedRevisionVersionPath(filepath)) continue;

      const bookingId = parseBookingIdFromFilepath(filepath);
      if (!bookingId) continue;

      const phase = resolveUploadPhase(filepath);
      const folderPath = getUploadFolderPath(filepath, phase || 'post');
      const bookingKey = `${bookingId}::${folderPath.toLowerCase()}`;
      const existingItems = editedRevisionItemsByBooking.get(bookingKey) || {
        bookingId: String(bookingId),
        folderPath,
        items: [],
      };
      existingItems.items.push(item);
      editedRevisionItemsByBooking.set(bookingKey, existingItems);
    }

    for (const entry of editedRevisionItemsByBooking.values()) {
      const booking = await getBookingForUploadEmail(entry.bookingId);
      if (!booking) continue;

      const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
      const linkedLeadIds = getLinkedLeadIdsFromBooking(plainBooking);
      const bookingReference = String(plainBooking?.stream_project_booking_id || entry.bookingId);

      const hasClientEmailAlreadyBeenSent =
        await hasUploadEmailAlreadyBeenSent({
          linkedLeadIds,
          bookingId: bookingReference,
          folderPath: entry.folderPath,
          emailEvent: 'edits_delivered_client',
        });

      const toEmail = normalizeEmailAddress(plainBooking?.user?.email || plainBooking?.guest_email);

      const recipientName = String(
        plainBooking?.user?.name ||
        plainBooking?.client_name ||
        plainBooking?.project_name ||
        plainBooking?.guest_email ||
        ''
      ).trim();
      const projectName = String(
        plainBooking?.project_name ||
        plainBooking?.client_name ||
        `Booking #${bookingReference}`
      );
      const reviewLink = buildProjectFilesUrl(bookingReference);
      const deliveredAt = new Date().toISOString();
      const deliveryTime = formatEditingSubmissionTime(deliveredAt);

      if (toEmail && !hasClientEmailAlreadyBeenSent) {
        const emailResult = await emailService.sendEditsDeliveredClientEmail({
          to: toEmail,
          data: {
            first_name: getFirstName(recipientName, 'there'),
            client_name: getFirstName(recipientName, 'there'),
            shoot_name: projectName,
            project_name: projectName,
            booking_id: bookingReference,
            order_id: bookingReference,
            total_files: entry.items.length || 1,
            frontend_url: reviewLink,
            review_link: reviewLink,
            delivered_at: deliveredAt,
          },
        });

        if (!emailResult?.success) {
          console.error(
            'Edits delivered client email failed:',
            emailResult?.error || 'Unknown email error'
          );
        } else {
          await recordUploadEmailSent({
            linkedLeadIds,
            bookingId: bookingReference,
            folderPath: entry.folderPath,
            filepath: entry.items[0]?.filepath || '',
            emailEvent: 'edits_delivered_client',
          });
        }
      }

      const adminRecipients = getAdminNotificationRecipients();
      const hasAdminEmailAlreadyBeenSent =
        await hasUploadEmailAlreadyBeenSent({
          linkedLeadIds,
          bookingId: bookingReference,
          folderPath: entry.folderPath,
          emailEvent: 'edits_delivered_to_client_admin',
        });

      if (adminRecipients.length && !hasAdminEmailAlreadyBeenSent) {
        const adminEmailResult = await emailService.sendEditsDeliveredToClientAdminEmail({
          recipients: adminRecipients,
          data: {
            recipient_name: 'Admin',
            shoot_name: projectName,
            project_name: projectName,
            booking_id: bookingReference,
            order_id: bookingReference,
            total_files: entry.items.length || 1,
            delivered_by: deliveredByName || 'Production Team',
            delivery_time: deliveryTime,
            delivered_at: deliveredAt,
            dashboard_link: buildAdminDashboardUrl(),
          },
        });

        if (!adminEmailResult?.success) {
          console.error(
            'Edits delivered to client admin email failed:',
            adminEmailResult?.error || adminEmailResult?.failedRecipients || 'Unknown email error'
          );
        } else {
          await recordUploadEmailSent({
            linkedLeadIds,
            bookingId: bookingReference,
            folderPath: entry.folderPath,
            filepath: entry.items[0]?.filepath || '',
            emailEvent: 'edits_delivered_to_client_admin',
          });
        }
      }
    }
  } catch (error) {
    console.error('Edits delivered email trigger failed:', error?.message || error);
  }
};

const sendRevisionRequestedEmailsForFiles = async ({
  externalId,
  filepaths = [],
  requestedByName = 'Client',
}) => {
  try {
    const revisionRequestsByFolder = new Map();

    for (const filepath of filepaths) {
      if (!isEditedRevisionVersionPath(filepath)) continue;

      const bookingId = parseBookingIdFromFilepath(filepath) || Number(externalId);
      if (!bookingId) continue;

      const phase = resolveUploadPhase(filepath);
      const folderPath = getUploadFolderPath(filepath, phase || 'post');
      const bookingKey = `${bookingId}::${folderPath.toLowerCase()}`;
      const existing = revisionRequestsByFolder.get(bookingKey) || {
        bookingId: String(bookingId),
        folderPath,
        filepaths: [],
      };
      existing.filepaths.push(filepath);
      revisionRequestsByFolder.set(bookingKey, existing);
    }

    for (const entry of revisionRequestsByFolder.values()) {
      const booking = await getBookingForEditingInternalEmail(entry.bookingId);
      if (!booking) continue;

      const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
      const bookingReference = String(plainBooking?.stream_project_booking_id || entry.bookingId);
      const projectName = String(
        plainBooking?.project_name ||
        plainBooking?.client_name ||
        `Booking #${bookingReference}`
      );
      const fileNames = entry.filepaths.map(getFileNameFromPath).filter(Boolean);
      const fileNameLabel = fileNames.length > 1 ? `${fileNames.length} files selected` : fileNames[0] || '';
      const currentVersion = getEditedRevisionVersionLabel(entry.filepaths[0]) || '';
      const requestedAt = new Date().toISOString();
      const requestTime = formatEditingSubmissionTime(requestedAt);

      const cpRecipients = getAssignedCreativePartnerRecipients(plainBooking);
      if (cpRecipients.length) {
        const cpEmailResult = await emailService.sendRevisionRequestedOnEditEmail({
          recipients: cpRecipients,
          data: {
            shoot_name: projectName,
            project_name: projectName,
            booking_id: bookingReference,
            order_id: bookingReference,
            file_name: fileNameLabel,
            file_names: fileNames.join(', '),
            total_files: fileNames.length || entry.filepaths.length || 1,
            current_version: currentVersion,
            requested_by: requestedByName || 'Client',
            request_time: requestTime,
            requested_at: requestedAt,
            frontend_url: buildCreatorDashboardUrl() || buildAdminDashboardUrl(),
          },
        });

        if (!cpEmailResult?.success) {
          console.error(
            'Revision requested on edit email failed:',
            cpEmailResult?.error || cpEmailResult?.failedRecipients || 'Unknown email error'
          );
        }
      }

      const adminRecipients = getAdminNotificationRecipients();
      if (adminRecipients.length) {
        const adminEmailResult = await emailService.sendClientRequestedRevisionsAdminEmail({
          recipients: adminRecipients,
          data: {
            recipient_name: 'Admin',
            shoot_name: projectName,
            project_name: projectName,
            booking_id: bookingReference,
            order_id: bookingReference,
            revision_type: 'Edited File Revision',
            file_name: fileNameLabel,
            file_names: fileNames.join(', '),
            total_files: fileNames.length || entry.filepaths.length || 1,
            current_version: currentVersion,
            requested_by: requestedByName || 'Client',
            request_time: requestTime,
            requested_at: requestedAt,
            dashboard_link: buildAdminDashboardUrl(),
          },
        });

        if (!adminEmailResult?.success) {
          console.error(
            'Client requested edit revisions admin email failed:',
            adminEmailResult?.error || adminEmailResult?.failedRecipients || 'Unknown email error'
          );
        }
      }
    }
  } catch (error) {
    console.error('Revision requested email trigger failed:', error?.message || error);
  }
};

const sendFileApprovedInternalEmailsForReviews = async ({
  externalId,
  reviewResults = [],
  approvedByName = 'Client',
}) => {
  try {
    const approvedItemsByFolder = new Map();

    for (const item of reviewResults) {
      const filepath = item?.filepath;
      if (!item?.success || !isEditedRevisionVersionPath(filepath)) continue;

      const bookingId = parseBookingIdFromFilepath(filepath) || Number(externalId);
      if (!bookingId) continue;

      const phase = resolveUploadPhase(filepath);
      const folderPath = getUploadFolderPath(filepath, phase || 'post');
      const bookingKey = `${bookingId}::${folderPath.toLowerCase()}`;
      const existing = approvedItemsByFolder.get(bookingKey) || {
        bookingId: String(bookingId),
        folderPath,
        items: [],
      };
      existing.items.push(item);
      approvedItemsByFolder.set(bookingKey, existing);
    }

    for (const entry of approvedItemsByFolder.values()) {
      const booking = await getBookingForEditingInternalEmail(entry.bookingId);
      if (!booking) continue;

      const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
      const bookingReference = String(plainBooking?.stream_project_booking_id || entry.bookingId);
      const projectName = String(
        plainBooking?.project_name ||
        plainBooking?.client_name ||
        `Booking #${bookingReference}`
      );

      const recipients = [
        ...getAssignedCreativePartnerRecipients(plainBooking),
        ...getAdminNotificationRecipients().map((email) => ({
          email,
          name: 'Admin',
          data: {
            recipient_name: 'Admin',
            frontend_url: buildAdminDashboardUrl(),
            dashboard_link: buildAdminDashboardUrl(),
          },
        })),
      ];
      const seenEmails = new Set();
      const uniqueRecipients = recipients.filter((recipient) => {
        const email = normalizeEmailAddress(recipient?.email);
        if (!email || seenEmails.has(email)) return false;
        seenEmails.add(email);
        return true;
      });
      if (!uniqueRecipients.length) continue;

      const approvedAt = new Date().toISOString();
      const approvalTime = formatEditingSubmissionTime(approvedAt);

      for (const item of entry.items) {
        const responseData = item?.result?.data || {};
        const finalDeliverable = responseData?.finalDeliverable || {};
        const fileName =
          finalDeliverable?.name ||
          responseData?.name ||
          getFileNameFromPath(item?.filepath);
        const versionNumber = responseData?.versionNumber || getEditedRevisionVersionLabel(item?.filepath);
        const version = versionNumber && String(versionNumber).toLowerCase().startsWith('version')
          ? String(versionNumber)
          : versionNumber
            ? `Version${versionNumber}`
            : getEditedRevisionVersionLabel(item?.filepath);

        const emailResult = await emailService.sendFileApprovedInternalEmail({
          recipients: uniqueRecipients,
          data: {
            shoot_name: projectName,
            project_name: projectName,
            booking_id: bookingReference,
            order_id: bookingReference,
            file_name: fileName,
            version,
            current_version: version,
            approved_by: approvedByName || 'Client',
            approval_time: approvalTime,
            approved_at: approvedAt,
            final_deliverable_path: finalDeliverable?.path || '',
            final_deliverable_name: finalDeliverable?.name || fileName,
            dashboard_link: buildAdminDashboardUrl(),
            frontend_url: buildAdminDashboardUrl(),
          },
        });

        if (!emailResult?.success) {
          console.error(
            'File approved internal email failed:',
            emailResult?.error || emailResult?.failedRecipients || 'Unknown email error'
          );
        }
      }
    }
  } catch (error) {
    console.error('File approved internal email trigger failed:', error?.message || error);
  }
};

const isNewEditedRevisionVersionFolder = ({ phase, path, folderName, result }) => {
  if (result?.success === false || result?.data?.alreadyExists === true) return false;

  const resultFolder = result?.data?.folder || {};
  const effectiveFolderName = resultFolder?.name || folderName;
  const folderNameKey = normalizePathSegmentKey(effectiveFolderName);
  const isVersionFolder = /^version0*[1-9]\d*$/.test(folderNameKey);
  if (!isVersionFolder) return false;

  const folderPath = resultFolder?.path || '';
  const resultPathIsRevisionVersion = isEditedRevisionVersionPath(folderPath);
  const normalizedPhase = normalizeWorkspacePhase(phase, null);
  const pathSegments = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(normalizePathSegmentKey)
    .filter(Boolean);
  const requestPathIsRevisionRoot =
    pathSegments[pathSegments.length - 2] === 'edits' &&
    pathSegments[pathSegments.length - 1] === 'revisions';

  return (
    (normalizedPhase === 'post' || resultPathIsRevisionVersion) &&
    (requestPathIsRevisionRoot || resultPathIsRevisionVersion)
  );
};

const sendNewVersionUploadedClientEmailForFolder = async ({
  externalId,
  phase,
  path,
  folderName,
  result,
  uploadedByName = 'Production Team',
}) => {
  try {
    if (!isNewEditedRevisionVersionFolder({ phase, path, folderName, result })) return;
    if (!/^\d+$/.test(String(externalId || '').trim())) return;

    const booking = await getBookingForUploadEmail(externalId);
    if (!booking) return;

    const plainBooking = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
    const toEmail = normalizeEmailAddress(plainBooking?.user?.email || plainBooking?.guest_email);
    if (!toEmail) return;

    const bookingReference = String(plainBooking?.stream_project_booking_id || externalId);
    const recipientName = String(
      plainBooking?.user?.name ||
      plainBooking?.client_name ||
      plainBooking?.project_name ||
      plainBooking?.guest_email ||
      ''
    ).trim();
    const projectName = String(
      plainBooking?.project_name ||
      plainBooking?.client_name ||
      `Booking #${bookingReference}`
    );
    const version = String(result?.data?.folder?.name || folderName || '').trim();
    const dashboardLink = buildProjectFilesUrl(bookingReference);

    const emailResult = await emailService.sendNewVersionUploadedClientEmail({
      to: toEmail,
      data: {
        first_name: getFirstName(recipientName, 'there'),
        recipient_name: getFirstName(recipientName, 'there'),
        client_name: recipientName || getFirstName(toEmail, 'there'),
        shoot_name: projectName,
        project_name: projectName,
        booking_id: bookingReference,
        order_id: bookingReference,
        file_name: version,
        folder_name: version,
        version,
        uploaded_by: uploadedByName || 'Production Team',
        dashboard_link: dashboardLink,
        review_link: dashboardLink,
        frontend_url: dashboardLink,
      },
    });

    if (!emailResult?.success) {
      console.error(
        'New version uploaded client email failed:',
        emailResult?.error || emailResult?.failedRecipients || 'Unknown email error'
      );
    }
  } catch (error) {
    console.error('New version uploaded client email trigger failed:', error?.message || error);
  }
};

const ensureCommonEventsTable = async () => {
  if (!commonEventsTableReadyPromise) {
    commonEventsTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_common_events (
        event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_name VARCHAR(255) NOT NULL,
        event_slug VARCHAR(255) NOT NULL,
        workspace_external_id VARCHAR(128) NOT NULL,
        root_path VARCHAR(1024) DEFAULT NULL,
        visible_until DATETIME DEFAULT NULL,
        created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id),
        UNIQUE KEY uq_event_workspace_external_id (workspace_external_id),
        KEY idx_event_slug (event_slug),
        KEY idx_event_created_by (created_by_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await commonEventsTableReadyPromise;
  await db.sequelize.query(`
    ALTER TABLE file_manager_common_events
    ADD COLUMN IF NOT EXISTS visible_until DATETIME DEFAULT NULL AFTER root_path
  `).catch(() => null);
};

const ensureFileShareTable = async () => {
  if (!fileShareTableReadyPromise) {
    fileShareTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_shares (
        share_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        share_token VARCHAR(128) NOT NULL,
        resource_type ENUM('workspace', 'folder', 'file') NOT NULL DEFAULT 'folder',
        external_id VARCHAR(255) NOT NULL,
        phase VARCHAR(64) DEFAULT NULL,
        path VARCHAR(2048) DEFAULT NULL,
        filepath VARCHAR(2048) DEFAULT NULL,
        shared_with_email VARCHAR(255) NOT NULL,
        created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (share_id),
        UNIQUE KEY uq_file_manager_share_token (share_token),
        KEY idx_file_manager_share_external_id (external_id),
        KEY idx_file_manager_share_email (shared_with_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await fileShareTableReadyPromise;
  await db.sequelize.query(`
    ALTER TABLE file_manager_shares
    ADD COLUMN IF NOT EXISTS access_mode ENUM('email_only', 'anyone_with_link') NOT NULL DEFAULT 'email_only' AFTER shared_with_email
  `).catch(() => null);
  await db.sequelize.query(`
    ALTER TABLE file_manager_shares
    ADD COLUMN IF NOT EXISTS share_message TEXT NULL AFTER access_mode
  `).catch(() => null);
  await db.sequelize.query(`
    ALTER TABLE file_manager_shares
    ADD COLUMN IF NOT EXISTS permission ENUM('view_download', 'upload_download') NOT NULL DEFAULT 'view_download' AFTER access_mode
  `).catch(() => null);
};

const ensureFileShareOtpTable = async () => {
  if (!fileShareOtpTableReadyPromise) {
    fileShareOtpTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_share_otp (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        share_id BIGINT UNSIGNED NOT NULL,
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(16) NOT NULL,
        otp_expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        verified_at DATETIME DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_file_manager_share_otp_lookup (share_id, email, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await fileShareOtpTableReadyPromise;
};

const generateShareToken = () => `shr_${crypto.randomBytes(24).toString('hex')}`;
const getShareAccessSecret = () => process.env.FILE_SHARE_ACCESS_SECRET || process.env.JWT_SECRET || 'beige-share-access-secret';

const signShareAccessToken = ({ shareToken, email }) =>
  jwt.sign(
    {
      purpose: 'external_file_share',
      shareToken: String(shareToken || ''),
      email: normalizeEmailAddress(email),
    },
    getShareAccessSecret(),
    { expiresIn: process.env.FILE_SHARE_ACCESS_TOKEN_EXPIRES_IN || '12h' }
  );

const verifyShareAccessToken = (token) => {
  const payload = jwt.verify(String(token || ''), getShareAccessSecret());
  if (payload?.purpose !== 'external_file_share' || !payload?.shareToken || !payload?.email) {
    throw new Error('Invalid share access token');
  }
  return payload;
};

const ensureCommonEventCreatorFoldersTable = async () => {
  if (!commonEventCreatorFoldersTableReadyPromise) {
    commonEventCreatorFoldersTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_common_event_creator_folders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        workspace_external_id VARCHAR(128) NOT NULL,
        phase VARCHAR(16) NOT NULL DEFAULT 'pre',
        folder_path VARCHAR(1024) NOT NULL,
        folder_path_hash CHAR(64) AS (SHA2(folder_path, 256)) STORED,
        created_by_user_id BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_common_event_creator_folder (workspace_external_id, phase, folder_path_hash),
        KEY idx_common_event_creator_user (created_by_user_id),
        KEY idx_common_event_creator_workspace (workspace_external_id),
        KEY idx_common_event_creator_folder_path (folder_path(191))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await commonEventCreatorFoldersTableReadyPromise;
};

const ensureFaceEmbeddingsTable = async () => {
  if (!faceEmbeddingsTableReadyPromise) {
    faceEmbeddingsTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_face_embeddings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        external_id VARCHAR(128) NOT NULL,
        filepath VARCHAR(1024) NOT NULL,
        filepath_hash CHAR(64) AS (SHA2(filepath, 256)) STORED,
        embedding_json LONGTEXT NOT NULL,
        faces_count INT UNSIGNED NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'ready',
        error_message VARCHAR(255) DEFAULT NULL,
        indexed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_face_embedding_filepath (filepath_hash),
        KEY idx_face_embedding_external_status (external_id, status),
        KEY idx_face_embedding_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await faceEmbeddingsTableReadyPromise;
};

const toEventSlug = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const buildCommonEventExternalId = (eventName) => {
  const slug = toEventSlug(eventName) || 'event';
  return `${COMMON_EVENT_ID_PREFIX}${slug}_${Date.now()}`.slice(0, 120);
};

const normalizeCommonEventVisibleUntil = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw} 23:59:59`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error('visibleUntil must be a valid date');
    error.status = 400;
    throw error;
  }

  return parsed.toISOString().slice(0, 19).replace('T', ' ');
};

const isCommonEventVisibleForRole = (row) => {
  if (!row?.visible_until) return true;
  const visibleUntil = new Date(row.visible_until).getTime();
  if (Number.isNaN(visibleUntil)) return true;
  return visibleUntil >= Date.now();
};

const assertCommonEventVisibleForRequest = async (req, externalId) => {
  if (!isCommonEventVisibilityLimitedRole(req)) return;
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  if (!isCommonEventExternalId(normalizedExternalId)) return;

  await ensureCommonEventsTable();
  const [rows] = await db.sequelize.query(
    `SELECT visible_until FROM file_manager_common_events WHERE workspace_external_id = ? LIMIT 1`,
    { replacements: [normalizedExternalId] }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || isCommonEventVisibleForRole(row)) return;

  const error = new Error('This common event folder is no longer visible');
  error.status = 403;
  throw error;
};

const listCommonEventRows = async () => {
  await ensureCommonEventsTable();

  const [rows] = await db.sequelize.query(`
    SELECT
      event_id,
      event_name,
      event_slug,
      workspace_external_id,
      root_path,
      visible_until,
      created_by_user_id,
      created_at,
      updated_at
    FROM file_manager_common_events
    ORDER BY created_at DESC
  `);

  return Array.isArray(rows) ? rows : [];
};

const deleteCommonEventRowsByExternalId = async (externalId) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  if (!normalizedExternalId) return;

  await ensureCommonEventsTable();
  await ensureCommonEventCreatorFoldersTable();

  await db.sequelize.query(
    'DELETE FROM file_manager_common_event_creator_folders WHERE workspace_external_id = ?',
    { replacements: [normalizedExternalId] }
  );
  await db.sequelize.query(
    'DELETE FROM file_manager_common_events WHERE workspace_external_id = ?',
    { replacements: [normalizedExternalId] }
  );
  await ensureFaceEmbeddingsTable().catch(() => null);
  await db.sequelize
    .query('DELETE FROM file_manager_face_embeddings WHERE external_id = ?', {
      replacements: [normalizedExternalId],
    })
    .catch(() => null);
};

const findCommonEventByFilepath = async (filepath) => {
  const normalizedPath = String(filepath || '').trim().toLowerCase();
  if (!normalizedPath) return null;

  const rows = await listCommonEventRows();
  const pathTokens = normalizeForPathMatch(normalizedPath);

  return (
    rows.find((row) => {
      const externalId = String(row.workspace_external_id || '').trim().toLowerCase();
      const folderName = `event - ${String(row.event_name || '').trim().toLowerCase()}`;
      const folderTokens = normalizeForPathMatch(folderName);

      return (
        (externalId && normalizedPath.includes(externalId)) ||
        (folderName && normalizedPath.includes(folderName)) ||
        (folderTokens && pathTokens.includes(folderTokens))
      );
    }) || null
  );
};

const getUserDisplayName = async (userId) => {
  if (!userId) return null;
  const user = await users.findByPk(userId, {
    attributes: ['id', 'name', 'email'],
  });

  const nameCandidate = user?.name || user?.email || '';
  return String(nameCandidate || '').trim() || null;
};

const sanitizeFolderName = (value, fallback = 'Folder') => {
  const raw = String(value || '').trim();
  const safe = raw.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return (safe || fallback).slice(0, 120);
};

const sanitizeRelativeFolderPath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => sanitizeFolderName(segment, ''))
    .filter(Boolean)
    .join('/');

const normalizePathForAccess = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .trim();

const normalizeWorkspacePhase = (value, fallback = null) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');

  if (['pre', 'pre-production', 'preproduction'].includes(normalized)) return 'pre';
  if (['post', 'post-production', 'postproduction'].includes(normalized)) return 'post';
  return fallback;
};

const isWorkspacePhaseRootName = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return ['pre-production', 'preproduction', 'post-production', 'postproduction'].includes(normalized);
};

const extractPhaseAndRelativePath = (value, fallbackPhase = null) => {
  const normalizedPath = normalizePathForAccess(value);
  if (!normalizedPath) {
    return {
      phase: fallbackPhase,
      relativePath: '',
    };
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  const phaseIndex = segments.findIndex((segment) => {
    const normalizedSegment = String(segment || '').trim().toLowerCase();
    return normalizedSegment === 'pre-production' || normalizedSegment === 'post-production';
  });

  if (phaseIndex === -1) {
    return {
      phase: fallbackPhase,
      relativePath: normalizedPath,
    };
  }

  const phaseSegment = String(segments[phaseIndex] || '').toLowerCase();
  const phase = phaseSegment === 'post-production' ? 'post' : 'pre';
  const relativePath = segments.slice(phaseIndex + 1).join('/');

  return {
    phase,
    relativePath: normalizePathForAccess(relativePath),
  };
};

const getCommonEventRootCandidates = (row = {}) => {
  const candidates = [
    row.root_path,
    row.event_name ? `Event - ${row.event_name}` : '',
  ]
    .map((value) => normalizePathForAccess(value))
    .filter(Boolean);

  return Array.from(new Set(candidates)).sort((a, b) => b.length - a.length);
};

const stripCommonEventRootFromPath = (value, row = {}) => {
  const normalizedPath = normalizePathForAccess(value);
  if (!normalizedPath) return '';

  const normalizedPathLower = normalizedPath.toLowerCase();
  const rootPath = getCommonEventRootCandidates(row).find((candidate) => {
    const candidateLower = candidate.toLowerCase();
    return normalizedPathLower === candidateLower || normalizedPathLower.startsWith(`${candidateLower}/`);
  });

  if (!rootPath) return normalizedPath;
  if (normalizedPathLower === rootPath.toLowerCase()) return '';
  return normalizePathForAccess(normalizedPath.slice(rootPath.length + 1));
};

const getCreatorCommonEventAllowedRoots = (creatorFolders = []) =>
  Array.from(
    new Set(
      creatorFolders.flatMap((row) => {
        const folderPath = normalizePathForAccess(row.folder_path);
        const relativePath = stripCommonEventRootFromPath(folderPath, row);
        const prefixedPaths = getCommonEventRootCandidates(row)
          .map((rootPath) => (relativePath ? `${rootPath}/${relativePath}` : ''))
          .filter(Boolean);
        return [folderPath, relativePath, ...prefixedPaths].filter(Boolean);
      })
    )
  );

const isPathWithin = (basePath, candidatePath) => {
  const base = normalizePathForAccess(basePath);
  const candidate = normalizePathForAccess(candidatePath);
  if (!base || !candidate) return false;
  return candidate === base || candidate.startsWith(`${base}/`);
};

const listCreatorCommonEventFolders = async ({ eventExternalId, userId, phase = null }) => {
  if (!eventExternalId || !userId) return [];

  await ensureCommonEventCreatorFoldersTable();
  const replacements = [String(eventExternalId).trim().toLowerCase(), Number(userId)];
  let sql = `
    SELECT
      cf.workspace_external_id,
      cf.phase,
      cf.folder_path,
      cf.created_by_user_id,
      ce.event_name,
      ce.root_path
    FROM file_manager_common_event_creator_folders cf
    LEFT JOIN file_manager_common_events ce
      ON ce.workspace_external_id = cf.workspace_external_id
    WHERE cf.workspace_external_id = ?
      AND cf.created_by_user_id = ?
  `;

  if (phase) {
    sql += ' AND cf.phase = ?';
    replacements.push(String(phase).trim().toLowerCase());
  }

  const [rows] = await db.sequelize.query(sql, { replacements });
  return Array.isArray(rows) ? rows : [];
};

const ensureCreatorCommonEventRelativePathAccess = async ({
  req,
  eventExternalId,
  phase,
  relativePath,
  allowRoot = false,
  allowAncestorNavigation = false,
}) => {
  if (!isCreatorRole(req)) return;

  const normalizedEventExternalId = String(eventExternalId || '').trim().toLowerCase();
  if (!isCommonEventExternalId(normalizedEventExternalId)) return;
  await assertCommonEventVisibleForRequest(req, normalizedEventExternalId);

  const userId = getRequestUserId(req);
  if (!userId) {
    const error = new Error('Creator profile not found');
    error.status = 403;
    throw error;
  }

  const normalizedPhase = normalizeWorkspacePhase(phase, null);
  const normalizedRelativePath = normalizePathForAccess(relativePath);
  const creatorFolders = await listCreatorCommonEventFolders({
    eventExternalId: normalizedEventExternalId,
    userId,
    phase: normalizedPhase || null,
  });
  const allowedRoots = getCreatorCommonEventAllowedRoots(creatorFolders);

  if (!allowedRoots.length) {
    const phaseLabel = normalizedPhase === 'post' ? 'Post-Production' : normalizedPhase === 'pre' ? 'Pre-Production' : 'this common event';
    const error = new Error(`Please create your own folder first, then access ${phaseLabel}`);
    error.status = 403;
    throw error;
  }

  if (!normalizedRelativePath) {
    if (allowRoot) return;
    const error = new Error('Folder path is required');
    error.status = 400;
    throw error;
  }

  const hasPathAccess = allowedRoots.some((rootPath) => {
    if (isPathWithin(rootPath, normalizedRelativePath)) return true;
    if (allowAncestorNavigation && isPathWithin(normalizedRelativePath, rootPath)) return true;
    return false;
  });
  if (!hasPathAccess) {
    const error = new Error('You can access only your own common event folder/files');
    error.status = 403;
    throw error;
  }
};

const ensureCreatorCommonEventFileAccess = async (req, filepath) => {
  if (!isCreatorRole(req)) return false;

  const normalizedFilepath = String(filepath || '').trim();
  if (!normalizedFilepath) return false;

  let eventExternalId = extractCommonEventExternalIdFromPath(normalizedFilepath);
  if (!eventExternalId) {
    const row = await findCommonEventByFilepath(normalizedFilepath);
    eventExternalId = row?.workspace_external_id || null;
  }

  if (!isCommonEventExternalId(eventExternalId)) return false;

  const { phase, relativePath } = extractPhaseAndRelativePath(normalizedFilepath);
  await ensureCreatorCommonEventRelativePathAccess({
    req,
    eventExternalId,
    phase,
    relativePath,
    allowRoot: false,
  });

  return true;
};

const getRelativePathForEntry = (entry, parentPath = '') => {
  const directPath = normalizePathForAccess(entry?.path || '');
  if (directPath) {
    const fromDirectPath = extractPhaseAndRelativePath(directPath).relativePath || directPath;
    return normalizePathForAccess(fromDirectPath);
  }

  const name = normalizePathForAccess(entry?.name || '');
  if (!name) return '';
  const parent = normalizePathForAccess(parentPath);
  return normalizePathForAccess(parent ? `${parent}/${name}` : name);
};

const isImageLikeFile = (file = {}) => {
  const contentType = String(file.contentType || '').toLowerCase();
  if (contentType.startsWith('image/')) return true;

  const fileName = String(file.name || file.path || '').toLowerCase();
  return /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(fileName);
};

const isImageLikePath = (filepath = '') =>
  /\.(jpg|jpeg|png|webp|heic|heif|bmp)$/i.test(String(filepath || '').toLowerCase());

const parseExternalIdFromFilepath = (filepath = '') => {
  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  if (commonEventExternalId) return commonEventExternalId;

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (bookingId) return String(bookingId);
  return '';
};

const cosineSimilarity = (vectorA = [], vectorB = []) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) return 0;
  if (!vectorA.length || !vectorB.length || vectorA.length !== vectorB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i += 1) {
    const a = Number(vectorA[i] || 0);
    const b = Number(vectorB[i] || 0);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB) + 1e-8;
  const rawScore = dot / denominator;
  const normalized = (rawScore + 1) / 2;
  return Math.max(0, Math.min(1, normalized));
};

const getBestFacePairScore = (queryEmbeddings = [], candidateEmbeddings = []) => {
  let bestScore = 0;
  let bestQueryIndex = -1;
  let bestCandidateIndex = -1;

  queryEmbeddings.forEach((queryEmbedding, queryIndex) => {
    candidateEmbeddings.forEach((candidateEmbedding, candidateIndex) => {
      const score = cosineSimilarity(queryEmbedding, candidateEmbedding);
      if (score > bestScore) {
        bestScore = score;
        bestQueryIndex = queryIndex;
        bestCandidateIndex = candidateIndex;
      }
    });
  });

  return {
    score: bestScore,
    queryFaceIndex: bestQueryIndex,
    candidateFaceIndex: bestCandidateIndex,
  };
};

const toEmbeddingArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const runWithConcurrency = async (items = [], concurrency = 3, task = async () => null) => {
  const workers = Math.max(1, Number(concurrency) || 1);
  let index = 0;

  const runWorker = async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await task(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: Math.min(workers, items.length || 1) }, runWorker));
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
};

const limitFaceScanCandidates = (candidates = [], limit = FACE_SCAN_MAX_CANDIDATES) =>
  (Array.isArray(candidates) ? candidates : []).slice(0, toPositiveInteger(limit, FACE_SCAN_MAX_CANDIDATES));

const fetchWorkspaceFiles = async (externalId, phase, path) => {
  const query = new URLSearchParams();
  if (phase) query.set('phase', phase);
  if (path) query.set('path', path);

  return proxyRequest(
    `/workspace/${encodeURIComponent(String(externalId))}/files${query.toString() ? `?${query.toString()}` : ''}`
  );
};

const collectWorkspaceImageCandidates = async (externalId) => {
  const collected = new Map();
  const phases = ['pre', 'post'];

  await Promise.allSettled(
    phases.map(async (phase) => {
      const rootListing = await fetchWorkspaceFiles(externalId, phase);
      const rootFiles = rootListing?.data?.files || [];
      const rootFolders = rootListing?.data?.folders || [];

      rootFiles.filter(isImageLikeFile).forEach((file) => {
        if (!file?.path) return;
        collected.set(file.path, {
          path: file.path,
          name: file.name,
          contentType: file.contentType,
          phase,
        });
      });

      await Promise.allSettled(
        rootFolders.map(async (folder) => {
          try {
            const nestedListing = await fetchWorkspaceFiles(externalId, phase, folder.name);
            (nestedListing?.data?.files || []).filter(isImageLikeFile).forEach((file) => {
              if (!file?.path) return;
              collected.set(file.path, {
                path: file.path,
                name: file.name,
                contentType: file.contentType,
                phase,
                folder: folder.name,
              });
            });
          } catch (error) {
            // Skip unreadable folders to keep scan flow resilient.
          }
        })
      );
    })
  );

  return [...collected.values()];
};

const enrichCandidatesWithViewUrls = async (candidates = []) => {
  const enriched = await Promise.all(
    (candidates || []).map(async (candidate) => {
      if (!candidate?.path) return candidate;

      try {
        const view = await proxyRequest('/file-view-url', {
          method: 'POST',
          body: JSON.stringify({
            filepath: candidate.path,
          }),
        });

        return {
          ...candidate,
          url: view?.data?.url || null,
        };
      } catch (error) {
        return {
          ...candidate,
          url: null,
        };
      }
    })
  );

  return enriched.filter((candidate) => candidate?.url);
};

const upsertFaceEmbeddingRecord = async ({
  externalId,
  filepath,
  embeddings = [],
  status = 'ready',
  errorMessage = null,
}) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  const normalizedFilepath = normalizePathForAccess(filepath);
  if (!normalizedExternalId || !normalizedFilepath) return;

  await ensureFaceEmbeddingsTable();
  await db.sequelize.query(
    `
    INSERT INTO file_manager_face_embeddings
    (external_id, filepath, embedding_json, faces_count, status, error_message, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      external_id = VALUES(external_id),
      embedding_json = VALUES(embedding_json),
      faces_count = VALUES(faces_count),
      status = VALUES(status),
      error_message = VALUES(error_message),
      indexed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    `,
    {
      replacements: [
        normalizedExternalId,
        normalizedFilepath,
        JSON.stringify(Array.isArray(embeddings) ? embeddings : []),
        Array.isArray(embeddings) ? embeddings.length : 0,
        String(status || 'ready').slice(0, 24),
        errorMessage ? String(errorMessage).slice(0, 255) : null,
      ],
    }
  );
};

const deleteFaceEmbeddingRecordsByPath = async (filepath) => {
  const normalizedFilepath = normalizePathForAccess(filepath);
  if (!normalizedFilepath) return;
  await ensureFaceEmbeddingsTable();
  await db.sequelize.query(
    `
    DELETE FROM file_manager_face_embeddings
    WHERE filepath = ?
      OR filepath LIKE ?
    `,
    {
      replacements: [normalizedFilepath, `${normalizedFilepath}/%`],
    }
  );
};

const listFaceEmbeddingRecords = async (externalId) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  if (!normalizedExternalId) return [];

  await ensureFaceEmbeddingsTable();
  const [rows] = await db.sequelize.query(
    `
    SELECT filepath, embedding_json, faces_count, indexed_at, updated_at
    FROM file_manager_face_embeddings
    WHERE external_id = ?
      AND status = 'ready'
    ORDER BY updated_at DESC
    `,
    {
      replacements: [normalizedExternalId],
    }
  );

  return Array.isArray(rows) ? rows : [];
};

const fetchEmbeddingsFromFaceService = async ({ scanImageBase64, scanImageUrl }) => {
  if (!FACE_SCAN_SERVICE_URL) return [];

  const response = await fetch(`${FACE_SCAN_SERVICE_URL.replace(/\/+$/, '')}/embed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scanImageBase64: scanImageBase64 || undefined,
      scanImageUrl: scanImageUrl || undefined,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.detail || payload?.message || 'Failed to generate face embeddings';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return toEmbeddingArray(payload?.data?.embeddings || payload?.embeddings);
};

const indexFaceEmbeddingForFile = async ({ externalId, filepath, fileName = '', fileContentType = '' }) => {
  const normalizedExternalId = String(externalId || '').trim().toLowerCase();
  const normalizedFilepath = normalizePathForAccess(filepath);
  if (!normalizedExternalId || !normalizedFilepath) return { status: 'skipped', reason: 'invalid' };

  const looksLikeImage =
    String(fileContentType || '').toLowerCase().startsWith('image/') ||
    isImageLikePath(fileName) ||
    isImageLikePath(normalizedFilepath);
  if (!looksLikeImage) return { status: 'skipped', reason: 'not_image' };

  if (!FACE_SCAN_SERVICE_URL) return { status: 'skipped', reason: 'provider_missing' };

  try {
    const viewResult = await proxyRequest('/file-view-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: normalizedFilepath,
      }),
    });
    const scanImageUrl = viewResult?.data?.url || '';
    if (!scanImageUrl) {
      await upsertFaceEmbeddingRecord({
        externalId: normalizedExternalId,
        filepath: normalizedFilepath,
        embeddings: [],
        status: 'failed',
        errorMessage: 'Missing file view URL',
      });
      return { status: 'failed', reason: 'missing_view_url' };
    }

    const embeddings = await fetchEmbeddingsFromFaceService({ scanImageUrl });
    if (!embeddings.length) {
      await upsertFaceEmbeddingRecord({
        externalId: normalizedExternalId,
        filepath: normalizedFilepath,
        embeddings: [],
        status: 'failed',
        errorMessage: 'No face detected',
      });
      return { status: 'failed', reason: 'no_face' };
    }

    await upsertFaceEmbeddingRecord({
      externalId: normalizedExternalId,
      filepath: normalizedFilepath,
      embeddings,
      status: 'ready',
      errorMessage: null,
    });

    return { status: 'indexed', facesCount: embeddings.length };
  } catch (error) {
    await upsertFaceEmbeddingRecord({
      externalId: normalizedExternalId,
      filepath: normalizedFilepath,
      embeddings: [],
      status: 'failed',
      errorMessage: error?.message || 'Face indexing failed',
    });
    return { status: 'failed', reason: error?.message || 'Face indexing failed' };
  }
};

const searchFaceMatchesFromIndexedEmbeddings = async ({
  externalId,
  scanImageBase64,
  scanImageUrl,
  threshold,
  maxResults,
}) => {
  if (!FACE_SCAN_SERVICE_URL) {
    return {
      usedIndex: false,
      indexedCandidatesCount: 0,
      matches: [],
    };
  }

  const indexedRows = await listFaceEmbeddingRecords(externalId);
  if (!indexedRows.length) {
    return {
      usedIndex: false,
      indexedCandidatesCount: 0,
      matches: [],
    };
  }

  const queryEmbeddings = await fetchEmbeddingsFromFaceService({
    scanImageBase64,
    scanImageUrl,
  });
  if (!queryEmbeddings.length) {
    return {
      usedIndex: true,
      indexedCandidatesCount: indexedRows.length,
      matches: [],
    };
  }

  const safeThreshold = Math.max(0, Math.min(1, Number(threshold || 0.7)));
  const matches = [];
  indexedRows.forEach((row) => {
    const candidateEmbeddings = toEmbeddingArray(row.embedding_json);
    if (!candidateEmbeddings.length) return;

    const { score, queryFaceIndex, candidateFaceIndex } = getBestFacePairScore(
      queryEmbeddings,
      candidateEmbeddings
    );
    if (score < safeThreshold) return;

    matches.push({
      path: row.filepath,
      score,
      confidence: score,
      queryFaceIndex,
      candidateFaceIndex,
      queryFacesDetected: queryEmbeddings.length,
      candidateFacesDetected: candidateEmbeddings.length,
    });
  });

  matches.sort((a, b) => b.score - a.score);

  return {
    usedIndex: true,
    indexedCandidatesCount: indexedRows.length,
    matches: matches.slice(0, Math.max(1, Number(maxResults || 200))),
  };
};

const isCreatorPostProductionPath = (filepath) =>
  /(^|\/)post-production(\/|$)/i.test(String(filepath || ''));

const isPreProductionPath = (filepath) =>
  /(^|\/)pre-production(\/|$)/i.test(String(filepath || ''));

const isCreatorAllowedUploadPath = (filepath) =>
  isCreatorPostProductionPath(filepath) || isPreProductionPath(filepath);

const isPreProductionOnlyRole = (req) =>
  ['sales_rep', 'sales_representative', 'sales', 'client'].includes(getNormalizedRequestUserRole(req));

const getTodayDateOnly = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ensureCreatorPostProductionUploadWindow = async (req, filepath) => {
  if (!isCreatorRole(req)) return;
  if (!isCreatorPostProductionPath(filepath)) return;

  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  if (commonEventExternalId) return;

  const commonEventByPath = await findCommonEventByFilepath(filepath);
  if (commonEventByPath) return;

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (!bookingId) {
    const error = new Error('Invalid project file path');
    error.status = 400;
    throw error;
  }

  const booking = await stream_project_booking.findOne({
    where: { stream_project_booking_id: Number(bookingId) },
    attributes: ['stream_project_booking_id', 'event_date'],
  });

  const eventDate = booking?.event_date ? String(booking.event_date).slice(0, 10) : null;
  if (!eventDate) {
    const error = new Error('Shoot date is not set for this project');
    error.status = 403;
    throw error;
  }

  const today = getTodayDateOnly();
  if (today < eventDate) {
    const error = new Error(`Post-Production uploads are allowed on or after shoot day (${eventDate})`);
    error.status = 403;
    throw error;
  }
};

const validateUploadAccessForPath = async (req, filepath) => {
  await ensureCreatorFileAccess(req, filepath);
  await ensureClientFileAccess(req, filepath);

  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  const commonEventByPath = commonEventExternalId ? null : await findCommonEventByFilepath(filepath);
  const isCommonEventPath = Boolean(commonEventExternalId || commonEventByPath);

  if (getNormalizedRequestUserRole(req) === 'creator' && !isCommonEventPath && !isCreatorAllowedUploadPath(filepath)) {
    const error = new Error('Creators can upload files only in Pre-Production or Post-Production');
    error.status = 403;
    throw error;
  }

  await ensureCreatorPostProductionUploadWindow(req, filepath);

  if (isPreProductionOnlyRole(req) && !isCommonEventPath && !isPreProductionPath(filepath)) {
    const error = new Error('Uploads are allowed only in Pre-Production');
    error.status = 403;
    throw error;
  }
};

const resolveCreatorCrewMemberId = async (userId) => {
  if (!userId) return null;

  const user = await users.findByPk(userId, {
    attributes: ['id', 'email'],
  });

  if (!user?.email) return null;

  const crewMember = await crew_members.findOne({
    where: { email: user.email },
    attributes: ['crew_member_id'],
  });

  return crewMember?.crew_member_id || null;
};

const ensureCreatorWorkspaceAccess = async (req, bookingId) => {
  if (!isCreatorRole(req)) return;

  if (isCommonEventExternalId(bookingId)) {
    return;
  }

  const normalizedBookingId = Number(bookingId);
  if (!normalizedBookingId) {
    const error = new Error('Invalid project reference');
    error.status = 400;
    throw error;
  }

  const crewMemberId = await resolveCreatorCrewMemberId(getRequestUserId(req));
  if (!crewMemberId) {
    const error = new Error('Creator profile not found');
    error.status = 403;
    throw error;
  }

  const assignment = await assigned_crew.findOne({
    where: {
      project_id: normalizedBookingId,
      crew_member_id: crewMemberId,
      is_active: 1,
    },
    attributes: ['id', 'crew_accept'],
  });

  if (!assignment) {
    const error = new Error('You do not have access to this project file manager');
    error.status = 403;
    throw error;
  }
};

const ensureCreatorFileAccess = async (req, filepath) => {
  if (!isCreatorRole(req)) return;

  const hasCommonEventAccess = await ensureCreatorCommonEventFileAccess(req, filepath);
  if (hasCommonEventAccess) {
    return;
  }

  const commonEventByPath = await findCommonEventByFilepath(filepath);
  if (commonEventByPath) {
    await ensureCreatorCommonEventFileAccess(req, filepath);
    return;
  }

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (!bookingId) {
    const error = new Error('Invalid project file path');
    error.status = 400;
    throw error;
  }

  await ensureCreatorWorkspaceAccess(req, bookingId);
};

const ensureClientWorkspaceAccess = async (req, bookingId) => {
  if (!isClientRole(req)) return;

  if (isCommonEventExternalId(bookingId)) {
    return;
  }

  const normalizedBookingId = Number(bookingId);
  if (!normalizedBookingId) {
    const error = new Error('Invalid project reference');
    error.status = 400;
    throw error;
  }

  const userId = getRequestUserId(req);
  if (!userId) {
    const error = new Error('User profile not found');
    error.status = 403;
    throw error;
  }

  const booking = await stream_project_booking.findOne({
    where: {
      stream_project_booking_id: normalizedBookingId,
      user_id: userId,
      is_active: 1,
    },
    attributes: ['stream_project_booking_id'],
  });

  if (!booking) {
    const error = new Error('You do not have access to this project file manager');
    error.status = 403;
    throw error;
  }
};

const ensureClientFileAccess = async (req, filepath) => {
  if (!isClientRole(req)) return;

  const commonEventExternalId = extractCommonEventExternalIdFromPath(filepath);
  const commonEventByPath = commonEventExternalId ? null : await findCommonEventByFilepath(filepath);
  if (commonEventExternalId || commonEventByPath) {
    return;
  }

  const bookingId = parseBookingIdFromFilepath(filepath);
  if (!bookingId) {
    const error = new Error('Invalid project file path');
    error.status = 400;
    throw error;
  }

  await ensureClientWorkspaceAccess(req, bookingId);
};

const getCreatorAssignedProjectIds = async (req) => {
  if (!isCreatorRole(req)) return null;

  const crewMemberId = await resolveCreatorCrewMemberId(getRequestUserId(req));
  if (!crewMemberId) return [];

  const assignments = await assigned_crew.findAll({
    where: {
      crew_member_id: crewMemberId,
      is_active: 1,
    },
    attributes: ['project_id'],
  });

  return assignments
    .map((assignment) => Number(assignment.project_id))
    .filter(Boolean);
};

const getClientProjectIds = async (req) => {
  if (!isClientRole(req)) return null;

  const userId = getRequestUserId(req);
  if (!userId) return [];

  const bookings = await stream_project_booking.findAll({
    where: {
      user_id: userId,
      is_active: 1,
    },
    attributes: ['stream_project_booking_id'],
    raw: true,
  });

  return bookings
    .map((booking) => Number(booking.stream_project_booking_id))
    .filter(Boolean);
};

const syncWorkspaceForExistingBookingId = async (bookingId) => {
  const normalizedBookingId = Number(bookingId);
  if (!normalizedBookingId) {
    const error = new Error('Invalid project reference');
    error.status = 400;
    throw error;
  }

  const booking = await stream_project_booking.findOne({
    where: { stream_project_booking_id: normalizedBookingId },
  });

  if (!booking) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }

  return exports.syncWorkspaceForBookingFromRecord(booking);
};

const proxyRequest = async (path, options = {}) => {
  const { timeoutMs: requestedTimeoutMs, ...requestOptions } = options || {};
  const controller = new AbortController();
  const timeoutMs = Math.max(
    15000,
    Number(requestedTimeoutMs || EXTERNAL_FILE_MANAGER_PROXY_TIMEOUT_MS)
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${DEFAULT_BASE_URL}${path}`, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        ...buildHeaders(),
        ...(requestOptions.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`External file manager timed out after ${timeoutMs}ms`);
      timeoutError.status = 504;
      timeoutError.payload = {
        success: false,
        message: 'Request timed out while waiting for external file manager',
      };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({
    success: false,
    message: 'Invalid JSON response from external file manager',
  }));

  if (!response.ok) {
    const error = new Error(payload.message || 'External file manager request failed');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const normalizeSegment = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/(shoot|event|project)/gi, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

const pickNameToken = (booking) => {
  const source = String(
    booking.project_name || booking.client_name || booking.notes || booking.guest_email || ''
  ).trim();
  if (!source) return 'client';

  const preferredChunk = source.split('-').map((part) => part.trim()).filter(Boolean).pop() || source;
  const firstWord = preferredChunk.split(/\s+/).filter(Boolean)[0] || preferredChunk;
  return normalizeSegment(firstWord) || 'client';
};

const buildWorkspaceFolderName = (booking) => {
  const bookingId = booking.stream_project_booking_id || booking.booking_id || 'new';
  const shootToken = normalizeSegment(booking.shoot_type || booking.event_type || 'booking') || 'booking';
  const nameToken = pickNameToken(booking);
  return `${shootToken}_${nameToken}_#${bookingId}`;
};

exports.syncWorkspaceForBooking = async ({ bookingId, folderName }) => {
  return proxyRequest('/workspace', {
    method: 'POST',
    body: JSON.stringify({
      externalId: String(bookingId),
      folderName,
    }),
  });
};

exports.syncWorkspaceForBookingFromRecord = async (booking) => {
  if (!booking?.stream_project_booking_id) {
    return { success: false, message: 'booking_id is required for workspace sync' };
  }

  return exports.syncWorkspaceForBooking({
    bookingId: booking.stream_project_booking_id,
    folderName: buildWorkspaceFolderName(booking),
  });
};

exports.createWorkspace = async (req, res) => {
  try {
    const bookingId = String(req.body.bookingId || req.body.externalId || "").trim();
    const folderName = String(req.body.folderName || "").trim();

    if (!bookingId || !folderName) {
      return res.status(400).json({
        success: false,
        message: 'bookingId and folderName are required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, bookingId);
    await ensureClientWorkspaceAccess(req, bookingId);

    const result = await exports.syncWorkspaceForBooking({
      bookingId,
      folderName,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.listCommonEvents = async (req, res) => {
  try {
    const rows = await listCommonEventRows();
    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({
        eventId: row.event_id,
        eventName: row.event_name,
        eventSlug: row.event_slug,
        externalId: row.workspace_external_id,
        rootPath: row.root_path,
        visibleUntil: row.visible_until,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load common events',
    });
  }
};

exports.createCommonEvent = async (req, res) => {
  try {
    if (!isAdminRole(req)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin can create a common event folder',
      });
    }

    const eventName = sanitizeFolderName(req.body.eventName || req.body.folderName, '');
    if (!eventName) {
      return res.status(400).json({
        success: false,
        message: 'eventName is required',
      });
    }

    await ensureCommonEventsTable();

    const eventSlug = toEventSlug(eventName) || `event_${Date.now()}`;
    const workspaceExternalId = String(req.body.externalId || buildCommonEventExternalId(eventName)).trim().toLowerCase();
    const workspaceFolderName = `Event - ${eventName}`;
    const visibleUntil = normalizeCommonEventVisibleUntil(req.body.visibleUntil || req.body.visible_until);

    const workspaceResult = await proxyRequest('/workspace', {
      method: 'POST',
      body: JSON.stringify({
        externalId: workspaceExternalId,
        folderName: workspaceFolderName,
      }),
    });

    const rootPath = workspaceResult?.data?.workspace?.rootPath || null;
    await db.sequelize.query(
      `
      INSERT INTO file_manager_common_events
      (event_name, event_slug, workspace_external_id, root_path, visible_until, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        event_name = VALUES(event_name),
        event_slug = VALUES(event_slug),
        root_path = VALUES(root_path),
        visible_until = VALUES(visible_until),
        updated_at = CURRENT_TIMESTAMP
      `,
      {
        replacements: [eventName, eventSlug, workspaceExternalId, rootPath, visibleUntil, getRequestUserId(req) || null],
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Common event folder created successfully',
      data: {
        eventName,
        eventSlug,
        externalId: workspaceExternalId,
        visibleUntil,
        workspace: workspaceResult?.data?.workspace || null,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create common event folder',
    });
  }
};

exports.updateCommonEvent = async (req, res) => {
  try {
    if (!isAdminRole(req)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin can update common event visibility',
      });
    }

    const eventExternalId = String(req.params.eventExternalId || req.body.externalId || '').trim().toLowerCase();
    if (!isCommonEventExternalId(eventExternalId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid common event externalId is required',
      });
    }

    await ensureCommonEventsTable();
    const visibleUntil = normalizeCommonEventVisibleUntil(req.body.visibleUntil || req.body.visible_until);
    const [existingRows] = await db.sequelize.query(
      `SELECT event_id FROM file_manager_common_events WHERE workspace_external_id = ? LIMIT 1`,
      { replacements: [eventExternalId] }
    );
    if (!existingRows?.length) {
      return res.status(404).json({
        success: false,
        message: 'Common event folder not found',
      });
    }

    await db.sequelize.query(
      `
      UPDATE file_manager_common_events
      SET visible_until = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_external_id = ?
      `,
      { replacements: [visibleUntil, eventExternalId] }
    );

    return res.status(200).json({
      success: true,
      message: 'Common event visibility updated',
      data: {
        externalId: eventExternalId,
        visibleUntil,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to update common event visibility',
    });
  }
};

exports.createCreatorEventFolder = async (req, res) => {
  try {
    const eventExternalId = String(req.params.eventExternalId || req.body.externalId || '').trim().toLowerCase();
    if (!isCommonEventExternalId(eventExternalId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid common event externalId is required',
      });
    }
    await assertCommonEventVisibleForRequest(req, eventExternalId);

    if (!isCreatorRole(req) && !isAdminRole(req)) {
      return res.status(403).json({
        success: false,
        message: 'Only creators or admin can create creative partner folders',
      });
    }

    await ensureCommonEventsTable();
    const [rows] = await db.sequelize.query(
      `SELECT event_id, event_name, root_path FROM file_manager_common_events WHERE workspace_external_id = ? LIMIT 1`,
      { replacements: [eventExternalId] }
    );

    if (!rows?.length) {
      return res.status(404).json({
        success: false,
        message: 'Common event folder not found',
      });
    }

    const userId = getRequestUserId(req);
    const profileName = await getUserDisplayName(userId);
    const requestedName = sanitizeFolderName(req.body.folderName, '');
    const folderName = requestedName || sanitizeFolderName(profileName ? `${profileName}` : `CP ${userId || ''}`, 'Creative Partner');
    const phase = normalizeWorkspacePhase(req.body.phase || req.body.state || req.body.stage, null);
    const folderPath = sanitizeRelativeFolderPath(req.body.path);

    const folderPayload = {
      externalId: eventExternalId,
      path: folderPath || undefined,
      folderName,
    };
    if (phase) {
      folderPayload.phase = phase;
    }

    const result = await proxyRequest('/folder', {
      method: 'POST',
      body: JSON.stringify(folderPayload),
    });

    if (isCreatorRole(req)) {
      const createdFolderPathFromProvider = result?.data?.folder?.path || result?.data?.folderPath || '';
      const normalizedPhase = normalizeWorkspacePhase(phase, null) || 'root';
      const createdFolderPath = sanitizeRelativeFolderPath(
        stripCommonEventRootFromPath(
          extractPhaseAndRelativePath(createdFolderPathFromProvider, normalizedPhase === 'root' ? null : normalizedPhase).relativePath,
          rows[0]
        )
          || [folderPath, folderName].filter(Boolean).join('/')
      );

      if (createdFolderPath) {
        await ensureCommonEventCreatorFoldersTable();
        await db.sequelize.query(
          `
          INSERT INTO file_manager_common_event_creator_folders
          (workspace_external_id, phase, folder_path, created_by_user_id)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            updated_at = CURRENT_TIMESTAMP
          `,
          {
            replacements: [eventExternalId, normalizedPhase, createdFolderPath, userId],
          }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Creative partner folder created',
      data: {
        externalId: eventExternalId,
        phase: phase || null,
        path: folderPath || null,
        folderName,
        folder: result?.data?.folder || null,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create creative partner folder',
    });
  }
};

exports.searchFaceMatches = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    const scanImageBase64 = String(req.body.scanImageBase64 || '').trim();
    const scanImageUrl = String(req.body.scanImageUrl || '').trim();
    const scanImagePath = String(req.body.scanImagePath || '').trim();
    if (!scanImageBase64 && !scanImageUrl && !scanImagePath) {
      return res.status(400).json({
        success: false,
        message: 'scanImageBase64, scanImageUrl or scanImagePath is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    const proxyResult = await proxyRequest('/face-scan/search', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        scanImageBase64: scanImagePath ? undefined : scanImageBase64 || undefined,
        scanImageUrl: scanImageUrl || undefined,
        scanImagePath: scanImagePath || undefined,
        threshold: req.body.threshold,
        minScore: req.body.minScore,
        maxResults: req.body.maxResults,
        candidateLimit: req.body.candidateLimit,
        fallbackCandidateLimit: req.body.fallbackCandidateLimit,
        backgroundReindex: req.body.backgroundReindex,
        backgroundBatchLimit: req.body.backgroundBatchLimit,
        backgroundConcurrency: req.body.backgroundConcurrency,
        providerTimeoutMs: req.body.providerTimeoutMs,
      }),
    });

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Face scan search failed',
    });
  }
};

exports.getFaceScanQueryUploadPolicy = async (req, res) => {
  try {
    const proxyResult = await proxyRequest('/face-scan/query-upload-policy', {
      method: 'POST',
      body: JSON.stringify({
        externalId: req.body.externalId || req.body.eventExternalId,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        userId: getRequestUserId(req),
      }),
    });

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create face scan upload policy',
    });
  }
};

exports.createFaceScanJob = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    const scanImageBase64 = String(req.body.scanImageBase64 || '').trim();
    const scanImageUrl = String(req.body.scanImageUrl || '').trim();
    const scanImagePath = String(req.body.scanImagePath || '').trim();
    if (!scanImageBase64 && !scanImageUrl && !scanImagePath) {
      return res.status(400).json({
        success: false,
        message: 'scanImageBase64, scanImageUrl or scanImagePath is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    const proxyResult = await proxyRequest('/face-scan/jobs', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        scanImageBase64: scanImagePath ? undefined : scanImageBase64 || undefined,
        scanImageUrl: scanImageUrl || undefined,
        scanImagePath: scanImagePath || undefined,
        threshold: req.body.threshold,
        minScore: req.body.minScore,
        maxResults: req.body.maxResults,
        candidateLimit: req.body.candidateLimit,
        fallbackCandidateLimit: req.body.fallbackCandidateLimit,
        backgroundReindex: req.body.backgroundReindex,
        backgroundBatchLimit: req.body.backgroundBatchLimit,
        backgroundConcurrency: req.body.backgroundConcurrency,
        includeLiveFallback: req.body.includeLiveFallback,
        providerTimeoutMs: req.body.providerTimeoutMs,
      }),
    });

    return res.status(202).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Face scan job queue failed',
    });
  }
};

exports.getFaceScanJob = async (req, res) => {
  try {
    const externalId = String(req.query.externalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    const proxyResult = await proxyRequest(
      `/face-scan/jobs/${encodeURIComponent(String(req.params.jobId || ''))}`
    );

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to fetch face scan job',
    });
  }
};

exports.getFaceScanQueueStatus = async (req, res) => {
  try {
    const proxyResult = await proxyRequest('/face-scan/queue-status');
    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to fetch face scan queue status',
    });
  }
};

exports.getFaceScanIndexStatus = async (req, res) => {
  try {
    const externalId = String(req.params.externalId || req.query.externalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    const proxyResult = await proxyRequest(`/face-scan/index-status/${encodeURIComponent(externalId)}`);

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to fetch face index status',
    });
  }
};

// exports.searchFaceMatches = async (req, res) => {
//   req.setTimeout(120000); 
//   res.setTimeout(120000);

//   try {
//     const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
//     if (!externalId) {
//       return res.status(400).json({ success: false, message: 'externalId is required' });
//     }

//     const scanImageBase64 = String(req.body.scanImageBase64 || '').trim();
//     const scanImageUrl = String(req.body.scanImageUrl || '').trim();
//     if (!scanImageBase64 && !scanImageUrl) {
//       return res.status(400).json({ success: false, message: 'scanImageBase64 or scanImageUrl is required' });
//     }

//     await ensureCreatorWorkspaceAccess(req, externalId);

//     const imageCandidates = await collectWorkspaceImageCandidates(externalId);
//     const imageCandidatesWithUrls = await enrichCandidatesWithViewUrls(imageCandidates);

//     if (!FACE_SCAN_SERVICE_URL) {
//       return res.status(200).json({
//         success: true,
//         message: 'Face scan provider is not configured yet',
//         data: { externalId, scanMode: 'full_face_scan', integrated: false, candidatesCount: imageCandidatesWithUrls.length, matches: [] },
//       });
//     }

//     const controller = new AbortController();
//     const timeout = setTimeout(() => controller.abort(), 120000);

//     try {
//       const response = await fetch(`${FACE_SCAN_SERVICE_URL.replace(/\/+$/, '')}/search`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         signal: controller.signal,
//         body: JSON.stringify({
//           externalId,
//           scanMode: 'full_face_scan',
//           scanImageBase64: scanImageUrl ? undefined : (scanImageBase64 || undefined),
//           scanImageUrl: scanImageUrl || undefined,
//           candidates: imageCandidatesWithUrls.map(c => ({
//             id: c.id || c._id,
//             url: c.url || c.viewUrl
//           })),
//           threshold: Number(req.body.threshold || 0.7),
//           maxResults: Number(req.body.maxResults || 200),
//         }),
//       });

//       clearTimeout(timeout);

//       const providerPayload = await response.json().catch(() => null);
      
//       if (!response.ok) {
//         return res.status(502).json({
//           success: false,
//           message: providerPayload?.message || 'Face scan provider failed',
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         message: 'Face scan completed',
//         data: {
//           externalId,
//           scanMode: 'full_face_scan',
//           integrated: true,
//           candidatesCount: imageCandidatesWithUrls.length,
//           matches: providerPayload?.data?.matches || providerPayload?.matches || [],
//           provider: providerPayload?.data?.provider || providerPayload?.provider || null,
//         },
//       });

//     } catch (fetchError) {
//       if (fetchError.name === 'AbortError') {
//         return res.status(504).json({
//           success: false,
//           message: 'The face scan service took too long to respond (Timeout)',
//         });
//       }
//       throw fetchError;
//     }

//   } catch (error) {
//     console.error('Face Scan Error:', error);
//     return res.status(error.status || 500).json(error.payload || {
//       success: false,
//       message: error.message || 'Face scan search failed',
//     });
//   }
// };

exports.listWorkspaces = async (req, res) => {
  try {
    const hasPaginationParams =
      typeof req.query.page !== 'undefined' || typeof req.query.limit !== 'undefined';
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit || '24'), 10) || 24));
    const search = String(req.query.search || '').trim().toLowerCase();
    const workspaceType = String(req.query.workspaceType || req.query.type || '').trim().toLowerCase();
    const commonEventsOnly = ['common', 'common-event', 'common-events', 'common_event', 'common_events'].includes(workspaceType);
    const expiredCommonEventsOnly = ['visibility-expired', 'expired', 'expired-common-events'].includes(workspaceType);
    const result = await proxyRequest('/workspaces');
    const eventRows = await listCommonEventRows().catch(() => []);
    const eventRowByExternalId = new Map(
      eventRows.map((row) => [String(row.workspace_external_id || '').trim().toLowerCase(), row])
    );
    const eventWorkspaces = eventRows.map((row) => ({
      externalId: row.workspace_external_id,
      folderName: `Event - ${row.event_name}`,
      rootPath: row.root_path || null,
      fileCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isCommonEvent: true,
      eventId: row.event_id,
      eventName: row.event_name,
      visibleUntil: row.visible_until,
    }));

    const existingByExternalId = new Set(
      (result.data?.workspaces || []).map((workspace) => String(workspace.externalId || '').trim().toLowerCase())
    );
    const missingEventWorkspaces = eventWorkspaces.filter(
      (workspace) => !existingByExternalId.has(String(workspace.externalId || '').trim().toLowerCase())
    );

    const verifiedMissingEventWorkspaces = (
      await Promise.all(
        missingEventWorkspaces.map(async (workspace) => {
          try {
            const lookup = await proxyRequest(`/workspace/${encodeURIComponent(String(workspace.externalId))}`);
            if (!lookup?.data?.workspace) return null;
            return workspace;
          } catch (error) {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const mergedWorkspaces = [
      ...(result.data?.workspaces || []),
      ...verifiedMissingEventWorkspaces,
    ].map((workspace) => {
      const externalId = String(workspace.externalId || '').trim().toLowerCase();
      const eventRow = eventRowByExternalId.get(externalId);
      if (!eventRow) return workspace;
      return {
        ...workspace,
        isCommonEvent: true,
        eventId: eventRow.event_id,
        eventName: eventRow.event_name,
        visibleUntil: eventRow.visible_until,
      };
    });

    let filteredWorkspaces = mergedWorkspaces;
    if (isCommonEventVisibilityLimitedRole(req)) {
      const visibleEventIds = new Set(
        eventRows
          .filter((row) => isCommonEventVisibleForRole(row))
          .map((row) => String(row.workspace_external_id || '').trim().toLowerCase())
      );
      filteredWorkspaces = filteredWorkspaces.filter((workspace) => {
        const externalId = String(workspace.externalId || '').trim().toLowerCase();
        return !isCommonEventExternalId(externalId) || visibleEventIds.has(externalId);
      });
    }

    if (isCreatorRole(req)) {
      const allowedProjectIds = await getCreatorAssignedProjectIds(req);
      const allowedIdSet = new Set((allowedProjectIds || []).map((id) => String(id)));
      filteredWorkspaces = filteredWorkspaces.filter((workspace) =>
        isCommonEventExternalId(workspace.externalId) || allowedIdSet.has(String(workspace.externalId))
      );
    }

    if (isClientRole(req)) {
      const allowedProjectIds = await getClientProjectIds(req);
      const allowedIdSet = new Set((allowedProjectIds || []).map((id) => String(id)));
      filteredWorkspaces = filteredWorkspaces.filter((workspace) =>
        isCommonEventExternalId(workspace.externalId) || allowedIdSet.has(String(workspace.externalId))
      );
    }

    if (commonEventsOnly || expiredCommonEventsOnly) {
      filteredWorkspaces = filteredWorkspaces.filter((workspace) =>
        Boolean(workspace?.isCommonEvent) || isCommonEventExternalId(workspace?.externalId)
      );
    }

    if (expiredCommonEventsOnly) {
      filteredWorkspaces = filteredWorkspaces.filter((workspace) => {
        const eventRow = eventRowByExternalId.get(String(workspace?.externalId || '').trim().toLowerCase());
        return eventRow ? !isCommonEventVisibleForRole(eventRow) : false;
      });
    }

    if (search) {
      filteredWorkspaces = filteredWorkspaces.filter((workspace) => {
        const folderName = String(workspace.folderName || '').toLowerCase();
        const externalId = String(workspace.externalId || '').toLowerCase();
        const eventName = String(workspace.eventName || '').toLowerCase();
        return (
          folderName.includes(search) ||
          externalId.includes(search) ||
          eventName.includes(search)
        );
      });
    }
    const total = filteredWorkspaces.length;
    const effectiveLimit = hasPaginationParams ? limit : Math.max(total, 1);
    const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));
    const safePage = hasPaginationParams ? Math.min(page, totalPages) : 1;
    const offset = (safePage - 1) * effectiveLimit;
    const paginatedWorkspaces = filteredWorkspaces.slice(offset, offset + effectiveLimit);

    return res.status(200).json({
      ...result,
      data: {
        ...(result.data || {}),
        workspaces: paginatedWorkspaces,
        pagination: {
          page: safePage,
          limit: effectiveLimit,
          total,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
        },
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getWorkspace = async (req, res) => {
  try {
    await ensureCreatorWorkspaceAccess(req, req.params.bookingId);
    await ensureClientWorkspaceAccess(req, req.params.bookingId);
    await assertCommonEventVisibleForRequest(req, req.params.bookingId);
    const isCommonEventWorkspace = isCommonEventExternalId(req.params.bookingId);
    let result;
    try {
      result = await proxyRequest(`/workspace/${req.params.bookingId}`);
    } catch (error) {
      if (error.status !== 404 || isCommonEventWorkspace || isCreatorRole(req) || isClientRole(req)) {
        throw error;
      }
      result = await syncWorkspaceForExistingBookingId(req.params.bookingId);
    }

    if (isCommonEventWorkspace) {
      await ensureCommonEventsTable();
      const normalizedExternalId = String(req.params.bookingId || '').trim().toLowerCase();
      const [eventRows] = await db.sequelize.query(
        `
        SELECT event_id, event_name, visible_until
        FROM file_manager_common_events
        WHERE workspace_external_id = ?
        LIMIT 1
        `,
        { replacements: [normalizedExternalId] }
      );
      const eventRow = Array.isArray(eventRows) ? eventRows[0] : null;
      const rootFolders = (result?.data?.folders || []).filter(
        (folder) => !isWorkspacePhaseRootName(folder?.name) || Number(folder?.fileCount || 0) > 0
      );

      if (isCreatorRole(req)) {
        const creatorFolders = await listCreatorCommonEventFolders({
          eventExternalId: req.params.bookingId,
          userId: getRequestUserId(req),
        });
        const allowedRoots = getCreatorCommonEventAllowedRoots(creatorFolders);
        result = {
          ...result,
          data: {
            ...(result.data || {}),
            workspace: {
              ...(result.data?.workspace || {}),
              isCommonEvent: true,
              eventId: eventRow?.event_id,
              eventName: eventRow?.event_name,
              visibleUntil: eventRow?.visible_until || null,
            },
            folders: rootFolders.filter((folder) => {
              const entryPath = getRelativePathForEntry(folder);
              return entryPath && allowedRoots.some((rootPath) => isPathWithin(rootPath, entryPath) || isPathWithin(entryPath, rootPath));
            }),
          },
        };
      } else {
        result = {
          ...result,
          data: {
            ...(result.data || {}),
            workspace: {
              ...(result.data?.workspace || {}),
              isCommonEvent: true,
              eventId: eventRow?.event_id,
              eventName: eventRow?.event_name,
              visibleUntil: eventRow?.visible_until || null,
            },
            folders: rootFolders,
          },
        };
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 404) {
      return res.status(200).json({
        success: true,
        message: 'Workspace not found',
        data: null,
      });
    }

    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

// Used by scripts to check existence without req/res
exports.getWorkspaceByBookingId = async (bookingId) => {
  const normalizedBookingId = String(bookingId || '').trim();
  if (!normalizedBookingId) {
    return { success: false, message: 'booking_id is required for workspace lookup', data: null };
  }

  try {
    return await proxyRequest(`/workspace/${normalizedBookingId}`);
  } catch (error) {
    if (error.status === 404) {
      return {
        success: true,
        message: 'Workspace not found',
        data: null,
      };
    }

    throw error;
  }
};

exports.getWorkspaceFiles = async (req, res) => {
  try {
    await ensureCreatorWorkspaceAccess(req, req.params.bookingId);
    await ensureClientWorkspaceAccess(req, req.params.bookingId);
    await assertCommonEventVisibleForRequest(req, req.params.bookingId);
    const query = new URLSearchParams();
    if (req.query.phase) query.set('phase', req.query.phase);
    if (req.query.path) query.set('path', req.query.path);

    let result;
    try {
      result = await proxyRequest(
        `/workspace/${req.params.bookingId}/files${query.toString() ? `?${query.toString()}` : ''}`
      );
    } catch (error) {
      if (
        error.status !== 404 ||
        isCommonEventExternalId(req.params.bookingId) ||
        isCreatorRole(req) ||
        isClientRole(req)
      ) {
        throw error;
      }
      await syncWorkspaceForExistingBookingId(req.params.bookingId);
      result = await proxyRequest(
        `/workspace/${req.params.bookingId}/files${query.toString() ? `?${query.toString()}` : ''}`
      );
    }

    if (isCreatorRole(req) && isCommonEventExternalId(req.params.bookingId)) {
      const phase = normalizeWorkspacePhase(req.query.phase, null);
      const requestedPath = sanitizeRelativeFolderPath(req.query.path || '');
      await ensureCreatorCommonEventRelativePathAccess({
        req,
        eventExternalId: req.params.bookingId,
        phase,
        relativePath: requestedPath,
        allowRoot: true,
        allowAncestorNavigation: true,
      });

      const creatorFolders = await listCreatorCommonEventFolders({
        eventExternalId: req.params.bookingId,
        userId: getRequestUserId(req),
        phase: phase || null,
      });
      const allowedRoots = getCreatorCommonEventAllowedRoots(creatorFolders);
      const isAllowed = (entryPath) =>
        allowedRoots.some((rootPath) => isPathWithin(rootPath, entryPath) || isPathWithin(entryPath, rootPath));

      const filteredFolders = (result?.data?.folders || []).filter((folder) => {
        const entryPath = getRelativePathForEntry(folder, requestedPath);
        return entryPath && isAllowed(entryPath);
      });
      const filteredFiles = (result?.data?.files || []).filter((file) => {
        const entryPath = getRelativePathForEntry(file, requestedPath);
        return entryPath && isAllowed(entryPath);
      });

      return res.status(200).json({
        ...result,
        data: {
          ...(result.data || {}),
          folders: filteredFolders,
          files: filteredFiles,
        },
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 404) {
      return res.status(200).json({
        success: true,
        message: 'Workspace not found',
        data: null,
      });
    }

    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getUploadPolicy = async (req, res) => {
  try {
    await validateUploadAccessForPath(req, req.body.filepath);

    const result = await proxyRequest('/upload-policy', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        userId: getRequestUserId(req),
      }),
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getUploadPoliciesBatch = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: 'items array is required',
      });
    }

    for (const item of items) {
      await validateUploadAccessForPath(req, item?.filepath);
    }

    const result = await proxyRequest('/upload-policies/batch', {
      method: 'POST',
      body: JSON.stringify({
        userId: getRequestUserId(req),
        items: items.map((item = {}) => ({
          filepath: item.filepath,
          fileContentType: item.fileContentType,
          fileSize: item.fileSize,
          userId: getRequestUserId(req),
        })),
      }),
    });

    if (result?.success !== false) {
      const uploaderName = await getUserDisplayName(getRequestUserId(req)).catch(() => null);
      await sendEditsDeliveredEmailsForUploadedItems({
        items: items.map((item = {}) => ({
          filepath: item.filepath,
          fileName: item.fileName || String(item.filepath || '').split('/').pop() || '',
        })),
        deliveredByName: uploaderName || 'Production Team',
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.notifyFileUploaded = async (req, res) => {
  try {
    await validateUploadAccessForPath(req, req.body.filepath);
    const uploaderName = await getUserDisplayName(getRequestUserId(req)).catch(() => null);

    const result = await proxyRequest('/file-uploaded', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        fileName: req.body.fileName,
        userId: getRequestUserId(req),
        authorName: uploaderName || 'Beige User',
      }),
    });

    if (result?.success !== false && req.body.filepath) {
      await sendUploadTemplateEmailForFile({
        filepath: req.body.filepath,
        fileName: req.body.fileName,
        uploadedByName: uploaderName || 'Beige User',
        uploadedById: getRequestUserId(req),
      });
      await sendRawFilesUploadedEmailsForUploadedItems({
        items: [{
          filepath: req.body.filepath,
          fileName: req.body.fileName,
        }],
        uploadedByName: uploaderName || 'Beige User',
        uploadedById: getRequestUserId(req),
      });
      await sendEditsDeliveredEmailsForUploadedItems({
        items: [{
          filepath: req.body.filepath,
          fileName: req.body.fileName,
        }],
        deliveredByName: uploaderName || 'Production Team',
      });
      await sendRawFootageReadyEmailForUploadedFiles({
        filepaths: [req.body.filepath],
      });
    }

    try {
      await bookingTimelineService.applyUploadDrivenStatusTransition({
        filepath: req.body.filepath,
      });
    } catch (timelineError) {
      console.error('Timeline update skipped after file upload:', timelineError.message);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.notifyFilesUploadedBatch = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: 'items array is required',
      });
    }

    for (const item of items) {
      await validateUploadAccessForPath(req, item?.filepath);
    }
    const uploaderName = await getUserDisplayName(getRequestUserId(req)).catch(() => null);

    const result = await proxyRequest('/files-uploaded/batch', {
      method: 'POST',
      body: JSON.stringify({
        userId: getRequestUserId(req),
        items: items.map((item = {}) => ({
          filepath: item.filepath,
          fileContentType: item.fileContentType,
          fileSize: item.fileSize,
          fileName: item.fileName,
          userId: getRequestUserId(req),
          authorName: uploaderName || 'Beige User',
        })),
      }),
    });

    const succeededItems = Array.isArray(result?.data?.items)
      ? result.data.items.filter((item) => item?.success && item?.filepath)
      : [];
    const notifiedFolderKeys = new Set();
    for (const item of succeededItems) {
      const phase = resolveUploadPhase(item?.filepath);
      const folderKey =
        ((phase === 'pre') || (phase === 'post' && !isRawFootageUploadPath(item?.filepath)))
          ? `${parseBookingIdFromFilepath(item?.filepath) || ''}::${getUploadFolderPath(item?.filepath, phase)}`
          : null;

      if (folderKey && notifiedFolderKeys.has(folderKey)) {
        continue;
      }

      await sendUploadTemplateEmailForFile({
        filepath: item.filepath,
        fileName: item?.data?.name || item?.fileName || '',
        uploadedByName: uploaderName || 'Beige User',
        uploadedById: getRequestUserId(req),
      });

      if (folderKey) {
        notifiedFolderKeys.add(folderKey);
      }
    }

    await sendRawFilesUploadedEmailsForUploadedItems({
      items: succeededItems,
      uploadedByName: uploaderName || 'Beige User',
      uploadedById: getRequestUserId(req),
    });

    await sendEditsDeliveredEmailsForUploadedItems({
      items: succeededItems,
      deliveredByName: uploaderName || 'Production Team',
    });

    await sendRawFootageReadyEmailForUploadedFiles({
      filepaths: succeededItems.map((item) => item?.filepath).filter(Boolean),
    });

    for (const item of succeededItems) {
      try {
        await bookingTimelineService.applyUploadDrivenStatusTransition({
          filepath: item.filepath,
        });
      } catch (timelineError) {
        console.error('Timeline update skipped after file upload batch item:', timelineError.message);
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.copyFiles = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.bookingId || '').trim();
    const phase = normalizeWorkspacePhase(req.body.phase || req.body.state || req.body.stage, null);
    const targetPath = sanitizeRelativeFolderPath(req.body.targetPath || req.body.path);
    const sourcePaths = Array.isArray(req.body.sourcePaths)
      ? req.body.sourcePaths.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    if (!externalId || !phase || !targetPath || !sourcePaths.length) {
      return res.status(400).json({
        success: false,
        message: 'externalId, phase, targetPath and sourcePaths are required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    for (const sourcePath of sourcePaths) {
      await ensureCreatorFileAccess(req, sourcePath);
    }

    const authorName = await getUserDisplayName(getRequestUserId(req)).catch(() => 'Beige User');
    const result = await proxyRequest('/copy-files', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        phase,
        targetPath,
        sourcePaths,
        userId: getRequestUserId(req),
        authorName,
      }),
    });

    if (result?.success !== false) {
      await sendFilesForEditingInternalEmailForCopy({
        externalId,
        phase,
        targetPath,
        sourcePaths,
        submittedByName: authorName,
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.reviewRevisionFile = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.bookingId || '').trim();
    const filepaths = Array.isArray(req.body.filepaths)
      ? req.body.filepaths.map((item) => String(item || '').trim()).filter(Boolean)
      : [String(req.body.filepath || req.body.path || '').trim()].filter(Boolean);
    const action = String(req.body.action || '').trim().toLowerCase();

    if (!externalId || !filepaths.length || !['approve', 'request_revision'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'externalId, filepath/filepaths and action are required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    for (const filepath of filepaths) {
      await ensureCreatorFileAccess(req, filepath);
    }

    const authorName = await getUserDisplayName(getRequestUserId(req)).catch(() => 'Beige User');
    const reviewResults = [];

    for (const filepath of filepaths) {
      const reviewResult = await proxyRequest('/revision-file/review', {
        method: 'POST',
        body: JSON.stringify({
          externalId,
          filepath,
          action,
          userId: getRequestUserId(req),
          authorName,
        }),
      });
      reviewResults.push({
        filepath,
        success: reviewResult?.success !== false,
        result: reviewResult,
      });
    }

    if (action === 'request_revision') {
      const succeededFilepaths = reviewResults
        .filter((item) => item.success)
        .map((item) => item.filepath)
        .filter(Boolean);

      if (succeededFilepaths.length) {
        await sendRevisionRequestedEmailsForFiles({
          externalId,
          filepaths: succeededFilepaths,
          requestedByName: authorName,
        });
      }
    } else if (action === 'approve') {
      await sendFileApprovedInternalEmailsForReviews({
        externalId,
        reviewResults,
        approvedByName: authorName,
      });
    }

    if (filepaths.length === 1) {
      return res.status(200).json(reviewResults[0].result);
    }

    const hasFailure = reviewResults.some((item) => !item.success);
    const result = {
      success: !hasFailure,
      partialSuccess: hasFailure && reviewResults.some((item) => item.success),
      data: {
        items: reviewResults,
      },
    };

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.reindexFaceEmbeddings = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.eventExternalId || '').trim().toLowerCase();
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: 'externalId is required',
      });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);

    const proxyResult = await proxyRequest('/face-scan/reindex', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        candidateLimit: req.body.candidateLimit,
        concurrency: req.body.concurrency,
        providerTimeoutMs: req.body.providerTimeoutMs,
      }),
    });

    return res.status(200).json(proxyResult);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Face embedding reindex failed',
    });
  }
};

exports.getFileViewUrl = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath);
    await ensureClientFileAccess(req, req.body.filepath);
    const result = await proxyRequest('/file-view-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
      }),
    });
    return res.status(200).json(withPublicUrl(result, req));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.bookingId || '').trim();
    await ensureCreatorWorkspaceAccess(req, externalId);
    await ensureClientWorkspaceAccess(req, externalId);

    const isCommonEvent = isCommonEventExternalId(externalId);
    const phase = normalizeWorkspacePhase(
      req.body.phase || req.body.state || req.body.stage,
      null
    );
    const path = sanitizeRelativeFolderPath(req.body.path);
    const folderName = req.body.folderName || req.body.name;

    // Regular workspaces must target Pre/Post Production. Common Events are
    // intentionally phase-less and create folders directly under their path.
    if (!isCommonEvent && !phase) {
      return res.status(400).json({
        success: false,
        message: 'phase is required. Allowed values: pre, post, pre-production, post-production',
      });
    }

    if (isCommonEvent && isCreatorRole(req)) {
      if (!path) {
        return res.status(403).json({
          success: false,
          message: 'Creators can create folders only inside their own common event folder',
        });
      }

      await ensureCreatorCommonEventRelativePathAccess({
        req,
        eventExternalId: externalId,
        phase,
        relativePath: path,
        allowRoot: false,
      });
    }

    const folderPayload = {
      externalId,
      path: path || undefined,
      folderName,
    };
    if (phase || req.body.phase) {
      folderPayload.phase = phase || req.body.phase;
    }

    const result = await proxyRequest('/folder', {
      method: 'POST',
      body: JSON.stringify(folderPayload),
    });

    if (result?.success !== false) {
      const uploaderName = await getUserDisplayName(getRequestUserId(req)).catch(() => null);
      await sendNewVersionUploadedClientEmailForFolder({
        externalId,
        phase: phase || req.body.phase,
        path,
        folderName,
        result,
        uploadedByName: uploaderName || 'Production Team',
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getFileDownloadUrl = async (req, res) => {
  try {
    await ensureCreatorFileAccess(req, req.body.filepath);
    await ensureClientFileAccess(req, req.body.filepath);
    const result = await proxyRequest('/file-download-url', {
      method: 'POST',
      body: JSON.stringify({
        filepath: req.body.filepath,
      }),
    });
    return res.status(200).json(withPublicUrl(result, req));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.getFolderDownloadUrl = async (req, res) => {
  try {
    const externalId = String(req.body.externalId || req.body.bookingId || '').trim();
    await ensureCreatorWorkspaceAccess(req, externalId);
    await ensureClientWorkspaceAccess(req, externalId);

    if (isCreatorRole(req) && isCommonEventExternalId(externalId)) {
      await ensureCreatorCommonEventRelativePathAccess({
        req,
        eventExternalId: externalId,
        phase: req.body.phase,
        relativePath: req.body.path,
        allowRoot: false,
      });
    }

    const result = await proxyRequest('/folder-download-url', {
      method: 'POST',
      body: JSON.stringify({
        externalId,
        phase: req.body.phase,
        path: req.body.path,
      }),
    });
    return res.status(200).json(withPublicUrl(result));
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const targetPath = req.body.filepath || req.body.path;
    await ensureCreatorFileAccess(req, targetPath);
    await ensureClientFileAccess(req, targetPath);
    const result = await proxyRequest('/delete', {
      method: 'POST',
      body: JSON.stringify({
        filepath: targetPath,
      }),
    });

    const deletedPath = normalizePathForAccess(targetPath);
    if (deletedPath) {
      await deactivateSharesForDeletedPath(deletedPath).catch((error) => {
        console.error('Failed to invalidate deleted file-manager shares:', error);
      });
      await deleteFaceEmbeddingRecordsByPath(deletedPath).catch(() => null);

      const rows = await listCommonEventRows().catch(() => []);
      const deletedRootRow = rows.find((row) => {
        const rootPath = normalizePathForAccess(row?.root_path || '');
        return rootPath && rootPath === deletedPath;
      });

      if (deletedRootRow?.workspace_external_id) {
        await deleteCommonEventRowsByExternalId(deletedRootRow.workspace_external_id);
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message,
    });
  }
};

const getShareByToken = async (shareToken) => {
  await ensureFileShareTable();
  const [rows] = await db.sequelize.query(
    `SELECT * FROM file_manager_shares WHERE share_token = :shareToken AND is_active = 1 LIMIT 1`,
    { replacements: { shareToken: String(shareToken || '').trim() } }
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
};

const isMissingSharedResourceError = (error) => {
  const status = Number(error?.status);
  if (status === 404 || status === 410) return true;

  const message = String(error?.payload?.message || error?.message || '').trim().toLowerCase();
  // The storage service currently returns this opaque 500 when a previously
  // shared object has already been removed. Never expose that implementation
  // detail on a public share page.
  if (status === 500 && message === 'internal server error') return true;

  return (
    message.includes('file not found') ||
    message.includes('not available') ||
    message.includes('no longer available') ||
    message.includes('does not exist') ||
    message.includes('missing') ||
    message.includes('enoent') ||
    message.includes('deleted')
  );
};

const sendSharedResourceUnavailable = (res) =>
  res.status(410).json({
    success: false,
    code: 'SHARED_RESOURCE_UNAVAILABLE',
    message: 'This shared file or folder is no longer available. It may have been deleted by the owner.',
  });

async function deactivateSharesForDeletedPath(deletedPath) {
  const normalizedDeletedPath = normalizePathForAccess(deletedPath);
  if (!normalizedDeletedPath) return;

  await ensureFileShareTable();
  const [rows] = await db.sequelize.query(
    `SELECT share_id, resource_type, external_id, phase, path, filepath
     FROM file_manager_shares
     WHERE is_active = 1`
  );

  const deletedShareIds = (Array.isArray(rows) ? rows : [])
    .filter((share) => {
      const resourceType = String(share?.resource_type || '').toLowerCase();
      if (resourceType === 'file') {
        const sharedFilepath = normalizePathForAccess(share?.filepath || '');
        return sharedFilepath && isPathWithin(normalizedDeletedPath, sharedFilepath);
      }

      const externalId = normalizePathForAccess(share?.external_id || '');
      const relativePath = normalizePathForAccess(share?.path || '');
      const phase = normalizeWorkspacePhase(share?.phase, null);
      const phaseFolder = phase === 'pre' ? 'pre-production' : phase === 'post' ? 'post-production' : '';
      const sharedResourcePath = normalizePathForAccess(
        [externalId, phaseFolder, relativePath].filter(Boolean).join('/')
      );

      return sharedResourcePath && isPathWithin(normalizedDeletedPath, sharedResourcePath);
    })
    .map((share) => Number(share.share_id))
    .filter(Boolean);

  if (!deletedShareIds.length) return;
  await db.sequelize.query(
    `UPDATE file_manager_shares
     SET is_active = 0, updated_at = NOW()
     WHERE share_id IN (:shareIds)`,
    { replacements: { shareIds: deletedShareIds } }
  );
}

const extractBearerToken = (req) => {
  const authHeader = String(req.headers?.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
};

const ensureFileShareAccessLogsTable = async () => {
  if (!fileShareAccessLogsTableReadyPromise) {
    fileShareAccessLogsTableReadyPromise = db.sequelize.query(`
      CREATE TABLE IF NOT EXISTS file_manager_share_access_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        share_id BIGINT UNSIGNED NOT NULL,
        share_token VARCHAR(128) NOT NULL,
        email VARCHAR(255) NOT NULL,
        action VARCHAR(32) NOT NULL DEFAULT 'content_view',
        ip_address VARCHAR(64) DEFAULT NULL,
        user_agent VARCHAR(512) DEFAULT NULL,
        access_session_key VARCHAR(64) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_file_manager_share_access_logs_share_id (share_id),
        KEY idx_file_manager_share_access_logs_token (share_token),
        KEY idx_file_manager_share_access_logs_email (email),
        KEY idx_file_manager_share_access_logs_session (access_session_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  await fileShareAccessLogsTableReadyPromise;
  await db.sequelize.query(`
    ALTER TABLE file_manager_share_access_logs
    ADD COLUMN IF NOT EXISTS access_session_key VARCHAR(64) DEFAULT NULL
  `).catch(() => null);
  await db.sequelize.query(`
    ALTER TABLE file_manager_share_access_logs
    ADD INDEX idx_file_manager_share_access_logs_session (access_session_key)
  `).catch(() => null);
};

const getClientIpAddress = (req) => {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || '').trim() || null;
};

const getAccessSessionKey = (accessToken) => {
  const token = String(accessToken || '').trim();
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
};

const recordShareAccessLog = async (req, share, email, action = 'content_view', accessToken = '') => {
  if (!share?.share_id || !share?.share_token || !email) return;
  await ensureFileShareAccessLogsTable();
  const normalizedEmail = normalizeEmailAddress(email);
  const normalizedAction = String(action || 'content_view').trim().toLowerCase();
  const accessSessionKey = getAccessSessionKey(accessToken);

  const [latestRows] = await db.sequelize.query(
    `SELECT id, action
     FROM file_manager_share_access_logs
     WHERE share_id = :shareId
       AND email = :email
       AND (
         (:accessSessionKey IS NOT NULL AND access_session_key = :accessSessionKey)
         OR (:accessSessionKey IS NULL AND created_at >= (NOW() - INTERVAL 60 SECOND))
       )
     ORDER BY id DESC
     LIMIT 1`,
    {
      replacements: {
        shareId: share.share_id,
        email: normalizedEmail,
        accessSessionKey,
      },
    }
  ).catch(() => [[]]);

  const latestLog = Array.isArray(latestRows) && latestRows.length ? latestRows[0] : null;
  const latestAction = String(latestLog?.action || '').trim().toLowerCase();

  if (normalizedAction === 'content_view') {
    if (latestAction === 'content_view' || latestAction === 'view_download') return;
  }

  if (normalizedAction === 'download') {
    if (latestAction === 'view_download') return;
    if (latestAction === 'content_view' && latestLog?.id) {
      await db.sequelize.query(
        `UPDATE file_manager_share_access_logs
         SET action = 'view_download'
         WHERE id = :id`,
        { replacements: { id: latestLog.id } }
      ).catch(() => null);
      return;
    }
  }

  await db.sequelize.query(
    `INSERT INTO file_manager_share_access_logs
    (share_id, share_token, email, action, ip_address, user_agent, access_session_key)
    VALUES (:shareId, :shareToken, :email, :action, :ipAddress, :userAgent, :accessSessionKey)`,
    {
      replacements: {
        shareId: share.share_id,
        shareToken: String(share.share_token || ''),
        email: normalizedEmail,
        action: normalizedAction,
        ipAddress: getClientIpAddress(req),
        userAgent: String(req.headers?.['user-agent'] || '').slice(0, 512) || null,
        accessSessionKey,
      },
    }
  ).catch(() => null);
};

const ensureSharedScopeAccess = (share, requestedPhase, requestedPath) => {
  const shareType = String(share?.resource_type || '').toLowerCase();
  if (shareType === 'file') return true;

  const basePhase = normalizeWorkspacePhase(share?.phase, null);
  const basePath = normalizePathForAccess(share?.path || '');
  const targetPhase = normalizeWorkspacePhase(requestedPhase, basePhase);
  const targetPath = normalizePathForAccess(requestedPath || '');

  if (basePhase && targetPhase && basePhase !== targetPhase) {
    throw new Error('Requested path is outside the shared scope');
  }

  if (!basePath) return true;

  if (!targetPath) return true;
  if (!isPathWithin(basePath, targetPath)) {
    throw new Error('Requested path is outside the shared scope');
  }
  return true;
};

const normalizeSharePermission = (value, accessMode = 'email_only') => {
  const normalizedAccessMode = String(accessMode || 'email_only').trim().toLowerCase();
  if (normalizedAccessMode === 'anyone_with_link') return 'view_download';
  return String(value || '').trim().toLowerCase() === 'upload_download'
    ? 'upload_download'
    : 'view_download';
};

const ensureSharedUploadAccess = (share) => {
  if (String(share?.access_mode || 'email_only') === 'anyone_with_link') {
    const error = new Error('Upload access is only available for verified email shares');
    error.status = 403;
    throw error;
  }

  if (normalizeSharePermission(share?.permission, share?.access_mode) !== 'upload_download') {
    const error = new Error('This share does not allow uploads');
    error.status = 403;
    throw error;
  }
};

const getSharedWorkspaceRootPath = async (externalId) => {
  const result = await proxyRequest(`/workspace/${encodeURIComponent(String(externalId || ''))}`);
  return normalizePathForAccess(result?.data?.workspace?.rootPath || result?.data?.workspace?.fullPath || externalId);
};

const normalizeSharedUploadPhase = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'root') return null;
  return normalizeWorkspacePhase(normalized, null);
};

const normalizeSharedStorageFilepath = (value) =>
  normalizePathForAccess(value).replace(/^Website_Shoots_Flow\//i, '');

const resolveSharedUploadFilepath = async (share, requestedPhase, requestedPath, fileName) => {
  const safeFileName = sanitizeFolderName(fileName, 'file');
  if (!safeFileName) {
    const error = new Error('fileName is required');
    error.status = 400;
    throw error;
  }

  if (String(share?.resource_type || '').toLowerCase() === 'file') {
    const error = new Error('Uploads are not supported for single-file shares');
    error.status = 400;
    throw error;
  }

  const phaseToUse = normalizeSharedUploadPhase(requestedPhase) || normalizeSharedUploadPhase(share?.phase);
  const pathToUse = normalizePathForAccess(requestedPath || share?.path || '');
  ensureSharedScopeAccess(share, phaseToUse, pathToUse);

  const phaseFolder = phaseToUse === 'pre' ? 'pre-production' : phaseToUse === 'post' ? 'post-production' : '';
  const workspaceRootPath = await getSharedWorkspaceRootPath(share.external_id);
  return normalizePathForAccess(
    [workspaceRootPath, phaseFolder, pathToUse, safeFileName].filter(Boolean).join('/')
  );
};

exports.createShare = async (req, res) => {
  try {
    await ensureFileShareTable();
    const resourceType = String(req.body.resourceType || '').trim().toLowerCase();
    const externalId = String(req.body.externalId || '').trim();
    const phase = String(req.body.phase || '').trim() || null;
    const path = String(req.body.path || '').trim() || null;
    const filepath = String(req.body.filepath || '').trim() || null;
    const email = normalizeEmailAddress(req.body.email);
    const accessMode = String(req.body.accessMode || 'email_only').trim().toLowerCase();
    const normalizedAccessMode = accessMode === 'anyone_with_link' ? 'anyone_with_link' : 'email_only';
    const permission = normalizeSharePermission(req.body.permission, normalizedAccessMode);
    const effectiveEmail = normalizedAccessMode === 'anyone_with_link' ? 'anyone@link.local' : email;
    const shareMessage = String(req.body.message || '').trim().slice(0, 2000) || null;

    if (!['workspace', 'folder', 'file'].includes(resourceType)) {
      return res.status(400).json({ success: false, message: 'resourceType must be workspace, folder, or file' });
    }
    if (!externalId) return res.status(400).json({ success: false, message: 'externalId is required' });
    if (normalizedAccessMode === 'email_only' && !email) return res.status(400).json({ success: false, message: 'email is required' });
    if (resourceType === 'file' && !filepath) {
      return res.status(400).json({ success: false, message: 'filepath is required for file share' });
    }

    await ensureCreatorWorkspaceAccess(req, externalId);
    await ensureClientWorkspaceAccess(req, externalId);
    if (resourceType === 'file' && filepath) {
      await ensureCreatorFileAccess(req, filepath);
      await ensureClientFileAccess(req, filepath);
    }

    const shareToken = generateShareToken();
    await db.sequelize.query(
      `INSERT INTO file_manager_shares
      (share_token, resource_type, external_id, phase, path, filepath, shared_with_email, access_mode, permission, share_message, created_by_user_id, is_active)
      VALUES (:shareToken, :resourceType, :externalId, :phase, :path, :filepath, :email, :accessMode, :permission, :shareMessage, :createdBy, 1)`,
      {
        replacements: {
          shareToken,
          resourceType,
          externalId,
          phase,
          path,
          filepath,
          email: effectiveEmail,
          accessMode: normalizedAccessMode,
          permission,
          shareMessage,
          createdBy: getRequestUserId(req) || null,
        },
      }
    );

    const frontendBase = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
    const shareUrl = frontendBase ? `${frontendBase}/shared/file-manager/${shareToken}` : `/shared/file-manager/${shareToken}`;
    if (email) {
      const senderName = await getUserDisplayName(getRequestUserId(req)).catch(() => null);
      const emailResult = await emailService.sendFileShareInvitationEmail({
        to: email,
        data: {
          sender_name: senderName || 'Beige',
          shared_files_url: shareUrl,
          share_message: shareMessage || '',
          resource_type: resourceType,
          external_id: externalId,
          access_mode: normalizedAccessMode,
          permission,
        },
      });

      if (!emailResult?.success) {
        console.error(
          'File share invitation email failed:',
          emailResult?.error || 'Unknown email error'
        );
      }
    }

    return res.status(201).json({ success: true, data: { shareToken, shareUrl, message: shareMessage, permission } });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || { success: false, message: error.message });
  }
};

exports.requestShareOtp = async (req, res) => {
  try {
    await ensureFileShareOtpTable();
    const shareToken = String(req.body.shareToken || '').trim();
    const email = normalizeEmailAddress(req.body.email);
    if (!shareToken || !email) {
      return res.status(400).json({ success: false, message: 'shareToken and email are required' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (
      String(share.access_mode || 'email_only') !== 'anyone_with_link' &&
      normalizeEmailAddress(share.shared_with_email) !== email
    ) {
      return res.status(403).json({ success: false, message: 'This email does not have access for the Shared link' });
    }

    const otpExpiryMinutes = 10;
    const otp = otpService.generateOTP();
    const otpExpiry = otpService.generateOTPExpiry(otpExpiryMinutes);
    await db.sequelize.query(
      `UPDATE file_manager_share_otp
       SET otp_expires_at = NOW()
       WHERE share_id = :shareId AND email = :email AND verified_at IS NULL`,
      { replacements: { shareId: share.share_id, email } }
    );
    await db.sequelize.query(
      `INSERT INTO file_manager_share_otp (share_id, email, otp_code, otp_expires_at) VALUES (:shareId, :email, :otpCode, :otpExpiry)`,
      { replacements: { shareId: share.share_id, email, otpCode: otp, otpExpiry } }
    );

    const emailResult = await emailService.sendFileShareVerificationOTP(
      { email },
      otp,
      otpExpiryMinutes
    );
    if (!emailResult?.success) {
      return res.status(500).json({ success: false, message: emailResult?.error || 'Failed to send OTP email' });
    }

    return res.status(200).json({ success: true, message: 'OTP sent to email' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to request OTP' });
  }
};

exports.verifyShareOtp = async (req, res) => {
  try {
    await ensureFileShareOtpTable();
    const shareToken = String(req.body.shareToken || '').trim();
    const email = normalizeEmailAddress(req.body.email);
    const otp = String(req.body.otp || '').trim();
    if (!shareToken || !email || !otp) {
      return res.status(400).json({ success: false, message: 'shareToken, email and otp are required' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (
      String(share.access_mode || 'email_only') !== 'anyone_with_link' &&
      normalizeEmailAddress(share.shared_with_email) !== email
    ) {
      return res.status(403).json({ success: false, message: 'This email does not have access for the shared link' });
    }

    const [rows] = await db.sequelize.query(
      `SELECT * FROM file_manager_share_otp
      WHERE share_id = :shareId AND email = :email
      ORDER BY id DESC LIMIT 1`,
      { replacements: { shareId: share.share_id, email } }
    );
    const otpRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!otpRow) return res.status(400).json({ success: false, message: 'No OTP found. Please request a new OTP.' });

    const validation = otpService.validateOTP(otp, otpRow.otp_code, otpRow.otp_expires_at);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message || 'Invalid OTP' });
    }

    await db.sequelize.query(`UPDATE file_manager_share_otp SET verified_at = NOW() WHERE id = :id`, {
      replacements: { id: otpRow.id },
    });

    const accessToken = signShareAccessToken({ shareToken, email });
    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        permission: normalizeSharePermission(share.permission, share.access_mode),
        accessMode: share.access_mode || 'email_only',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to verify OTP' });
  }
};

exports.getSharedContent = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }
    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (
      String(share.access_mode || 'email_only') !== 'anyone_with_link' &&
      normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)
    ) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }
    await recordShareAccessLog(req, share, claims.email, 'content_view', accessToken);

    if (share.resource_type === 'file') {
      try {
        const viewResult = await proxyRequest('/file-view-url', {
          method: 'POST',
          body: JSON.stringify({ filepath: share.filepath }),
        });
        return res.status(200).json({
          success: true,
          data: {
            type: 'file',
            file: { path: share.filepath, name: String(share.filepath || '').split('/').pop() || '' },
            view: withPublicUrl(viewResult, req)?.data || null,
            permission: normalizeSharePermission(share.permission, share.access_mode),
            accessMode: share.access_mode || 'email_only',
          },
        });
      } catch (error) {
        if (isMissingSharedResourceError(error)) {
          return sendSharedResourceUnavailable(res);
        }
        throw error;
      }
    }

    const requestedPhase = String(req.query.phase || '').trim() || null;
    const requestedPath = String(req.query.path || '').trim() || null;
    ensureSharedScopeAccess(share, requestedPhase, requestedPath);

    const phaseToUse = requestedPhase || share.phase || null;
    const pathToUse = requestedPath || share.path || null;

    const query = new URLSearchParams();
    if (phaseToUse) query.set('phase', phaseToUse);
    if (pathToUse) query.set('path', pathToUse);
    let listing;
    try {
      listing = await proxyRequest(`/workspace/${encodeURIComponent(String(share.external_id))}/files${query.toString() ? `?${query.toString()}` : ''}`);
    } catch (error) {
      if (isMissingSharedResourceError(error)) {
        return sendSharedResourceUnavailable(res);
      }
      throw error;
    }
    return res.status(200).json({
      success: true,
      data: {
        type: share.resource_type === 'workspace' ? 'workspace' : 'folder',
        externalId: share.external_id,
        phase: phaseToUse,
        path: pathToUse,
        rootPhase: share.phase,
        rootPath: share.path,
        permission: normalizeSharePermission(share.permission, share.access_mode),
        accessMode: share.access_mode || 'email_only',
        ...listing.data,
      },
    });
  } catch (error) {
    if (isMissingSharedResourceError(error)) {
      return sendSharedResourceUnavailable(res);
    }
    const statusCode = String(error?.message || '').toLowerCase().includes('outside the shared scope') ? 403 : 401;
    return res.status(statusCode).json({ success: false, message: error.message || 'Invalid or expired share access token' });
  }
};

exports.listShares = async (req, res) => {
  try {
    await ensureFileShareTable();
    const resourceType = String(req.query.resourceType || '').trim().toLowerCase();
    const externalId = String(req.query.externalId || '').trim();
    const phase = String(req.query.phase || '').trim() || null;
    const path = String(req.query.path || '').trim() || null;
    const filepath = String(req.query.filepath || '').trim() || null;

    if (!['workspace', 'folder', 'file'].includes(resourceType)) {
      return res.status(400).json({ success: false, message: 'resourceType must be workspace, folder, or file' });
    }
    if (!externalId) return res.status(400).json({ success: false, message: 'externalId is required' });

    await ensureCreatorWorkspaceAccess(req, externalId);
    if (resourceType === 'file' && filepath) {
      await ensureCreatorFileAccess(req, filepath);
    }

    const [rows] = await db.sequelize.query(
      `SELECT share_id, share_token, resource_type, shared_with_email, access_mode, permission, share_message, phase, path, filepath, created_at
       FROM file_manager_shares
       WHERE is_active = 1
         AND resource_type = :resourceType
         AND external_id = :externalId
         AND (:phase IS NULL OR IFNULL(phase,'') = IFNULL(:phase,''))
         AND (:path IS NULL OR IFNULL(path,'') = IFNULL(:path,''))
         AND (:filepath IS NULL OR IFNULL(filepath,'') = IFNULL(:filepath,''))
       ORDER BY created_at DESC`,
      {
        replacements: { resourceType, externalId, phase, path, filepath },
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        shares: (rows || []).map((row) => ({
          shareId: row.share_id,
          shareToken: row.share_token,
          email: row.shared_with_email,
          accessMode: row.access_mode || 'email_only',
          permission: normalizeSharePermission(row.permission, row.access_mode),
          message: row.share_message || null,
          resourceType: row.resource_type,
          phase: row.phase,
          path: row.path,
          filepath: row.filepath,
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || { success: false, message: error.message });
  }
};

exports.revokeShare = async (req, res) => {
  try {
    await ensureFileShareTable();
    const shareId = Number(req.body.shareId);
    const shareToken = String(req.body.shareToken || '').trim();

    if (!shareId && !shareToken) {
      return res.status(400).json({ success: false, message: 'shareId or shareToken is required' });
    }

    let shareRow = null;
    if (shareId) {
      const [rows] = await db.sequelize.query(
        `SELECT * FROM file_manager_shares WHERE share_id = :shareId AND is_active = 1 LIMIT 1`,
        { replacements: { shareId } }
      );
      shareRow = Array.isArray(rows) && rows.length ? rows[0] : null;
    } else if (shareToken) {
      shareRow = await getShareByToken(shareToken);
    }

    if (!shareRow) {
      return res.status(404).json({ success: false, message: 'Share not found' });
    }

    await ensureCreatorWorkspaceAccess(req, String(shareRow.external_id || ''));
    if (String(shareRow.resource_type || '').toLowerCase() === 'file' && shareRow.filepath) {
      await ensureCreatorFileAccess(req, shareRow.filepath);
    }

    await db.sequelize.query(
      `UPDATE file_manager_shares SET is_active = 0, updated_at = NOW() WHERE share_id = :shareId`,
      { replacements: { shareId: shareRow.share_id } }
    );

    return res.status(200).json({ success: true, message: 'Share revoked successfully' });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || { success: false, message: error.message });
  }
};

exports.listShareAccessLogs = async (req, res) => {
  try {
    await ensureFileShareTable();
    await ensureFileShareAccessLogsTable();
    const resourceType = String(req.query.resourceType || '').trim().toLowerCase();
    const externalId = String(req.query.externalId || '').trim();
    const phase = String(req.query.phase || '').trim() || null;
    const path = String(req.query.path || '').trim() || null;
    const filepath = String(req.query.filepath || '').trim() || null;

    if (!['workspace', 'folder', 'file'].includes(resourceType)) {
      return res.status(400).json({ success: false, message: 'resourceType must be workspace, folder, or file' });
    }
    if (!externalId) return res.status(400).json({ success: false, message: 'externalId is required' });

    await ensureCreatorWorkspaceAccess(req, externalId);
    if (resourceType === 'file' && filepath) {
      await ensureCreatorFileAccess(req, filepath);
    }

    const [rows] = await db.sequelize.query(
      `SELECT l.id, l.share_id, l.share_token, l.email, l.action, l.ip_address, l.user_agent, l.created_at
       FROM file_manager_share_access_logs l
       INNER JOIN file_manager_shares s ON s.share_id = l.share_id
       WHERE s.is_active = 1
         AND s.resource_type = :resourceType
         AND s.external_id = :externalId
         AND (:phase IS NULL OR IFNULL(s.phase,'') = IFNULL(:phase,''))
         AND (:path IS NULL OR IFNULL(s.path,'') = IFNULL(:path,''))
         AND (:filepath IS NULL OR IFNULL(s.filepath,'') = IFNULL(:filepath,''))
       ORDER BY l.created_at DESC
       LIMIT 500`,
      { replacements: { resourceType, externalId, phase, path, filepath } }
    );

    return res.status(200).json({
      success: true,
      data: {
        logs: (rows || []).map((row) => ({
          id: row.id,
          shareId: row.share_id,
          shareToken: row.share_token,
          email: row.email,
          action: row.action,
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || { success: false, message: error.message });
  }
};

exports.getSharedDownloadUrl = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    const filepath = String(req.query.filepath || '').trim();
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }
    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (
      String(share.access_mode || 'email_only') !== 'anyone_with_link' &&
      normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)
    ) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }
    await recordShareAccessLog(req, share, claims.email, 'download', accessToken);

    if (share.resource_type === 'file') {
      try {
        const result = await proxyRequest('/file-download-url', {
          method: 'POST',
          body: JSON.stringify({ filepath: share.filepath }),
        });
        return res.status(200).json(withPublicUrl(result, req));
      } catch (error) {
        if (isMissingSharedResourceError(error)) {
          return sendSharedResourceUnavailable(res);
        }
        throw error;
      }
    }

    if (!filepath) {
      return res.status(400).json({ success: false, message: 'filepath query is required for folder/workspace shares' });
    }

    const normalizedFilepath = normalizePathForAccess(filepath);
    const requestedPhase = normalizeWorkspacePhase(req.query.phase, null);
    const requestedRelativePath = normalizePathForAccess(req.query.path || '');
    const extractedFromFilepath = extractPhaseAndRelativePath(normalizedFilepath, requestedPhase);
    const scopePhase = extractedFromFilepath.phase || requestedPhase;
    const scopePath = extractedFromFilepath.relativePath || requestedRelativePath;
    ensureSharedScopeAccess(share, scopePhase, scopePath);

    const result = await proxyRequest('/file-download-url', {
      method: 'POST',
      body: JSON.stringify({ filepath: normalizedFilepath }),
    });
    return res.status(200).json(withPublicUrl(result, req));
  } catch (error) {
    if (isMissingSharedResourceError(error)) {
      return sendSharedResourceUnavailable(res);
    }
    const statusCode = String(error?.message || '').toLowerCase().includes('outside the shared scope') ? 403 : 401;
    return res.status(statusCode).json({ success: false, message: error.message || 'Invalid or expired share access token' });
  }
};

exports.getSharedViewUrl = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    const filepath = String(req.query.filepath || '').trim();
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }
    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (
      String(share.access_mode || 'email_only') !== 'anyone_with_link' &&
      normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)
    ) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }

    if (share.resource_type === 'file') {
      try {
        const result = await proxyRequest('/file-view-url', {
          method: 'POST',
          body: JSON.stringify({ filepath: share.filepath }),
        });
        return res.status(200).json(withPublicUrl(result, req));
      } catch (error) {
        if (isMissingSharedResourceError(error)) {
          return sendSharedResourceUnavailable(res);
        }
        throw error;
      }
    }

    if (!filepath) {
      return res.status(400).json({ success: false, message: 'filepath query is required for folder/workspace shares' });
    }

    const normalizedFilepath = normalizePathForAccess(filepath);
    const requestedPhase = normalizeWorkspacePhase(req.query.phase, null);
    const requestedRelativePath = normalizePathForAccess(req.query.path || '');
    const extractedFromFilepath = extractPhaseAndRelativePath(normalizedFilepath, requestedPhase);
    const scopePhase = extractedFromFilepath.phase || requestedPhase;
    const scopePath = extractedFromFilepath.relativePath || requestedRelativePath;
    ensureSharedScopeAccess(share, scopePhase, scopePath);

    const result = await proxyRequest('/file-view-url', {
      method: 'POST',
      body: JSON.stringify({ filepath: normalizedFilepath }),
    });
    return res.status(200).json(withPublicUrl(result, req));
  } catch (error) {
    if (isMissingSharedResourceError(error)) {
      return sendSharedResourceUnavailable(res);
    }
    const statusCode = String(error?.message || '').toLowerCase().includes('outside the shared scope') ? 403 : 401;
    return res.status(statusCode).json({ success: false, message: error.message || 'Invalid or expired share access token' });
  }
};

exports.getSharedUploadPolicy = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    const fileName = String(req.body.fileName || '').trim();
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }

    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }
    ensureSharedUploadAccess(share);

    const filepath = await resolveSharedUploadFilepath(share, req.body.phase, req.body.path, fileName);
    const result = await proxyRequest('/upload-policy', {
      method: 'POST',
      body: JSON.stringify({
        filepath,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        userId: null,
      }),
    });

    await recordShareAccessLog(req, share, claims.email, 'upload_policy', accessToken);
    return res.status(200).json({
      ...result,
      data: {
        ...(result?.data || {}),
        filepath,
        filePath: filepath,
        storageFilePath: result?.data?.filePath || null,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create shared upload policy',
    });
  }
};

exports.getSharedUploadPoliciesBatch = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }
    ensureSharedUploadAccess(share);

    const resolvedItems = [];
    for (const item of items.slice(0, 500)) {
      try {
        const filepath = await resolveSharedUploadFilepath(
          share,
          item?.phase ?? req.body.phase,
          item?.path ?? req.body.path,
          item?.fileName || String(item?.filepath || '').split('/').pop() || ''
        );
        resolvedItems.push({
          filepath,
          fileContentType: item?.fileContentType,
          fileSize: item?.fileSize,
          fileName: item?.fileName || filepath.split('/').pop() || '',
        });
      } catch (error) {
        resolvedItems.push({
          filepath: String(item?.filepath || item?.fileName || ''),
          fileContentType: item?.fileContentType,
          fileSize: item?.fileSize,
          fileName: item?.fileName || '',
          error: error?.message || 'Invalid upload target',
        });
      }
    }

    const validItems = resolvedItems.filter((item) => !item.error);
    const invalidItems = resolvedItems.filter((item) => item.error);
    const result = validItems.length
      ? await proxyRequest('/upload-policies/batch', {
          method: 'POST',
          body: JSON.stringify({
            userId: null,
            items: validItems.map((item) => ({
              filepath: item.filepath,
              fileContentType: item.fileContentType,
              fileSize: item.fileSize,
              userId: null,
            })),
          }),
        })
      : { success: true, data: { items: [] } };

    const proxyItems = Array.isArray(result?.data?.items) ? result.data.items : [];
    const proxyItemsByPath = new Map(proxyItems.map((item) => [normalizeSharedStorageFilepath(item.filepath), item]));
    const responseItems = [
      ...validItems.map((item) => {
        const proxyItem = proxyItemsByPath.get(normalizeSharedStorageFilepath(item.filepath));
        if (!proxyItem?.success || !proxyItem?.data?.url || !proxyItem?.data?.fields) {
          return {
            filepath: item.filepath,
            success: false,
            error: proxyItem?.error || 'Failed to create upload policy',
            code: proxyItem?.code || 500,
          };
        }
        return {
          filepath: item.filepath,
          success: true,
          data: {
            ...proxyItem.data,
            filepath: item.filepath,
            filePath: item.filepath,
            storageFilePath: proxyItem.data.filePath || null,
          },
        };
      }),
      ...invalidItems.map((item) => ({
        filepath: item.filepath,
        success: false,
        error: item.error,
        code: 400,
      })),
    ];

    await recordShareAccessLog(req, share, claims.email, 'upload_policy', accessToken);
    return res.status(200).json({
      success: true,
      data: {
        total: responseItems.length,
        successCount: responseItems.filter((item) => item.success).length,
        failureCount: responseItems.filter((item) => !item.success).length,
        items: responseItems,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to create shared upload policies',
    });
  }
};

exports.notifySharedFileUploaded = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    const filepath = normalizeSharedStorageFilepath(req.body.filepath || req.body.filePath || '');
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }

    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }
    ensureSharedUploadAccess(share);
    const workspaceRootPath = await getSharedWorkspaceRootPath(share.external_id);
    if (!isPathWithin(workspaceRootPath, filepath)) {
      return res.status(403).json({ success: false, message: 'Uploaded file is outside the shared workspace' });
    }

    const requestedPhase = normalizeSharedUploadPhase(req.body.phase);
    const requestedRelativePath = normalizePathForAccess(req.body.path || '');
    const extractedFromFilepath = extractPhaseAndRelativePath(filepath, requestedPhase);
    ensureSharedScopeAccess(
      share,
      extractedFromFilepath.phase || requestedPhase,
      extractedFromFilepath.relativePath || requestedRelativePath
    );

    const result = await proxyRequest('/file-uploaded', {
      method: 'POST',
      body: JSON.stringify({
        filepath,
        fileContentType: req.body.fileContentType,
        fileSize: req.body.fileSize,
        fileName: req.body.fileName,
        userId: null,
        authorName: claims.email || 'Shared upload',
      }),
    });

    await recordShareAccessLog(req, share, claims.email, 'upload', accessToken);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to record shared upload',
    });
  }
};

exports.notifySharedFilesUploadedBatch = async (req, res) => {
  try {
    const shareToken = String(req.params.shareToken || '').trim();
    const accessToken = extractBearerToken(req);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!shareToken || !accessToken) {
      return res.status(401).json({ success: false, message: 'Share token and access token are required' });
    }
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    const claims = verifyShareAccessToken(accessToken);
    if (String(claims.shareToken) !== shareToken) {
      return res.status(403).json({ success: false, message: 'Access token does not match share link' });
    }

    const share = await getShareByToken(shareToken);
    if (!share) return sendSharedResourceUnavailable(res);
    if (normalizeEmailAddress(share.shared_with_email) !== normalizeEmailAddress(claims.email)) {
      return res.status(403).json({ success: false, message: 'Access denied for this email' });
    }
    ensureSharedUploadAccess(share);

    const workspaceRootPath = await getSharedWorkspaceRootPath(share.external_id);
    const validItems = [];
    const invalidItems = [];
    for (const item of items.slice(0, 500)) {
      const filepath = normalizeSharedStorageFilepath(item?.filepath || item?.filePath || '');
      try {
        if (!isPathWithin(workspaceRootPath, filepath)) {
          throw new Error('Uploaded file is outside the shared workspace');
        }
        const requestedPhase = normalizeSharedUploadPhase(item?.phase ?? req.body.phase);
        const requestedRelativePath = normalizePathForAccess((item?.path ?? req.body.path) || '');
        const extractedFromFilepath = extractPhaseAndRelativePath(filepath, requestedPhase);
        ensureSharedScopeAccess(
          share,
          extractedFromFilepath.phase || requestedPhase,
          extractedFromFilepath.relativePath || requestedRelativePath
        );
        validItems.push({
          filepath,
          fileContentType: item?.fileContentType,
          fileSize: item?.fileSize,
          fileName: item?.fileName || filepath.split('/').pop() || '',
          authorName: claims.email || 'Shared upload',
          userId: null,
        });
      } catch (error) {
        invalidItems.push({
          filepath,
          success: false,
          error: error?.message || 'Invalid uploaded file',
          code: 400,
        });
      }
    }

    const result = validItems.length
      ? await proxyRequest('/files-uploaded/batch', {
          method: 'POST',
          body: JSON.stringify({
            userId: null,
            authorName: claims.email || 'Shared upload',
            items: validItems,
          }),
        })
      : { success: true, data: { items: [] } };

    const proxyItems = Array.isArray(result?.data?.items) ? result.data.items : [];
    const responseItems = [...proxyItems, ...invalidItems];
    await recordShareAccessLog(req, share, claims.email, 'upload', accessToken);
    return res.status(200).json({
      success: true,
      data: {
        total: responseItems.length,
        successCount: responseItems.filter((item) => item.success).length,
        failureCount: responseItems.filter((item) => !item.success).length,
        items: responseItems,
      },
    });
  } catch (error) {
    return res.status(error.status || 500).json(error.payload || {
      success: false,
      message: error.message || 'Failed to record shared uploads',
    });
  }
};
