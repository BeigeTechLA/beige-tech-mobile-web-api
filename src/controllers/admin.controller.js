const constants = require('../utils/constants');
const { Sequelize, users, affiliates } = require('../models')
const multer = require('multer');
const path = require('path');
const common_model = require('../utils/common_model');
const { Op, QueryTypes } = require('sequelize');
const { S3UploadFiles, toAbsoluteBeigeAssetUrl } = require('../utils/common.js');
const moment = require('moment');
const {
  sendTaskAssignmentEmail,
  sendCPNewBookingRequestEmail,
  sendPostProductionAssignmentEmail,
  sendOnboardingFormCriticalEmail
} = require('../utils/emailService');
const { stream_project_booking, crew_members, crew_member_files, tasks, equipment, crew_roles,
  equipment_accessories,
  equipment_category,
  equipment_documents,
  equipment_photos,
  equipment_specs,
  equipment_assignments,
  assignment_checklist,
  checklist_master,
  equipment_returns,
  equipment_return_checklist,
  equipment_return_issues,
  skills_master,
  certifications_master,
  assigned_crew,
  assigned_equipment,
  project_brief,
  event_type_master,
  payment_transactions,
  assigned_post_production_member,
  post_production_members,
  clients, user_archive_history, sales_leads, client_leads, sales_lead_activities, client_lead_activities, quotes, quote_line_items, discount_codes, payment_links, project_form_submissions,
  payments } = require('../models');
  const { deleteSheetRow, updateSheetRow } = require('../utils/googleSheets');
const leadAssignmentService = require('../services/lead-assignment.service');
const { extractCoordinatesFromPayload, calculateDistance } = require('../utils/locationHelpers');
const db = require('../models');
const bookingTimelineService = require('../services/bookingTimeline.service');
const accountCreditService = require('../services/account-credit.service');
const bookingPaymentSummaryService = require('../services/booking-payment-summary.service');
const quoteService = require('../services/sales-quote.service');
const bookingPricingService = require('../services/booking-pricing.service');
const { getStudioPricingSnapshot, isStudioLineItem } = require('../utils/studio-pricing');
// const NodeGeocoder = require('node-geocoder');
const EXTERNAL_FILE_MANAGER_API_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_API_BASE_URL || 'http://localhost:5002/v1/external-file-manager';
const EXTERNAL_MEETINGS_API_BASE_URL = process.env.EXTERNAL_MEETINGS_API_BASE_URL || 'http://localhost:5002/v1/external-meetings';
const EXTERNAL_FILE_MANAGER_KEY = process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';

const getFrontendBaseUrl = () =>
  String(process.env.FRONTEND_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');

const buildShootReceiptUrl = ({ bookingId, manualPaymentId = null, paymentId = null, download = false }) => {
  const url = new URL(`${getFrontendBaseUrl()}/beige_invoice/${encodeURIComponent(String(bookingId))}`);
  url.searchParams.set('receipt', '1');
  if (manualPaymentId) url.searchParams.set('manual_payment_id', String(manualPaymentId));
  if (paymentId) url.searchParams.set('payment_id', String(paymentId));
  if (download) url.searchParams.set('download', '1');
  return url.toString();
};

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const buildShootNeedsAttention = (project = {}, formSubmission = null) => {
  const missingFields = [];
  const bookingDays = Array.isArray(project.booking_days) ? project.booking_days : [];
  const hasDate = hasValue(project.event_date) || bookingDays.some((day) => hasValue(day.event_date));
  const hasLocation = hasValue(project.event_location);
  const hasOnboardingForm = !!formSubmission;

  if (!hasDate) missingFields.push('date');
  if (!hasLocation) missingFields.push('location');
  if (!hasOnboardingForm) missingFields.push('onboarding_form');

  return {
    required: missingFields.length > 0,
    missing_fields: missingFields,
  };
};

const normalizeLocationForStorage = (location) => {
  if (location === undefined) return undefined;
  if (location === null) return null;
  if (typeof location === 'string') return location.trim() || null;
  if (typeof location === 'object') return JSON.stringify(location);
  return String(location);
};

const isValidDateOnly = (date) => moment(String(date), 'YYYY-MM-DD', true).isValid();

const normalizeScheduleTime = (time) => {
  if (time === null || time === undefined || time === '') return null;
  const parsed = moment(String(time), ['HH:mm:ss', 'HH:mm'], true);
  return parsed.isValid() ? parsed.format('HH:mm:ss') : null;
};

const calculateDurationHours = (startTime, endTime) => {
  if (!startTime || !endTime) return null;
  const start = moment(startTime, 'HH:mm:ss', true);
  const end = moment(endTime, 'HH:mm:ss', true);
  if (!start.isValid() || !end.isValid()) return null;
  const diff = end.diff(start, 'minutes');
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : null;
};

const getCPNewBookingEmailFields = (booking = {}, fallbackClientName = '', fallbackShootAmount = null) => ({
  client_name:
    fallbackClientName ||
    booking?.client_name ||
    booking?.user?.name ||
    null,
  service_type:
    booking?.content_type ||
    booking?.event_type ||
    booking?.shoot_type ||
    null,
  date: booking?.event_date || null,
  start_time: booking?.start_time || null,
  end_time: booking?.end_time || null,
  shoot_amount: fallbackShootAmount ?? booking?.budget ?? null
});

const resolveAdminBookingClientName = async (booking = null, fallbackClientName = null) => {
  if (fallbackClientName) {
    return fallbackClientName;
  }

  if (!booking) {
    return null;
  }

  if (booking.client_name) {
    return booking.client_name;
  }

  if (booking.user?.name) {
    return booking.user.name;
  }

  if (booking.user_id) {
    const bookingUser = await users.findOne({
      where: { id: booking.user_id },
      attributes: ['name']
    });

    if (bookingUser?.name) {
      return bookingUser.name;
    }
  }

  const linkedLead = await sales_leads.findOne({
    where: { booking_id: booking.stream_project_booking_id },
    attributes: ['client_name']
  });

  if (linkedLead?.client_name) {
    return linkedLead.client_name;
  }

  const linkedClientLead = await client_leads.findOne({
    where: { booking_id: booking.stream_project_booking_id },
    attributes: ['client_name']
  });

  if (linkedClientLead?.client_name) {
    return linkedClientLead.client_name;
  }

  if (booking.guest_email) {
    const localPart = String(booking.guest_email).split('@')[0] || '';
    const derivedName = localPart.replace(/[._-]+/g, ' ').trim();
    if (derivedName) {
      return derivedName;
    }
  }

  return null;
};

const resolveAdminBookingClientContact = async (booking = null) => {
  if (!booking) {
    return { full_name: null, email: null, phone_number: null };
  }

  const bookingJson = typeof booking.toJSON === 'function' ? booking.toJSON() : booking;
  const bookingId = bookingJson.stream_project_booking_id;
  const userId = bookingJson.user_id;

  const [bookingUser, linkedClient, linkedLead, linkedClientLead] = await Promise.all([
    userId
      ? users.findOne({
          where: { id: userId },
          attributes: ['name', 'email', 'phone_number'],
          raw: true
        })
      : Promise.resolve(null),
    userId
      ? clients.findOne({
          where: { user_id: userId, is_active: 1 },
          attributes: ['name', 'email', 'phone_number'],
          raw: true
        })
      : Promise.resolve(null),
    bookingId
      ? sales_leads.findOne({
          where: { booking_id: bookingId, is_active: 1 },
          attributes: ['client_name', 'guest_email', 'phone'],
          raw: true
        })
      : Promise.resolve(null),
    bookingId
      ? client_leads.findOne({
          where: { booking_id: bookingId, is_active: 1 },
          attributes: ['client_name', 'guest_email', 'phone'],
          raw: true
        })
      : Promise.resolve(null)
  ]);

  const email =
    bookingUser?.email ||
    linkedClient?.email ||
    linkedLead?.guest_email ||
    linkedClientLead?.guest_email ||
    bookingJson.guest_email ||
    null;

  let fullName =
    bookingUser?.name ||
    linkedClient?.name ||
    linkedLead?.client_name ||
    linkedClientLead?.client_name ||
    null;

  if (!fullName && email) {
    fullName = String(email).split('@')[0].replace(/[._-]+/g, ' ').trim() || null;
  }

  return {
    full_name: fullName,
    email,
    phone_number:
      bookingUser?.phone_number ||
      linkedClient?.phone_number ||
      linkedLead?.phone ||
      linkedClientLead?.phone ||
      null
  };
};

const getFirstNameForEmail = (name, email) => {
  const normalizedName = String(name || '').trim();
  if (normalizedName) return normalizedName.split(/\s+/)[0];

  if (email && String(email).includes('@')) {
    const localPart = String(email).split('@')[0] || '';
    const derived = localPart.replace(/[._-]+/g, ' ').trim();
    if (derived) return derived.split(/\s+/)[0];
  }

  return 'there';
};

const resolveAdminBookingShootAmount = async (booking = null, fallbackShootAmount = null) => {
  if (fallbackShootAmount !== undefined && fallbackShootAmount !== null) {
    return fallbackShootAmount;
  }

  if (!booking) {
    return null;
  }

  if (booking.budget !== undefined && booking.budget !== null) {
    return booking.budget;
  }

  if (booking.primary_quote) {
    return (
      booking.primary_quote.total ??
      booking.primary_quote.price_after_discount ??
      booking.primary_quote.subtotal ??
      null
    );
  }

  if (booking.quote_id) {
    const quote = await quotes.findByPk(booking.quote_id, {
      attributes: ['total', 'price_after_discount', 'subtotal']
    });

    if (quote) {
      return quote.total ?? quote.price_after_discount ?? quote.subtotal ?? null;
    }
  }

  return null;
};

const parseAmountCandidate = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const resolveProjectDisplayAmount = async ({ project, paymentData }) => {
  const paymentAmount = parseAmountCandidate(paymentData?.total_amount);
  if (paymentAmount !== null && paymentAmount > 0) {
    return paymentAmount;
  }

  const budgetAmount = parseAmountCandidate(project?.budget);

  const quoteAmountFromLinkedQuote = project?.quote_id
    ? await quotes.findByPk(project.quote_id, {
        attributes: ['total', 'price_after_discount', 'subtotal'],
      }).then((quote) => {
        if (!quote) return null;
        if (budgetAmount !== null && budgetAmount > 0) {
          return budgetAmount;
        }
        return (
          parseAmountCandidate(quote.total) ??
          parseAmountCandidate(quote.price_after_discount) ??
          parseAmountCandidate(quote.subtotal)
        );
      })
    : null;

  if (quoteAmountFromLinkedQuote !== null && quoteAmountFromLinkedQuote > 0) {
    return quoteAmountFromLinkedQuote;
  }

  const quoteAmountFromBooking = await quotes.findOne({
    where: { booking_id: project?.stream_project_booking_id },
    attributes: ['total', 'price_after_discount', 'subtotal'],
    order: [['quote_id', 'DESC']],
  }).then((quote) => {
    if (!quote) return null;
    if (budgetAmount !== null && budgetAmount > 0) {
      return budgetAmount;
    }
    return (
      parseAmountCandidate(quote.total) ??
      parseAmountCandidate(quote.price_after_discount) ??
      parseAmountCandidate(quote.subtotal)
    );
  });

  if (quoteAmountFromBooking !== null && quoteAmountFromBooking > 0) {
    return quoteAmountFromBooking;
  }

  if (budgetAmount !== null && budgetAmount > 0) {
    return budgetAmount;
  }

  return 0;
};

const resolveProjectTotalValueAmount = async ({ project, salesQuoteId = null }) => {
  const budgetAmount = parseAmountCandidate(project?.budget);

  const salesQuoteAmount = salesQuoteId
    ? await db.sales_quotes.findByPk(salesQuoteId, {
        attributes: ['total', 'subtotal'],
      }).then((quote) => {
        if (!quote) return null;
        return (
          parseAmountCandidate(quote.total) ??
          parseAmountCandidate(quote.subtotal)
        );
      })
    : null;

  if (salesQuoteAmount !== null && salesQuoteAmount > 0) {
    return salesQuoteAmount;
  }

  const quoteAmountFromLinkedQuote = project?.quote_id
    ? await quotes.findByPk(project.quote_id, {
        attributes: ['subtotal', 'total', 'price_after_discount'],
      }).then((quote) => {
        if (!quote) return null;
        if (budgetAmount !== null && budgetAmount > 0) {
          return budgetAmount;
        }
        return (
          parseAmountCandidate(quote.total) ??
          parseAmountCandidate(quote.price_after_discount) ??
          parseAmountCandidate(quote.subtotal)
        );
      })
    : null;

  if (quoteAmountFromLinkedQuote !== null && quoteAmountFromLinkedQuote > 0) {
    return quoteAmountFromLinkedQuote;
  }

  const quoteAmountFromBooking = await quotes.findOne({
    where: { booking_id: project?.stream_project_booking_id },
    attributes: ['subtotal', 'total', 'price_after_discount'],
    order: [['quote_id', 'DESC']],
  }).then((quote) => {
    if (!quote) return null;
    if (budgetAmount !== null && budgetAmount > 0) {
      return budgetAmount;
    }
    return (
      parseAmountCandidate(quote.total) ??
      parseAmountCandidate(quote.price_after_discount) ??
      parseAmountCandidate(quote.subtotal)
    );
  });

  if (quoteAmountFromBooking !== null && quoteAmountFromBooking > 0) {
    return quoteAmountFromBooking;
  }

  const bookingId = project?.stream_project_booking_id;
  const salesQuoteAmountFromLead = bookingId
    ? await db.sales_leads.findOne({
        where: { booking_id: bookingId, is_active: 1 },
        attributes: ['lead_id'],
        order: [['lead_id', 'DESC']],
      }).then((lead) => {
        if (!lead?.lead_id) return null;
        return db.sales_quotes.findOne({
          where: { lead_id: lead.lead_id },
          attributes: ['total', 'subtotal'],
          order: [['updated_at', 'DESC'], ['sales_quote_id', 'DESC']],
        });
      }).then((quote) => {
        if (!quote) return null;
        return (
          parseAmountCandidate(quote.total) ??
          parseAmountCandidate(quote.subtotal)
        );
      })
    : null;

  if (salesQuoteAmountFromLead !== null && salesQuoteAmountFromLead > 0) {
    return salesQuoteAmountFromLead;
  }

  if (budgetAmount !== null && budgetAmount > 0) {
    return budgetAmount;
  }

  return 0;
};

const parseActivityPayload = (rawValue) => {
  if (!rawValue) return null;
  if (typeof rawValue === 'object') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch (_) {
    return null;
  }
};

const normalizeStatusFilterValue = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[\s_-]+/g, '')
);

const formatLocalDateParts = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateOnlyString = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalDateParts(parsed);
};

const getTodayDateOnlyString = () => formatLocalDateParts(new Date());

const matchShootStatusFilter = (booking, rawStatus) => {
  const normalizedStatus = normalizeStatusFilterValue(rawStatus);
  if (!normalizedStatus || normalizedStatus === 'all') return null;

  const bookingStatus = Number(booking?.status);
  const eventDate = getDateOnlyString(booking?.event_date);
  const today = getTodayDateOnlyString();
  const isCancelled = Number(booking?.is_cancelled || 0) === 1;
  const isDraft = Number(booking?.is_draft || 0) === 1;
  const isFutureEvent = eventDate ? eventDate > today : false;
  const isTodayEvent = eventDate ? eventDate === today : false;
  const isPastEvent = eventDate ? eventDate < today : false;

  switch (normalizedStatus) {
    case 'initiated':
      return bookingStatus === 0 && (!eventDate || isFutureEvent);
    case 'preproduction':
      return bookingStatus === 1 && isFutureEvent;
    case 'shootday':
      return ![3, 4, 5].includes(bookingStatus) && isTodayEvent;
    case 'postproduction':
      return bookingStatus === 2 || ([0, 1].includes(bookingStatus) && isPastEvent);
    case 'revision':
      return bookingStatus === 3;
    case 'completed':
    case 'assetsdelivered':
      return bookingStatus === 4;
    case 'cancelled':
      return bookingStatus === 5 || isCancelled;
    case 'upcoming':
      return ![3, 4, 5].includes(bookingStatus) && isFutureEvent;
    case 'draft':
      return isDraft;
    default:
      return null;
  }
};

const hasScheduledMeetingOfType = (meetings, meetingType) => {
  const meetingList = Array.isArray(meetings) ? meetings : [];
  return meetingList.some((meeting) =>
    String(meeting?.meeting_type || '').toLowerCase() === String(meetingType || '').toLowerCase() &&
    String(meeting?.meeting_status || '').toLowerCase() !== 'cancelled'
  );
};

const buildExternalHeaders = ({ authHeader } = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    'x-internal-key': EXTERNAL_FILE_MANAGER_KEY
  };

  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return headers;
};

const fetchExternalWorkspaceFiles = async (bookingId, phase, options = {}) => {
  const query = new URLSearchParams();
  if (phase) query.set('phase', phase);

  const url = `${EXTERNAL_FILE_MANAGER_API_BASE_URL}/workspace/${encodeURIComponent(String(bookingId))}/files${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: buildExternalHeaders({ authHeader: options?.authHeader })
  });

  if (!response.ok) {
    throw new Error(`External file manager returned ${response.status} for booking ${bookingId}`);
  }

  return response.json();
};

const hasExternalWorkspaceFiles = async (bookingId, phase, options = {}) => {
  if (!bookingId) return false;
  try {
    const payload = await fetchExternalWorkspaceFiles(bookingId, phase, options);
    const files = Array.isArray(payload?.data?.files) ? payload.data.files : [];
    const expectedSegment = phase === 'post' ? 'post-production' : phase === 'pre' ? 'pre-production' : '';

    const phaseScopedFiles = files.filter((file) => {
      const pathCandidate = String(
        file?.path ||
        file?.filepath ||
        file?.key ||
        file?.filePath ||
        file?.name ||
        ''
      ).toLowerCase();

      if (!expectedSegment) return pathCandidate.length > 0;
      return pathCandidate.includes(`/${expectedSegment}/`) || pathCandidate.includes(`${expectedSegment}/`);
    });

    return phaseScopedFiles.length > 0;
  } catch (error) {
    if (String(error?.message || '').includes('returned 404')) {
      return false;
    }
    console.error('[admin/get-projects] external workspace file check failed:', {
      bookingId,
      phase,
      message: error?.message || error
    });
    return false;
  }
};

const fetchExternalMeetingsByBookingIds = async (bookingIds = [], options = {}) => {
  try {
    const url = `${EXTERNAL_MEETINGS_API_BASE_URL}?limit=5000&page=1&sortBy=meeting_date_time:desc`;
    const response = await fetch(url, {
      method: 'GET',
      headers: buildExternalHeaders({ authHeader: options?.authHeader })
    });

    if (!response.ok) {
      throw new Error(`External meetings returned ${response.status}`);
    }

    const payload = await response.json();
    const allMeetings = Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.data?.results)
        ? payload.data.results
        : [];
    const bookingIdSet = new Set(
      bookingIds.map((id) => String(id)).filter(Boolean)
    );

    const byBookingId = new Map();
    allMeetings.forEach((meeting) => {
      const orderId = String(meeting?.order?.id || '');
      if (!orderId || !bookingIdSet.has(orderId)) return;
      if (!byBookingId.has(orderId)) byBookingId.set(orderId, []);
      byBookingId.get(orderId).push(meeting);
    });

    return byBookingId;
  } catch (error) {
    console.error('[admin/get-projects] external meetings fetch failed:', error?.message || error);
    return new Map();
  }
};

const isPostProductionEligible = (booking) => Boolean(
  matchShootStatusFilter(booking, 'postproduction') ||
  matchShootStatusFilter(booking, 'revision') ||
  matchShootStatusFilter(booking, 'completed') ||
  matchShootStatusFilter(booking, 'assetsdelivered')
);

const buildManualPaymentSummaryFromActivities = (activities = [], totalAmount = 0) => {
  const manualEntries = (activities || [])
    .filter((activity) => activity?.activity_type === 'payment_completed')
    .map((activity) => parseActivityPayload(activity?.activity_data))
    .filter((payload) => payload && payload.payment_method === 'manual');

  const hasFullPayment = manualEntries.some((entry) => String(entry?.payment_type || '').toLowerCase() === 'full');
  const partialPaidAmount = manualEntries.reduce((sum, entry) => {
    if (String(entry?.payment_type || '').toLowerCase() !== 'partial') return sum;
    const numeric = Number(entry?.amount || 0);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);

  const paidAmount = hasFullPayment ? Number(totalAmount || 0) : partialPaidAmount;
  const pendingAmount = Math.max(Number(totalAmount || 0) - paidAmount, 0);

  return {
    hasFullPayment,
    paidAmount,
    pendingAmount,
    isPartiallyPaid: !hasFullPayment && paidAmount > 0 && pendingAmount > 0,
  };
};

const fetchCollectedBookingPaymentSummaries = async () => db.sequelize.query(
  `
  SELECT booking_id, sales_quote_id, payment_status, paid_amount, credit_used_amount, due_amount, quote_total
  FROM booking_payment_summary
  WHERE payment_status IN ('paid', 'partially_paid', 'approval_pending', 'no_payment_due')
    AND (
      COALESCE(paid_amount, 0) > 0
      OR COALESCE(credit_used_amount, 0) > 0
      OR payment_status = 'no_payment_due'
    )
  `,
  { type: QueryTypes.SELECT }
);

const countActiveShootNotesByBookingIds = async (bookingIds = []) => {
  const ids = Array.from(new Set(
    bookingIds
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  ));

  if (!ids.length) return new Map();

  const rows = await db.project_notes.findAll({
    where: {
      booking_id: { [Sequelize.Op.in]: ids },
      is_active: 1
    },
    attributes: [
      'booking_id',
      [Sequelize.fn('COUNT', Sequelize.col('note_id')), 'notes_count']
    ],
    group: ['booking_id'],
    raw: true
  });

  return new Map(
    rows.map((row) => [
      Number(row.booking_id),
      Number(row.notes_count || 0)
    ])
  );
};

// Initialize geocoder
// const geocoder = NodeGeocoder({ provider: 'openstreetmap' });

function toArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) { }

  if (typeof value === "string") {
    return value
      .split(',')
      .map(v => v.trim())
      .filter(v => v !== "");
  }

  return [];
}

function toDbJson(value) {
  try {
    const arr = toArray(value);
    return JSON.stringify(arr);   // ✅ ALWAYS return STRING
  } catch (e) {
    return "[]";
  }
}

const toIdArray = (value) => {
  if (!value) return [];

  try {
    if (Array.isArray(value)) {
      return value.map(v => Number(v));
    }

    if (typeof value === "string" && value.trim().startsWith("[")) {
      return JSON.parse(value).map(v => Number(v));
    }

    if (typeof value === "string") {
      return value.split(",").map(v => Number(v.trim()));
    }

    // Fallback: single number
    return [Number(value)];

  } catch (err) {
    console.log("toIdArray Parse Error:", err);
    return [];
  }
};


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads/media'));
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + path.extname(file.originalname);
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png','image/webp', 'image/jfif', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
    cb(null, true);
  },
});

const shootNotesAttachmentUpload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/jfif',
      'image/jpg',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed'
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type for attachment.'));
    }
    cb(null, true);
  }
});

exports.uploadShootNoteAttachments = shootNotesAttachmentUpload.array('attachments', 10);

function uploadFiles(files) {
  const filePaths = [];
  if (files) {
    for (let fileKey in files) {
      const file = files[fileKey];
      filePaths.push({
        file_type: fileKey,
        file_path: `/uploads/${file[0].filename}`,
      });
    }
  }
  return filePaths;
}

function buildDateFilter(req) {
  const { range, start_date, end_date } = req.query;

  if (start_date && end_date) {
    return {
      created_at: {
        [Op.between]: [
          `${start_date} 00:00:00`,
          `${end_date} 23:59:59`
        ]
      }
    };
  }

  if (range === 'month') {
    return {
      created_at: {
        [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-%m-01')")
      }
    };
  }

  if (range === 'week') {
    return {
      created_at: {
        [Op.gte]: Sequelize.literal("DATE_SUB(NOW(), INTERVAL 7 DAY)")
      }
    };
  }

  if (range === 'year') {
    return {
      created_at: {
        [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-01-01')")
      }
    };
  }

  return {};
}

const SHOOT_TYPE_TITLES = {
    corporate: "Corporate Event",
    wedding: "Wedding",
    private: "Private Event",
    commercial: "Commercial & Advertising",
    social_content: "Social Content",
    podcast: "Podcasts & Shows",
    music: "Music Videos",
    short_film: "Short Films & Narrative",
    brand_product: "Brand & Product",
    people_teams: "People & Teams",
    behind_scenes: "Behind-the-Scenes",
};

const VIDEO_EDIT_TITLES = {
    social_reel_15_30: "Social Media Reel (15 sec-30 sec)",
    social_reel_30_90: "Social Media Reel (30 sec-90 sec)",
    mini_highlight_1_2: "Mini Highlight Video (1-2 mins)",
    highlight_4_7: "Highlight Video (4-7 min)",
    feature_30_40: "Feature Video (30-40 min)",
    commercial_2_4: "Commercial (2 min-4 min)",
    commercial_4_10: "Commercial (4 min-10 min)",
    social_reel_2_4: "Social Media Reel (2 min-4 min)",
    full_podcast_15_30: "Full Length Podcast (15 min-30 min)",
    full_podcast_30_60: "Longer Full Length Podcast (30 min-60 min)",
    music_video_2_3: "Edited Music Video (2-3 min)",
    music_video_vfx_2_3: "Edited Music Video with VFX (2-3 min)",
    short_film_2_5: "Edited Short Film (2 Min-5 Min)",
    short_film_5_10: "Edited Short Film (5 Min-10 Min)",
};

const PHOTO_EDIT_TITLES = {
    edited_photos: "Professionally Edited Photos",
};

// const getDistanceInMiles = (lat1, lon1, lat2, lon2) => {
//     if (!lat1 || !lon1 || !lat2 || !lon2) return null; 
//     const R = 3958.8; // Earth's radius in miles
//     const dLat = (lat2 - lat1) * Math.PI / 180;
//     const dLon = (lon2 - lon1) * Math.PI / 180;
//     const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
//               Math.sin(dLon / 2) * Math.sin(dLon / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     return R * c;
// };

// // 3. Helper: Parse "Upto 10 miles" or "Open to travel" into a number
// const parseWorkingDistance = (distStr) => {
//     if (!distStr) return 50; // Default radius
//     const lower = distStr.toLowerCase();
//     if (lower.includes("open to traveling")) return 5000; // Unlimited travel
//     const numbers = distStr.match(/\d+/g);
//     return numbers ? Math.max(...numbers.map(Number)) : 50;
// };

// // 4. Helper: Delay function to prevent 429 Errors (OSM limits)
// const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// exports.createProject = async (req, res) => {
//   try {
//     console.log("Controller - req.body:", req.body);
//     const {
//       project_name,
//       description,
//       event_type,
//       event_date,
//       duration_hours,
//       budget,
//       expected_viewers,
//       stream_quality,
//       crew_size_needed,
//       event_location,
//       streaming_platforms,
//       crew_roles,
//       required_skills,
//       equipments_needed,
//     } = req.body || {};
//     console.log("body", req.body);

//     if (!project_name) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "project_name is required",
//         data: null,
//       });
//     }

//     const platformsArr = toArray(streaming_platforms);
//     const rolesArr = toArray(crew_roles);
//     const skillsArr = toArray(required_skills);
//     const eqIdsArr = toArray(equipments_needed);

//     if (platformsArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one streaming platform",
//         data: null,
//       });
//     }

//     if (rolesArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one crew role",
//         data: null,
//       });
//     }

//     if (skillsArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one required skill",
//         data: null,
//       });
//     }

//    if (eqIdsArr.length === 0) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         error: true,
//         code: constants.BAD_REQUEST.code,
//         message: "Select at least one equipment",
//         data: null,
//       });
//     }

//     const booking = await stream_project_booking.create({
//       project_name,
//       description,
//       event_type,
//       event_date: event_date || null,
//       duration_hours: duration_hours ?? null,
//       budget: budget ?? null,
//       expected_viewers: expected_viewers ?? null,
//       stream_quality: stream_quality || null,
//       crew_size_needed: crew_size_needed ?? null,
//       event_location: event_location || null,

//       streaming_platforms: toDbJson(platformsArr),
//       crew_roles: toDbJson(rolesArr),
//       skills_needed: toDbJson(skillsArr),
//       equipments_needed: toDbJson(eqIdsArr),
//       is_active: 1,
//       created_at: new Date()
//     });

//     return res.status(constants.CREATED.code).json({
//       error: false,
//       code: constants.CREATED.code,
//       message: "Booking saved successfully",
//       data: { id: booking.stream_project_booking_id, booking },
//     });

//   } catch (error) {
//     console.error("Create Booking Error:", error);
//     return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       error: true,
//       code: constants.INTERNAL_SERVER_ERROR.code,
//       message: error.message || constants.INTERNAL_SERVER_ERROR.message,
//       data: null,
//     });
//   }
// };


exports.createProject = async (req, res) => {
  try {
    console.log("Controller - req.body:", req.body);
    const {
      project_name,
      description,
      event_type,
      event_date,
      start_time,
      end_time,
      duration_hours,
      budget,
      expected_viewers,
      stream_quality,
      crew_size_needed,
      event_location,
      streaming_platforms,
      crew_roles,
      required_skills,
      equipments_needed,
      is_draft = 0,
      is_completed = 0,
      is_cancelled = 0
    } = req.body || {};

    console.log("body", req.body);

    if (!project_name) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "project_name is required",
        data: null,
      });
    }

    const platformsArr = toArray(streaming_platforms);
    const rolesArr = toArray(crew_roles);
    const skillsArr = toArray(required_skills);
    const equipmentNamesArr = toArray(equipments_needed);

    if (platformsArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one streaming platform",
        data: null,
      });
    }

    if (rolesArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one crew role",
        data: null,
      });
    }

    if (skillsArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one required skill",
        data: null,
      });
    }

    if (equipmentNamesArr.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Select at least one equipment",
        data: null,
      });
    }

    const allEquipments = await equipment.findAll({
      where: {
        equipment_name: { [Sequelize.Op.in]: equipmentNamesArr }
      },
      attributes: ['equipment_id', 'equipment_name']
    });

    if (allEquipments.length !== equipmentNamesArr.length) {
      const existingNames = allEquipments.map(eq => eq.equipment_name);
      const missingNames = equipmentNamesArr.filter(name => !existingNames.includes(name));

      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: `The following equipment names are invalid or not found: ${missingNames.join(', ')}`,
        data: null,
      });
    }

    const equipmentDetailsArr = allEquipments.map(eq => eq.equipment_name);

    const { latitude, longitude } = extractCoordinatesFromPayload(req.body, event_location);

    const booking = await stream_project_booking.create({
      project_name,
      description,
      event_type,
      event_date: event_date || null,
      start_time: start_time || null,
      end_time: end_time || null,
      duration_hours: duration_hours ?? null,
      budget: budget ?? null,
      expected_viewers: expected_viewers ?? null,
      stream_quality: stream_quality || null,
      crew_size_needed: crew_size_needed ?? null,
      event_location: event_location || null,
      event_latitude: latitude,
      event_longitude: longitude,

      streaming_platforms: toDbJson(platformsArr),
      crew_roles: toDbJson(rolesArr),
      skills_needed: toDbJson(skillsArr),
      equipments_needed: toDbJson(equipmentDetailsArr),

      is_draft,
      is_completed,
      is_cancelled,

      is_active: 1,
      created_at: new Date()
    });

    const equipmentResponse = allEquipments.map(eq => ({
      equipment_id: eq.equipment_id,
      equipment_name: eq.equipment_name
    }));

    return res.status(constants.CREATED.code).json({
      error: false,
      code: constants.CREATED.code,
      message: "Booking saved successfully",
      data: { id: booking.stream_project_booking_id, booking, equipments: equipmentResponse },
    });

  } catch (error) {
    console.error("Create Booking Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: error.message || constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.matchCrew = async (req, res) => {
  try {
    const { crew_roles, required_skills, location, hourly_rate } = req.body;

    if (!crew_roles || !required_skills) {
      return res.status(400).json({
        error: true,
        message: "crew_roles and required_skills are required",
      });
    }

    const rolesArr = Array.isArray(crew_roles)
      ? crew_roles.map(String)
      : [String(crew_roles)];

    const skillsArr = Array.isArray(required_skills)
      ? required_skills.map(String)
      : [String(required_skills)];

    const desiredHourlyRate = hourly_rate ? parseFloat(hourly_rate) : null;

    if (hourly_rate && isNaN(desiredHourlyRate)) {
      return res.status(400).json({
        error: true,
        message: "Invalid hourly_rate",
      });
    }

    const rateRange = 0.20;
    const lowerLimit = desiredHourlyRate ? desiredHourlyRate - (desiredHourlyRate * rateRange) : null;
    const upperLimit = desiredHourlyRate ? desiredHourlyRate + (desiredHourlyRate * rateRange) : null;

    let crewList = await crew_members.findAll({
      where: { is_active: 1 }
    });

    const parseSkills = (value) => {
      if (!value) return [];
      try {
        let parsed = JSON.parse(value);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch { }
      return value.toString().split(",").map(s => s.trim());
    };

    let filtered = [];

    for (const crew of crewList) {
      const crewRole = crew.primary_role ? String(crew.primary_role) : null;
      const crewSkills = parseSkills(crew.skills || "[]");
      const crewLocation = crew.location ? crew.location.trim().toLowerCase() : "";
      const crewHourlyRate = crew.hourly_rate ? parseFloat(crew.hourly_rate) : null;

      const locationMatch = !location || crewLocation === location.trim().toLowerCase();

      const roleMatch = crewRole && rolesArr.includes(crewRole);

      const matchingSkills = crewSkills.filter(s => skillsArr.includes(s));
      const skillMatch = matchingSkills.length > 0;

      const hourlyRateMatch = !hourly_rate || (crewHourlyRate && crewHourlyRate >= lowerLimit && crewHourlyRate <= upperLimit);

      if (roleMatch && skillMatch && locationMatch && hourlyRateMatch) {
        filtered.push({
          ...crew.dataValues,
          matchCount: matchingSkills.length,
          hourly_rate: crewHourlyRate
        });
      }
    }

    filtered.sort((a, b) => b.matchCount - a.matchCount);

    // if (sizeNeeded && filtered.length > sizeNeeded) {
    //   filtered = filtered.slice(0, sizeNeeded);
    // }

    return res.status(200).json({
      error: false,
      message: "Crew matched successfully",
      data: filtered
    });
  } catch (error) {
    console.error("Match Crew Error:", error);
    return res.status(500).json({
      error: true,
      message: "Something went wrong",
      data: null,
    });
  }
};

// exports.matchCrew = async (req, res) => {
//   try {
//     const { crew_roles, required_skills, crew_size_needed, location, min_hourly_rate, max_hourly_rate } = req.body;

//     if (!crew_roles || !required_skills) {
//       return res.status(400).json({
//         error: true,
//         message: "crew_roles and required_skills are required",
//       });
//     }

//     const rolesArr = Array.isArray(crew_roles)
//       ? crew_roles.map(String)
//       : [String(crew_roles)];

//     const skillsArr = Array.isArray(required_skills)
//       ? required_skills.map(String)
//       : [String(required_skills)];

//     const sizeNeeded = crew_size_needed ? parseInt(crew_size_needed) : null;

//     const minRate = min_hourly_rate ? parseFloat(min_hourly_rate) : null;
//     const maxRate = max_hourly_rate ? parseFloat(max_hourly_rate) : null;

//     if ((min_hourly_rate && isNaN(minRate)) || (max_hourly_rate && isNaN(maxRate))) {
//       return res.status(400).json({
//         error: true,
//         message: "Invalid min_hourly_rate or max_hourly_rate",
//       });
//     }

//     let crewList = await crew_members.findAll({
//       where: { is_active: 1 }
//     });

//     const parseSkills = (value) => {
//       if (!value) return [];
//       try {
//         let parsed = JSON.parse(value);
//         if (typeof parsed === "string") parsed = JSON.parse(parsed);
//         if (Array.isArray(parsed)) return parsed.map(String);
//       } catch { }
//       return value.toString().split(",").map(s => s.trim());
//     };

//     let filtered = [];

//     for (const crew of crewList) {
//       const crewRole = crew.primary_role ? String(crew.primary_role) : null;
//       const crewSkills = parseSkills(crew.skills || "[]");
//       const crewLocation = crew.location ? crew.location.trim().toLowerCase() : "";
//       const crewHourlyRate = crew.hourly_rate ? parseFloat(crew.hourly_rate) : null;

//       // Check for location match
//       const locationMatch = !location || crewLocation === location.trim().toLowerCase();

//       const roleMatch = crewRole && rolesArr.includes(crewRole);

//       const matchingSkills = crewSkills.filter(s => skillsArr.includes(s));
//       const skillMatch = matchingSkills.length > 0;

//       const hourlyRateMatch = (!min_hourly_rate || crewHourlyRate >= minRate) && (!max_hourly_rate || crewHourlyRate <= maxRate);

//       if (roleMatch && skillMatch && locationMatch && hourlyRateMatch) {
//         filtered.push({
//           ...crew.dataValues,
//           matchCount: matchingSkills.length,
//           hourly_rate: crewHourlyRate
//         });
//       }
//     }

//     filtered.sort((a, b) => b.matchCount - a.matchCount);

//     if (sizeNeeded && filtered.length > sizeNeeded) {
//       filtered = filtered.slice(0, sizeNeeded);
//     }

//     return res.status(200).json({
//       error: false,
//       message: "Crew matched successfully",
//       data: filtered
//     });
//   } catch (error) {
//     console.error("Match Crew Error:", error);
//     return res.status(500).json({
//       error: true,
//       message: "Something went wrong",
//       data: null,
//     });
//   }
// };

exports.assignCrew = async (req, res) => {
  try {
    const { project_id, assigned_crew: crewIds } = req.body;
    console.log("ASSIGN CREW BODY:", req.body);

    if (!Array.isArray(crewIds) || crewIds.length === 0) {
      return res.status(400).json({
        error: true,
        message: "No crew members selected",
      });
    }

    const uniqueCrewIds = [...new Set(crewIds.map(Number).filter(Boolean))];

  for (const crewId of uniqueCrewIds) {
  await assigned_crew.create({
    project_id,
    crew_member_id: crewId,
    assigned_date: new Date(),
    status: 'assigned',
    is_active: 1,
  });

  const existingEarning = await db.creator_earnings.findOne({
    where: { booking_id: project_id, creator_id: crewId }
  });

  if (!existingEarning) {
    await db.creator_earnings.create({
      booking_id: project_id,
      creator_id: crewId,
      gross_amount: 0,
      net_earning_amount: 0,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
}

    // Non-blocking email trigger
    try {
      const crews = await crew_members.findAll({
        where: { crew_member_id: uniqueCrewIds },
        attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
      });
      const booking = await stream_project_booking.findByPk(project_id, {
        attributes: [
          'stream_project_booking_id',
          'user_id',
          'guest_email',
          'quote_id',
          'budget',
          'content_type',
          'event_type',
          'shoot_type',
          'event_date',
          'start_time',
          'end_time'
        ]
      });
      const lead = await sales_leads.findOne({
        where: { booking_id: project_id },
        attributes: ['client_name']
      });

      const dashboardLink =
        process.env.CP_DASHBOARD_LINK ||
        process.env.FRONTEND_URL ||
        'https://beige.app/';

      const emailClientName = await resolveAdminBookingClientName(booking, lead?.client_name || null);
      const emailShootAmount = await resolveAdminBookingShootAmount(booking);

      await Promise.allSettled(
        crews
          .filter(c => c.email)
          .map(c =>
            sendCPNewBookingRequestEmail({
              to_email: c.email,
              user_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'there',
              ...getCPNewBookingEmailFields(booking, emailClientName, emailShootAmount),
              dashboardLink
            })
          )
      );
    } catch (mailErr) {
      console.error('assignCrew email send error:', mailErr?.message || mailErr);
    }

    return res.status(200).json({
      error: false,
      message: 'Crew members assigned successfully',
    });

  } catch (error) {
    console.error('Error assigning crew:', error);
    return res.status(500).json({
      error: true,
      message: 'Error assigning crew',
    });
  }
};


exports.matchEquipment = async (req, res) => {
  try {
    const { crew_id, equipments_needed } = req.body;

    const crewArr = toIdArray(crew_id);
    const neededNamesArr = equipments_needed;

    if (crewArr.length === 0 || neededNamesArr.length === 0) {
      return res.status(400).json({
        error: true,
        message: "crew_id and equipments_needed are required",
      });
    }

    const allEquipments = await equipment.findAll({
      where: {
        equipment_name: { [Sequelize.Op.in]: neededNamesArr }
      },
      include: [
        { model: equipment_photos, as: "equipment_photos" },
        { model: equipment_documents, as: "equipment_documents" },
        { model: equipment_specs, as: "equipment_specs" },
        { model: equipment_accessories, as: "equipment_accessories" }
      ]
    });

    const eqMap = {};
    allEquipments.forEach(eq => {
      eqMap[eq.equipment_name] = eq;
    });

    if (Object.keys(eqMap).length === 0) {
      return res.status(404).json({
        error: true,
        message: "No equipment found with the provided names",
      });
    }

    const crews = await crew_members.findAll({
      where: { crew_member_id: crewArr }
    });

    const finalResult = [];

    for (const crew of crews) {
      let ownedNames = [];
      try {
        ownedNames = JSON.parse(crew.equipment_ownership);
      } catch (error) {
        ownedNames = Array.isArray(crew.equipment_ownership) ? crew.equipment_ownership : [];
      }

      ownedNames = ownedNames || [];

      const hasNames = neededNamesArr.filter(name => ownedNames.includes(name));
      const needNames = neededNamesArr.filter(name => !ownedNames.includes(name));

      const has = hasNames.map(name => eqMap[name] || { equipment_id: null, equipment_name: name, message: "Unknown" });
      const needs_pick = needNames.map(name => eqMap[name] || { equipment_id: null, equipment_name: name, message: "Unknown" });

      finalResult.push({
        crew_id: crew.crew_member_id,
        has,
        needs_pick
      });
    }

    return res.status(200).json({
      error: false,
      message: "Equipment matched successfully",
      data: finalResult
    });

  } catch (error) {
    console.error("Equipment Match Error:", error);
    return res.status(500).json({ error: true, message: "Server error" });
  }
};


exports.saveMatchedEquipment = async (req, res) => {
  try {
    const { project_id, assigned_equipment: equipmentIds } = req.body;

    if (!project_id || !equipmentIds || equipmentIds.length === 0) {
      return res.status(400).json({
        error: true,
        message: "Project ID and equipment IDs are required",
      });
    }

    const project = await stream_project_booking.findByPk(project_id);
    if (!project) {
      return res.status(404).json({
        error: true,
        message: "Project not found",
      });
    }

    for (const equipmentId of equipmentIds) {
      const equipmentRecord = await equipment.findByPk(equipmentId);
      if (!equipmentRecord) {
        return res.status(404).json({
          error: true,
          message: `Equipment with ID ${equipmentId} not found`,
        });
      }

      await assigned_equipment.create({
        project_id,
        equipment_id: equipmentId,
        assigned_date: new Date(),
        status: 'assigned',
        is_active: 1,
      });
    }

    return res.status(200).json({
      error: false,
      message: 'Matched equipment assigned to project successfully',
    });

  } catch (error) {
    console.error('Error saving matched equipment:', error);
    return res.status(500).json({
      error: true,
      message: 'Error saving matched equipment',
    });
  }
};


// exports.getProjectDetails = async (req, res) => {
//   try {
//     const { project_id } = req.params;

//     if (!project_id) {
//       return res.status(400).json({ error: true, message: 'Project ID is required' });
//     }

//     // 1. Fetch main project and masters
//     const [project, allEventMasterTypes, allRoles] = await Promise.all([
//       stream_project_booking.findOne({
//         where: { stream_project_booking_id: project_id, is_active: 1 },
//       }),
//       event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true }),
//       crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
//     ]);

//     if (!project) {
//       return res.status(404).json({ error: true, message: 'Project not found' });
//     }

//     // 2. Fetch Associations + Payment Amount
//     const [crew, equip, postProd, paymentData] = await Promise.all([
//       assigned_crew.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ 
//             model: crew_members, 
//             as: 'crew_member', 
//             attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] 
//         }],
//       }),
//       assigned_equipment.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//       }),
//       assigned_post_production_member.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//       }),
//       // FETCH PAYMENT AMOUNT HERE
//       payment_transactions.findOne({
//         where: { payment_id: project.payment_id },
//         attributes: ['total_amount'],
//         raw: true
//       })
//     ]);

//     // 3. Process Event Type Labels
//     const rawTypes = project.event_type ? project.event_type.split(',') : [];
//     const eventTypeLabels = rawTypes.map(t => {
//       const val = t.trim();
//       const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
//       if (masterMatch) return masterMatch.event_type_name;

//       const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
//       return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
//     });

//     // 4. Process Crew Roles
//     const processedCrew = crew.map(assignment => {
//       const crewMember = assignment.crew_member ? assignment.crew_member.toJSON() : null;
//       let roleName = "N/A";

//       if (crewMember && crewMember.primary_role) {
//         try {
//           let roleIds = [];
//           const rawRole = crewMember.primary_role;
//           if (typeof rawRole === 'string' && (rawRole.startsWith('[') || rawRole.startsWith('{'))) {
//             roleIds = JSON.parse(rawRole);
//           } else {
//             roleIds = [rawRole];
//           }

//           const names = allRoles
//             .filter(r => roleIds.includes(String(r.role_id)) || roleIds.includes(Number(r.role_id)))
//             .map(r => r.role_name);
          
//           if (names.length > 0) roleName = names.join(", ");
//         } catch (e) {
//           console.error("Role processing error:", e);
//         }
//       }

//       return {
//         ...assignment.toJSON(),
//         crew_member: crewMember ? { ...crewMember, role_name: roleName } : null
//       };
//     });

//     // 5. Final Response
//     return res.status(200).json({
//       error: false,
//       message: 'Project details retrieved successfully',
//       data: {
//         project: {
//           ...project.toJSON(),
//           total_paid_amount: paymentData ? paymentData.total_amount : 0, // ADDED THIS LINE
//           event_type_labels: eventTypeLabels.join(', ')
//         },
//         assignedCrew: processedCrew,
//         assignedEquipment: equip,
//         assignedPostProductionMembers: postProd,
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };

exports.getProjectDetails = async (req, res) => {
  try {
    const { project_id } = req.params;

    if (!project_id) {
      return res.status(400).json({ error: true, message: 'Project ID is required' });
    }

    // 1. Fetch Master Data for Labels/Roles
    const [allEventMasterTypes, allRoles] = await Promise.all([
      event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true }),
      crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
    ]);

    // 2. Fetch Project with ALL associations (including Lead)
    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id },
      include: [
        {
          model: quotes,
          as: "primary_quote",
          include: [{ model: quote_line_items, as: "line_items" }],
        },
        {
          model: assigned_crew,
          as: "assigned_crews",
          where: { is_active: 1 },
          required: false,
          include: [{
            model: crew_members,
            as: 'crew_member',
            include: [{
              model: crew_member_files,
              as: "crew_member_files",
              where: { is_active: 1, file_type: "profile_photo" },
              required: false
            }]
          }]
        },
        {
          model: assigned_equipment,
          as: 'assigned_equipments',
          include: [{ model: equipment, as: 'equipment' }]
        },
        {
          model: assigned_post_production_member,
          as: 'assigned_post_production_members',
          include: [{ model: post_production_members, as: 'post_production_member' }]
        },
        // Include the Lead associated with this project
        {
          model: sales_leads,
          as: "sales_leads",
          required: false,
          include: [
            { model: users, as: "assigned_sales_rep", attributes: ["id", "name", "email"] },
            { model: payment_links, as: "payment_links" },
            { model: discount_codes, as: "discount_codes" },
            { 
              model: sales_lead_activities, 
              as: "activities",
              include: [{ model: users, as: "performed_by", attributes: ["id", "name"] }]
            }
          ]
        },
        {
          model: db.stream_project_booking_days,
          as: "booking_days",
          required: false
        }
      ]
    });

    if (!project) {
      return res.status(404).json({ error: true, message: 'Project not found' });
    }

    let projectJson = project.toJSON();
    
    const bookingDayEntries =
      Array.isArray(projectJson.booking_days) && projectJson.booking_days.length
        ? [...projectJson.booking_days].sort((a, b) => {
            const dateDiff = new Date(a.event_date) - new Date(b.event_date);
            if (dateDiff !== 0) return dateDiff;
            return (a.start_time || "").localeCompare(b.start_time || "");
          })
        : [{
            event_date: projectJson.event_date,
            start_time: projectJson.start_time,
            end_time: projectJson.end_time,
            duration_hours: projectJson.duration_hours,
            time_zone: null
          }];

    projectJson.booking_days = bookingDayEntries.map(day => ({
      event_date: day.event_date,
      start_time: day.start_time,
      end_time: day.end_time,
      duration_hours: day.duration_hours,
      time_zone: day.time_zone || null
    }));

    // Get the first lead associated (usually there's only one)
    const lead = projectJson.sales_leads?.[0] || null;

    // Fallback: fetch lead + payment activities directly by booking_id
    // because some association payloads may not include full activities reliably.
    const leadRecord = await sales_leads.findOne({
      where: { booking_id: projectJson.stream_project_booking_id, is_active: 1 },
      attributes: ['lead_id', 'lead_status'],
      raw: true
    });

    const leadPaymentActivities = leadRecord?.lead_id
      ? await sales_lead_activities.findAll({
          where: {
            lead_id: leadRecord.lead_id,
            activity_type: 'payment_completed'
          },
          attributes: ['activity_type', 'activity_data', 'created_at'],
          order: [['created_at', 'ASC']],
          raw: true
        })
      : [];

    // 3. Fetch Transaction Total (from payment_transactions table)
    const [paymentData, formSubmission, shootNotesCountMap, bookingPaymentSummary, manualPaymentRows, stripeReceiptRows] = await Promise.all([
      payment_transactions.findOne({
        where: { payment_id: projectJson.payment_id },
        attributes: ['payment_id', 'total_amount', 'status', 'created_at'],
        raw: true
      }),
      project_form_submissions.findOne({
        where: { project_id: projectJson.stream_project_booking_id, is_active: 1 },
        attributes: ['id'],
        order: [['created_at', 'DESC']],
        raw: true
      }),
      countActiveShootNotesByBookingIds([projectJson.stream_project_booking_id]),
      bookingPaymentSummaryService.getBookingPaymentSummary(projectJson.stream_project_booking_id),
      db.sequelize.query(
        `
          SELECT
            booking_manual_payment_id,
            payment_type,
            amount,
            payment_mode,
            other_payment_mode,
            created_at
          FROM booking_manual_payments
          WHERE booking_id = :bookingId
          ORDER BY created_at ASC, booking_manual_payment_id ASC
        `,
        {
          replacements: { bookingId: projectJson.stream_project_booking_id },
          type: QueryTypes.SELECT
        }
      ).catch((error) => {
        const code = error?.original?.code || error?.parent?.code || error?.code;
        if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') return [];
        throw error;
      }),
      db.sequelize.query(
        `
          SELECT
            fip.payment_id,
            MIN(fip.finance_invoice_payment_id) AS finance_invoice_payment_id,
            MAX(fip.amount) AS amount,
            'paid' AS status,
            MIN(fip.paid_at) AS paid_at,
            MIN(fip.created_at) AS created_at,
            p.total_amount,
            p.status AS payment_status,
            p.created_at AS payment_created_at
          FROM finance_invoice_payments fip
          LEFT JOIN payment_transactions p
            ON p.payment_id = fip.payment_id
          WHERE fip.booking_id = :bookingId
            AND fip.payment_id IS NOT NULL
            AND fip.status = 'paid'
          GROUP BY
            fip.payment_id,
            p.total_amount,
            p.status,
            p.created_at
          ORDER BY COALESCE(MIN(fip.paid_at), p.created_at, MIN(fip.created_at)) ASC, MIN(fip.finance_invoice_payment_id) ASC
        `,
        {
          replacements: { bookingId: projectJson.stream_project_booking_id },
          type: QueryTypes.SELECT
        }
      ).catch((error) => {
        const code = error?.original?.code || error?.parent?.code || error?.code;
        if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_TABLE_ERROR') return [];
        throw error;
      })
    ]);
    const shootNotesCount = shootNotesCountMap.get(Number(projectJson.stream_project_booking_id)) || 0;

    const normalizedGuestEmail = String(projectJson.guest_email || '').trim().toLowerCase() || null;
    const [emailUserRecord] = await Promise.all([
      normalizedGuestEmail
        ? users.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('email')),
              normalizedGuestEmail
            ),
            attributes: ['id', 'email'],
            raw: true
          })
        : Promise.resolve(null),
    ]);

    const matchedUserId = projectJson.user_id || emailUserRecord?.id || null;
    const [clientByUser, clientByEmail] = await Promise.all([
      matchedUserId
        ? clients.findOne({
            where: { user_id: matchedUserId, is_active: 1 },
            attributes: ['client_id', 'user_id', 'email'],
            raw: true
          })
        : Promise.resolve(null),
      normalizedGuestEmail
        ? clients.findOne({
            where: {
              is_active: 1,
              [Op.and]: [
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.col('email')),
                  normalizedGuestEmail
                )
              ]
            },
            attributes: ['client_id', 'user_id', 'email'],
            raw: true
          })
        : Promise.resolve(null),
    ]);

    const resolvedClientRecord = clientByUser || clientByEmail || null;
    const isRegisteredUser = Boolean(matchedUserId);
    const isClient = Boolean(resolvedClientRecord?.client_id);
    const isClientOnly = !isRegisteredUser && isClient;
    const contactRegistrationType = isRegisteredUser
      ? 'registered_user'
      : isClientOnly
        ? 'client_only'
        : 'unregistered_contact';

    let convertedSalesQuote = null;
    if (bookingPaymentSummary?.sales_quote_id) {
      convertedSalesQuote = await db.sales_quotes.findOne({
        where: { sales_quote_id: bookingPaymentSummary.sales_quote_id },
        attributes: ['sales_quote_id', 'quote_number', 'status'],
        raw: true
      });
    } else if (lead?.lead_id) {
      convertedSalesQuote = await db.sales_quotes.findOne({
        where: { lead_id: lead.lead_id },
        attributes: ['sales_quote_id', 'quote_number', 'status'],
        order: [['sales_quote_id', 'DESC']],
        raw: true
      });
    }

    const convertedSalesQuoteId = convertedSalesQuote?.sales_quote_id || bookingPaymentSummary?.sales_quote_id || null;
    const currentUsableConvertedQuote = convertedSalesQuoteId
      ? await quoteService.getCurrentUsableQuoteVersionSnapshot(convertedSalesQuoteId, null)
      : null;
    const isQuoteConvertedBooking = Boolean(
      convertedSalesQuoteId || String(lead?.lead_source || '').toLowerCase() === 'converted bookings'
    );

    let displayAmount = await resolveProjectDisplayAmount({
      project: projectJson,
      paymentData,
    });
    let totalValueAmount = await resolveProjectTotalValueAmount({
      project: projectJson,
      salesQuoteId: bookingPaymentSummary?.sales_quote_id || convertedSalesQuoteId || null,
    });
    const currentUsableQuoteTotal = parseAmountCandidate(currentUsableConvertedQuote?.total);
    if (currentUsableQuoteTotal !== null && currentUsableQuoteTotal > 0) {
      totalValueAmount = Math.max(totalValueAmount, currentUsableQuoteTotal);
    }

    // 4. Process Event Type Labels
    const rawTypes = projectJson.event_type ? projectJson.event_type.split(',') : [];
    const eventTypeLabels = rawTypes.map(t => {
      const val = t.trim();
      const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
      if (masterMatch) return masterMatch.event_type_name;
      const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
      return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
    });

    // 5. Pricing Breakdown logic
    // Using calculateLeadPricing helper if available, otherwise manual calc
    const projectedQuote = await bookingPricingService.calculateBookingPricing(projectJson);
    const activeQuoteSource = currentUsableConvertedQuote || projectJson.primary_quote || projectedQuote;
    const projectedTotal = parseAmountCandidate(projectedQuote?.total);
    if (
      !currentUsableConvertedQuote &&
      !projectJson.primary_quote &&
      projectedTotal !== null &&
      projectedTotal > 0
    ) {
      totalValueAmount = projectedTotal;
    }
    
    const parsedQuoteTotal = parseFloat(activeQuoteSource?.total || 0);
    let pricing_breakdown = {
      shoot_cost: 0,
      editing_cost: 0,
      studio_cost: 0,
      studio_items: [],
      subtotal: 0,
      total_before_credit: 0,
      credit_applied: 0,
      discount: parseFloat(activeQuoteSource?.discount_amount || projectJson.primary_quote?.discount_amount || 0),
      total_after_credit: 0,
      total: 0
    };
    let subtotal = 0;
    const studioSnapshot = getStudioPricingSnapshot(projectJson.description);
    pricing_breakdown.studio_items = studioSnapshot.items;
    let hasPersistedStudioLine = false;

    (activeQuoteSource?.line_items || []).forEach(item => {
        const cost = parseFloat(item.line_total || item.total || 0);
        subtotal += cost;
        const name = (item.item_name || '').toLowerCase();
        if (isStudioLineItem(item)) {
          hasPersistedStudioLine = true;
          pricing_breakdown.studio_cost += cost;
        }
        else if (name.includes('edit') || name.includes('reel') || name.includes('post')) pricing_breakdown.editing_cost += cost;
        else pricing_breakdown.shoot_cost += cost;
    });
    if (!hasPersistedStudioLine && studioSnapshot.total > 0 && parsedQuoteTotal > subtotal) {
      const legacyStudioAmount = Math.min(studioSnapshot.total, parsedQuoteTotal - subtotal);
      pricing_breakdown.studio_cost += parseFloat(legacyStudioAmount.toFixed(2));
      subtotal += legacyStudioAmount;
    }
    pricing_breakdown.subtotal = subtotal;
    pricing_breakdown.total_before_credit = subtotal;
    pricing_breakdown.total_after_credit =
      parsedQuoteTotal > 0
        ? parsedQuoteTotal
        : Math.max(subtotal - pricing_breakdown.discount, 0);
    pricing_breakdown.total = pricing_breakdown.total_after_credit;

    // 6. Crew Processing & Fulfillment Summary
    const ROLE_GROUPS = { videographer: ['9', '1'], photographer: ['10', '2'], cinematographer: ['11', '3'] };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([role, ids]) => ids.forEach(id => ID_TO_ROLE_MAP[id] = role));

    let fulfillmentSummary = {};
    let requestedRoles = {};
    try { requestedRoles = typeof projectJson.crew_roles === 'string' ? JSON.parse(projectJson.crew_roles) : projectJson.crew_roles || {}; } catch(e){}
    
    Object.keys(requestedRoles).forEach(role => {
        fulfillmentSummary[role] = { required: requestedRoles[role], accepted: 0, display: `0/${requestedRoles[role]}` };
    });

    const processedCrew = (projectJson.assigned_crews || []).map(ac => {
        let roleNames = [];
        if (ac.crew_member?.primary_role) {
            try {
                const raw = ac.crew_member.primary_role;
                const roleIds = (typeof raw === 'string' && raw.startsWith('[')) ? JSON.parse(raw) : [raw];
                roleNames = allRoles.filter(r => roleIds.map(String).includes(String(r.role_id))).map(r => r.role_name);
                
                if (ac.crew_accept === 1) {
                    const cat = roleIds.map(id => ID_TO_ROLE_MAP[String(id)]).find(c => fulfillmentSummary[c]);
                    if (cat) fulfillmentSummary[cat].accepted += 1;
                }
            } catch(e){}
        }
        return {
            ...ac,
            acceptance_status: ac.crew_accept === 1 ? 'accepted' : ac.crew_accept === 2 ? 'rejected' : 'pending',
            crew_member: { 
                ...ac.crew_member, 
                role_name: roleNames.join(', ') || 'N/A',
                first_name: ac.crew_member?.first_name ? ac.crew_member.first_name.charAt(0).toUpperCase() + ac.crew_member.first_name.slice(1).toLowerCase() : '',
                last_name: ac.crew_member?.last_name ? ac.crew_member.last_name.charAt(0).toUpperCase() : ''
            }
        };
    });

    Object.keys(fulfillmentSummary).forEach(k => { fulfillmentSummary[k].display = `${fulfillmentSummary[k].accepted}/${fulfillmentSummary[k].required}`; });

    // 7. Payment Link Logic
    let active_payment_link = null;
    if (lead?.payment_links?.length > 0) {
        const latest = [...lead.payment_links].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        active_payment_link = {
            ...latest,
            is_expired: latest.expires_at ? new Date(latest.expires_at) < new Date() : false
        };
    }

    const timelineStatus = bookingTimelineService.getTimelineStage(projectJson);
    const timelineLabel = bookingTimelineService.getTimelineLabel(timelineStatus);
    const manualPaymentSummary = buildManualPaymentSummaryFromActivities(
      (leadPaymentActivities && leadPaymentActivities.length > 0)
        ? leadPaymentActivities
        : (lead?.activities || []),
      totalValueAmount || displayAmount
    );
    const paymentHistory = [];
    (manualPaymentRows || []).forEach((manualPayment) => {
      const manualPaymentId = Number(manualPayment.booking_manual_payment_id || 0);
      if (!Number.isFinite(manualPaymentId) || manualPaymentId <= 0) return;
      const normalizedMode = String(manualPayment.payment_mode || '').toLowerCase();
      const method = normalizedMode === 'other' && String(manualPayment.other_payment_mode || '').trim()
        ? String(manualPayment.other_payment_mode).trim()
        : normalizedMode === 'net30'
          ? 'Net 30'
          : String(manualPayment.payment_mode || 'manual').replace(/_/g, ' ');

      paymentHistory.push({
        id: `manual-${manualPaymentId}`,
        type: 'manual',
        receipt_number: `RCPT-${String(projectJson.stream_project_booking_id).padStart(6, '0')}-${String(manualPaymentId).padStart(3, '0')}`,
        invoice_number: `INVBEIGE-M-${String(projectJson.stream_project_booking_id).padStart(4, '0')}-${String(manualPaymentId).padStart(3, '0')}`,
        method,
        amount: Number(manualPayment.amount || 0),
        status: 'paid',
        paid_at: manualPayment.created_at || null,
        receipt_url: buildShootReceiptUrl({
          bookingId: projectJson.stream_project_booking_id,
          manualPaymentId
        }),
        receipt_download_url: buildShootReceiptUrl({
          bookingId: projectJson.stream_project_booking_id,
          manualPaymentId,
          download: true
        })
      });
    });

    const stripePaymentIdsInHistory = new Set();
    (stripeReceiptRows || []).forEach((stripeReceipt) => {
      const paymentId = Number(stripeReceipt.payment_id || 0);
      if (!Number.isFinite(paymentId) || paymentId <= 0) return;
      stripePaymentIdsInHistory.add(paymentId);
      const normalizedStripeStatus = String(stripeReceipt.payment_status || stripeReceipt.status || '').trim().toLowerCase();
      paymentHistory.push({
        id: `stripe-${paymentId}`,
        type: 'stripe',
        receipt_number: `RCPT-${String(projectJson.stream_project_booking_id).padStart(6, '0')}-S${String(paymentId).padStart(3, '0')}`,
        invoice_number: `INVBEIGE-S-${String(projectJson.stream_project_booking_id).padStart(4, '0')}-${String(paymentId).padStart(3, '0')}`,
        method: 'Online Payment',
        amount: Number(stripeReceipt.amount || stripeReceipt.total_amount || 0),
        status: ['succeeded', 'success', 'completed', 'complete', 'paid'].includes(normalizedStripeStatus)
          ? 'paid'
          : (stripeReceipt.payment_status || stripeReceipt.status || 'paid'),
        paid_at: stripeReceipt.paid_at || stripeReceipt.payment_created_at || stripeReceipt.created_at || null,
        receipt_url: buildShootReceiptUrl({
          bookingId: projectJson.stream_project_booking_id,
          paymentId
        }),
        receipt_download_url: buildShootReceiptUrl({
          bookingId: projectJson.stream_project_booking_id,
          paymentId,
          download: true
        })
      });
    });

    if (
      paymentData?.payment_id &&
      Number(paymentData.total_amount || 0) > 0 &&
      !stripePaymentIdsInHistory.has(Number(paymentData.payment_id))
    ) {
      const normalizedStripeStatus = String(paymentData.status || '').trim().toLowerCase();
      paymentHistory.push({
        id: `stripe-${paymentData.payment_id}`,
        type: 'stripe',
        receipt_number: `RCPT-${String(projectJson.stream_project_booking_id).padStart(6, '0')}-S${String(paymentData.payment_id).padStart(3, '0')}`,
        invoice_number: `INVBEIGE-S-${String(projectJson.stream_project_booking_id).padStart(4, '0')}-${String(paymentData.payment_id).padStart(3, '0')}`,
        method: 'Online Payment',
        amount: Number(paymentData.total_amount || 0),
        status: ['succeeded', 'success', 'completed', 'complete', 'paid'].includes(normalizedStripeStatus)
          ? 'paid'
          : (paymentData.status || 'paid'),
        paid_at: paymentData.created_at || projectJson.payment_completed_at || null,
        receipt_url: buildShootReceiptUrl({
          bookingId: projectJson.stream_project_booking_id,
          paymentId: paymentData.payment_id
        }),
        receipt_download_url: buildShootReceiptUrl({
          bookingId: projectJson.stream_project_booking_id,
          paymentId: paymentData.payment_id,
          download: true
        })
      });
    }
    paymentHistory.sort((left, right) => new Date(left.paid_at || 0).getTime() - new Date(right.paid_at || 0).getTime());

    const summaryPaidAmount = bookingPaymentSummary
      ? parseAmountCandidate(bookingPaymentSummary.paid_amount)
      : null;
    const summaryCreditUsedAmount = bookingPaymentSummary
      ? parseAmountCandidate(bookingPaymentSummary.credit_used_amount)
      : null;
    const summaryPendingAmount = bookingPaymentSummary
      ? parseAmountCandidate(bookingPaymentSummary.due_amount)
      : null;
    const summaryQuoteTotal = bookingPaymentSummary
      ? parseAmountCandidate(bookingPaymentSummary.quote_total)
      : null;
    const totalPaidAmount = summaryPaidAmount !== null ? summaryPaidAmount : displayAmount;
    totalValueAmount = Math.max(
      totalValueAmount || 0,
      summaryQuoteTotal || 0,
      totalPaidAmount + (summaryCreditUsedAmount || 0) + (summaryPendingAmount || 0)
    );
    const creditUsedAmount = summaryCreditUsedAmount || 0;
    const pendingAmount = bookingPaymentSummary
      ? Math.max(summaryPendingAmount || 0, 0)
      : Math.max(totalValueAmount - totalPaidAmount - creditUsedAmount, 0);
    const resolvedPaymentStatus = pendingAmount > 0 && totalPaidAmount > 0
      ? 'partially_paid'
      : bookingPaymentSummary?.payment_status
        ? String(bookingPaymentSummary.payment_status).toLowerCase()
      : projectJson.payment_id
      ? 'paid'
      : manualPaymentSummary.hasFullPayment
        ? 'paid'
        : String(leadRecord?.lead_status || lead?.lead_status || '').toLowerCase() === 'booked'
          ? 'paid'
        : (active_payment_link ? 'link_sent' : 'unpaid');

    // 8. Construct Response
    return res.status(200).json({
      error: false,
      message: 'Project details retrieved successfully',
      data: {
        project: {
          ...projectJson,
          total_paid_amount: totalPaidAmount,
          total_value_amount: totalValueAmount,
          paid_amount: totalPaidAmount,
          pending_amount: pendingAmount,
          due_amount: pendingAmount,
          credit_used_amount: creditUsedAmount,
          payment_status: resolvedPaymentStatus,
          notes_count: shootNotesCount,
          contact_registration_type: contactRegistrationType,
          is_registered_user: isRegisteredUser,
          is_client: isClient,
          is_client_only: isClientOnly,
          is_unregistered_contact: !isRegisteredUser && !isClientOnly,
          client_record_id: resolvedClientRecord?.client_id || null,
          client_id: resolvedClientRecord?.client_id || null,
          matched_user_id: matchedUserId,
          is_quote_converted_booking: isQuoteConvertedBooking,
          converted_sales_quote_id: convertedSalesQuoteId,
          converted_sales_quote_number: convertedSalesQuote?.quote_number || null,
          event_type_labels: eventTypeLabels.join(', '),
          timeline_status: timelineStatus,
          timeline_label: timelineLabel,
          needs_attention: buildShootNeedsAttention(projectJson, formSubmission),
          sales_leads: undefined // Remove from main object to avoid redundancy
        },
        timeline_status: timelineStatus,
        timeline_label: timelineLabel,
        lead_details: lead, // Sales rep, activities, etc.
        contact_registration_type: contactRegistrationType,
        is_registered_user: isRegisteredUser,
        is_client: isClient,
        is_client_only: isClientOnly,
        is_unregistered_contact: !isRegisteredUser && !isClientOnly,
        client_id: resolvedClientRecord?.client_id || null,
        converted_sales_quote_id: convertedSalesQuoteId,
        converted_sales_quote_number: convertedSalesQuote?.quote_number || null,
        is_quote_converted_booking: isQuoteConvertedBooking,
        manual_payment_summary: manualPaymentSummary,
        payment_history: paymentHistory,
        pricing_breakdown,
        payment_status: resolvedPaymentStatus,
        active_payment_link,
        fulfillmentSummary,
        assignedCrew: processedCrew,
        assignedEquipment: projectJson.assigned_equipments || [],
        assignedPostProductionMembers: projectJson.assigned_post_production_members || []
      },
    });

  } catch (error) {
    console.error('Error fetching project details:', error);
    return res.status(500).json({ error: true, message: 'Internal server error', details: error.message });
  }
};

exports.updateProjectDateLocation = async (req, res) => {
  let transaction = null;
  try {
    const { project_id } = req.params;
    const {
      event_date,
      date,
      start_date,
      event_location,
      location,
      booking_type,
      booking_days,
      start_time,
      end_time,
      duration_hours,
      time_zone
    } = req.body || {};

    if (!project_id) {
      return res.status(400).json({ error: true, message: 'Project ID is required' });
    }

    const requestedBookingType = booking_type ? String(booking_type).toLowerCase().trim() : null;
    const nextDate = event_date ?? date ?? start_date;
    const nextLocation = event_location !== undefined ? event_location : location;
    const hasBookingDaysPayload = Array.isArray(booking_days);
    const hasScheduleUpdate =
      nextDate !== undefined ||
      start_time !== undefined ||
      end_time !== undefined ||
      duration_hours !== undefined ||
      time_zone !== undefined ||
      hasBookingDaysPayload ||
      requestedBookingType === 'single_day' ||
      requestedBookingType === 'multi_day';
    const hasLocationUpdate = nextLocation !== undefined;

    if (!hasScheduleUpdate && !hasLocationUpdate) {
      return res.status(400).json({
        error: true,
        message: 'Please provide schedule fields or event_location/location to update.'
      });
    }

    const normalizedBookingDays = hasBookingDaysPayload
      ? booking_days
          .filter((day) => day)
          .map((day) => {
            const dayDate = day.date || day.event_date || day.start_date;
            const startTime = normalizeScheduleTime(day.start_time || day.startTime);
            const endTime = normalizeScheduleTime(day.end_time || day.endTime);
            return {
              event_date: dayDate,
              start_time: startTime,
              end_time: endTime,
              duration_hours: day.duration_hours != null
                ? Number(day.duration_hours)
                : calculateDurationHours(startTime, endTime),
              time_zone: day.time_zone || day.timeZone || time_zone || null
            };
          })
      : [];

    const resolvedBookingType =
      requestedBookingType ||
      (normalizedBookingDays.length > 0 ? 'multi_day' : null);

    if (resolvedBookingType && !['single_day', 'multi_day'].includes(resolvedBookingType)) {
      return res.status(400).json({
        error: true,
        message: 'booking_type must be single_day or multi_day.'
      });
    }

    if (resolvedBookingType === 'multi_day' && normalizedBookingDays.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'booking_days is required for multi_day booking_type.'
      });
    }

    const invalidBookingDay = normalizedBookingDays.find((day) => !hasValue(day.event_date) || !isValidDateOnly(day.event_date));
    if (invalidBookingDay) {
      return res.status(400).json({
        error: true,
        message: 'Each booking_days item must include date in YYYY-MM-DD format.'
      });
    }

    if (nextDate !== undefined && (!hasValue(nextDate) || !isValidDateOnly(nextDate))) {
      return res.status(400).json({
        error: true,
        message: 'start_date/event_date must be in YYYY-MM-DD format for single_day booking_type.'
      });
    }

    const normalizedLocation = normalizeLocationForStorage(nextLocation);
    if (hasLocationUpdate && !hasValue(normalizedLocation)) {
      return res.status(400).json({
        error: true,
        message: 'event_location cannot be empty.'
      });
    }

    const normalizedStartTime = normalizeScheduleTime(start_time);
    const normalizedEndTime = normalizeScheduleTime(end_time);
    if (start_time && !normalizedStartTime) {
      return res.status(400).json({ error: true, message: 'start_time must be in HH:mm or HH:mm:ss format.' });
    }
    if (end_time && !normalizedEndTime) {
      return res.status(400).json({ error: true, message: 'end_time must be in HH:mm or HH:mm:ss format.' });
    }

    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id }
    });

    if (!project) {
      return res.status(404).json({ error: true, message: 'Project not found' });
    }

    transaction = await db.sequelize.transaction();

    const sortedBookingDays = [...normalizedBookingDays].sort(
      (a, b) => new Date(a.event_date) - new Date(b.event_date)
    );

    const primaryBookingDay =
      resolvedBookingType === 'multi_day'
        ? sortedBookingDays[0]
        : null;

    const primaryScheduleDate =
      resolvedBookingType === 'multi_day'
        ? primaryBookingDay?.event_date || null
        : nextDate;

    const primaryStartTime =
      resolvedBookingType === 'multi_day'
        ? primaryBookingDay?.start_time || null
        : normalizedStartTime;

    const primaryEndTime =
      resolvedBookingType === 'multi_day'
        ? primaryBookingDay?.end_time || null
        : normalizedEndTime;

    const primaryTimeZone =
      resolvedBookingType === 'multi_day'
        ? primaryBookingDay?.time_zone || null
        : time_zone;

    let totalDurationHours =
      resolvedBookingType === 'multi_day'
        ? sortedBookingDays.reduce((sum, day) => {
          return sum + (Number(day.duration_hours) || 0);
        }, 0)
        : duration_hours != null
          ? Number(duration_hours)
          : calculateDurationHours(normalizedStartTime, normalizedEndTime);

    if (totalDurationHours > 0) {
      totalDurationHours = Math.round(totalDurationHours * 100) / 100;
    } else {
      totalDurationHours = null;
    }

    const updatePayload = {};
    if (primaryScheduleDate !== undefined && primaryScheduleDate !== null) updatePayload.event_date = primaryScheduleDate;
    if (start_time !== undefined || resolvedBookingType === 'multi_day') updatePayload.start_time = primaryStartTime || null;
    if (end_time !== undefined || resolvedBookingType === 'multi_day') updatePayload.end_time = primaryEndTime || null;
    if (time_zone !== undefined || resolvedBookingType === 'multi_day') updatePayload.time_zone = primaryTimeZone || null;
    if (duration_hours !== undefined || totalDurationHours !== null || resolvedBookingType === 'multi_day') {
      updatePayload.duration_hours = totalDurationHours;
    }

    if (hasLocationUpdate) {
      const latitude = req.body.latitude ?? null;
      const longitude = req.body.longitude ?? null;
      updatePayload.event_location = normalizedLocation;
      updatePayload.event_latitude = latitude;
      updatePayload.event_longitude = longitude;
    }

    if (Object.keys(updatePayload).length > 0) {
      await project.update(updatePayload, { transaction });
    }

    if (resolvedBookingType === 'multi_day') {
      await db.stream_project_booking_days.destroy({
        where: { stream_project_booking_id: project.stream_project_booking_id },
        transaction
      });

      await db.stream_project_booking_days.bulkCreate(
        sortedBookingDays.map((day) => ({
          stream_project_booking_id: project.stream_project_booking_id,
          event_date: day.event_date,
          start_time: day.start_time,
          end_time: day.end_time,
          duration_hours: day.duration_hours,
          time_zone: day.time_zone,
          updated_at: new Date()
        })),
        { transaction }
      );
    }

    if (resolvedBookingType === 'single_day') {
      await db.stream_project_booking_days.destroy({
        where: { stream_project_booking_id: project.stream_project_booking_id },
        transaction
      });
    }

    const [bookingDays, formSubmission] = await Promise.all([
      db.stream_project_booking_days.findAll({
        where: { stream_project_booking_id: project.stream_project_booking_id },
        attributes: ['event_date', 'start_time', 'end_time', 'duration_hours', 'time_zone'],
        order: [['event_date', 'ASC']],
        transaction,
        raw: true
      }),
      project_form_submissions.findOne({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        attributes: ['id'],
        order: [['created_at', 'DESC']],
        transaction,
        raw: true
      })
    ]);

    const refreshedProject = project.toJSON();
    refreshedProject.booking_days = bookingDays;

    await transaction.commit();

    return res.status(200).json({
      error: false,
      message: 'Project date/location updated successfully',
      data: {
        project_id: refreshedProject.stream_project_booking_id,
        booking_type: resolvedBookingType,
        event_date: refreshedProject.event_date,
        start_time: refreshedProject.start_time,
        end_time: refreshedProject.end_time,
        duration_hours: refreshedProject.duration_hours,
        time_zone: refreshedProject.time_zone,
        event_location: refreshedProject.event_location,
        event_latitude: refreshedProject.event_latitude,
        event_longitude: refreshedProject.event_longitude,
        booking_days: bookingDays,
        needs_attention: buildShootNeedsAttention(refreshedProject, formSubmission)
      }
    });
  } catch (error) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    console.error('Error updating project attention fields:', error);
    return res.status(500).json({ error: true, message: 'Internal server error', details: error.message });
  }
};

// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     const { status, event_type, search } = req.query;  // Get filters from query params
//     const today = new Date();

//     const whereConditions = {
//       is_active: 1
//     };

//     if (status) {
//       switch (status) {
//         case 'cancelled':
//           whereConditions.is_cancelled = 1;
//           break;

//         case 'completed':
//           whereConditions.is_completed = 1;
//           break;

//         case 'upcoming':
//           whereConditions.is_cancelled = 0;
//           whereConditions.event_date = { [Sequelize.Op.gt]: today };
//           break;

//         case 'draft':
//           whereConditions.is_draft = 1;
//           break;

//         default:
//           return res.status(400).json({
//             error: true,
//             message: 'Invalid status filter'
//           });
//       }
//     }


//     if (event_type) {
//       const eventType = await event_type_master.findOne({
//         where: { event_type_id: event_type }
//       });

//       if (eventType) {
//         whereConditions.event_type = event_type;
//       } else {
//         return res.status(400).json({
//           error: true,
//           message: 'Invalid event_type ID'
//         });
//       }
//     }

//     if (search) {
//       whereConditions.project_name = Sequelize.where(
//         Sequelize.fn('LOWER', Sequelize.col('project_name')),
//         {
//           [Sequelize.Op.like]: `%${search.toLowerCase()}%`
//         }
//       );
//     }


//     const [
//       total_active,
//       total_cancelled,
//       total_completed,
//       total_upcoming,
//       total_draft
//     ] = await Promise.all([
//       stream_project_booking.count({
//         where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 }
//       }),

//       stream_project_booking.count({
//         where: { is_cancelled: 1 }
//       }),

//       stream_project_booking.count({
//         where: { is_completed: 1 }
//       }),

//       stream_project_booking.count({
//         where: {
//           is_cancelled: 0,
//           is_draft: 0,
//           event_date: { [Sequelize.Op.gt]: today }
//         }
//       }),

//       stream_project_booking.count({
//         where: { is_draft: 1 }
//       }),
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions
//     });

//     if (!projects || projects.length === 0) {
//       return res.status(404).json({
//         error: true,
//         message: 'No active projects found',
//       });
//     }

//     const projectDetailsPromises = projects.map(async (project) => {
//       const assignedCrew = await assigned_crew.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [
//           {
//             model: crew_members,
//             as: 'crew_member',
//             attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'],
//           },
//         ],
//       });

//       const assignedEquipment = await assigned_equipment.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [
//           {
//             model: equipment,
//             as: 'equipment',
//             attributes: ['equipment_id', 'equipment_name'],
//           },
//         ],
//       });

//       return {
//         project,
//         assignedCrew,
//         assignedEquipment,
//       };
//     });

//     const projectDetails = await Promise.all(projectDetailsPromises);

//     return res.status(200).json({
//       error: false,
//       message: 'All project details retrieved successfully',
//       data: {
//         stats: {
//           total_active,
//           total_cancelled,
//           total_completed,
//           total_upcoming,
//           total_draft
//         },
//         projects: projectDetails
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({
//       error: true,
//       message: 'Internal server error',
//     });
//   }
// };


// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;
//     const today = new Date();

//     const noPagination = !limit && !page;

//     let pageNumber = null;
//     let pageSize = null;
//     let offset = null;

//     if (!noPagination) {
//       pageNumber = parseInt(page ?? 1, 10);
//       pageSize = parseInt(limit ?? 10, 10);
//       offset = (pageNumber - 1) * pageSize;
//     }

//     // ----------- IMPROVED DATE RANGE FILTER LOGIC -----------
//     let dateFilter = {};

//     if (start_date && end_date) {
//       dateFilter = {
//         event_date: {
//           [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
//         }
//       };
//     } else if (range === 'month') {
//       dateFilter = {
//         [Sequelize.Op.and]: [
//             Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//             Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//         ]
//       };
//     } else if (range === 'week') {
//       dateFilter = {
//         [Sequelize.Op.and]: [
//             Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
//         ]
//       };
//     } else if (range === 'year') {
//       dateFilter = {
//         [Sequelize.Op.and]: [
//             Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//         ]
//       };
//     }

//     const whereConditions = {
//       is_active: 1,
//       ...dateFilter
//     };

//     // ----------- STATUS FILTER -----------
//     if (status) {
//       switch (status) {
//         case 'cancelled':
//           whereConditions.is_cancelled = 1;
//           break;
//         case 'completed':
//           whereConditions.is_completed = 1;
//           break;
//         case 'upcoming':
//           whereConditions.is_cancelled = 0;
//           whereConditions.is_draft = 0;
//           whereConditions.event_date = {
//             ...(dateFilter.event_date || {}),
//             [Sequelize.Op.gt]: today
//           };
//           break;
//         case 'draft':
//           whereConditions.is_draft = 1;
//           break;
//         default:
//           return res.status(400).json({ error: true, message: 'Invalid status filter' });
//       }
//     }

//     // ----------- EVENT TYPE FILTER -----------
//     if (event_type) {
//       whereConditions.event_type = event_type;
//     }

//     // ----------- SEARCH FILTER -----------
//     if (search) {
//       whereConditions.project_name = Sequelize.where(
//         Sequelize.fn('LOWER', Sequelize.col('project_name')),
//         { [Sequelize.Op.like]: `%${search.toLowerCase()}%` }
//       );
//     }

//     // ----------- STATS COUNTS (Respecting Date Filter) -----------
//     const [
//       total_active,
//       total_cancelled,
//       total_completed,
//       total_upcoming,
//       total_draft
//     ] = await Promise.all([
//       stream_project_booking.count({
//         where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0, ...dateFilter }
//       }),
//       stream_project_booking.count({
//         where: { is_cancelled: 1, ...dateFilter }
//       }),
//       stream_project_booking.count({
//         where: { is_completed: 1, ...dateFilter }
//       }),
//       stream_project_booking.count({
//         where: {
//           is_cancelled: 0,
//           is_draft: 0,
//           ...dateFilter,
//           event_date: {
//             ...(dateFilter.event_date || {}),
//             [Sequelize.Op.gt]: today
//           }
//         }
//       }),
//       stream_project_booking.count({
//         where: { is_draft: 1, ...dateFilter }
//       }),
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions,
//       ...(noPagination ? {} : { limit: pageSize, offset }),
//       order: [['event_date', 'DESC']],
//     });

//     if (!projects || projects.length === 0) {
//       return res.status(200).json({
//         error: false,
//         message: 'No projects found',
//         data: {
//             stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//             projects: []
//         }
//       });
//     }

//     const projectDetailsPromises = projects.map(async (project) => {
//       const assignedCrew = await assigned_crew.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
//       });

//       const assignedEquipment = await assigned_equipment.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//       });

//       const assignedPostProd = await assigned_post_production_member.findAll({
//         where: { project_id: project.stream_project_booking_id, is_active: 1 },
//         include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//       });

//       return {
//         project: {
//           ...project.toJSON(),
//           event_location: (() => {
//             const loc = project.event_location;
//             if (!loc) return null;
//             try {
//               if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
//                 const parsed = JSON.parse(loc);
//                 return parsed.address || parsed;
//               }
//             } catch (e) { return loc; }
//             return loc;
//           })()
//         },
//         assignedCrew,
//         assignedEquipment,
//         assignedPostProductionMembers: assignedPostProd,
//       };
//     });

//     const projectDetails = await Promise.all(projectDetailsPromises);

//     return res.status(200).json({
//       error: false,
//       message: 'All project details retrieved successfully',
//       data: {
//         stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//         projects: projectDetails,
//         pagination: noPagination ? null : {
//             page: pageNumber,
//             limit: pageSize,
//             totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
//           }
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };

// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;
//     const today = new Date();
//     const noPagination = !limit && !page;

//     let pageNumber = null, pageSize = null, offset = null;
//     if (!noPagination) {
//       pageNumber = parseInt(page ?? 1, 10);
//       pageSize = parseInt(limit ?? 10, 10);
//       offset = (pageNumber - 1) * pageSize;
//     }

//     // 1. Setup Date Filters
//     let dateFilter = {};
//     if (start_date && end_date) {
//       dateFilter = { event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } };
//     } else if (range === 'month') {
//       dateFilter = { [Sequelize.Op.and]: [
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ]};
//     }

//     const whereConditions = { is_active: 1, ...dateFilter };

//     // 2. Status & Search Filters
//     if (status) {
//       if (status === 'cancelled') whereConditions.is_cancelled = 1;
//       else if (status === 'completed') whereConditions.is_completed = 1;
//       else if (status === 'upcoming') {
//         whereConditions.is_cancelled = 0; whereConditions.is_draft = 0;
//         whereConditions.event_date = { ...(dateFilter.event_date || {}), [Sequelize.Op.gt]: today };
//       }
//       else if (status === 'draft') whereConditions.is_draft = 1;
//     }
//     if (event_type) whereConditions.event_type = event_type;
//     if (search) {
//       whereConditions.project_name = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('project_name')), { [Sequelize.Op.like]: `%${search.toLowerCase()}%` });
//     }

//     // 3. Fetch Stats + Event Type Master in parallel
//     const [
//       total_active, total_cancelled, total_completed, total_upcoming, total_draft,
//       allEventMasterTypes // Fetch names for numeric IDs like '6'
//     ] = await Promise.all([
//       stream_project_booking.count({ where: { is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0, ...dateFilter } }),
//       stream_project_booking.count({ where: { is_cancelled: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { is_completed: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { is_cancelled: 0, is_draft: 0, ...dateFilter, event_date: { [Sequelize.Op.gt]: today } } }),
//       stream_project_booking.count({ where: { is_draft: 1, ...dateFilter } }),
//       event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true })
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions,
//       ...(noPagination ? {} : { limit: pageSize, offset }),
//       order: [['event_date', 'DESC']],
//     });

//     // 4. Processing Loop
//     const projectDetails = await Promise.all(projects.map(async (project) => {
//       const [assignedCrewData, assignedEquipData, assignedPostProdData] = await Promise.all([
//         assigned_crew.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
//         }),
//         assigned_equipment.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//         }),
//         assigned_post_production_member.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//         })
//       ]);

//       // --- NEW LOGIC: Map Event Type to Labels ---
//       const rawTypes = project.event_type ? project.event_type.split(',') : [];
//       const formattedTypes = rawTypes.map(t => {
//         const val = t.trim();
//         // Check if it's a numeric ID in the master table
//         const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
//         if (masterMatch) return masterMatch.event_type_name;

//         // Custom mapping for string-based database values
//         const stringMap = {
//           'videographer': 'Videography',
//           'photographer': 'Photography'
//         };
//         return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
//       });

//       return {
//         project: {
//           ...project.toJSON(),
//           event_type_labels: formattedTypes.join(', '), // New field: "Videography, Photography"
//           event_location: (() => {
//             const loc = project.event_location;
//             if (!loc) return null;
//             try {
//               if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
//                 const parsed = JSON.parse(loc);
//                 return parsed.address || parsed;
//               }
//             } catch (e) { return loc; }
//             return loc;
//           })()
//         },
//         assignedCrew: assignedCrewData,
//         assignedEquipment: assignedEquipData,
//         assignedPostProductionMembers: assignedPostProdData,
//       };
//     }));

//     return res.status(200).json({
//       error: false,
//       message: 'All project details retrieved successfully',
//       data: {
//         stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//         projects: projectDetails,
//         pagination: noPagination ? null : {
//             page: pageNumber,
//             limit: pageSize,
//             totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
//         }
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };


// exports.getAllProjectDetails = async (req, res) => {
//   try {
//     let { status, event_type, search, limit, page, range, start_date, end_date, date_on } = req.query;
//     const today = new Date();
//     const noPagination = !limit && !page;

//     let pageNumber = null, pageSize = null, offset = null;
//     if (!noPagination) {
//       pageNumber = parseInt(page ?? 1, 10);
//       pageSize = parseInt(limit ?? 10, 10);
//       offset = (pageNumber - 1) * pageSize;
//     }

//     // 1. Setup Date Filters
//     let dateFilter = {};
    
//     if (start_date && end_date) {
//       dateFilter = { event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } };
//     } else if (range === 'month') {
//       dateFilter = { [Sequelize.Op.and]: [
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ]};
//     } else if (range === 'week') {
//       dateFilter = { [Sequelize.Op.and]: [
//         Sequelize.where(Sequelize.fn('WEEK', Sequelize.col('event_date')), Sequelize.fn('WEEK', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ]};
//     } else if (range === 'all') {
//       dateFilter = { event_date: { [Sequelize.Op.ne]: null } };  // Optional check to ensure event_date is not null
//     } else if (date_on) {
//       // If custom date is provided
//       dateFilter = { event_date: { [Sequelize.Op.eq]: `${date_on} 00:00:00` } };
//     }

//     // --- Filter for Paid Projects Only ---
//     const paidOnlyFilter = { 
//       payment_id: { [Sequelize.Op.ne]: null },
//       is_active: 1 
//     };

//     const whereConditions = { ...paidOnlyFilter, ...dateFilter };

//     // 2. Status & Search Filters
//     if (status) {
//       if (status === 'cancelled') whereConditions.is_cancelled = 1;
//       else if (status === 'completed') whereConditions.is_completed = 1;
//       else if (status === 'upcoming') {
//         whereConditions.is_cancelled = 0; 
//         whereConditions.is_draft = 0;
//         whereConditions.event_date = { ...(dateFilter.event_date || {}), [Sequelize.Op.gt]: today };
//       }
//       else if (status === 'draft') whereConditions.is_draft = 1;
//     }
    
//     if (event_type) whereConditions.event_type = event_type;
    
//     if (search) {
//       whereConditions.project_name = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('project_name')), { 
//         [Sequelize.Op.like]: `%${search.toLowerCase()}%` 
//       });
//     }

//     const [
//       total_active, total_cancelled, total_completed, total_upcoming, total_draft,
//       allEventMasterTypes 
//     ] = await Promise.all([
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_cancelled: 0, is_completed: 0, is_draft: 0, ...dateFilter } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_cancelled: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_completed: 1, ...dateFilter } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_cancelled: 0, is_draft: 0, ...dateFilter, event_date: { [Sequelize.Op.gt]: today } } }),
//       stream_project_booking.count({ where: { ...paidOnlyFilter, is_draft: 1, ...dateFilter } }),
//       event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true })
//     ]);

//     const projects = await stream_project_booking.findAll({
//       where: whereConditions,
//       ...(noPagination ? {} : { limit: pageSize, offset }),
//       order: [['event_date', 'ASC']],
//     });

//     const projectDetails = await Promise.all(projects.map(async (project) => {
//       const [assignedCrewData, assignedEquipData, assignedPostProdData, paymentData] = await Promise.all([
//         assigned_crew.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
//         }),
//         assigned_equipment.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
//         }),
//         assigned_post_production_member.findAll({
//           where: { project_id: project.stream_project_booking_id, is_active: 1 },
//           include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
//         }),
//         payment_transactions.findOne({
//           where: { payment_id: project.payment_id },
//           attributes: ['total_amount']
//         })
//       ]);

//       const rawTypes = project.event_type ? project.event_type.split(',') : [];
//       const formattedTypes = rawTypes.map(t => {
//         const val = t.trim();
//         const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
//         if (masterMatch) return masterMatch.event_type_name;
//         const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
//         return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
//       });

//       return {
//         project: {
//           ...project.toJSON(),
//           total_paid_amount: paymentData ? paymentData.total_amount : 0,
//           event_type_labels: formattedTypes.join(', '),
//           event_location: (() => {
//             const loc = project.event_location;
//             if (!loc) return null;
//             try {
//               if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
//                 const parsed = JSON.parse(loc);
//                 return parsed.address || parsed;
//               }
//             } catch (e) { return loc; }
//             return loc;
//           })()
//         },
//         assignedCrew: assignedCrewData,
//         assignedEquipment: assignedEquipData,
//         assignedPostProductionMembers: assignedPostProdData,
//       };
//     }));

//     return res.status(200).json({
//       error: false,
//       message: 'Paid project details with amounts retrieved successfully',
//       data: {
//         stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
//         projects: projectDetails,
//         pagination: noPagination ? null : {
//             page: pageNumber,
//             limit: pageSize,
//             totalRecords: total_active + total_cancelled + total_completed + total_upcoming + total_draft,
//         }
//       },
//     });
//   } catch (error) {
//     console.error('Error fetching project details:', error);
//     return res.status(500).json({ error: true, message: 'Internal server error' });
//   }
// };


exports.getAllProjectDetails = async (req, res) => {
  try {
    let { status, event_type, search, limit, page, range, start_date, end_date, date_on, category, cp_assignment, production_filter, summary_only } = req.query;
    const today = new Date();
    const noPagination = !limit && !page;
    const requestUserId = Number(req.user?.userId || req.user?.id || req.userId);
    const requestUserRole = String(req.user?.userRole || req.userRole || '').toLowerCase().trim();
    const clientProjectFilter = requestUserRole === 'client' && Number.isInteger(requestUserId) && requestUserId > 0
      ? { user_id: requestUserId }
      : {};

    let pageNumber = null, pageSize = null, offset = null;
    if (!noPagination) {
      pageNumber = parseInt(page ?? 1, 10);
      pageSize = parseInt(limit ?? 10, 10);
      offset = (pageNumber - 1) * pageSize;
    }

    const categoryConfig = {
      corporate: ['corporate'],
      wedding: ['wedding'],
      private: ['private'],
      commercial: ['commercial', 'brand', 'advertising'],
      social: ['social'],
      podcasts: ['podcast'],
      music: ['music'],
      narrative: ['narrative', 'short film']
    };

    let dateFilter = {};
    if (start_date && end_date) {
      dateFilter = { event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } };
    } else if (range === 'month') {
      dateFilter = { [Sequelize.Op.and]: [
        Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
        Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
      ]};
    } else if (range === 'week') {
      dateFilter = { [Sequelize.Op.and]: [
        Sequelize.where(Sequelize.fn('WEEK', Sequelize.col('event_date')), Sequelize.fn('WEEK', Sequelize.fn('CURDATE'))),
        Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
      ]};
    } else if (range === 'all') {
      dateFilter = {};
    } else if (date_on) {
      dateFilter = { event_date: { [Sequelize.Op.eq]: `${date_on} 00:00:00` } };
    }

    const [
      bookedSalesLeads,
      bookedClientLeads,
      salesManualPaymentActivities,
      clientManualPaymentActivities,
      collectedPaymentSummaryRows,
    ] = await Promise.all([
      sales_leads.findAll({
        where: {
          is_active: 1,
          lead_status: 'booked',
          booking_id: { [Sequelize.Op.ne]: null }
        },
        attributes: ['booking_id'],
        raw: true
      }),
      client_leads.findAll({
        where: {
          is_active: 1,
          lead_status: 'booked',
          booking_id: { [Sequelize.Op.ne]: null }
        },
        attributes: ['booking_id'],
        raw: true
      }),
      sales_lead_activities.findAll({
        where: {
          activity_type: 'payment_completed',
        },
        attributes: ['lead_id'],
        raw: true,
      }),
      client_lead_activities.findAll({
        where: {
          activity_type: 'payment_completed',
        },
        attributes: ['lead_id'],
        raw: true,
      }),
      fetchCollectedBookingPaymentSummaries(),
    ]);

    const collectedPaymentSummaryByBookingId = new Map();
    collectedPaymentSummaryRows.forEach((row) => {
      const bookingId = Number(row.booking_id);
      if (!Number.isFinite(bookingId) || bookingId <= 0) return;
      collectedPaymentSummaryByBookingId.set(bookingId, row);
    });

    const manualSalesLeadIds = Array.from(new Set(
      salesManualPaymentActivities
        .map((row) => Number(row.lead_id))
        .filter(Number.isFinite)
    ));

    const manualClientLeadIds = Array.from(new Set(
      clientManualPaymentActivities
        .map((row) => Number(row.lead_id))
        .filter(Number.isFinite)
    ));

    const [manualPaidSalesLeads, manualPaidClientLeads] = await Promise.all([
      manualSalesLeadIds.length
        ? sales_leads.findAll({
            where: {
              is_active: 1,
              lead_id: { [Sequelize.Op.in]: manualSalesLeadIds },
              booking_id: { [Sequelize.Op.ne]: null }
            },
            attributes: ['booking_id'],
            raw: true
          })
        : Promise.resolve([]),
      manualClientLeadIds.length
        ? client_leads.findAll({
            where: {
              is_active: 1,
              lead_id: { [Sequelize.Op.in]: manualClientLeadIds },
              booking_id: { [Sequelize.Op.ne]: null }
            },
            attributes: ['booking_id'],
            raw: true
          })
        : Promise.resolve([]),
    ]);

    const bookedBookingIds = Array.from(new Set([
      ...bookedSalesLeads.map((row) => Number(row.booking_id)).filter(Number.isFinite),
      ...bookedClientLeads.map((row) => Number(row.booking_id)).filter(Number.isFinite),
      ...manualPaidSalesLeads.map((row) => Number(row.booking_id)).filter(Number.isFinite),
      ...manualPaidClientLeads.map((row) => Number(row.booking_id)).filter(Number.isFinite),
      ...collectedPaymentSummaryRows.map((row) => Number(row.booking_id)).filter(Number.isFinite),
    ]));

    const paidOnlyFilter = {
      is_active: 1,
      ...clientProjectFilter,
      [Sequelize.Op.or]: [
        { payment_id: { [Sequelize.Op.ne]: null } },
        ...(bookedBookingIds.length > 0
          ? [{ stream_project_booking_id: { [Sequelize.Op.in]: bookedBookingIds } }]
          : []),
      ]
    };

    let whereConditions = { ...paidOnlyFilter, ...dateFilter };

    if (category && categoryConfig[category.toLowerCase()]) {
      const keywords = categoryConfig[category.toLowerCase()];
      const categoryConditions = keywords.map(word => ({
        project_name: { [Sequelize.Op.like]: `%${word}%` }
      }));
      whereConditions = {
        ...whereConditions,
        [Sequelize.Op.and]: [
          ...(whereConditions[Sequelize.Op.and] || []),
          { [Sequelize.Op.or]: categoryConditions }
        ]
      };
    }

    if (status) {
      const statusLower = String(status).toLowerCase().replace(/\s+/g, '');
      const dynamicStatusConditions = {
        initiated: {
          [Sequelize.Op.and]: [
            { status: 0 },
            {
              [Sequelize.Op.or]: [
                { event_date: null },
                Sequelize.where(Sequelize.fn('DATE', Sequelize.col('event_date')), { [Sequelize.Op.gt]: Sequelize.fn('CURDATE') })
              ]
            }
          ]
        },
        preproduction: {
          [Sequelize.Op.and]: [
            { status: 1 },
            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('event_date')), { [Sequelize.Op.gt]: Sequelize.fn('CURDATE') })
          ]
        },
        shootday: {
          [Sequelize.Op.and]: [
            { status: { [Sequelize.Op.notIn]: [3, 4, 5] } },
            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('event_date')), Sequelize.fn('CURDATE'))
          ]
        },
        postproduction: {
          [Sequelize.Op.or]: [
            { status: 2 },
            {
              [Sequelize.Op.and]: [
                { status: { [Sequelize.Op.in]: [0, 1] } },
                Sequelize.where(Sequelize.fn('DATE', Sequelize.col('event_date')), { [Sequelize.Op.lt]: Sequelize.fn('CURDATE') })
              ]
            }
          ]
        },
        revision: { status: 3 },
        completed: { status: 4 },
        assetsdelivered: { status: 4 },
        cancelled: {
          [Sequelize.Op.or]: [
            { status: 5 },
            { is_cancelled: 1 }
          ]
        }
      };

      if (dynamicStatusConditions[statusLower]) {
        whereConditions = {
          ...whereConditions,
          [Sequelize.Op.and]: [
            ...(whereConditions[Sequelize.Op.and] || []),
            dynamicStatusConditions[statusLower]
          ]
        };
      } else if (statusLower === 'upcoming') {
        whereConditions = {
          ...whereConditions,
          [Sequelize.Op.and]: [
            ...(whereConditions[Sequelize.Op.and] || []),
            { status: { [Sequelize.Op.notIn]: [3, 4, 5] } },
            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('event_date')), { [Sequelize.Op.gt]: Sequelize.fn('CURDATE') })
          ]
        };
      } else if (statusLower === 'draft') {
        whereConditions.is_draft = 1;
      }
    }

    if (event_type) whereConditions.event_type = event_type;
    
    if (search) {
      const searchCondition = Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('project_name')), { [Sequelize.Op.like]: `%${search.toLowerCase()}%` });
      whereConditions = {
        ...whereConditions,
        [Sequelize.Op.and]: [
          ...(whereConditions[Sequelize.Op.and] || []),
          searchCondition
        ]
      };
    }

    const [ total_active, total_cancelled, total_completed, total_upcoming, total_draft, allEventMasterTypes ] = await Promise.all([
      stream_project_booking.count({ where: { ...whereConditions, is_cancelled: 0, is_completed: 0, is_draft: 0 } }),
      stream_project_booking.count({ where: { ...whereConditions, is_cancelled: 1 } }),
      stream_project_booking.count({ where: { ...whereConditions, is_completed: 1 } }),
      stream_project_booking.count({ where: { ...whereConditions, is_cancelled: 0, is_draft: 0, event_date: { [Sequelize.Op.gt]: today } } }),
      stream_project_booking.count({ where: { ...whereConditions, is_draft: 1 } }),
      event_type_master.findAll({ attributes: ['event_type_id', 'event_type_name'], raw: true })
    ]);

    const projectRows = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [
        [Sequelize.literal(`CASE WHEN DATE(event_date) >= CURDATE() THEN 0 ELSE 1 END`), 'ASC'],
        [Sequelize.literal(`CASE WHEN DATE(event_date) >= CURDATE() THEN event_date END`), 'ASC'],
        [Sequelize.literal(`CASE WHEN DATE(event_date) < CURDATE() THEN event_date END`), 'DESC']
      ],
    });

    if (String(summary_only || '').toLowerCase() === 'true' || String(summary_only) === '1') {
      const projects = projectRows.map((project) => ({
        project: typeof project.toJSON === 'function' ? project.toJSON() : project,
      }));

      return res.status(200).json({
        error: false,
        message: 'Project summaries retrieved successfully',
        data: {
          stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
          projects,
          pagination: noPagination ? null : {
            page: pageNumber,
            limit: pageSize,
            totalRecords: projects.length,
          },
        },
      });
    }

    const shootNotesCountMap = await countActiveShootNotesByBookingIds(
      projectRows.map((project) => project.stream_project_booking_id)
    );

    let projectDetails = await Promise.all(projectRows.map(async (project) => {
      const shootNotesCount = shootNotesCountMap.get(Number(project.stream_project_booking_id)) || 0;
      const [assignedCrewData, assignedEquipData, assignedPostProdData, paymentData, formSubmission, bookingDaysData] = await Promise.all([
        assigned_crew.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [{ model: crew_members, as: 'crew_member', attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role'] }],
        }),
        assigned_equipment.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [{ model: equipment, as: 'equipment', attributes: ['equipment_id', 'equipment_name'] }],
        }),
        assigned_post_production_member.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [{ model: post_production_members, as: 'post_production_member', attributes: ['post_production_member_id', 'first_name', 'last_name', 'email'] }],
        }),
        payment_transactions.findOne({
          where: { payment_id: project.payment_id },
          attributes: ['total_amount']
        }),
        project_form_submissions.findOne({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          attributes: ['id'],
          order: [['created_at', 'DESC']],
          raw: true
        }),
        db.stream_project_booking_days.findAll({
          where: { stream_project_booking_id: project.stream_project_booking_id },
          attributes: ['event_date'],
          raw: true
        }),
      ]);

      const bookingPaymentSummary = collectedPaymentSummaryByBookingId.get(Number(project.stream_project_booking_id)) || null;
      const displayAmount = await resolveProjectDisplayAmount({
        project,
        paymentData,
      });
      const summaryPaidAmount = bookingPaymentSummary
        ? parseAmountCandidate(bookingPaymentSummary.paid_amount)
        : null;
      const summaryCreditUsedAmount = bookingPaymentSummary
        ? parseAmountCandidate(bookingPaymentSummary.credit_used_amount)
        : null;
      const summaryPendingAmount = bookingPaymentSummary
        ? parseAmountCandidate(bookingPaymentSummary.due_amount)
        : null;
      const summaryQuoteTotal = bookingPaymentSummary
        ? parseAmountCandidate(bookingPaymentSummary.quote_total)
        : null;
      const resolvedQuoteValueAmount = await resolveProjectTotalValueAmount({
        project,
        salesQuoteId: bookingPaymentSummary?.sales_quote_id || null,
      });
      const totalPaidAmount = summaryPaidAmount !== null
        ? summaryPaidAmount
        : (project.payment_id ? displayAmount : 0);
      const creditUsedAmount = summaryCreditUsedAmount || 0;
      const knownCollectedTotal = totalPaidAmount + creditUsedAmount + (summaryPendingAmount || 0);
      let totalValueAmount = Math.max(
        summaryQuoteTotal || 0,
        resolvedQuoteValueAmount || 0,
        knownCollectedTotal || 0
      );
      const summaryPaymentStatus = String(bookingPaymentSummary?.payment_status || '').toLowerCase();
      const isNoPaymentDueSummary =
        Boolean(bookingPaymentSummary) &&
        summaryPaymentStatus === 'no_payment_due' &&
        (summaryPendingAmount || 0) <= 0 &&
        totalPaidAmount <= 0 &&
        creditUsedAmount <= 0;
      const shouldUseCalculatedBookingPricing =
        totalValueAmount <= totalPaidAmount ||
        (summaryQuoteTotal === null && (!resolvedQuoteValueAmount || resolvedQuoteValueAmount <= 0)) ||
        isNoPaymentDueSummary;

      if (shouldUseCalculatedBookingPricing) {
        const projectedPricing = await bookingPricingService.calculateBookingPricing({
          ...project.toJSON(),
          booking_days: bookingDaysData
        });
        const projectedTotal = parseAmountCandidate(projectedPricing?.total);
        const projectedSubtotal = parseAmountCandidate(projectedPricing?.subtotal);
        if (isNoPaymentDueSummary && projectedSubtotal !== null && projectedSubtotal > totalValueAmount) {
          totalValueAmount = projectedSubtotal;
        } else if (projectedTotal !== null && projectedTotal > totalValueAmount) {
          totalValueAmount = projectedTotal;
        }
      }
      const pendingAmount = bookingPaymentSummary
        ? Math.max(summaryPendingAmount || 0, 0)
        : Math.max(totalValueAmount - totalPaidAmount - creditUsedAmount, 0);
      const paymentStatus = pendingAmount > 0 && totalPaidAmount > 0
        ? 'partially_paid'
        : String(
            bookingPaymentSummary?.payment_status ||
            (project.payment_id ? 'paid' : (totalPaidAmount > 0 ? 'partially_paid' : 'pending'))
          ).toLowerCase();

      const rawTypes = project.event_type ? project.event_type.split(',') : [];
      const formattedTypes = rawTypes.map(t => {
        const val = t.trim();
        const masterMatch = allEventMasterTypes.find(m => String(m.event_type_id) === val);
        if (masterMatch) return masterMatch.event_type_name;
        const stringMap = { 'videographer': 'Videography', 'photographer': 'Photography' };
        return stringMap[val.toLowerCase()] || val.charAt(0).toUpperCase() + val.slice(1);
      });

      const timelineStatus = bookingTimelineService.getTimelineStage(project);
      const timelineLabel = bookingTimelineService.getTimelineLabel(timelineStatus);
      const projectJson = {
        ...project.toJSON(),
        booking_days: bookingDaysData
      };

      return {
        project: {
          ...projectJson,
          total_paid_amount: totalPaidAmount,
          total_value_amount: totalValueAmount,
          paid_amount: totalPaidAmount,
          pending_amount: pendingAmount,
          due_amount: pendingAmount,
          credit_used_amount: summaryCreditUsedAmount || 0,
          payment_status: paymentStatus,
          notes_count: shootNotesCount,
          event_type_labels: formattedTypes.join(', '),
          timeline_status: timelineStatus,
          timeline_label: timelineLabel,
          needs_attention: buildShootNeedsAttention(projectJson, formSubmission),
          event_location: (() => {
            const loc = project.event_location;
            if (!loc) return null;
            try {
              if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
                const parsed = JSON.parse(loc);
                return parsed.address || parsed;
              }
            } catch (e) { return loc; }
            return loc;
          })()
        },
        assignedCrew: assignedCrewData,
        assignedEquipment: assignedEquipData,
        assignedPostProductionMembers: assignedPostProdData,
      };
    }));

    if (cp_assignment && cp_assignment !== 'all') {
      const normalizedCpAssignment = String(cp_assignment).toLowerCase().trim();
      projectDetails = projectDetails.filter((entry) => {
        const assignedCrew = Array.isArray(entry?.assignedCrew) ? entry.assignedCrew : [];
        const selectedCrewIds = Array.isArray(entry?.project?.selected_crew_ids) ? entry.project.selected_crew_ids : [];
        const hasAssigned = assignedCrew.length > 0 || selectedCrewIds.length > 0;

        if (normalizedCpAssignment === 'assigned') return hasAssigned;
        if (normalizedCpAssignment === 'not_assigned') return !hasAssigned;
        return true;
      });
    }

    if (production_filter && production_filter !== 'all') {
      const normalizedProductionFilter = String(production_filter).toLowerCase().trim();
      const authHeader = req.headers?.authorization || null;
      const bookingIds = Array.from(
        new Set(
          projectDetails
            .map((entry) => Number(entry?.project?.stream_project_booking_id || 0))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );

      const needsMeetingData =
        normalizedProductionFilter === 'pre_production_meeting_not_done' ||
        normalizedProductionFilter === 'post_production_meeting_not_done';
      const needsPreFileData = normalizedProductionFilter === 'pre_production_file_not_provided';
      const needsPostFileData = normalizedProductionFilter === 'post_production_file_not_uploaded';

      const [meetingsByBookingId, preFileFlags, postFileFlags] = await Promise.all([
        needsMeetingData ? fetchExternalMeetingsByBookingIds(bookingIds, { authHeader }) : Promise.resolve(new Map()),
        (async () => {
          if (!needsPreFileData) return new Map();
          const map = new Map();
          await Promise.all(
            bookingIds.map(async (bookingId) => {
              map.set(bookingId, await hasExternalWorkspaceFiles(bookingId, 'pre', { authHeader }));
            })
          );
          return map;
        })(),
        (async () => {
          if (!needsPostFileData) return new Map();
          const map = new Map();
          await Promise.all(
            bookingIds.map(async (bookingId) => {
              map.set(bookingId, await hasExternalWorkspaceFiles(bookingId, 'post', { authHeader }));
            })
          );
          return map;
        })(),
      ]);

      projectDetails = projectDetails.filter((entry) => {
        const booking = entry?.project;
        if (!booking) return false;
        const bookingId = Number(booking.stream_project_booking_id || 0);
        const bookingMeetings = meetingsByBookingId.get(String(bookingId)) || meetingsByBookingId.get(bookingId) || [];

        if (normalizedProductionFilter === 'pre_production_file_not_provided') {
          return preFileFlags.get(bookingId) !== true;
        }

        if (normalizedProductionFilter === 'pre_production_meeting_not_done') {
          return !hasScheduledMeetingOfType(bookingMeetings, 'pre_production');
        }

        if (normalizedProductionFilter === 'post_production_meeting_not_done') {
          if (!isPostProductionEligible(booking)) return false;
          return !hasScheduledMeetingOfType(bookingMeetings, 'post_production');
        }

        if (normalizedProductionFilter === 'post_production_file_not_uploaded') {
          if (!isPostProductionEligible(booking)) return false;
          return postFileFlags.get(bookingId) !== true;
        }

        return true;
      });
    }

    const filteredTotalRecords = projectDetails.length;

    return res.status(200).json({
      error: false,
      message: 'Filtered project details retrieved successfully',
      data: {
        stats: { total_active, total_cancelled, total_completed, total_upcoming, total_draft },
        projects: projectDetails,
        pagination: noPagination ? null : {
            page: pageNumber,
            limit: pageSize,
            totalRecords: filteredTotalRecords,
        }
      },
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};

exports.getUpcomingEvents = async (req, res) => {
  try {
    const { search, event_type, status } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereConditions = {
      is_cancelled: 0,
      is_draft: 0,
      event_date: { [Sequelize.Op.gt]: today }
    };

    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn("LOWER", Sequelize.col("project_name")),
        {
          [Sequelize.Op.like]: `%${search.toLowerCase()}%`,
        }
      );
    }

    if (event_type && event_type !== "all") {
      whereConditions.event_type = event_type;
    }

    if (status && status !== "all") {
      switch (status) {
        case "cancelled":
          whereConditions.is_cancelled = 1;
          break;
        case "completed":
          whereConditions.is_completed = 1;
          break;
        case "upcoming":
          break;
        case "draft":
          whereConditions.is_draft = 1;
          break;
      }
    }

    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      order: [["event_date", "ASC"]],
    });

    if (!projects.length) {
      return res.status(200).json({
        error: false,
        message: "No upcoming events found",
        data: { projects: [] },
      });
    }

    const projectDetails = await Promise.all(
      projects.map(async (project) => {
        const assignedCrew = await assigned_crew.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [
            {
              model: crew_members,
              as: "crew_member",
              attributes: ["crew_member_id", "first_name", "last_name", "primary_role"],
            },
          ],
        });

        const assignedEquipment = await assigned_equipment.findAll({
          where: { project_id: project.stream_project_booking_id, is_active: 1 },
          include: [
            {
              model: equipment,
              as: "equipment",
              attributes: ["equipment_id", "equipment_name"],
            },
          ],
        });

        return {
          project: {
            ...project.toJSON(),
            event_location: (() => {
              const loc = project.event_location;
              if (!loc) return null;

              if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
                try {
                  const parsed = JSON.parse(loc);
                  return parsed.address || parsed || loc;
                } catch {
                  return loc;
                }
              }

              return loc;
            })()
          },
          assignedCrew,
          assignedEquipment,
        };

      })
    );

    return res.status(200).json({
      error: false,
      message: "Upcoming events fetched successfully",
      data: {
        total_upcoming: projectDetails.length,
        projects: projectDetails,
      },
    });
  } catch (error) {
    console.error("Error in getUpcomingEvents:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
};


exports.getProjectStats = async (req, res) => {
  try {
    const today = new Date();

    const [
      total_active,
      total_cancelled,
      total_completed,
      total_upcoming
    ] = await Promise.all([

      stream_project_booking.count({
        where: {
          is_active: 1,
          is_cancelled: 0,
          is_completed: 0
        }
      }),

      stream_project_booking.count({
        where: {
          is_cancelled: 1
        }
      }),

      stream_project_booking.count({
        where: {
          is_completed: 1
        }
      }),

      stream_project_booking.count({
        where: {
          is_cancelled: 0,
          event_date: {
            [Sequelize.Op.gt]: today
          }
        }
      }),

    ]);

    return res.status(200).json({
      error: false,
      message: "Project stats fetched successfully",
      data: {
        total_active,
        total_cancelled,
        total_completed,
        total_upcoming
      }
    });

  } catch (error) {
    console.error("Project Stats Error:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
    });
  }
};


exports.getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activities = [];

    // Fetch recent requirements/projects (with created_at timestamp)
    const recentProjects = await stream_project_booking.findAll({
      where: { is_active: 1 },
      attributes: ['stream_project_booking_id', 'project_name', 'event_location', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    recentProjects.forEach(project => {
      let locationText = 'Unknown location';
      try {
        const locationData = JSON.parse(project.event_location);
        locationText = locationData.address || locationData.name || 'Unknown location';
      } catch (e) {
        locationText = project.event_location || 'Unknown location';
      }

      activities.push({
        type: 'requirement',
        title: 'New Requirement Created',
        description: `${project.project_name} at ${locationText}`,
        timestamp: project.created_at,
        icon: 'FileText',
        metadata: {
          project_id: project.stream_project_booking_id,
          project_name: project.project_name
        }
      });
    });

    // Fetch recent equipment assignments
    const recentEquipmentAssignments = await equipment_assignments.findAll({
      where: { is_active: 1 },
      attributes: ['assignment_id', 'equipment_id', 'project_id', 'crew_member_id', 'check_out_date', 'created_at'],
      include: [
        {
          model: equipment,
          as: 'equipment',
          attributes: ['equipment_name']
        },
        {
          model: crew_members,
          as: 'crew_member',
          attributes: ['first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    recentEquipmentAssignments.forEach(assignment => {
      const equipmentName = assignment.equipment?.equipment_name || 'Unknown equipment';
      const crewName = assignment.crew_member
        ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}`
        : 'Unknown crew';

      activities.push({
        type: 'equipment',
        title: 'Equipment Assigned',
        description: `${equipmentName} assigned to ${crewName}`,
        timestamp: assignment.created_at,
        icon: 'Package',
        metadata: {
          assignment_id: assignment.assignment_id,
          equipment_id: assignment.equipment_id,
          crew_member_id: assignment.crew_member_id
        }
      });
    });

    // Fetch recent crew assignments
    const recentCrewAssignments = await assigned_crew.findAll({
      where: { is_active: 1 },
      attributes: ['id', 'project_id', 'crew_member_id', 'assigned_date', 'status'],
      include: [
        {
          model: crew_members,
          as: 'crew_member',
          attributes: ['first_name', 'last_name', 'primary_role']
        },
        {
          model: stream_project_booking,
          as: 'project',
          attributes: ['project_name']
        }
      ],
      order: [['assigned_date', 'DESC']],
      limit: limit
    });

    recentCrewAssignments.forEach(assignment => {
      const crewName = assignment.crew_member
        ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}`
        : 'Unknown crew';
      const role = assignment.crew_member?.primary_role || 'Crew member';
      const projectName = assignment.project?.project_name || 'Unknown project';

      activities.push({
        type: 'crew',
        title: 'Crew Assigned',
        description: `${crewName} (${role}) assigned to ${projectName}`,
        timestamp: assignment.assigned_date,
        icon: 'Users',
        metadata: {
          assignment_id: assignment.id,
          crew_member_id: assignment.crew_member_id,
          project_id: assignment.project_id
        }
      });
    });

    // Fetch recent tasks
    const recentTasks = await tasks.findAll({
      where: { is_active: 1 },
      attributes: ['assign_task_id', 'title', 'assigned_to', 'status', 'created_at'],
      include: [
        {
          model: crew_members,
          as: 'assigned_to_crew_member',
          attributes: ['first_name', 'last_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit
    });

    recentTasks.forEach(task => {
      const assigneeName = task.crew_member
        ? `${task.crew_member.first_name} ${task.crew_member.last_name}`
        : 'Unknown assignee';

      activities.push({
        type: 'task',
        title: 'Task Assigned',
        description: `"${task.title}" assigned to ${assigneeName}`,
        timestamp: task.created_at,
        icon: 'CheckSquare',
        metadata: {
          task_id: task.assign_task_id,
          assigned_to: task.assigned_to,
          status: task.status
        }
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the most recent 'limit' activities
    const limitedActivities = activities.slice(0, limit);

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Recent activities retrieved successfully',
      data: limitedActivities,
      total: limitedActivities.length
    });

  } catch (error) {
    console.error('Get Recent Activity Error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getActiveProjects = async (req, res) => {
  try {
    const { search, category, status, date } = req.query;

    let whereConditions = {};

    // Search filter: case-insensitive text search in project_name and event_location
    if (search) {
      whereConditions[Op.or] = [
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('project_name')),
          {
            [Op.like]: `%${search.toLowerCase()}%`
          }
        ),
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('event_location')),
          {
            [Op.like]: `%${search.toLowerCase()}%`
          }
        )
      ];
    }

    // Category filter (event_type)
    if (category && category !== 'all') {
      whereConditions.event_type = category;
    }

    // Status filter - when no status specified, return ALL projects for dashboard map
    if (status) {
      switch (status.toLowerCase()) {
        case 'cancelled':
          whereConditions.is_cancelled = 1;
          break;
        case 'completed':
          whereConditions.is_completed = 1;
          break;
        case 'draft':
          whereConditions.is_draft = 1;
          break;
        case 'active':
          whereConditions.is_active = 1;
          whereConditions.is_cancelled = 0;
          whereConditions.is_completed = 0;
          whereConditions.is_draft = 0;
          break;
        default:
          break;
      }
    }

    // Date filter
    if (date) {
      if (date.toLowerCase() === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        whereConditions.event_date = {
          [Op.gte]: today,
          [Op.lt]: tomorrow
        };
      } else {
        // Support specific date format (YYYY-MM-DD)
        try {
          const specificDate = new Date(date);
          if (!isNaN(specificDate.getTime())) {
            specificDate.setHours(0, 0, 0, 0);
            const nextDay = new Date(specificDate);
            nextDay.setDate(nextDay.getDate() + 1);

            whereConditions.event_date = {
              [Op.gte]: specificDate,
              [Op.lt]: nextDay
            };
          }
        } catch (e) {
          console.error('Invalid date format:', e);
        }
      }
    }

    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      attributes: [
        'stream_project_booking_id',
        'project_name',
        'description',
        'event_type',
        'event_date',
        'duration_hours',
        'budget',
        'expected_viewers',
        'stream_quality',
        'crew_size_needed',
        'event_location',
        'streaming_platforms',
        'crew_roles',
        'skills_needed',
        'equipments_needed',
        'is_active',
        'is_cancelled',
        'is_completed',
        'is_draft',
        'created_at'
      ],
      order: [['created_at', 'DESC']]
    });

    // Fetch assigned crew counts for all projects
    const crewAssignments = await assigned_crew.findAll({
      attributes: [
        'project_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'crew_count']
      ],
      where: { is_active: 1 },
      group: ['project_id']
    });

    // Create a map of project_id to crew count
    const crewCountMap = {};
    crewAssignments.forEach(assignment => {
      const assignmentData = assignment.toJSON();
      crewCountMap[assignmentData.project_id] = parseInt(assignmentData.crew_count) || 0;
    });

    const transformedProjects = projects.map(project => {
      const projectData = project.toJSON();

      // Parse event_location if it's a JSON string
      if (projectData.event_location) {
        try {
          projectData.location_data = JSON.parse(projectData.event_location);
        } catch (e) {
          projectData.location_data = null;
        }
      }

      // Parse JSON arrays
      projectData.streaming_platforms = toArray(projectData.streaming_platforms);
      projectData.crew_roles = toArray(projectData.crew_roles);
      projectData.skills_needed = toArray(projectData.skills_needed);
      projectData.equipments_needed = toArray(projectData.equipments_needed);

      // Add assigned crew count
      projectData.assignedCrewCount = crewCountMap[projectData.stream_project_booking_id] || 0;

      return projectData;
    });

    return res.status(200).json({
      error: false,
      message: 'Active projects retrieved successfully',
      data: transformedProjects,
      filters: { search, category, status, date }
    });
  } catch (error) {
    console.error('Error fetching active projects:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

exports.createProjectBrief = async (req, res) => {
  try {
    const {
      project_id,
      brief_title,
      project_overview,
      event_time,
      event_date,
      call_time_schedule,
      key_deliverables,
      special_instructions,
      main_contact_name,
      contact_phone,
      contact_email,
      assigned_crew,
      assigned_equipment
    } = req.body;

    const brief = await project_brief.create({
      project_id,
      brief_title,
      project_overview,
      event_time,
      event_date,
      call_time_schedule,
      key_deliverables,
      special_instructions,
      main_contact_name,
      contact_phone,
      contact_email,

      assigned_crew:
        typeof assigned_crew === "string"
          ? assigned_crew
          : JSON.stringify(assigned_crew),

      assigned_equipment:
        typeof assigned_equipment === "string"
          ? assigned_equipment
          : JSON.stringify(assigned_equipment),
    });

    res.json({
      error: false,
      message: "Project brief saved",
      data: brief
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: "Internal error" });
  }
};

// exports.createCrewMember = [
//   upload.fields([ 
//     { name: 'profile_photo', maxCount: 1 },
//     { name: 'resume', maxCount: 1 },
//     { name: 'certifications', maxCount: 10 },
//     { name: 'portfolio', maxCount: 1 }
//   ]),

//   async (req, res) => {
//     try {
//       const {
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills,
//         availability,
//         equipment_ownership,
//         working_distance
//       } = req.body;

//       if (!first_name || !last_name || !email) {
//         return res.status(constants.BAD_REQUEST.code).json({
//           error: true,
//           code: constants.BAD_REQUEST.code,
//           message: 'First name, last name, and email are required',
//           data: null,
//         });
//       }

//       const skillsArr = skills ? JSON.stringify(skills) : '[]';

//       const availabilityArr = toArray(availability);
//       const equipmentOwnershipArr = toArray(equipment_ownership);

//       const newCrewMember = await crew_members.create({
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills: skillsArr,
//         availability: JSON.stringify(availabilityArr),
//         equipment_ownership: JSON.stringify(equipmentOwnershipArr),
//         working_distance,
//         is_active: 1,
//       });

//       const filePaths = await S3UploadFiles(req.files);
//       console.log("filePaths------------------", filePaths);

//       for (let fileData of filePaths) {
//         await crew_member_files.create({
//           crew_member_id: newCrewMember.crew_member_id,
//           file_type: fileData.file_type,
//           file_path: fileData.file_path,
//         });
//       }

//       return res.status(constants.CREATED.code).json({
//         error: false,
//         code: constants.CREATED.code,
//         message: 'Crew member created successfully',
//         data: { crew_member_id: newCrewMember.crew_member_id, crew_member: newCrewMember },
//       });
//     } catch (error) {
//       console.error('Create Crew Member Error:', error);
//       return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//         error: true,
//         code: constants.INTERNAL_SERVER_ERROR.code,
//         message: constants.INTERNAL_SERVER_ERROR.message,
//         data: null,
//       });
//     }
//   },
// ];

// exports.createCrewMember = [
//   upload.fields([
//     { name: 'profile_photo', maxCount: 1 },
//     { name: 'resume', maxCount: 1 },
//     { name: 'certifications', maxCount: 10 },
//     { name: 'portfolio', maxCount: 1 }
//   ]),

//   async (req, res) => {
//     try {
//       const {
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills,
//         availability,
//         equipment_ownership,
//         working_distance,

//         is_draft = 0
//       } = req.body;

//       let equipmentOwnershipArr = equipment_ownership;

//       if (typeof equipmentOwnershipArr === 'string') {
//         try {
//           equipmentOwnershipArr = JSON.parse(equipmentOwnershipArr);
//         } catch (error) {
//           return res.status(constants.BAD_REQUEST.code).json({
//             error: true,
//             code: constants.BAD_REQUEST.code,
//             message: 'Invalid format for equipment ownership.',
//             data: null,
//           });
//         }
//       }

//       equipmentOwnershipArr = Array.isArray(equipmentOwnershipArr)
//         ? equipmentOwnershipArr
//         : [equipmentOwnershipArr];

//       if (!first_name || !last_name || !email) {
//         return res.status(constants.BAD_REQUEST.code).json({
//           error: true,
//           code: constants.BAD_REQUEST.code,
//           message: 'First name, last name, and email are required',
//           data: null,
//         });
//       }

//       const skillsArr = skills ? JSON.stringify(skills) : '[]';
//       const availabilityArr = toArray(availability);

//       console.log('Equipment Ownership Array:', equipmentOwnershipArr);

//       const equipmentNames = await equipment.findAll({
//         where: {
//           equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr }
//         },
//         attributes: ['equipment_id', 'equipment_name']
//       });

//       console.log('Valid Equipment Names from the Database:', equipmentNames);

//       const validEquipmentDetails = equipmentNames.map(item => ({
//         equipment_id: item.equipment_id,
//         equipment_name: item.equipment_name
//       }));

//       const invalidEquipmentNames = equipmentOwnershipArr.filter(name =>
//         !validEquipmentDetails.some(item => item.equipment_name === name)
//       );

//       if (invalidEquipmentNames.length > 0) {
//         return res.status(constants.BAD_REQUEST.code).json({
//           error: true,
//           code: constants.BAD_REQUEST.code,
//           message: `Invalid equipment: ${invalidEquipmentNames.join(', ')}`,
//           data: null,
//         });
//       }

//       const newCrewMember = await crew_members.create({
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         primary_role,
//         years_of_experience,
//         hourly_rate,
//         bio,
//         skills: skillsArr,
//         availability: JSON.stringify(availabilityArr),
//         equipment_ownership: JSON.stringify(equipmentOwnershipArr),
//         working_distance,

//         is_draft: is_draft == 1 ? 1 : 0,
//         is_active: 1,
//       });

//       const filePaths = await S3UploadFiles(req.files);
//       console.log("filePaths------------------", filePaths);

//       for (let fileData of filePaths) {
//         await crew_member_files.create({
//           crew_member_id: newCrewMember.crew_member_id,
//           file_type: fileData.file_type,
//           file_path: fileData.file_path,
//         });
//       }

//       return res.status(constants.CREATED.code).json({
//         error: false,
//         code: constants.CREATED.code,
//         message: 'Crew member created successfully',
//         data: {
//           crew_member_id: newCrewMember.crew_member_id,
//           crew_member: newCrewMember,
//           equipment_details: validEquipmentDetails
//         },
//       });

//     } catch (error) {
//       console.error('Create Crew Member Error:', error);
//       return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//         error: true,
//         code: constants.INTERNAL_SERVER_ERROR.code,
//         message: constants.INTERNAL_SERVER_ERROR.message,
//         data: null,
//       });
//     }
//   },
// ];


exports.createCrewMember = [
  upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'certifications', maxCount: 10 },
    { name: 'portfolio', maxCount: 1 },
    { name: 'recent_work', maxCount: undefined }
  ]),

  async (req, res) => {
    try {
      const {
        first_name,
        last_name,
        email,
        phone_number,
        location,
        primary_role,
        years_of_experience,
        hourly_rate,
        bio,
        skills,
        availability,
        equipment_ownership,
        working_distance,
        is_draft = 0
      } = req.body;

      let equipmentOwnershipArr = equipment_ownership;

      if (typeof equipmentOwnershipArr === 'string') {
        try {
          equipmentOwnershipArr = JSON.parse(equipmentOwnershipArr);
        } catch (error) {
          return res.status(constants.BAD_REQUEST.code).json({
            error: true,
            code: constants.BAD_REQUEST.code,
            message: 'Invalid format for equipment ownership.',
            data: null,
          });
        }
      }

      equipmentOwnershipArr = Array.isArray(equipmentOwnershipArr)
        ? equipmentOwnershipArr
        : [equipmentOwnershipArr];

      if (!first_name || !last_name || !email) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'First name, last name, and email are required',
          data: null,
        });
      }

      const skillsArr = skills ? JSON.stringify(skills) : '[]';
      const availabilityArr = toArray(availability);

      console.log('Equipment Ownership Array:', equipmentOwnershipArr);

      const equipmentNames = await equipment.findAll({
        where: {
          equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr }
        },
        attributes: ['equipment_id', 'equipment_name']
      });

      console.log('Valid Equipment Names from the Database:', equipmentNames);

      const validEquipmentDetails = equipmentNames.map(item => ({
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name
      }));

      const invalidEquipmentNames = equipmentOwnershipArr.filter(name =>
        !validEquipmentDetails.some(item => item.equipment_name === name)
      );

      if (invalidEquipmentNames.length > 0) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: `Invalid equipment: ${invalidEquipmentNames.join(', ')}`,
          data: null,
        });
      }

      const newCrewMember = await crew_members.create({
        first_name,
        last_name,
        email,
        phone_number,
        location,
        primary_role,
        years_of_experience,
        hourly_rate,
        bio,
        skills: skillsArr,
        availability: JSON.stringify(availabilityArr),
        equipment_ownership: JSON.stringify(equipmentOwnershipArr),
        working_distance,
        is_draft: is_draft == 1 ? 1 : 0,
        is_active: 1,
      });

      const filePaths = await S3UploadFiles(req.files);
      console.log("filePaths------------------", filePaths);

      for (let fileData of filePaths) {
        if (fileData.fieldname === 'recent_work') {
          await crew_member_files.create({
            crew_member_id: newCrewMember.crew_member_id,
            file_type: fileData.file_type,
            file_path: fileData.file_path,
            file_category: 'recent_work',
          });
        } else {
          await crew_member_files.create({
            crew_member_id: newCrewMember.crew_member_id,
            file_type: fileData.file_type,
            file_path: fileData.file_path,
          });
        }
      }

      return res.status(constants.CREATED.code).json({
        error: false,
        code: constants.CREATED.code,
        message: 'Crew member created successfully',
        data: {
          crew_member_id: newCrewMember.crew_member_id,
          crew_member: newCrewMember,
          equipment_details: validEquipmentDetails
        },
      });

    } catch (error) {
      console.error('Create Crew Member Error:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  },
];


// exports.getCrewMembers = async (req, res) => {
//   try {
//     let members = await crew_members.findAll({
//       where: { is_active: 1 },
//       include: [
//         {
//           model: crew_member_files,
//           as: 'crew_member_files',
//           attributes: ['crew_files_id', 'file_type', 'file_path']
//         }
//       ],
//       order: [
//         ['is_beige_member', 'ASC'],
//         ['crew_member_id', 'ASC']
//       ]
//     });

//     members = JSON.parse(JSON.stringify(members));

//     for (let m of members) {
//       let skillIds = [];

//       try {
//         if (m.skills) {
//           let once = JSON.parse(m.skills);
//           skillIds = JSON.parse(once);
//         }
//       } catch (e) {
//         skillIds = [];
//       }

//       const skillList = await skills_master.findAll({
//         where: { id: skillIds },
//         attributes: ['id', 'name']
//       });

//       m.skills = skillList;

//       const assignedTasks = await tasks.findAll({
//         where: {
//           assigned_to: m.crew_member_id,
//           is_active: 1
//         },
//         attributes: [
//           'assign_task_id',
//           'title',
//           'description',
//           'priority_id',
//           'category_id',
//           'due_date',
//           'due_time',
//           'estimated_duration',
//           'dependencies',
//           'additional_notes',
//           'checklist',
//           'status',
//           'created_at'
//         ],
//         order: [['assign_task_id', 'DESC']]
//       });

//       for (let t of assignedTasks) {
//         try {
//           t.dependencies = t.dependencies ? JSON.parse(t.dependencies) : [];
//         } catch {}
//         try {
//           t.checklist = t.checklist ? JSON.parse(t.checklist) : [];
//         } catch {}
//       }

//       m.assigned_tasks = assignedTasks;
//     }

//     return res.status(constants.OK.code).json({
//       error: false,
//       code: constants.OK.code,
//       message: "Crew members fetched successfully",
//       data: members
//     });

//   } catch (error) {
//     console.error("Get Crew Members Error:", error);
//     return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       error: true,
//       code: constants.INTERNAL_SERVER_ERROR.code,
//       message: constants.INTERNAL_SERVER_ERROR.message,
//       data: null,
//     });
//   }
// };

exports.getCrewMembers = async (req, res) => {
    try {
        let {
            page = 1,
            limit = 20,
            search,
            location,
            status,
            range,
            start_date,
            end_date
        } = req.body;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let conditions = [{ is_active: 1 }];

        if (status) {
            if (status === 'pending') conditions.push({ is_crew_verified: 0 });
            else if (status === 'approved') conditions.push({ is_crew_verified: 1 });
            else if (status === 'rejected') conditions.push({ is_crew_verified: 2 });
        }

        if (start_date && end_date) {
            conditions.push({
                'created_at': { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] }
            });
        } else if (range === 'month') {
            conditions.push(
                Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('crew_members.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
                Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('crew_members.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
            );
        }

          if (search) {
                    conditions.push({
                        [Sequelize.Op.or]: [
                            {
                                first_name: {
                                    [Sequelize.Op.like]: `%${search}%`
                                }
                            },
                            {
                                last_name: {
                                    [Sequelize.Op.like]: `%${search}%`
                                }
                            },
                            {
                                email: {
                                    [Sequelize.Op.like]: `%${search}%`
                                }
                            },
                            {
                                phone_number: {
                                    [Sequelize.Op.like]: `%${search}%`
                                }
                            },
                            Sequelize.where(
                                Sequelize.fn(
                                    "concat",
                                    Sequelize.col("first_name"),
                                    " ",
                                    Sequelize.col("last_name")
                                ),
                                {
                                    [Sequelize.Op.like]: `%${search}%`
                                }
                            )
                        ]
                    });
                }
        if (location) conditions.push({ location: { [Sequelize.Op.like]: `%${location}%` } });

        const [{ count, rows: members }, allRoles] = await Promise.all([
            crew_members.findAndCountAll({
                where: { [Sequelize.Op.and]: conditions },
                distinct: true,
                col: 'crew_member_id',
                include: [{
                    model: crew_member_files,
                    as: 'crew_member_files',
                    attributes: ['crew_files_id', 'file_type', 'file_path'],
                }],
                order: [
                    ['is_crew_verified', 'ASC'],
                    ['is_beige_member', 'ASC'],
                    ['crew_member_id', 'DESC'],
                ],
                limit,
                offset,
            }),
            crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
        ]);

        const crewUserIds = Array.from(
            new Set(
                members
                    .map((member) => Number(member.user_id))
                    .filter(Boolean)
            )
        );

        const affiliateRows = crewUserIds.length
            ? await affiliates.findAll({
                where: { user_id: { [Sequelize.Op.in]: crewUserIds } },
                attributes: ['user_id', 'referral_code'],
                raw: true
            })
            : [];

        const affiliateMap = new Map(
            affiliateRows.map((row) => [Number(row.user_id), row.referral_code || null])
        );

        const processedMembers = members.map((member) => {
            const memberData = member.get({ clone: true });

            let statusLabel = 'pending';
            if (member.is_crew_verified === 1) statusLabel = 'approved';
            else if (member.is_crew_verified === 2) statusLabel = 'rejected';

            let finalLocation = memberData.location;
            if (finalLocation && typeof finalLocation === 'string' && (finalLocation.startsWith('{') || finalLocation.startsWith('['))) {
                try {
                    const parsed = JSON.parse(finalLocation);
                    finalLocation = parsed.address || parsed || finalLocation;
                } catch { }
            }

            let roleNames = [];
            const rawRole = memberData.primary_role;
            if (rawRole) {
                let roleIds = [];
                try {
                    const parsed = JSON.parse(rawRole);
                    roleIds = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
                } catch (e) {
                    roleIds = [String(rawRole)];
                }
                roleNames = allRoles
                    .filter(r => roleIds.includes(String(r.role_id)))
                    .map(r => r.role_name);
            }

            return {
                ...memberData,
                referral_code: affiliateMap.get(Number(memberData.user_id)) || null,
                location: finalLocation,
                status: statusLabel,
                role: roleNames.length > 0 ? { role_name: roleNames.join(", ") } : null
            };
        });

        return res.status(200).json({
            error: false,
            message: "Crew members fetched successfully",
            pagination: {
                total_records: count,
                current_page: page,
                per_page: limit,
                total_pages: Math.ceil(count / limit),
            },
            data: processedMembers,
        });

    } catch (error) {
        console.error("Get Crew Members Error:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
    }
};

exports.verifyCrewMember = async (req, res) => {
  try {
    const { crew_member_id, status } = req.body;

    if (!crew_member_id || (status !== 1 && status !== 2)) {
      return res.status(400).json({
        error: true,
        message: "Missing or invalid 'crew_member_id' or 'status'.",
      });
    }

    const updatedMember = await crew_members.update(
      { is_crew_verified: status },
      { where: { crew_member_id } }
    );

    if (updatedMember[0] === 0) {
      return res.status(404).json({ error: true, message: "Crew member not found." });
    }

    try {
      if (status === 1) {
        await deleteSheetRow('Crew_data', crew_member_id);
      } else if (status === 2) {
        await updateSheetRow('Crew_data', crew_member_id, {
          'H': 'rejected'
        });
      }
    } catch (sheetErr) {
      console.error("Google Sheets Sync Error:", sheetErr.message);
    }

    return res.status(200).json({
      error: false,
      message: `Crew member ${status === 1 ? 'approved and removed from sheet' : 'rejected in sheet'} successfully.`,
    });
  } catch (error) {
    console.error("Verify Crew Member Error:", error);
    return res.status(500).json({ error: true, message: "Internal server error" });
  }
};


exports.getCrewMemberById = async (req, res) => {
    try {
        const { crew_member_id } = req.params;

        let member = await crew_members.findOne({
            where: { crew_member_id },
            include: [{
                model: crew_member_files,
                as: 'crew_member_files',
                attributes: ['crew_member_id', 'file_type', 'file_path', 'created_at', 'title', 'tag'],
                where: { is_active: 1 },
                required: false
            }]
        });

        if (!member) {
            return res.status(404).json({ error: true, message: "Crew member not found" });
        }

        const loc = member.location;
        if (loc && typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
            try {
                const parsed = JSON.parse(loc);
                member.location = parsed.address || parsed || loc;
            } catch { }
        }

        let skillIds = [];
        try {
            const rawSkills = member.skills;
            if (rawSkills) {
                const parsedSkills = typeof rawSkills === 'string' ? JSON.parse(rawSkills) : rawSkills;
                skillIds = Array.isArray(parsedSkills) ? parsedSkills.map(id => parseInt(id)) : [parseInt(parsedSkills)];
            }
        } catch (err) { skillIds = []; }

        let roleIds = [];
        try {
            const rawRole = member.primary_role;
            if (rawRole) {
                const parsedRole = (typeof rawRole === 'string' && (rawRole.startsWith('[') || rawRole.startsWith('{'))) 
                    ? JSON.parse(rawRole) 
                    : rawRole;
                roleIds = Array.isArray(parsedRole) ? parsedRole.map(id => String(id)) : [String(parsedRole)];
            }
        } catch (err) { roleIds = []; }

        const [skillList, roleList] = await Promise.all([
            skills_master.findAll({ where: { id: skillIds }, attributes: ['id', 'name'] }),
            crew_roles.findAll({ where: { role_id: roleIds }, attributes: ['role_id', 'role_name'] })
        ]);

        const memberJson = member.toJSON();
        memberJson.skills = skillList;
        memberJson.role = roleList.length > 0 
            ? { role_name: roleList.map(r => r.role_name).join(", ") } 
            : null;

        return res.status(200).json({
            error: false,
            message: "Crew member fetched successfully",
            data: memberJson,
        });

    } catch (error) {
        console.error("Get Crew Member By ID Error:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
    }
};


exports.deleteCrewMember = async (req, res) => {
  try {
    const { crew_member_id } = req.params;

    const member = await crew_members.findOne({ where: { crew_member_id } });

    if (!member) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: "Crew member not found",
        data: null,
      });
    }

    await crew_members.update(
      { is_active: 0 },
      { where: { crew_member_id } }
    );

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Crew member deleted successfully",
      data: { crew_member_id }
    });

  } catch (error) {
    console.error("Delete Crew Member Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.updateCrewMember = [
  upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'certifications', maxCount: 10 },
    { name: 'portfolio', maxCount: 1 },
    { name: 'recent_work', maxCount: undefined }
  ]),

  async (req, res) => {
    try {
      const { crew_member_id } = req.params;

      const member = await crew_members.findOne({
        where: { crew_member_id }
      });

      if (!member) {
        return res.status(constants.NOT_FOUND.code).json({
          error: true,
          code: constants.NOT_FOUND.code,
          message: "Crew member not found",
          data: null,
        });
      }

      const {
        first_name,
        last_name,
        email,
        phone_number,
        location,
        primary_role,
        years_of_experience,
        hourly_rate,
        bio,
        skills,
        availability,
        equipment_ownership,
        working_distance
      } = req.body;

      let equipmentOwnershipArr = equipment_ownership;

      if (typeof equipmentOwnershipArr === 'string') {
        try {
          equipmentOwnershipArr = JSON.parse(equipmentOwnershipArr);
        } catch (error) {
          return res.status(constants.BAD_REQUEST.code).json({
            error: true,
            code: constants.BAD_REQUEST.code,
            message: 'Invalid format for equipment ownership.',
            data: null,
          });
        }
      }

      equipmentOwnershipArr = Array.isArray(equipmentOwnershipArr) ? equipmentOwnershipArr : [equipmentOwnershipArr];

      const equipmentNames = await equipment.findAll({
        where: {
          equipment_name: { [Sequelize.Op.in]: equipmentOwnershipArr }
        },
        attributes: ['equipment_id', 'equipment_name']
      });

      const validEquipmentDetails = equipmentNames.map(item => ({
        equipment_id: item.equipment_id,
        equipment_name: item.equipment_name
      }));

      const invalidEquipmentNames = equipmentOwnershipArr.filter(name =>
        !validEquipmentDetails.some(item => item.equipment_name === name)
      );

      if (invalidEquipmentNames.length > 0) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: `The following equipment names are invalid: ${invalidEquipmentNames.join(', ')}`,
          data: null,
        });
      }

      const skillsJson = skills ? JSON.stringify(skills) : member.skills;
      const availabilityJson = availability ? JSON.stringify(toArray(availability)) : member.availability;

      await crew_members.update(
        {
          first_name,
          last_name,
          email,
          phone_number,
          location,
          primary_role,
          years_of_experience,
          hourly_rate,
          bio,
          skills: skillsJson,
          availability: availabilityJson,
          equipment_ownership: JSON.stringify(equipmentOwnershipArr),
          working_distance: working_distance ?? member.working_distance
        },
        { where: { crew_member_id } }
      );

      const filePaths = await S3UploadFiles(req.files);

      for (let fileData of filePaths) {
        if (fileData.fieldname === 'recent_work') {
          const existingRecentWork = await crew_member_files.findOne({
            where: {
              crew_member_id,
              file_type: 'recent_work'
            }
          });

          if (existingRecentWork) {
            await crew_member_files.update(
              { file_path: fileData.file_path },
              { where: { crew_files_id: existingRecentWork.crew_files_id } }
            );
          } else {
            await crew_member_files.create({
              crew_member_id,
              file_type: 'recent_work',
              file_path: fileData.file_path
            });
          }
        } else {
          const existing = await crew_member_files.findOne({
            where: {
              crew_member_id,
              file_type: fileData.file_type
            }
          });

          if (existing) {
            await crew_member_files.update(
              { file_path: fileData.file_path },
              { where: { crew_files_id: existing.crew_files_id } }
            );
          } else {
            await crew_member_files.create({
              crew_member_id,
              file_type: fileData.file_type,
              file_path: fileData.file_path
            });
          }
        }
      }

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: "Crew member updated successfully",
        data: { crew_member_id, equipment_details: validEquipmentDetails }
      });

    } catch (error) {
      console.error('Update Crew Member Error:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  }
];

exports.createTask = async (req, res) => {
  try {
    const {
      title,
      description,

      priority_id,
      category_id,

      due_date,
      due_time,
      estimated_duration,

      dependencies,
      additional_notes,

      assigned_to,
      send_sms,
      send_email,

      checklist,
      status
    } = req.body;

    if (!title || !assigned_to) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: "Title and Assigned To are required",
        data: null,
      });
    }

    const member = await crew_members.findOne({
      where: {
        crew_member_id: assigned_to,
        is_active: 1
      }
    });

    if (!member) {
      return res.status(constants.OK.code).json({
        error: true,
        code: constants.OK.code,
        message: "Assigned crew member does not exist or is inactive",
        data: null,
      });
    }

    const newTask = await tasks.create({
      title,
      description,

      priority_id,
      category_id,

      due_date,
      due_time,
      estimated_duration,

      dependencies: dependencies ? JSON.stringify(dependencies) : null,
      additional_notes,

      assigned_to,
      send_sms: send_sms ?? 0,
      send_email: send_email ?? 0,

      checklist: checklist ? JSON.stringify(checklist) : null,
      status: status || 'assigned',

      is_active: 1
    });

    if (send_email === 1 || send_email === true) {
      try {
        const taskData = {
          assign_task_id: newTask.assign_task_id,
          title: newTask.title,
          description: newTask.description,
          priority_id: newTask.priority_id,
          due_date: newTask.due_date,
          due_time: newTask.due_time,
          estimated_duration: newTask.estimated_duration,
          additional_notes: newTask.additional_notes,
          status: newTask.status
        };

        const assigneeData = {
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email
        };

        await sendTaskAssignmentEmail(taskData, assigneeData);
        console.log(`Email notification sent to ${member.email} for task: ${newTask.title}`);
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the task creation if email fails, just log it
      }
    }

    return res.status(constants.CREATED.code).json({
      error: false,
      code: constants.CREATED.code,
      message: "Task created successfully",
      data: newTask
    });

  } catch (error) {
    console.error("Create Task Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null,
    });
  }
};

exports.createEquipment = [
  upload.fields([
    { name: 'photos' },
    { name: 'manual' },
    { name: 'warranty' }
  ]),

  async (req, res) => {
    try {
      const {
        equipment_name,
        category_id,
        manufacturer,
        model_number,
        serial_number,
        description,

        storage_location,
        initial_status_id,

        purchase_price,
        daily_rental_rate,
        purchase_date,

        last_maintenance_date,
        next_maintenance_due,

        specs,
        accessories,

        is_draft = 0
      } = req.body;

      if (!equipment_name || !category_id) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: "equipment_name and category_id are required",
          data: null,
        });
      }

      const specsArr = toArray(specs);
      const accessoriesArr = toArray(accessories);

      const eq = await equipment.create({
        equipment_name,
        category_id,
        manufacturer,
        model_number,
        serial_number,
        description,

        storage_location,
        initial_status_id,

        purchase_price,
        daily_rental_rate,
        purchase_date,

        last_maintenance_date,
        next_maintenance_due,

        is_draft: is_draft == 1 ? 1 : 0,
        is_active: 1
      });

      if (specsArr.length > 0) {
        for (let s of specsArr) {
          await equipment_specs.create({
            equipment_id: eq.equipment_id,
            spec_name: s.name,
            spec_value: s.value,
            is_active: 1
          });
        }
      }

      if (accessoriesArr.length > 0) {
        for (let a of accessoriesArr) {
          await equipment_accessories.create({
            equipment_id: eq.equipment_id,
            accessory_name: a,
            is_active: 1
          });
        }
      }

      const filePaths = await S3UploadFiles(req.files);

      const photos = filePaths.filter(f => f.file_type === 'photos');
      const manuals = filePaths.filter(f => f.file_type === 'manual');
      const warranties = filePaths.filter(f => f.file_type === 'warranty');

      for (let p of photos) {
        await equipment_photos.create({
          equipment_id: eq.equipment_id,
          file_url: p.file_path,
          is_active: 1
        });
      }

      if (manuals.length > 0) {
        await equipment_documents.create({
          equipment_id: eq.equipment_id,
          doc_type: 'manual',
          file_url: manuals[0].file_path,
          is_active: 1
        });
      }

      if (warranties.length > 0) {
        await equipment_documents.create({
          equipment_id: eq.equipment_id,
          doc_type: 'warranty',
          file_url: warranties[0].file_path,
          is_active: 1
        });
      }

      return res.status(constants.CREATED.code).json({
        error: false,
        code: constants.CREATED.code,
        message: "Equipment created successfully",
        data: { equipment_id: eq.equipment_id }
      });

    } catch (error) {
      console.error("Create Equipment Error:", error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  }
];


exports.getEquipment = async (req, res) => {
  try {
    const {
      search,
      category_id,
      location_id,
      limit = 50,
      page = 1
    } = req.query;

    // 1. Build the base filter
    let where = { is_active: 1 };
    
    if (search) {
      where[Op.or] = [
        { equipment_name: { [Op.like]: `%${search}%` } },
        { manufacturer: { [Op.like]: `%${search}%` } },
        { model_number: { [Op.like]: `%${search}%` } },
        { serial_number: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    if (category_id) where.category_id = category_id;
    if (location_id) where.storage_location_id = location_id;

    // 2. Define "Today" boundaries
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 3. GET ASSIGNMENTS FOR TODAY (Summing units from both tables)
    const inUseMap = {}; // equipment_id -> total_units_out

    // A. Random/Manual Assignments
    const directAssignments = await equipment_assignments.findAll({
      where: {
        check_out_date: { [Op.lte]: endOfToday },
        expected_return_date: { [Op.gte]: startOfToday },
        is_active: 1
      },
      attributes: ['equipment_id'],
      raw: true
    });
    directAssignments.forEach(a => {
      inUseMap[a.equipment_id] = (inUseMap[a.equipment_id] || 0) + 1;
    });

    // B. Project Based Assignments (Matched via stream_project_booking event_date)
    const projectAssignments = await assigned_equipment.findAll({
      where: { is_active: 1 },
      include: [{
        model: stream_project_booking,
        as: 'project', 
        where: { event_date: { [Op.between]: [startOfToday, endOfToday] } },
        attributes: []
      }],
      attributes: ['equipment_id'],
      raw: true
    });
    projectAssignments.forEach(a => {
      inUseMap[a.equipment_id] = (inUseMap[a.equipment_id] || 0) + 1;
    });

    // 4. CALCULATE GLOBAL SUMMARY (Calculated across all equipment matching filters)
    const allMatchingEquipment = await equipment.findAll({
      where,
      attributes: ['equipment_id', 'quantity', 'initial_status_id'],
      raw: true
    });

    let summaryStats = {
      total_equipment_types: allMatchingEquipment.length,
      available_equipment_types: 0,
      in_use_equipment_types: 0,
      maintenance_equipment_types: 0,
      // Raw unit counts
      total_units_count: 0,
      units_in_use_count: 0
    };

    allMatchingEquipment.forEach(item => {
      const unitsOut = inUseMap[item.equipment_id] || 0;
      const totalQty = parseInt(item.quantity) || 0;

      summaryStats.total_units_count += totalQty;
      summaryStats.units_in_use_count += unitsOut;

      // Type-based logic (What you asked for):
      // 1. Available Equipment: Count if at least one unit is NOT in use
      if (totalQty > unitsOut) {
        summaryStats.available_equipment_types++;
      }

      // 2. In Use Equipment: Count if at least one unit IS in use
      if (unitsOut > 0) {
        summaryStats.in_use_equipment_types++;
      }

      // 3. Maintenance Count (Status 2)
      if (item.initial_status_id == 2) {
        summaryStats.maintenance_equipment_types++;
      }
    });

    // 5. FETCH PAGINATED LIST
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const list = await equipment.findAll({
      where,
      include: [
        { model: equipment_photos, as: 'equipment_photos', attributes: ['photo_id', 'file_url'] },
        { model: equipment_documents, as: 'equipment_documents', attributes: ['document_id', 'doc_type', 'file_url'] },
        { model: equipment_specs, as: 'equipment_specs', attributes: ['spec_name', 'spec_value'] },
        { model: equipment_accessories, as: 'equipment_accessories', attributes: ['accessory_name'] }
      ],
      order: [['equipment_id', 'ASC']],
      limit: parseInt(limit),
      offset
    });

    // 6. PROCESS PAGINATED LIST
    const processedList = list.map(item => {
      const eq = item.toJSON();
      const unitsOut = inUseMap[eq.equipment_id] || 0;
      const totalQty = parseInt(eq.quantity) || 0;

      eq.units_in_use = unitsOut;
      eq.units_available = Math.max(0, totalQty - unitsOut);
      eq.is_available = (totalQty > unitsOut) ? 1 : 0; 

      if (eq.storage_location && typeof eq.storage_location === 'string' && (eq.storage_location.startsWith('{') || eq.storage_location.startsWith('['))) {
        try {
          const parsed = JSON.parse(eq.storage_location);
          eq.storage_location = parsed.address || parsed;
        } catch (e) {}
      }
      return eq;
    });

    return res.status(200).json({
      error: false,
      code: 200,
      summary: {
        // Equipment Type Counts (Count as 1 even if qty is 10)
        total_equipment: summaryStats.total_equipment_types,
        available_equipment: summaryStats.available_equipment_types,
        in_use_equipment: summaryStats.in_use_equipment_types,
        maintenance_equipment: summaryStats.maintenance_equipment_types,
        
        // Raw Unit Counts (Sum of all quantities)
        unit_summary: {
          total_units: summaryStats.total_units_count,
          units_in_use: summaryStats.units_in_use_count,
          units_available: summaryStats.total_units_count - summaryStats.units_in_use_count
        }
      },
      message: "Equipment fetched successfully",
      data: processedList
    });

  } catch (error) {
    console.error("Get Equipment Error:", error);
    return res.status(500).json({
      error: true,
      code: 500,
      message: "Internal Server Error",
      data: null
    });
  }
};

exports.getEquipmentById = async (req, res) => {
  try {
    const { equipment_id } = req.params;

    const item = await equipment.findOne({
      where: { equipment_id, is_active: 1 },
      include: [
        {
          model: equipment_photos,
          as: 'equipment_photos',
          attributes: ['photo_id', 'file_url', 'created_at']
        },
        {
          model: equipment_documents,
          as: 'equipment_documents',
          attributes: ['document_id', 'doc_type', 'file_url', 'created_at']
        },
        {
          model: equipment_specs,
          as: 'equipment_specs',
          attributes: ['spec_id', 'spec_name', 'spec_value']
        },
        {
          model: equipment_accessories,
          as: 'equipment_accessories',
          attributes: ['accessory_id', 'accessory_name']
        }
      ]
    });

    if (!item) {
      return res.status(constants.OK.code).json({
        error: true,
        code: constants.OK.code,
        message: "Equipment not found",
        data: null
      });
    }

    const loc = item.storage_location;

    if (loc) {
      if (typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          item.storage_location = parsed.address || parsed || loc;
        } catch {
          item.storage_location = loc;
        }
      } else {
        item.storage_location = loc;
      }
    }

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment fetched successfully",
      data: item
    });

  } catch (error) {
    console.error("Get Equipment by ID Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.deleteEquipment = async (req, res) => {
  try {
    const { equipment_id } = req.params;

    const equipmentItem = await equipment.findOne({
      where: { equipment_id, is_active: 1 }
    });

    if (!equipmentItem) {
      return res.status(constants.OK.code).json({
        error: true,
        code: constants.OK.code,
        message: "Equipment not found or already deleted",
        data: null
      });
    }

    await equipment.update(
      { is_active: 0 },
      { where: { equipment_id } }
    );

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment deleted successfully",
      data: { equipment_id }
    });

  } catch (error) {
    console.error("Delete Equipment Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.updateEquipment = [
  upload.fields([
    { name: 'photos' },
    { name: 'manual' },
    { name: 'warranty' }
  ]),

  async (req, res) => {
    try {
      const { equipment_id } = req.params;

      const {
        equipment_name,
        category_id,
        manufacturer,
        model_number,
        serial_number,
        description,
        storage_location_id,
        initial_status_id,
        purchase_price,
        daily_rental_rate,
        purchase_date,
        last_maintenance_date,
        next_maintenance_due,
        specs,
        accessories
      } = req.body;

      const specsArr = toArray(specs);
      const accessoriesArr = toArray(accessories);

      const eq = await equipment.findOne({
        where: { equipment_id, is_active: 1 }
      });

      if (!eq) {
        return res.status(constants.OK.code).json({
          error: true,
          code: constants.OK.code,
          message: "Equipment not found",
          data: null
        });
      }

      await equipment.update(
        {
          equipment_name,
          category_id,
          manufacturer,
          model_number,
          serial_number,
          description,
          storage_location_id,
          initial_status_id,
          purchase_price,
          daily_rental_rate,
          purchase_date,
          last_maintenance_date,
          next_maintenance_due,
          is_active: 1
        },
        { where: { equipment_id } }
      );

      await equipment_specs.destroy({ where: { equipment_id } });
      if (specsArr.length > 0) {
        for (let s of specsArr) {
          await equipment_specs.create({
            equipment_id,
            spec_name: s.name,
            spec_value: s.value,
            is_active: 1
          });
        }
      }

      await equipment_accessories.destroy({ where: { equipment_id } });
      if (accessoriesArr.length > 0) {
        for (let a of accessoriesArr) {
          await equipment_accessories.create({
            equipment_id,
            accessory_name: a,
            is_active: 1
          });
        }
      }

      const uploadedFiles = await S3UploadFiles(req.files);

      const photos = uploadedFiles.filter(f => f.file_type === "photos");
      const manuals = uploadedFiles.filter(f => f.file_type === "manual");
      const warranties = uploadedFiles.filter(f => f.file_type === "warranty");

      if (manuals.length > 0) {
        await equipment_documents.update(
          { is_active: 0 },
          { where: { equipment_id, doc_type: "manual" } }
        );

        await equipment_documents.create({
          equipment_id,
          doc_type: "manual",
          file_url: manuals[0].file_path,
          is_active: 1
        });
      }

      if (warranties.length > 0) {
        await equipment_documents.update(
          { is_active: 0 },
          { where: { equipment_id, doc_type: "warranty" } }
        );

        await equipment_documents.create({
          equipment_id,
          doc_type: "warranty",
          file_url: warranties[0].file_path,
          is_active: 1
        });
      }

      if (photos.length > 0) {
        await equipment_photos.update(
          { is_active: 0 },
          { where: { equipment_id } }
        );

        for (let p of photos) {
          await equipment_photos.create({
            equipment_id,
            file_url: p.file_path,
            is_active: 1
          });
        }
      }

      return res.status(constants.OK.code).json({
        error: false,
        code: constants.OK.code,
        message: "Equipment updated successfully",
        data: { equipment_id }
      });

    } catch (error) {
      console.error("Update Equipment Error:", error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null
      });
    }
  }
];

exports.assignEquipment = async (req, res) => {
  try {
    const {
      equipment_id,
      project_id,            
      crew_member_id,
      check_out_date,
      expected_return_date,
      pickup_location,
      notes,
      checklist,
      send_email,
      rent_calculation
    } = req.body;

    if (!equipment_id || !crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "equipment_id and crew_member_id are required"
      });
    }

    const crew = await crew_members.findOne({
      where: { crew_member_id, is_active: 1 }
    });

    if (!crew) {
      return res.status(400).json({
        error: true,
        message: "Invalid or inactive crew_member_id"
      });
    }

    if (project_id) {
      const project = await stream_project_booking.findOne({
        where: { stream_project_booking_id: project_id, is_active: 1 }
      });

      if (!project) {
        return res.status(400).json({
          error: true,
          message: "Invalid or inactive stream_project_booking_id"
        });
      }
    }

    const assignment = await equipment_assignments.create({
      equipment_id,
      project_id: project_id || null,  
      crew_member_id,
      check_out_date,
      expected_return_date,
      pickup_location,
      notes,
      send_email: send_email ? 1 : 0,
      rent_calculation: rent_calculation || null
    });

    if (checklist && Array.isArray(checklist)) {
      for (const item of checklist) {
        await assignment_checklist.create({
          assignment_id: assignment.assignment_id,
          checklist_id: item.id,
          value: item.checked ? 1 : 0
        });
      }
    }

    return res.status(200).json({
      error: false,
      message: "Equipment assigned successfully",
      data: assignment
    });

  } catch (err) {
    console.error("ASSIGN EQUIPMENT ERROR:", err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};


exports.getAllAssignments = async (req, res) => {
  try {
    const list = await equipment_assignments.findAll({
      where: { is_active: 1 },

      include: [
        {
          model: equipment,
          as: "equipment",
          attributes: ["equipment_id", "equipment_name", "category_id"]
        },
        {
          model: stream_project_booking,
          as: "project",
          attributes: ["stream_project_booking_id", "project_name"]
        },
        {
          model: crew_members,
          as: "crew_member",
          attributes: ["crew_member_id", "first_name", "phone_number"]
        },
        {
          model: assignment_checklist,
          as: "assignment_checklists",
          include: [
            {
              model: checklist_master,
              as: "checklist",
              attributes: ["checklist_id", "checklist_text"]
            }
          ]
        }
      ],

      order: [["assignment_id", "DESC"]]
    });

    return res.status(200).json({
      error: false,
      message: "Assignments fetched successfully",
      data: list
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};


exports.getAssignmentById = async (req, res) => {
  try {
    const id = req.params.id;

    const data = await equipment_assignments.findOne({
      where: { assignment_id: id, is_active: 1 },

      include: [
        {
          model: equipment,
          as: "equipment",
          attributes: ["equipment_id", "equipment_name", "category_id"]
        },
        {
          model: stream_project_booking,
          as: "project",
          attributes: ["stream_project_booking_id", "project_name"]
        },
        {
          model: crew_members,
          as: "crew_member",
          attributes: ["crew_member_id", "first_name", "phone_number"]
        },
        {
          model: assignment_checklist,
          as: "assignment_checklists",
          include: [
            {
              model: checklist_master,
              as: "checklist",
              attributes: ["checklist_id", "checklist_text"]
            }
          ]
        }
      ]
    });

    if (!data) {
      return res.status(404).json({
        error: true,
        message: "Assignment not found"
      });
    }

    return res.status(200).json({
      error: false,
      message: "Assignment fetched successfully",
      data
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};

exports.returnEquipment = async (req, res) => {
  try {
    const {
      assignment_id,
      equipment_id,

      condition,
      inspection_notes,

      return_checklist,
      issues,
      mark_for_maintenance
    } = req.body;

    if (!assignment_id || !equipment_id) {
      return res.status(400).json({
        error: true,
        message: "assignment_id and equipment_id are required"
      });
    }

    const assignment = await equipment_assignments.findOne({
      where: { assignment_id, equipment_id }
    });

    if (!assignment) {
      return res.status(400).json({
        error: true,
        message: "Invalid assignment_id or equipment_id"
      });
    }

    const ret = await equipment_returns.create({
      assignment_id,
      equipment_id,
      condition,
      inspection_notes
    });

    if (Array.isArray(return_checklist)) {
      for (const c of return_checklist) {
        await equipment_return_checklist.create({
          return_id: ret.return_id,
          checklist_title: c.title,
          value: c.value ? 1 : 0
        });
      }
    }

    if (Array.isArray(issues)) {
      for (const i of issues) {
        await equipment_return_issues.create({
          return_id: ret.return_id,
          issue_title: i.title,
          severity: i.severity
        });
      }
    }

    let new_status = mark_for_maintenance == 1 ? "maintenance" : "available";

    await equipment.update(
      { initial_status_id: new_status },
      { where: { equipment_id } }
    );

    await equipment_assignments.update(
      { actual_return_date: new Date() },
      { where: { assignment_id } }
    );

    return res.status(200).json({
      error: false,
      message: "Equipment returned successfully",
      data: {
        return_id: ret.return_id,
        maintenance: mark_for_maintenance == 1 ? true : false
      }
    });

  } catch (err) {
    console.log("Return Equipment Error:", err);
    return res.status(500).json({
      error: true,
      message: "Server error"
    });
  }
};

exports.getEquipmentNameSuggestions = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(200).json({
        error: false,
        code: 200,
        message: "No search query provided",
        data: []
      });
    }

    const suggestions = await equipment.findAll({
      where: {
        is_active: 1,
        equipment_name: {
          [Op.like]: `%${query}%`
        }
      },
      attributes: ["equipment_id", "equipment_name"],
      limit: 10,
      order: [["equipment_name", "ASC"]]
    });

    return res.status(200).json({
      error: false,
      code: 200,
      message: "Suggestions fetched successfully",
      data: suggestions
    });

  } catch (error) {
    console.error("Equipment Suggestions Error:", error);
    return res.status(500).json({
      error: true,
      code: 500,
      message: "Internal Server Error",
      data: []
    });
  }
};

// ==================== MASTER DATA ENDPOINTS ====================

/**
 * GET Equipment Categories
 * Returns all equipment categories for dropdown/filter
 */
exports.getEquipmentCategories = async (req, res) => {
  try {
    const categories = await equipment_category.findAll({
      where: { is_active: 1 },
      attributes: ['category_id', 'name'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment categories fetched successfully",
      data: categories
    });

  } catch (error) {
    console.error("Get Equipment Categories Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Checklist Templates
 * Returns all checklist master items for assignment/return checklists
 */
exports.getChecklistTemplates = async (req, res) => {
  try {
    const checklists = await checklist_master.findAll({
      where: { is_active: 1 },
      attributes: ['checklist_id', 'checklist_text'],
      order: [['checklist_id', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Checklist templates fetched successfully",
      data: checklists
    });

  } catch (error) {
    console.error("Get Checklist Templates Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Crew Roles
 * Returns all crew roles for dropdown
 */
exports.getCrewRoles = async (req, res) => {
  try {
    const roles = await crew_roles.findAll({
      where: { is_active: 1 },
      attributes: ['role_id', 'role_name'],
      order: [['role_name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Crew roles fetched successfully",
      data: roles
    });

  } catch (error) {
    console.error("Get Crew Roles Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Skills Master
 * Returns all skills for dropdown/selection
 */
exports.getSkills = async (req, res) => {
  try {
    const skills = await skills_master.findAll({
      where: { is_active: 1 },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Skills fetched successfully",
      data: skills
    });

  } catch (error) {
    console.error("Get Skills Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Certifications Master
 * Returns all certifications for dropdown/selection
 */
exports.getCertifications = async (req, res) => {
  try {
    const certifications = await certifications_master.findAll({
      where: { is_active: 1 },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Certifications fetched successfully",
      data: certifications
    });

  } catch (error) {
    console.error("Get Certifications Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

/**
 * GET Equipment Statistics by Location
 * Groups equipment by storage location with counts
 */
exports.getEquipmentByLocation = async (req, res) => {
  try {
    // Get all equipment grouped by location
    const equipmentList = await equipment.findAll({
      where: { is_active: 1 },
      include: [
        { model: equipment_photos, as: 'equipment_photos', attributes: ['photo_id', 'file_url'] },
        { model: equipment_category, as: 'category', attributes: ['category_id', 'name'] }
      ],
      order: [['storage_location_id', 'ASC'], ['equipment_name', 'ASC']]
    });

    // Check for active assignments to determine in_use status
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeAssignments = await equipment_assignments.findAll({
      where: {
        check_out_date: { [Op.lte]: today },
        expected_return_date: { [Op.gte]: today }
      }
    });

    const inUseMap = {};
    activeAssignments.forEach(a => {
      inUseMap[a.equipment_id] = a;
    });

    // Group equipment by location
    const locationMap = {};

    equipmentList.forEach(item => {
      const locationId = item.storage_location_id || 0; // 0 for unassigned

      if (!locationMap[locationId]) {
        locationMap[locationId] = {
          storage_location_id: locationId,
          location_name: locationId === 0 ? 'Unassigned' : `Location ${locationId}`,
          equipment_count: 0,
          available_count: 0,
          in_use_count: 0,
          maintenance_count: 0,
          equipment: []
        };
      }

      const itemJson = item.toJSON();
      itemJson.in_use = !!inUseMap[item.equipment_id];
      itemJson.current_assignment = inUseMap[item.equipment_id] || null;

      locationMap[locationId].equipment.push(itemJson);
      locationMap[locationId].equipment_count++;

      // Count by status
      if (item.initial_status_id === 1) {
        locationMap[locationId].available_count++;
      } else if (item.initial_status_id === 2) {
        locationMap[locationId].in_use_count++;
      } else if (item.initial_status_id === 3) {
        locationMap[locationId].maintenance_count++;
      }
    });

    const locationsArray = Object.values(locationMap);

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Equipment grouped by location successfully",
      data: locationsArray
    });

  } catch (error) {
    console.error("Get Equipment By Location Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getEventTypes = async (req, res) => {
  try {
    const eventTypes = await event_type_master.findAll({
      where: { is_active: 1 },
      attributes: ['event_type_id', 'event_type_name'],
      order: [['event_type_id', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: "Event types fetched successfully",
      data: eventTypes
    });

  } catch (error) {
    console.error("Get Event Types Error:", error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getCrewMembersByName = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(200).json({
        error: false,
        code: 200,
        message: "No search query provided",
        data: []
      });
    }

    const crewMembers = await crew_members.findAll({
      where: {
        is_active: 1,
        [Op.or]: [
          { first_name: { [Op.like]: `%${query}%` } },
          { last_name: { [Op.like]: `%${query}%` } }
        ]
      },
      attributes: ['crew_member_id', 'first_name', 'last_name'],
      limit: 10,
      order: [['first_name', 'ASC']]
    });

    return res.status(200).json({
      error: false,
      code: 200,
      message: "Crew members fetched successfully",
      data: crewMembers
    });

  } catch (error) {
    console.error("Get Crew Members Error:", error);
    return res.status(500).json({
      error: true,
      code: 500,
      message: "Internal Server Error",
      data: []
    });
  }
};


exports.getCrewCount = async (req, res) => {
  try {
    const total = await crew_members.count({
      where: {
        is_active: 1,
        is_draft: 0
      }
    });

    return res.status(200).json({
      error: false,
      message: "Crew count fetched successfully",
      total_crew_members: total
    });

  } catch (error) {
    console.error("Get Crew Count Error:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const { date_on } = req.query;
    
    let standardDateFilter = buildDateFilter(req);

    let bookingDateFilter = { ...standardDateFilter };

    if (date_on) {
      if (date_on.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const dayRange = {
          [Op.between]: [`${date_on} 00:00:00`, `${date_on} 23:59:59`]
        };

        bookingDateFilter = { event_date: dayRange };
        standardDateFilter = { created_at: dayRange };
      } 
      
      else if (date_on === 'event_date' && standardDateFilter.created_at) {
        bookingDateFilter = { event_date: standardDateFilter.created_at };
      }
    }

    const [
      total_shoots,
      active_shoots,
      completed_shoots,
      total_clients,
      total_CPs,
      approved_CPs,
      pending_CPs,
      rejected_CPs
    ] = await Promise.all([
      stream_project_booking.count({
        where: { is_active: 1, is_draft: 0, ...bookingDateFilter }
      }),

      stream_project_booking.count({
        where: { is_active: 1, is_completed: 0, is_cancelled: 0, is_draft: 0, ...bookingDateFilter }
      }),

      stream_project_booking.count({
        where: { is_active: 1, is_completed: 1, ...bookingDateFilter }
      }),

      clients.count({
        where: { is_active: 1, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, is_crew_verified: 1, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, is_crew_verified: 0, ...standardDateFilter }
      }),

      crew_members.count({
        where: { is_active: 1, is_crew_verified: 2, ...standardDateFilter }
      })
    ]);

    return res.status(200).json({
      error: false,
      message: "Dashboard summary fetched successfully",
      data: {
        total_shoots: { count: total_shoots, growth: 3 },
        active_shoots: { count: active_shoots, growth: 3 },
        completed_shoots: { count: completed_shoots, growth: 3 },
        total_clients: { count: total_clients, growth: 3 },
        total_CPs: { count: total_CPs, growth: 3 },
        approved_CPs: { count: approved_CPs, growth: 3 },
        pending_CPs: { count: pending_CPs, growth: 3 },
        rejected_CPs: { count: rejected_CPs, growth: 3 }
      }
    });
  } catch (error) {
    console.error("Get Dashboard Summary:", error);
    return res.status(500).json({
      error: true,
      message: "Internal server error"
    });
  }
};


exports.getDashboardChartData = async (req, res) => {
    try {
        const { date_on } = req.query;

        let standardDateFilter = buildDateFilter(req);
        let bookingDateFilter = { ...standardDateFilter };

        if (date_on) {
            if (date_on.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const dayRange = { [Op.between]: [`${date_on} 00:00:00`, `${date_on} 23:59:59`] };
                bookingDateFilter = { event_date: dayRange };
                standardDateFilter = { created_at: dayRange };
            } else if (date_on === 'event_date' && standardDateFilter.created_at) {
                bookingDateFilter = { event_date: standardDateFilter.created_at };
            }
        }

        const chartStartDate = moment().subtract(5, 'months').startOf('month').format('YYYY-MM-DD HH:mm:ss');
        const chartEndDate = moment().endOf('day').format('YYYY-MM-DD HH:mm:ss');
        const chartMonthRange = { [Op.between]: [chartStartDate, chartEndDate] };

        const shootDateCol = (date_on === 'event_date') ? 'event_date' : 'created_at';
        const paidShootFilter = { payment_id: { [Op.ne]: null } };

        const [
            total_shoots, active_shoots, completed_shoots, total_clients, total_CPs,
            approved_CPs, pending_CPs, rejected_CPs,
            total_leads,
            paid_leads,
            chartShoots, chartClients, chartCPs,
            chartUnpaidLeads
        ] = await Promise.all([
            stream_project_booking.count({ where: { is_active: 1, is_draft: 0, ...paidShootFilter, ...bookingDateFilter } }),
            stream_project_booking.count({ where: { is_active: 1, is_completed: 0, is_cancelled: 0, is_draft: 0, ...paidShootFilter, ...bookingDateFilter } }),
            stream_project_booking.count({ where: { is_active: 1, is_completed: 1, ...paidShootFilter, ...bookingDateFilter } }),
            
            clients.count({ where: { is_active: 1, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, is_crew_verified: 1, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, is_crew_verified: 0, ...standardDateFilter } }),
            crew_members.count({ where: { is_active: 1, is_crew_verified: 2, ...standardDateFilter } }),

            sales_leads.count({ where: { ...standardDateFilter } }),
            sales_leads.count({
                include: [{
                    model: stream_project_booking,
                    as: 'booking',
                    where: { payment_id: { [Op.ne]: null } },
                    required: true
                }],
                where: { ...standardDateFilter }
            }),

            stream_project_booking.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col(shootDateCol), '%Y-%m'), 'month'],
                    [Sequelize.literal('SUM(CASE WHEN is_completed = 0 AND is_cancelled = 0 AND payment_id IS NOT NULL THEN 1 ELSE 0 END)'), 'active'],
                    [Sequelize.literal('SUM(CASE WHEN is_completed = 1 AND payment_id IS NOT NULL THEN 1 ELSE 0 END)'), 'completed'],
                    [Sequelize.literal('SUM(CASE WHEN payment_id IS NOT NULL THEN 1 ELSE 0 END)'), 'total']
                ],
                where: { is_active: 1, ...paidShootFilter, [shootDateCol]: chartMonthRange },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col(shootDateCol), '%Y-%m')],
                raw: true
            }),
            clients.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m'), 'month'],
                    [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
                ],
                where: { is_active: 1, created_at: chartMonthRange },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m')],
                raw: true
            }),
            crew_members.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m'), 'month'],
                    [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
                ],
                where: { is_active: 1, created_at: chartMonthRange },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%Y-%m')],
                raw: true
            }),
            sales_leads.findAll({
                attributes: [
                    [Sequelize.fn('DATE_FORMAT', Sequelize.col('sales_leads.created_at'), '%Y-%m'), 'month'],
                    [Sequelize.fn('COUNT', Sequelize.literal('*')), 'count']
                ],
                include: [{
                    model: stream_project_booking,
                    as: 'booking',
                    required: false
                }],
                where: { 
                    created_at: chartMonthRange,
                    [Op.or]: [
                        { '$booking.payment_id$': null },
                        { '$booking.stream_project_booking_id$': null }
                    ]
                },
                group: [Sequelize.fn('DATE_FORMAT', Sequelize.col('sales_leads.created_at'), '%Y-%m')],
                raw: true
            })
        ]);

        const unpaid_leads = total_leads - paid_leads;

        const generateSixMonthData = (dbResults, type) => {
            const result = [];
            for (let i = 5; i >= 0; i--) {
                const m = moment().subtract(i, 'months');
                const monthKey = m.format('YYYY-MM');
                const dbRow = dbResults.find(r => r.month === monthKey);

                if (type === 'shoots') {
                    result.push({
                        label: m.format('MMM'),
                        total: dbRow ? parseInt(dbRow.total) || 0 : 0,
                        active: dbRow ? parseInt(dbRow.active) || 0 : 0,
                        completed: dbRow ? parseInt(dbRow.completed) || 0 : 0
                    });
                } else {
                    result.push({
                        label: m.format('MMM'),
                        count: dbRow ? parseInt(dbRow.count) || 0 : 0
                    });
                }
            }
            return result;
        };

        const shootChartData = generateSixMonthData(chartShoots, 'shoots');
        const clientChartData = generateSixMonthData(chartClients, 'others');
        const cpChartData = generateSixMonthData(chartCPs, 'others');
        const leadChartData = generateSixMonthData(chartUnpaidLeads, 'others');

        return res.status(200).json({
            error: false,
            message: "Dashboard data fetched successfully",
            summary: {
                total_shoots: { count: total_shoots, growth: 3 },
                active_shoots: { count: active_shoots, growth: 3 },
                completed_shoots: { count: completed_shoots, growth: 3 },
                total_clients: { count: total_clients, growth: 0 },
                total_CPs: { count: total_CPs, growth: 3 },
                approved_CPs: { count: approved_CPs, growth: 3 },
                pending_CPs: { count: pending_CPs, growth: 3 },
                rejected_CPs: { count: rejected_CPs, growth: 3 },
                // SUMMARY DATA
                total_leads: { count: total_leads, growth: 0 },
                paid_leads: { count: paid_leads, growth: 0 },
                unpaid_leads: { count: unpaid_leads, growth: 0 }
            },
            charts: {
                total_shoots: shootChartData.map(d => ({ label: d.label, value: d.total })),
                active_shoots: shootChartData.map(d => ({ label: d.label, value: d.active })),
                completed_shoots: shootChartData.map(d => ({ label: d.label, value: d.completed })),
                total_clients: clientChartData.map(d => ({ label: d.label, value: d.count })),
                total_CPs: cpChartData.map(d => ({ label: d.label, value: d.count })),
                unpaid_leads: leadChartData.map(d => ({ label: d.label, value: d.count }))
            }
        });

    } catch (error) {
        console.error("Dashboard API Error:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
    }
};

exports.getTotalRevenue = async (req, res) => {
  try {
    const totalRevenue = await payment_transactions.sum('total_amount', {
      where: { status: 'succeeded' }
    });

    return res.status(200).json({
      error: false,
      data: {
        total_revenue: Number(totalRevenue || 0)
      }
    });
  } catch (err) {
    console.error('Total Revenue Error:', err);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
};

exports.getMonthlyRevenue = async (req, res) => {
  try {
    const data = await payment_transactions.findAll({
      attributes: [
        [Sequelize.fn('DATE_FORMAT', Sequelize.col('created_at'), '%b'), 'month'],
        [Sequelize.fn('SUM', Sequelize.col('cp_cost')), 'base_revenue'],
        [Sequelize.fn('SUM', Sequelize.col('beige_margin_amount')), 'margin_revenue'],
        [Sequelize.fn('SUM', Sequelize.col('total_amount')), 'total_revenue']
      ],
      where: { status: 'succeeded' },
      group: [Sequelize.fn('MONTH', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('MONTH', Sequelize.col('created_at')), 'ASC']],
      limit: 6
    });

    return res.status(200).json({
      error: false,
      data
    });
  } catch (err) {
    console.error('Monthly Revenue Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getWeeklyRevenue = async (req, res) => {
  try {
    const current = await payment_transactions.sum('total_amount', {
      where: {
        status: 'succeeded',
        created_at: {
          [Op.gte]: Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
        }
      }
    });

    const previous = await payment_transactions.sum('total_amount', {
      where: {
        status: 'succeeded',
        created_at: {
          [Op.between]: [
            Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 14 DAY)'),
            Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
          ]
        }
      }
    });

    const growth =
      previous && previous > 0
        ? (((current - previous) / previous) * 100).toFixed(1)
        : 0;

    return res.status(200).json({
      error: false,
      data: {
        weekly_revenue: Number(current || 0),
        growth_percent: Number(growth)
      }
    });
  } catch (err) {
    console.error('Weekly Revenue Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getTotalPayout = async (req, res) => {
  try {
    const totalPayout = await payment_transactions.sum('cp_cost', {
      where: { status: 'succeeded' }
    });

    return res.status(200).json({
      error: false,
      data: {
        total_payout: Number(totalPayout || 0)
      }
    });
  } catch (err) {
    console.error('Total Payout Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getWeeklyPayoutGraph = async (req, res) => {
  try {
    const data = await payment_transactions.findAll({
      attributes: [
        [Sequelize.fn('DAYNAME', Sequelize.col('created_at')), 'day'],
        [Sequelize.fn('SUM', Sequelize.col('cp_cost')), 'amount']
      ],
      where: {
        status: 'succeeded',
        created_at: {
          [Op.gte]: Sequelize.literal('DATE_SUB(CURDATE(), INTERVAL 7 DAY)')
        }
      },
      group: [Sequelize.fn('DAYOFWEEK', Sequelize.col('created_at'))],
      order: [[Sequelize.fn('DAYOFWEEK', Sequelize.col('created_at')), 'ASC']]
    });

    return res.status(200).json({
      error: false,
      data
    });
  } catch (err) {
    console.error('Weekly Payout Graph Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getPendingPayout = async (req, res) => {
  try {
    const pending = await payment_transactions.sum('cp_cost', {
      where: { status: 'pending' }
    });

    return res.status(200).json({
      error: false,
      data: {
        pending_payout: Number(pending || 0),
        growth_percent: 0
      }
    });
  } catch (err) {
    console.error('Pending Payout Error:', err);
    return res.status(500).json({ error: true });
  }
};

exports.getTotalCPCount = async (req, res) => {
  try {
    const totalCPs = await crew_members.count({
      where: { is_active: 1, is_crew_verified: 1 }
    });

    return res.status(200).json({
      error: false,
      data: {
        total_cps: totalCPs
      }
    });
  } catch (err) {
    console.error('CP Count Error:', err);
    return res.status(500).json({ error: true });
  }
};

// exports.getCategoryWiseCPs = async (req, res) => {
//   try {
//     const data = await crew_members.findAll({
//       attributes: [
//         'primary_role',
//         [Sequelize.fn('COUNT', Sequelize.col('crew_member_id')), 'count']
//       ],
//       where: { is_active: 1 },
//       group: ['primary_role']
//     });

//     return res.status(200).json({
//       error: false,
//       data
//     });
//   } catch (err) {
//     console.error('Category Wise CP Error:', err);
//     return res.status(500).json({ error: true });
//   }
// };

exports.getCategoryWiseCPs = async (req, res) => {
  try {
    const data = await crew_roles.findAll({
      attributes: [
        'role_id',
        'role_name',
        [
          Sequelize.fn(
            'COUNT',
            Sequelize.fn(
              'DISTINCT',
              Sequelize.col('crew_members.crew_member_id')
            )
          ),
          'count'
        ]
      ],
      include: [
        {
          model: crew_members,
          as: 'crew_members',
          attributes: [],
          required: true,
          where: {
            is_active: 1,
            [Op.or]: [
              // primary_role = "1"
              Sequelize.where(
                Sequelize.col('crew_members.primary_role'),
                Sequelize.col('crew_roles.role_id')
              ),

              // primary_role contains "1" inside JSON array
              Sequelize.literal(
                `JSON_CONTAINS(crew_members.primary_role, CONCAT('"', crew_roles.role_id, '"'))`
              )
            ]
          }
        }
      ],
      group: ['crew_roles.role_id'],
      order: [[Sequelize.literal('count'), 'DESC']]
    });

    return res.status(200).json({
      error: false,
      data
    });
  } catch (err) {
    console.error('Category Wise CP Error:', err);
    return res.status(500).json({
      error: true,
      message: 'Failed to fetch category wise CPs'
    });
  }
};

exports.getShootStatus = async (req, res) => {
  try {
    const { range, start_date, end_date } = req.query;

    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter = {
        event_date: {
          [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
        }
      };
    } else if (range === 'month') {
      dateFilter = {
        [Op.and]: [
          Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
          Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
        ]
      };
    } else if (range === 'week') {
      dateFilter = {
        [Op.and]: [
          Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
        ]
      };
    } else if (range === 'year') {
      dateFilter = {
        [Op.and]: [
          Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
        ]
      };
    } else if (range === 'all' || !range) {
      dateFilter = {};
    }

    const paidFilter = { payment_id: { [Op.ne]: null } };

    const [
      totalShoots,
      successfulShoots,
      pendingShoots,
      rejectedShoots,
      cancelledShoots
    ] = await Promise.all([
      stream_project_booking.count({ 
        where: { ...paidFilter, ...dateFilter } 
      }),

      stream_project_booking.count({
        where: { is_completed: 1, ...paidFilter, ...dateFilter }
      }),

      stream_project_booking.count({
        where: {
          is_completed: 0,
          is_cancelled: 0,
          is_active: 1,
          ...paidFilter,
          ...dateFilter
        }
      }),

      stream_project_booking.count({
        where: { is_cancelled: 1, ...paidFilter, ...dateFilter }
      }),

      stream_project_booking.count({
        where: { is_active: 0, is_cancelled: 1, ...paidFilter, ...dateFilter }
      })
    ]);

    return res.status(200).json({
      error: false,
      message: "Paid shoot status summary fetched successfully",
      data: {
        total: totalShoots,
        breakdown: [
          {
            label: 'Successful Shoots',
            count: successfulShoots,
            color: '#A78BFA' // purple
          },
          {
            label: 'Pending Shoots',
            count: pendingShoots,
            color: '#38BDF8' // blue
          },
          {
            label: 'Rejected Shoots',
            count: rejectedShoots,
            color: '#FBBF24' // yellow
          },
          {
            label: 'Cancelled Shoots',
            count: cancelledShoots,
            color: '#34D399' // green
          }
        ]
      }
    });
  } catch (err) {
    console.error('Shoot Status Error:', err);
    return res.status(500).json({ 
      error: true, 
      message: "Internal server error" 
    });
  }
};

exports.getTopCreativePartners = async (req, res) => {
  try {
    const { range, start_date, end_date } = req.query;

    const parsedLimit = Number(req.query.limit || 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;

    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter = {
        created_at: {
          [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
        }
      };
    } else if (range === 'month') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-%m-01')")
        }
      };
    } else if (range === 'week') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_SUB(NOW(), INTERVAL 7 DAY)")
        }
      };
    } else if (range === 'year') {
      dateFilter = {
        created_at: {
          [Op.gte]: Sequelize.literal("DATE_FORMAT(CURDATE(), '%Y-01-01')")
        }
      };
    }

    const partners = await payment_transactions.findAll({
      attributes: [
        'creator_id',
        [Sequelize.fn('SUM', Sequelize.col('total_amount')), 'total_earnings']
      ],
      where: {
        status: 'succeeded',
        ...dateFilter
      },
      include: [
        {
          model: crew_members,
          as: 'creator',
          attributes: ['crew_member_id', 'first_name', 'last_name', 'email'],
          where: {
            is_active: 1,
            is_crew_verified: 1, // only approved crew (exclude pending/rejected)
          },
          required: true,
          include: [
            {
              model: crew_member_files,
              as: 'crew_member_files',
              attributes: ['file_path'],
              where: {
                file_type: 'profile_photo',
                is_active: 1
              },
              required: false,
              separate: true,
              limit: 1,
              order: [['created_at', 'DESC']]
            }
          ]
        }
      ],
      group: ['creator_id'],
      having: Sequelize.where(
        Sequelize.fn('SUM', Sequelize.col('total_amount')),
        { [Op.gt]: 0 } // exclude CPs with $0 earnings
      ),
      order: [[Sequelize.literal('total_earnings'), 'DESC']],
      limit: limit
    });

    const result = partners
      .filter(p => p.creator)
      .map(p => {
        const files = p.creator.crew_member_files || [];
        const photo = files.length ? `${files[0].file_path}` : null;

        return {
          id: p.creator_id,
          name: `${p.creator.first_name} ${p.creator.last_name}`,
          email: p.creator.email,
          total_earnings: Number(p.get('total_earnings') || 0),
          avatar: photo
        };
      });

    return res.status(200).json({
      error: false,
      message: "Top creative partners fetched successfully",
      data: result
    });
  } catch (err) {
    console.error('Top Creative Partners Error:', err);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};


exports.getDashboardDetails = async (req, res) => {
  try {
    const creator_id = req.body.crew_member_id;
    const { date_filter, start_date, end_date, status } = req.body;

    const projectWhere = {};

    if (status === 'active') {
      projectWhere.is_completed = 0;
      projectWhere.is_cancelled = 0;
    }

    if (status == 'completed') {
      projectWhere.is_completed = 1;
    }

    if (status === 'cancelled') {
      projectWhere.is_cancelled = 1;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date_filter === 'today') {
      projectWhere.event_date = today;
    }

    if (date_filter === 'upcoming') {
      projectWhere.event_date = {
        [Sequelize.Op.gt]: today
      };
    }

    if (date_filter === 'this_week') {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      projectWhere.event_date = {
        [Sequelize.Op.between]: [startOfWeek, endOfWeek]
      };
    }

    if (date_filter === 'this_month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      projectWhere.event_date = {
        [Sequelize.Op.between]: [startOfMonth, endOfMonth]
      };
    }

    if (date_filter === 'custom' && start_date && end_date) {
      projectWhere.event_date = {
        [Sequelize.Op.between]: [start_date, end_date]
      };
    }

    console.log("projectWhere---------", projectWhere);
    const allShoots = await assigned_crew.findAll({
      where: {
        crew_accept: 1,
        crew_member_id: creator_id,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          where: projectWhere,
          required: true,
        },
      ],
      order: [
        [{ model: stream_project_booking, as: "project" }, "event_date", "ASC"]
      ]
    });

    // Pending Requests (Assigned projects with crew_accept = 0)
    const pendingRequests = await assigned_crew.findAll({
      where: {
        crew_accept: 0,
        crew_member_id: creator_id,
      },
      include: [
        {
          model: stream_project_booking,
          as: "project",
          where: {
            ...projectWhere,
            is_completed: 0
          },
          required: true,
        },
      ],
    });

    return res.status(200).json({
      error: false,
      message: 'Dashboard details fetched successfully',
      data: {
        allShoots,
        pendingRequests,
        equipmentRequests: 5,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard details:', error);
    return res.status(500).json({
      error: true,
      message: 'Something went wrong while fetching dashboard details',
    });
  }
};

exports.getShootByCategory = async (req, res) => {
  try {
    const activeTab = (req.query.tab || 'all').toLowerCase();

    // Fallback Skill IDs for deeper verification if needed
    const videoSkillIds = [1, 2, 3, 4, 11, 12, 13, 14, 17, 24, 29, 30, 31, 32, 33, 34, 35, 36];
    const photoSkillIds = [5, 6, 7, 8, 15, 16, 37];

    const categoryConfig = {
      corporate: { label: 'Corporate Events', color: '#3B82F6', matches: ['corporate'] },
      wedding: { label: 'Wedding', color: '#22C55E', matches: ['wedding'] },
      private: { label: 'Private Events', color: '#8B5CF6', matches: ['private'] },
      commercial: { label: 'Commercial & Advertising', color: '#F59E0B', matches: ['commercial', 'brand', 'advertising'] },
      social: { label: 'Social Content', color: '#06B6D4', matches: ['social'] },
      podcasts: { label: 'Podcasts & Shows', color: '#EC4899', matches: ['podcast'] },
      music: { label: 'Music Videos', color: '#EF4444', matches: ['music'] },
      narrative: { label: 'Short Films & Narrative', color: '#6366F1', matches: ['narrative', 'short film'] }
    };

    const collectedPaymentSummaryRows = await fetchCollectedBookingPaymentSummaries();
    const collectedSummaryBookingIds = Array.from(new Set(
      collectedPaymentSummaryRows
        .map((row) => Number(row.booking_id))
        .filter(Number.isFinite)
    ));

    // 1. Fetch paid or partially paid bookings
    const bookings = await stream_project_booking.findAll({
      attributes: ['project_name', 'event_type', 'skills_needed', 'stream_project_booking_id', 'payment_id'],
      where: { 
        is_active: 1,
        [Sequelize.Op.or]: [
          { payment_id: { [Sequelize.Op.ne]: null } },
          ...(collectedSummaryBookingIds.length
            ? [{ stream_project_booking_id: { [Sequelize.Op.in]: collectedSummaryBookingIds } }]
            : [])
        ]
      },
      raw: true
    });

    let grandTotal = 0;
    const finalResults = {};
    
    Object.keys(categoryConfig).forEach(key => {
      finalResults[key] = { label: categoryConfig[key].label, count: 0, color: categoryConfig[key].color };
    });

    // 2. Processing Loop
    bookings.forEach(booking => {
      const eventType = String(booking.event_type || '').toLowerCase();
      const projectName = String(booking.project_name || '').toLowerCase();
      const skills = String(booking.skills_needed || '').toLowerCase();

      let includeInTab = false;
      
      // NEW TAB LOGIC: Checking event_type for "videographer" or "photographer"
      if (activeTab === 'all') {
        includeInTab = true;
      } else {
        // Check if event_type string contains the roles
        const isVideo = eventType.includes('videographer') || eventType.includes('video') || videoSkillIds.some(id => skills.includes(String(id)));
        const isPhoto = eventType.includes('photographer') || eventType.includes('photo') || photoSkillIds.some(id => skills.includes(String(id)));
        
        if (activeTab === 'videography' && isVideo) includeInTab = true;
        if (activeTab === 'photography' && isPhoto) includeInTab = true;
      }

      // CATEGORY LOGIC: Based on Project Name
      if (includeInTab) {
        for (const [key, config] of Object.entries(categoryConfig)) {
          // Check if category keyword (like 'music') exists in project_name
          if (config.matches.some(keyword => projectName.includes(keyword))) {
            finalResults[key].count += 1;
            grandTotal += 1;
            break; 
          }
        }
      }
    });

    // 3. Format response
    const data = Object.values(finalResults).map(item => ({
      label: item.label,
      count: item.count,
      percentage: grandTotal > 0 ? Math.round((item.count / grandTotal) * 100) : 0,
      color: item.color
    }));

    return res.status(200).json({
      error: false,
      message: `Stats for ${activeTab} retrieved successfully`,
      data: {
        active_tab: activeTab,
        total_count: grandTotal,
        categories: data
      }
    });

  } catch (error) {
    console.error('Shoot By Category Error:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};

// Controller to fetch all post production members
exports.getPostProductionMembers = async (req, res) => {
  try {
    const allowedRoles = [
      'Production Team',
      'Video Editors',
      'Photo Editors',
      'Sales',
      'Sales Admin'
    ];

    // Source list from internal users so it's consistent with lead/quote flows.
    const internalMembers = await users.findAll({
      where: {
        is_active: 1,
        assign_lead: 1,
        user_type: 1,
        role: {
          [Op.in]: allowedRoles
        }
      },
      attributes: ['id', 'name', 'email', 'role'],
      order: [['name', 'ASC']]
    });

    if (!internalMembers || internalMembers.length === 0) {
      return res.status(404).json({
        error: true,
        message: 'No post-production members found',
      });
    }

    const data = internalMembers.map((member) => {
      const memberJson = member.toJSON();
      const fullName = String(memberJson.name || '').trim();
      const [firstName, ...restParts] = fullName.split(/\s+/).filter(Boolean);
      const lastName = restParts.join(' ');

      return {
        post_production_member_id: memberJson.id,
        first_name: firstName || fullName || 'Unknown',
        last_name: lastName || '',
        email: memberJson.email || null,
        role: memberJson.role || 'Post Production',
        is_active: 1,
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Post-production members fetched successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching post production members:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};


exports.assignPostProductionMember = async (req, res) => {
  try {
    const { project_id, post_production_member_id } = req.body;

    if (!project_id || !post_production_member_id) {
      return res.status(400).json({
        error: true,
        message: 'Project ID and Post Production Member ID are required',
      });
    }

    // Resolve selected member from internal users first.
    const selectedUser = await users.findOne({
      where: {
        id: post_production_member_id,
        is_active: 1,
        assign_lead: 1,
        user_type: 1
      },
      attributes: ['id', 'name', 'email', 'role']
    });

    if (!selectedUser) {
      return res.status(404).json({
        error: true,
        message: 'Selected internal member not found or inactive',
      });
    }

    const selectedUserJson = selectedUser.toJSON();
    const fullName = String(selectedUserJson.name || '').trim();
    const [firstName, ...restParts] = fullName.split(/\s+/).filter(Boolean);
    const lastName = restParts.join(' ');

    // Backward-compatible storage in post_production_members table.
    // Reuse existing row by email, else create a new one.
    let postProductionMember = await post_production_members.findOne({
      where: { email: selectedUserJson.email, is_active: 1 },
    });

    if (!postProductionMember) {
      postProductionMember = await post_production_members.create({
        first_name: firstName || fullName || 'Unknown',
        last_name: lastName || '',
        email: selectedUserJson.email,
        phone_number: null,
        is_active: 1,
      });
    }

    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id, is_active: 1 },
    });

    if (!project) {
      return res.status(404).json({
        error: true,
        message: 'Project not found or inactive',
      });
    }

    // Prevent duplicate active assignment of the same member for this project.
    const existingAssignment = await assigned_post_production_member.findOne({
      where: {
        project_id,
        post_production_member_id: postProductionMember.post_production_member_id,
        is_active: 1,
      }
    });

    if (existingAssignment) {
      return res.status(200).json({
        error: false,
        message: 'Post production member already assigned',
        data: existingAssignment,
      });
    }

    const assignedPostProductionMember = await assigned_post_production_member.create({
      project_id,
      post_production_member_id: postProductionMember.post_production_member_id,
      assigned_date: new Date(),
      status: 'assigned',
      is_active: 1,
    });

    try {
      const emailClientName = await resolveAdminBookingClientName(project);
      const emailShootAmount = await resolveAdminBookingShootAmount(project);

      const mailResult = await sendPostProductionAssignmentEmail({
        to_email: postProductionMember.email,
        member_name: fullName || `${postProductionMember.first_name || ''} ${postProductionMember.last_name || ''}`.trim(),
        first_name: postProductionMember.first_name || firstName || '',
        booking_id: project.stream_project_booking_id,
        project_id: project.stream_project_booking_id,
        client: emailClientName,
        shoot_type: project.shoot_type || project.event_type || project.content_type,
        date: project.event_date,
        start_time: project.start_time,
        end_time: project.end_time,
        shoot_amount: emailShootAmount,
        location: project.event_location,
      });

      if (!mailResult?.success) {
        console.error('Post-production assignment email failed:', mailResult?.error);
      }
    } catch (mailErr) {
      console.error('Post-production assignment email trigger error:', mailErr?.response?.body || mailErr.message);
    }

    return res.status(201).json({
      error: false,
      message: 'Post production member assigned successfully',
      data: assignedPostProductionMember,
    });
  } catch (error) {
    console.error('Error assigning post production member:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

const truthyQueryValues = new Set(['1', 'true', 'yes', 'y']);
const restoreClientModes = new Set(['normal', 'restore_as_dual_profile', 'convert_back_to_client']);

const isTruthyQuery = (value) => truthyQueryValues.has(String(value || '').trim().toLowerCase());

const getClientArchiveStatus = (client) => Number(client?.is_active) === 1 ? 'active' : 'archived';

const getRequestActor = async (req) => {
  const actorId = Number(req.user?.userId || req.userId || 0);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    return null;
  }

  const actor = await users.findOne({
    where: { id: actorId },
    attributes: ['id', 'name', 'email', 'role'],
    raw: true
  });

  return {
    id: actorId,
    name: actor?.name || actor?.email || `User ${actorId}`,
    role: req.user?.userRole || req.userRole || actor?.role || null
  };
};

const writeArchiveHistory = async ({
  client,
  action,
  reason = null,
  actor,
  previousStatus,
  newStatus,
  metadata = null,
  transaction = null
}) => {
  return user_archive_history.create({
    target_type: 'client',
    target_id: client.client_id,
    user_id: client.user_id || null,
    action,
    reason,
    performed_by_user_id: actor.id,
    performed_by_name: actor.name,
    performed_by_role: actor.role,
    previous_status: previousStatus,
    new_status: newStatus,
    metadata
  }, { transaction });
};

const getArchiveHistoryForClient = async (clientId) => {
  const rows = await user_archive_history.findAll({
    where: {
      target_type: 'client',
      target_id: clientId
    },
    order: [['created_at', 'DESC']],
    raw: true
  });

  return rows.map((row) => ({
    history_id: row.history_id,
    target_type: row.target_type,
    target_id: row.target_id,
    user_id: row.user_id,
    action: row.action,
    reason: row.reason,
    performed_by_user_id: row.performed_by_user_id,
    performed_by_name: row.performed_by_name,
    performed_by_role: row.performed_by_role,
    previous_status: row.previous_status,
    new_status: row.new_status,
    metadata: row.metadata,
    created_at: row.created_at
  }));
};

const writeInternalUserArchiveHistory = async ({
  user,
  action,
  reason = null,
  actor,
  previousStatus,
  newStatus,
  metadata = null,
  transaction = null
}) => {
  return user_archive_history.create({
    target_type: 'internal_user',
    target_id: user.id,
    user_id: user.id,
    action,
    reason,
    performed_by_user_id: actor.id,
    performed_by_name: actor.name,
    performed_by_role: actor.role,
    previous_status: previousStatus,
    new_status: newStatus,
    metadata
  }, { transaction });
};

const getArchiveHistoryForInternalUser = async (userId) => {
  const rows = await user_archive_history.findAll({
    where: {
      target_type: 'internal_user',
      target_id: userId
    },
    order: [['created_at', 'DESC']],
    raw: true
  });

  return rows.map((row) => ({
    history_id: row.history_id,
    target_type: row.target_type,
    target_id: row.target_id,
    user_id: row.user_id,
    action: row.action,
    reason: row.reason,
    performed_by_user_id: row.performed_by_user_id,
    performed_by_name: row.performed_by_name,
    performed_by_role: row.performed_by_role,
    previous_status: row.previous_status,
    new_status: row.new_status,
    metadata: row.metadata,
    created_at: row.created_at
  }));
};

const findActiveCreativePartnerForClient = async (client, transaction = null) => {
  if (!client) return null;

  const where = {
    is_active: 1,
    [Op.or]: []
  };

  if (client.user_id) {
    where[Op.or].push({ user_id: client.user_id });
  }

  if (client.email) {
    where[Op.or].push({ email: client.email });
  }

  if (!where[Op.or].length) return null;

  return crew_members.findOne({
    where,
    attributes: ['crew_member_id', 'user_id', 'first_name', 'last_name', 'email', 'is_active'],
    transaction
  });
};

const resolveUserTypeId = async (roles, transaction = null) => {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const roleRows = await db.user_type.findAll({
    where: {
      user_role: {
        [Op.in]: roleList
      }
    },
    attributes: ['user_type_id', 'user_role'],
    transaction,
    raw: true
  });

  return roleRows[0]?.user_type_id || null;
};

const splitClientName = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { first_name: 'Creative', last_name: 'Partner' };
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ') || parts[0]
  };
};

const buildClientArchiveFields = (client) => ({
  archive_status: getClientArchiveStatus(client),
  is_archived: Number(client?.is_active) !== 1,
  archived_at: client?.archived_at || null,
  archive_reason: client?.archive_reason || null,
  restored_at: client?.restored_at || null
});

exports.getClients = async (req, res) => {
  try {
    let { page = 1, limit = 20, search, range, start_date, end_date, include_archived, archived_only } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const whereConditions = {};
    const shouldIncludeArchived = isTruthyQuery(include_archived);
    const shouldShowArchivedOnly = isTruthyQuery(archived_only);

    if (shouldShowArchivedOnly) {
      whereConditions.is_active = 0;
    } else if (!shouldIncludeArchived) {
      whereConditions.is_active = 1;
    }

    if (start_date && end_date) {
      whereConditions.created_at = {
        [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
      };
    } else if (range === 'month') {
      whereConditions[Op.and] = [
        Sequelize.where(
          Sequelize.fn('MONTH', Sequelize.col('clients.created_at')),
          Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))
        ),
        Sequelize.where(
          Sequelize.fn('YEAR', Sequelize.col('clients.created_at')),
          Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
        )
      ];
    } else if (range === 'week') {
      whereConditions[Op.and] = [
        Sequelize.where(
          Sequelize.fn('WEEK', Sequelize.col('clients.created_at')),
          Sequelize.fn('WEEK', Sequelize.fn('CURDATE'))
        ),
        Sequelize.where(
          Sequelize.fn('YEAR', Sequelize.col('clients.created_at')),
          Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
        )
      ];
    }

    if (search) {
      const searchFilter = {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } }
        ]
      };

      if (whereConditions[Op.and]) {
        whereConditions[Op.and].push(searchFilter);
      } else {
        whereConditions[Op.or] = searchFilter[Op.or];
      }
    }

    const { count, rows } = await clients.findAndCountAll({
      where: whereConditions,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: users,
          as: 'user',
          required: false,
          attributes: ['id'],
          include: [
            {
              model: sales_leads,
              as: 'sales_leads', 
              required: false,
              separate: true,
              limit: 1,
              order: [['created_at', 'DESC']],
              include: [
                {
                  model: stream_project_booking,
                  as: 'booking',
                  required: false
                }
              ]
            }
          ]
        }
      ]
    });

    const clientUserIds = Array.from(
      new Set(
        rows
          .map((client) => Number(client.user_id))
          .filter(Boolean)
      )
    );

    const affiliateRows = clientUserIds.length
      ? await affiliates.findAll({
          where: { user_id: { [Op.in]: clientUserIds } },
          attributes: ['user_id', 'referral_code'],
          raw: true
        })
      : [];

    const affiliateMap = new Map(
      affiliateRows.map((row) => [Number(row.user_id), row.referral_code || null])
    );

    const data = rows.map(client => {
      const lead = client.user?.sales_leads?.[0] || null;
      const booking = lead?.booking || null;
      const hasLinkedUser = Boolean(client.user?.id);
      const clientType = hasLinkedUser ? 'registered' : 'guest';

      return {
        ...client.toJSON(),
        ...buildClientArchiveFields(client),
        client_type: clientType,
        registration_type: clientType,
        is_guest: !hasLinkedUser,
        referral_code: affiliateMap.get(Number(client.user_id)) || null,
        intent: leadAssignmentService.getClientIntent({ lead, booking }),
        booking_status: leadAssignmentService.getClientBookingStatus(booking)
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Clients fetched successfully',
      data,
      pagination: {
        total_records: count,
        current_page: page,
        per_page: limit,
        total_pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error("Get Clients Error:", error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};


exports.editClient = async (req, res) => {
  try {
    const { client_id } = req.params;
    const { name, email, phone_number } = req.body;

    if (!name || !email || !phone_number) {
      return res.status(400).json({
        error: true,
        message: 'Name, email, and phone number are required'
      });
    }

    const client = await clients.findOne({
      where: { client_id, is_active: 1 }
    });

    if (!client) {
      return res.status(404).json({
        error: true,
        message: 'Client not found or inactive'
      });
    }

    const user = await users.findOne({
      where: { id: client.user_id, is_active: 1 }
    });

    if (!user) {
      return res.status(404).json({
        error: true,
        message: 'Associated user not found or inactive'
      });
    }

    const updatedClient = await clients.update(
      {
        name,
        email,
        phone_number
      },
      {
        where: { client_id }
      }
    );

    const updatedUser = await users.update(
      {
        name,
        email,
        phone_number
      },
      {
        where: { id: client.user_id }
      }
    );

    return res.status(200).json({
      error: false,
      message: 'Client and user updated successfully',
      data: {
        client: updatedClient,
        user: updatedUser
      }
    });

  } catch (error) {
    console.error("Error updating client:", error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.deleteClient = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { client_id } = req.params;
    const { reason = null } = req.body || {};
    const actor = await getRequestActor(req);

    if (!actor) {
      await transaction.rollback();
      return res.status(401).json({
        error: true,
        message: 'Authentication required to archive a client'
      });
    }

    const client = await clients.findOne({
      where: { client_id, is_active: 1 },
      transaction
    });

    if (!client) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'Client not found or already archived'
      });
    }

    await client.update({
      is_active: 0,
      archived_at: new Date(),
      archived_by_user_id: actor.id,
      archive_reason: reason || 'Archived by admin',
      restored_at: null,
      restored_by_user_id: null
    }, { transaction });

    if (client.user_id) {
      await users.increment('permissions_version', {
        by: 1,
        where: { id: client.user_id },
        transaction
      });
      await affiliates.update(
        { status: 'paused', is_active: 0 },
        { where: { user_id: client.user_id }, transaction }
      );
    }

    await writeArchiveHistory({
      client,
      action: 'archived',
      reason: reason || 'Archived by admin',
      actor,
      previousStatus: 'active',
      newStatus: 'archived',
      metadata: {
        source_endpoint: 'DELETE /admin/delete-client/:client_id',
        user_kept_active: true
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      error: false,
      message: 'Client archived successfully',
      data: {
        client_id: Number(client_id),
        archive_status: 'archived',
        user_kept_active: true
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting client:", error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.restoreClient = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { client_id } = req.params;
    const { reason = null, mode = 'normal' } = req.body || {};
    const actor = await getRequestActor(req);

    if (!restoreClientModes.has(mode)) {
      await transaction.rollback();
      return res.status(400).json({
        error: true,
        code: 'INVALID_RESTORE_MODE',
        message: 'Restore mode must be normal, restore_as_dual_profile, or convert_back_to_client'
      });
    }

    if (!actor) {
      await transaction.rollback();
      return res.status(401).json({
        error: true,
        message: 'Authentication required to restore a client'
      });
    }

    const client = await clients.findOne({
      where: { client_id },
      transaction
    });

    if (!client) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'Client not found'
      });
    }

    if (Number(client.is_active) === 1) {
      await transaction.rollback();
      return res.status(409).json({
        error: true,
        code: 'CLIENT_ALREADY_ACTIVE',
        message: 'Client is already active'
      });
    }

    const activeCreativePartner = await findActiveCreativePartnerForClient(client, transaction);

    if (activeCreativePartner && mode === 'normal') {
      await writeArchiveHistory({
        client,
        action: 'restore_blocked_role_conflict',
        reason: reason || 'Restore blocked because active creative partner exists',
        actor,
        previousStatus: 'archived',
        newStatus: 'archived',
        metadata: {
          creative_partner_id: activeCreativePartner.crew_member_id,
          restore_mode: mode
        },
        transaction
      });

      await transaction.commit();

      return res.status(409).json({
        error: true,
        code: 'ROLE_CONFLICT',
        message: 'This account is currently an active creative partner. Choose restore_as_dual_profile or convert_back_to_client.',
        data: {
          client_id: client.client_id,
          user_id: client.user_id,
          creative_partner_id: activeCreativePartner.crew_member_id
        }
      });
    }

    if (activeCreativePartner && mode === 'convert_back_to_client') {
      await activeCreativePartner.update({ is_active: 0 }, { transaction });

      const clientTypeId = await resolveUserTypeId(['client'], transaction);
      if (client.user_id && clientTypeId) {
        await users.update(
          { user_type: clientTypeId, role: 'client' },
          { where: { id: client.user_id }, transaction }
        );
      }
    }

    await client.update({
      is_active: 1,
      restored_at: new Date(),
      restored_by_user_id: actor.id
    }, { transaction });

    if (client.user_id) {
      await users.increment('permissions_version', {
        by: 1,
        where: { id: client.user_id },
        transaction
      });
      await affiliates.update(
        { status: 'active', is_active: 1 },
        { where: { user_id: client.user_id }, transaction }
      );
    }

    await writeArchiveHistory({
      client,
      action: 'restored',
      reason: reason || 'Restored by admin',
      actor,
      previousStatus: 'archived',
      newStatus: 'active',
      metadata: {
        restore_mode: mode,
        creative_partner_id: activeCreativePartner?.crew_member_id || null
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      error: false,
      message: 'Client restored successfully',
      data: {
        client_id: client.client_id,
        archive_status: 'active',
        restore_mode: mode,
        creative_partner_id: activeCreativePartner?.crew_member_id || null
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error restoring client:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.convertClientToCreativePartner = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { client_id } = req.params;
    const { reason = null, creative_partner = {} } = req.body || {};
    const actor = await getRequestActor(req);

    if (!actor) {
      await transaction.rollback();
      return res.status(401).json({
        error: true,
        message: 'Authentication required to convert a client'
      });
    }

    const client = await clients.findOne({
      where: { client_id },
      transaction
    });

    if (!client) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'Client not found'
      });
    }

    let clientUser = client.user_id
      ? await users.findOne({ where: { id: client.user_id }, transaction })
      : null;

    if (!clientUser && client.email) {
      clientUser = await users.findOne({ where: { email: client.email }, transaction });
    }

    if (!clientUser) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'Associated user not found. Please create or link the user before converting.'
      });
    }

    let creativePartner = await findActiveCreativePartnerForClient(client, transaction);
    const nameParts = splitClientName(client.name);

    if (!creativePartner) {
      creativePartner = await crew_members.findOne({
        where: { email: client.email },
        transaction
      });

      if (creativePartner) {
        await creativePartner.update({
          user_id: clientUser.id,
          is_active: 1,
          is_available: creativePartner.is_available ?? 1,
          primary_role: creative_partner.primary_role || creativePartner.primary_role
        }, { transaction });
      } else {
        creativePartner = await crew_members.create({
          user_id: clientUser.id,
          first_name: creative_partner.first_name || nameParts.first_name,
          last_name: creative_partner.last_name || nameParts.last_name,
          email: client.email,
          phone_number: client.phone_number || null,
          primary_role: creative_partner.primary_role || null,
          is_active: 1,
          is_available: 1,
          is_draft: creative_partner.is_draft ?? 1,
          is_crew_verified: creative_partner.is_crew_verified ?? 0,
          created_from: actor.id
        }, { transaction });
      }
    }

    const creatorTypeId = await resolveUserTypeId(['creator', 'creative_partner', 'creative'], transaction);
    await clientUser.update({
      user_type: creatorTypeId || clientUser.user_type,
      role: 'creator',
      is_active: 1,
      permissions_version: Number(clientUser.permissions_version || 1) + 1
    }, { transaction });

    await affiliates.update(
      { status: 'active', is_active: 1 },
      { where: { user_id: clientUser.id }, transaction }
    );

    const wasActive = Number(client.is_active) === 1;
    if (wasActive) {
      await client.update({
        is_active: 0,
        archived_at: new Date(),
        archived_by_user_id: actor.id,
        archive_reason: reason || 'Converted to creative partner',
        restored_at: null,
        restored_by_user_id: null
      }, { transaction });

      await writeArchiveHistory({
        client,
        action: 'archived',
        reason: reason || 'Converted to creative partner',
        actor,
        previousStatus: 'active',
        newStatus: 'archived',
        metadata: { source_endpoint: 'convert-to-creative-partner' },
        transaction
      });
    }

    await writeArchiveHistory({
      client,
      action: 'converted_to_creator',
      reason: reason || 'Converted to creative partner',
      actor,
      previousStatus: wasActive ? 'active_client' : 'archived_client',
      newStatus: 'creative_partner',
      metadata: {
        creative_partner_id: creativePartner.crew_member_id,
        user_id: clientUser.id
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      error: false,
      message: 'Client converted to creative partner successfully',
      data: {
        client_id: client.client_id,
        user_id: clientUser.id,
        creative_partner_id: creativePartner.crew_member_id,
        archive_status: 'archived'
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error converting client to creative partner:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { project_id } = req.params;

    if (!project_id) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    const project = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    await assigned_crew.update({ is_active: 0 }, { where: { project_id: project.stream_project_booking_id } });
    await assigned_equipment.update({ is_active: 0 }, { where: { project_id: project.stream_project_booking_id } });
    await assigned_post_production_member.update({ is_active: 0 }, { where: { project_id: project.stream_project_booking_id } });

    await project.update({ is_active: 0 });

    return res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during project deletion',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.uploadProfilePhoto = [
  upload.single('profile_photo'),

  async (req, res) => {
    try {
      const { crew_member_id } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(constants.BAD_REQUEST.code).json({
          error: true,
          code: constants.BAD_REQUEST.code,
          message: 'Profile photo is required.',
          data: null,
        });
      }

      console.log('Uploaded file:', file);

      const existingProfilePhoto = await crew_member_files.findOne({
        where: {
          crew_member_id,
          file_type: 'profile_photo'
        }
      });

      const filePaths = await S3UploadFiles({ profile_photo: [file] });

      const filePath = filePaths.length > 0 ? filePaths[0].file_path : null;

      if (!filePath) {
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
          error: true,
          code: constants.INTERNAL_SERVER_ERROR.code,
          message: 'Error uploading the profile photo.',
          data: null,
        });
      }

      if (existingProfilePhoto) {
        await crew_member_files.update({
          file_type: 'profile_photo',
          file_path: filePath,
        }, {
          where: {
            crew_member_id,
            file_type: 'profile_photo'
          }
        });
      } else {
        await crew_member_files.create({
          crew_member_id,
          file_type: 'profile_photo',
          file_path: filePath, 
        });
      }

      return res.status(constants.CREATED.code).json({
        error: false,
        code: constants.CREATED.code,
        message: 'Profile photo uploaded and replaced successfully.',
        data: { file_path: filePath },
      });
    } catch (error) {
      console.error('Error in uploading profile photo:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        error: true,
        code: constants.INTERNAL_SERVER_ERROR.code,
        message: constants.INTERNAL_SERVER_ERROR.message,
        data: null,
      });
    }
  },
];

exports.getAllPendingCrewMembers = async (req, res) => {
  try {
    // 1. Fetch all pending members (is_crew_verified: 0) and ALL roles in parallel
    const [members, allRoles] = await Promise.all([
      crew_members.findAll({
        where: { 
          is_active: 1, 
          is_crew_verified: 0  // Hardcoded for Pending
        },
        include: [
          {
            model: crew_member_files,
            as: 'crew_member_files',
            attributes: ['crew_files_id', 'file_type', 'file_path'],
          }
        ],
        order: [['created_at', 'DESC']], // Newest applications at the top
      }),
      crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
    ]);

    // 2. DATA PROCESSING
    const processedMembers = members.map((member) => {
      const memberData = member.toJSON();
      
      // Handle Location Parsing
      const loc = member.location;
      let finalLocation = loc;
      if (loc && typeof loc === 'string' && (loc.startsWith('{') || loc.startsWith('['))) {
        try {
          const parsed = JSON.parse(loc);
          finalLocation = parsed.address || parsed || loc;
        } catch { finalLocation = loc; }
      }

      // Handle Role Mapping from JSON string to Names
      let roleNames = [];
      try {
        const roleIds = JSON.parse(memberData.primary_role || "[]");
        roleNames = allRoles
            .filter(r => roleIds.includes(String(r.role_id)) || roleIds.includes(Number(r.role_id)))
            .map(r => r.role_name);
      } catch (e) {
        console.error("Role parsing error", e);
      }

      return { 
        ...memberData, 
        location: finalLocation, 
        status: 'pending',
        role: roleNames.length > 0 ? { role_name: roleNames.join(", ") } : null 
      };
    });

    return res.status(200).json({
      error: false,
      message: "All pending crew members fetched successfully",
      total_pending: processedMembers.length,
      data: processedMembers,
    });
  } catch (error) {
    console.error("Get All Pending Crew Members Error:", error);
    return res.status(500).json({ error: true, message: "Internal server error" });
  }
};

exports.getApprovedCrewMembers = async (req, res) => {
    try {
        let {
            page = 1,
            limit = 20,
            search,
            location,
            start_date,
            end_date,
            sort_by = 'crew_member_id',
            sort_order = 'DESC'
        } = req.body;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // 1. Setup Base Conditions
        let conditions = [{ is_active: 1 }, { is_crew_verified: 1 }];

        if (start_date && end_date) {
            conditions.push({ 'created_at': { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] } });
        }
        
        if (location) conditions.push({ location: { [Sequelize.Op.like]: `%${location}%` } });

        // 2. Advanced Search Logic (Name, Email, ID AND Roles)
        if (search) {
            // First, find any role IDs that match the search string (e.g., "video" matches "Videographer")
            const matchingRoles = await crew_roles.findAll({
                where: { role_name: { [Sequelize.Op.like]: `%${search}%` } },
                attributes: ['role_id'],
                raw: true
            });

            const roleIds = matchingRoles.map(r => r.role_id.toString());

            let searchOrConditions = [
                { first_name: { [Sequelize.Op.like]: `%${search}%` } },
                { last_name: { [Sequelize.Op.like]: `%${search}%` } },
                { email: { [Sequelize.Op.like]: `%${search}%` } },
                { crew_member_id: { [Sequelize.Op.like]: `%${search}%` } }
            ];

            // If we found matching roles, add a condition to check the primary_role column
            roleIds.forEach(id => {
                searchOrConditions.push({ 
                    primary_role: { [Sequelize.Op.like]: `%${id}%` } 
                });
            });

            conditions.push({ [Sequelize.Op.or]: searchOrConditions });
        }

        // 3. Setup Sorting
        let orderColumn = 'crew_member_id';
        if (sort_by === 'first_name') orderColumn = 'first_name';
        if (sort_by === 'status') orderColumn = 'status';
        if (sort_by === 'created_at') orderColumn = 'created_at';

        const orderDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // 4. Query Database
        const [{ count, rows: members }, allRoles] = await Promise.all([
            crew_members.findAndCountAll({
                where: { [Sequelize.Op.and]: conditions },
                distinct: true,
                col: 'crew_member_id',
                include: [{
                    model: crew_member_files,
                    as: 'crew_member_files',
                    attributes: ['crew_files_id', 'file_type', 'file_path'],
                }],
                order: [[orderColumn, orderDirection]],
                limit,
                offset,
            }),
            crew_roles.findAll({ attributes: ['role_id', 'role_name'], raw: true })
        ]);

        // 5. Process Data for Frontend
        const processedMembers = members.map((member) => {
            const memberData = member.get({ clone: true });
            
            let roleNames = [];
            const rawRole = memberData.primary_role;
            if (rawRole) {
                let roleIds = [];
                try {
                    const parsed = JSON.parse(rawRole);
                    roleIds = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
                } catch (e) { roleIds = [String(rawRole)]; }
                
                roleNames = allRoles
                    .filter(r => roleIds.includes(String(r.role_id)))
                    .map(r => r.role_name);
            }

            return {
                ...memberData,
                status: 'approved',
                role: { role_name: roleNames.length > 0 ? roleNames.join(", ") : "N/A" }
            };
        });

        return res.status(200).json({
            error: false,
            message: "Success",
            pagination: {
                total_records: count,
                current_page: page,
                per_page: limit,
                total_pages: Math.ceil(count / limit),
            },
            data: processedMembers,
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: true, message: "Internal error" });
    }
};

exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: true,
        message: 'Client ID is required'
      });
    }

    const client = await clients.findOne({
      where: {
        client_id: id
      },
      include: [
        {
          model: users,
          as: 'archived_by',
          required: false,
          attributes: ['id', 'name', 'role']
        },
        {
          model: users,
          as: 'restored_by',
          required: false,
          attributes: ['id', 'name', 'role']
        }
      ]
    });

    if (!client) {
      return res.status(404).json({
        error: true,
        message: 'Client not found'
      });
    }

    const user = await users.findOne({
      where: { id: client.user_id },
      attributes: { exclude: ['password_hash'] } // never return password
    });

    const affiliate = await affiliates.findOne({
      where: { user_id: client.user_id }
    });
    const [archiveHistory, activeCreativePartner] = await Promise.all([
      getArchiveHistoryForClient(client.client_id),
      findActiveCreativePartnerForClient(client)
    ]);

    const archiveStatus = getClientArchiveStatus(client);
    const canRestore = archiveStatus === 'archived' && !activeCreativePartner;

    const [creditSummary, creditHistoryRows] = await Promise.all([
      accountCreditService.getAccountCreditBalance({
        userId: client.user_id || null,
        guestEmail: user?.email || client.email || null
      }),
      accountCreditService.getAccountCreditHistory({
        userId: client.user_id || null,
        guestEmail: user?.email || client.email || null,
        limit: 10,
        offset: 0
      })
    ]);

    const creditHistory = (creditHistoryRows || []).map((row) => {
      const plain = row?.toJSON ? row.toJSON() : row;
      const isDebit = plain.entry_type === 'credit_used' || plain.entry_type === 'credit_reversed';
      return {
        account_credit_ledger_id: plain.account_credit_ledger_id,
        amount: parseFloat(plain.amount || 0),
        direction: isDebit ? 'debit' : 'credit',
        entry_type: plain.entry_type,
        status: plain.status,
        source: plain.source,
        notes: plain.notes || null,
        booking_id: plain.booking_id || null,
        booking_name: plain.booking?.project_name || null,
        booking_event_date: plain.booking?.event_date || null,
        created_at: plain.created_at || null
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Client details fetched successfully',
      data: {
        client: {
          ...client.toJSON(),
          ...buildClientArchiveFields(client),
          client_type: user ? 'registered' : 'guest',
          registration_type: user ? 'registered' : 'guest',
          is_guest: !Boolean(user)
        },
        user: user,
        affiliate: affiliate,
        archive_history: archiveHistory,
        restore_options: {
          can_restore: canRestore,
          blocked_reason: archiveStatus === 'archived' && activeCreativePartner
            ? 'ACTIVE_CREATIVE_PARTNER_EXISTS'
            : null,
          creative_partner_id: activeCreativePartner?.crew_member_id || null,
          allowed_modes: activeCreativePartner
            ? ['restore_as_dual_profile', 'convert_back_to_client']
            : ['normal']
        },
        account_credit: {
          total_credit_amount: creditSummary?.total_credit_amount || 0,
          used_credit_amount: creditSummary?.used_credit_amount || 0,
          pending_credit_amount: creditSummary?.pending_credit_amount || 0,
          available_credit_amount: creditSummary?.available_credit_amount || 0,
          latest_credit: creditSummary?.latest_credit || null
        },
        credit_history: creditHistory
      }
    });

  } catch (error) {
    console.error('Get Client By ID Error:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.getArchiveHistory = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 20,
      target_type = 'client',
      action,
      target_id
    } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    page = Number.isInteger(page) && page > 0 ? page : 1;
    limit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const offset = (page - 1) * limit;

    const where = {};

    if (target_type) {
      where.target_type = target_type;
    }

    if (action) {
      where.action = action;
    }

    if (target_id) {
      where.target_id = target_id;
    }

    const { count, rows } = await user_archive_history.findAndCountAll({
      where,
      limit,
      offset,
      order: [['created_at', 'DESC']],
      raw: true
    });

    const clientIds = rows
      .filter((row) => row.target_type === 'client')
      .map((row) => Number(row.target_id))
      .filter(Boolean);

    const targetClients = clientIds.length
      ? await clients.findAll({
          where: { client_id: { [Op.in]: clientIds } },
          attributes: ['client_id', 'name', 'email', 'is_active', 'archived_at', 'restored_at'],
          raw: true
        })
      : [];

    const clientMap = new Map(targetClients.map((client) => [Number(client.client_id), client]));

    const data = rows.map((row) => {
      const targetClient = row.target_type === 'client'
        ? clientMap.get(Number(row.target_id))
        : null;

      return {
        history_id: row.history_id,
        target_type: row.target_type,
        target_id: row.target_id,
        target_name: targetClient?.name || null,
        target_email: targetClient?.email || null,
        user_id: row.user_id,
        action: row.action,
        reason: row.reason,
        performed_by_user_id: row.performed_by_user_id,
        performed_by_name: row.performed_by_name,
        performed_by_role: row.performed_by_role,
        previous_status: row.previous_status,
        new_status: row.new_status,
        metadata: row.metadata,
        created_at: row.created_at,
        archive_status: targetClient ? getClientArchiveStatus(targetClient) : null
      };
    });

    return res.status(200).json({
      error: false,
      message: 'Archive history fetched successfully',
      data,
      pagination: {
        total_records: count,
        current_page: page,
        per_page: limit,
        total_pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get Archive History Error:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.getClientsShoots = async (req, res) => {
  try {
    const { clientId } = req.params;
    let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;

    if (!clientId) {
      return res.status(400).json({ error: true, message: "clientId is required" });
    }

    const today = new Date();

    // 1️⃣ Get client to find user_id
    const client = await clients.findOne({
      where: { client_id: clientId }
    });

    if (!client) {
      return res.status(404).json({ error: true, message: "Client not found" });
    }

    const user_id = client.user_id;
    const clientEmail = String(client.email || '').trim().toLowerCase();
    // Scope projects correctly:
    // - Registered client: by user_id
    // - Guest client: by guest_email only
    const clientProjectScope = user_id
      ? { user_id }
      : {
          ...(clientEmail
            ? {
                [Sequelize.Op.and]: [
                  Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('guest_email')),
                    clientEmail
                  )
                ]
              }
            : { guest_email: { [Sequelize.Op.eq]: '__no_guest_email__' } })
        };

    // -------- PAGINATION --------
    const noPagination = !limit && !page;
    let pageNumber = null;
    let pageSize = null;
    let offset = null;

    if (!noPagination) {
      pageNumber = parseInt(page ?? 1, 10);
      pageSize = parseInt(limit ?? 10, 10);
      offset = (pageNumber - 1) * pageSize;
    }

    // -------- DATE FILTER --------
    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter = {
        event_date: {
          [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
        }
      };
    } else if (range === 'month') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(
            Sequelize.fn('MONTH', Sequelize.col('event_date')),
            Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))
          ),
          Sequelize.where(
            Sequelize.fn('YEAR', Sequelize.col('event_date')),
            Sequelize.fn('YEAR', Sequelize.fn('CURDATE'))
          )
        ]
      };
    } else if (range === 'week') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(
            Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1),
            Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1)
          )
        ]
      };
    }

    // -------- BASE WHERE --------
    const whereConditions = {
      is_active: 1,
      ...clientProjectScope,
      ...dateFilter
    };

    // -------- STATUS FILTER --------
    if (status) {
      switch (status) {
        case 'cancelled':
          whereConditions.is_cancelled = 1;
          break;
        case 'completed':
          whereConditions.is_completed = 1;
          break;
        case 'upcoming':
          whereConditions.is_cancelled = 0;
          whereConditions.is_draft = 0;
          whereConditions.event_date = {
            ...(dateFilter.event_date || {}),
            [Sequelize.Op.gt]: today
          };
          break;
        case 'draft':
          whereConditions.is_draft = 1;
          break;
      }
    }

    if (event_type) {
      whereConditions.event_type = event_type;
    }

    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('project_name')),
        { [Sequelize.Op.like]: `%${search.toLowerCase()}%` }
      );
    }

    // -------- COUNTS --------
    const [
      total_active,
      total_cancelled,
      total_completed,
      total_upcoming,
      total_draft
    ] = await Promise.all([
      stream_project_booking.count({
        where: { ...clientProjectScope, is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 }
      }),
      stream_project_booking.count({
        where: { ...clientProjectScope, is_cancelled: 1 }
      }),
      stream_project_booking.count({
        where: { ...clientProjectScope, is_completed: 1 }
      }),
      stream_project_booking.count({
        where: {
          ...clientProjectScope,
          is_cancelled: 0,
          is_draft: 0,
          event_date: { [Sequelize.Op.gt]: today }
        }
      }),
      stream_project_booking.count({
        where: { ...clientProjectScope, is_draft: 1 }
      }),
    ]);

    // -------- FETCH PROJECTS --------
    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [['event_date', 'DESC']]
    });

    const bookingIds = projects
      .map((project) => Number(project.stream_project_booking_id))
      .filter((id) => Number.isFinite(id));

    const bookedLeadRows = bookingIds.length
      ? await sales_leads.findAll({
          where: {
            booking_id: { [Sequelize.Op.in]: bookingIds },
            lead_status: 'booked',
            is_active: 1
          },
          attributes: ['booking_id'],
          raw: true
        })
      : [];

    const bookedBookingIdSet = new Set(
      bookedLeadRows
        .map((row) => Number(row.booking_id))
        .filter((id) => Number.isFinite(id))
    );

    // -------- FETCH ASSOCIATED DATA --------
    const projectDetails = await Promise.all(
  projects.map(async (project) => {

    const [
      assignedCrew,
      assignedEquipment,
      assignedPostProd,
      paymentData
    ] = await Promise.all([
      assigned_crew.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: crew_members, as: 'crew_member' }]
      }),
      assigned_equipment.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: equipment, as: 'equipment' }]
      }),
      assigned_post_production_member.findAll({
        where: { project_id: project.stream_project_booking_id, is_active: 1 },
        include: [{ model: post_production_members, as: 'post_production_member' }]
      }),
      payment_transactions.findOne({
        where: { payment_id: project.payment_id },
        attributes: ['total_amount']
      })
    ]);

    // -------- FORMAT EVENT TYPES --------
    const rawTypes = project.event_type ? project.event_type.split(',') : [];
    const formattedTypes = rawTypes.map(t => {
      const val = t.trim();
      const stringMap = {
        'videographer': 'Videography',
        'photographer': 'Photography'
      };
      return stringMap[val?.toLowerCase()] ||
        val.charAt(0).toUpperCase() + val.slice(1);
    });

    const displayAmount = await resolveProjectDisplayAmount({
      project,
      paymentData
    });
    const totalValueAmount = await resolveProjectTotalValueAmount({
      project
    });

    return {
      project: {
        ...project.toJSON(),
        total_paid_amount: displayAmount,
        total_value_amount: totalValueAmount,
        event_type_labels: formattedTypes.join(', '),
        event_location: (() => {
          const loc = project.event_location;
          if (!loc) return null;
          try {
            if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
              const parsed = JSON.parse(loc);
              return parsed.address || parsed;
            }
          } catch (e) {
            return loc;
          }
          return loc;
        })()
      },
      assignedCrew,
      assignedEquipment,
      assignedPostProductionMembers: assignedPostProd
    };
  })
);

    // 🔥 -------- SEPARATE PAID & UNPAID/DRAFT --------
    const paid = [];
    const unpaid_or_draft = [];

    projectDetails.forEach(item => {
      const proj = item.project;
      const isManualPaid = bookedBookingIdSet.has(Number(proj.stream_project_booking_id));
      const isStripePaid = Boolean(proj.payment_id);
      const isPaid = (isStripePaid || isManualPaid) && proj.is_draft !== 1;

      if (isPaid) {
        paid.push(item);
      } else {
        unpaid_or_draft.push(item);
      }
    });

    return res.status(200).json({
      error: false,
      message: 'Client shoots fetched successfully',
      data: {
        client: {
          ...client.toJSON(),
          client_type: user_id ? 'registered' : 'guest',
          registration_type: user_id ? 'registered' : 'guest',
          is_guest: !Boolean(user_id)
        },
        stats: {
          total_active,
          total_cancelled,
          total_completed,
          total_upcoming,
          total_draft
        },
        projects: {
          paid,
          unpaid_or_draft
        },
        pagination: noPagination ? null : {
          page: pageNumber,
          limit: pageSize
        }
      }
    });

  } catch (error) {
    console.error('Admin Get Client Shoots Error:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};


exports.searchCrewForLead = async (req, res) => {
    try {
        const {
            lead_id,
            role_type,
            search_query,
            max_distance,
            radius,
            latitude,
            longitude,
            date
        } = req.query;

        const requestedRadius = Number(max_distance ?? radius ?? 50);
        const normalizedSearchQuery = typeof search_query === 'string' ? search_query.trim() : '';
        const hasGlobalCrewSearch = normalizedSearchQuery.length > 0;

        let projectDate;
        let currentBookingId = null;
        let eventLocation = null;
        let centerLatitude = null;
        let centerLongitude = null;

        if (lead_id) {
            const lead = await sales_leads.findOne({
                where: { lead_id },
                include: [{ model: stream_project_booking, as: 'booking' }]
            });

            if (!lead || !lead.booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Lead or associated Booking not found'
                });
            }

            projectDate = lead.booking.event_date;
            eventLocation = lead.booking.event_location;
            currentBookingId = lead.booking.stream_project_booking_id;
            centerLatitude = Number(lead.booking.event_latitude);
            centerLongitude = Number(lead.booking.event_longitude);
        } else {
            if (!date && !hasGlobalCrewSearch) {
                return res.status(400).json({
                    success: false,
                    message: 'Date is required when lead_id is not provided'
                });
            }
            projectDate = date || null;
        }

        if (latitude !== undefined && longitude !== undefined) {
            centerLatitude = Number(latitude);
            centerLongitude = Number(longitude);
        } else if ((!Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) && eventLocation) {
            const coords = extractCoordinatesFromPayload({}, eventLocation);
            centerLatitude = Number(coords.latitude);
            centerLongitude = Number(coords.longitude);
        }

        const hasSearchCenter = Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude);

        const busyCrewRecords = projectDate && !hasGlobalCrewSearch
            ? await assigned_crew.findAll({
                where: {
                    crew_accept: 1,
                    is_active: 1
                },
                include: [{
                    model: stream_project_booking,
                    as: 'project',
                    where: { event_date: projectDate }
                }],
                attributes: ['crew_member_id']
            })
            : [];

        let alreadyAssignedToThisLead = [];
        if (currentBookingId) {
            const currentAssignments = await assigned_crew.findAll({
                where: {
                    project_id: currentBookingId,
                    is_active: 1,
                    crew_accept: { [Op.in]: [0, 1] }
                },
                attributes: ['crew_member_id']
            });

            alreadyAssignedToThisLead = currentAssignments.map(a => Number(a.crew_member_id));
        }

        const busyIds = busyCrewRecords.map(r => Number(r.crew_member_id));
        const excludeIds = [...new Set([...busyIds, ...alreadyAssignedToThisLead])];

        const ROLE_GROUPS = {
            videographer: ['9', '1'],
            photographer: ['10', '2'],
            cinematographer: ['11', '3']
        };

        const requestedRoles = role_type
            ? role_type.split(',').map(r => r.trim().toLowerCase())
            : [];

        let targetRoleIds = [];
        requestedRoles.forEach(role => {
            if (ROLE_GROUPS[role]) {
                targetRoleIds.push(...ROLE_GROUPS[role]);
            }
        });
        targetRoleIds = [...new Set(targetRoleIds)];

        const crewWhere = {
            is_active: true,
            is_crew_verified: 1,
            crew_member_id: { [Op.notIn]: excludeIds.length ? excludeIds : [0] }
        };

        if (!hasGlobalCrewSearch) {
            crewWhere.is_available = true;
        }

        if (targetRoleIds.length > 0 && !hasGlobalCrewSearch) {
            crewWhere[Op.or] = targetRoleIds.map(id => ({
                primary_role: { [Op.like]: `%${id}%` }
            }));
        }

        if (hasGlobalCrewSearch) {
            crewWhere[Op.and] = [{
                [Op.or]: [
                    { first_name: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    { last_name: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    Sequelize.where(
                        Sequelize.fn('CONCAT', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
                        { [Op.like]: `%${normalizedSearchQuery}%` }
                    ),
                    { email: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    { phone_number: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    { location: { [Op.like]: `%${normalizedSearchQuery}%` } }
                ]
            }];
        }

        const availableCrew = await crew_members.findAll({
            where: crewWhere,
            include: [
                {
                    model: crew_member_files,
                    as: 'crew_member_files',
                    attributes: ['file_path'],
                    where: { is_active: 1, file_type: 'profile_photo' },
                    required: false,
                }
            ],
            limit: 200
        });

        const crewWithRoles = availableCrew.map(crewMember => {
            let matchedRoles = [];
            let rawRoles = [];

            try {
                if (crewMember.primary_role) {
                    if (Array.isArray(crewMember.primary_role)) {
                        rawRoles = crewMember.primary_role;
                    } else if (typeof crewMember.primary_role === 'string') {
                        try {
                            const parsed = JSON.parse(crewMember.primary_role);
                            rawRoles = Array.isArray(parsed) ? parsed : [parsed];
                        } catch {
                            rawRoles = crewMember.primary_role.split(',').map(r => r.trim());
                        }
                    }
                }
            } catch (e) { rawRoles = []; }

            const stringRoleIds = rawRoles.map(String);
            if (stringRoleIds.some(id => ROLE_GROUPS.videographer.includes(id))) matchedRoles.push('videographer');
            if (stringRoleIds.some(id => ROLE_GROUPS.photographer.includes(id))) matchedRoles.push('photographer');
            if (stringRoleIds.some(id => ROLE_GROUPS.cinematographer.includes(id))) matchedRoles.push('cinematographer');

            const profilePhoto = crewMember.crew_member_files && crewMember.crew_member_files.length > 0
                ? crewMember.crew_member_files[0].file_path
                : null;

            const crewJson = crewMember.toJSON();
            delete crewJson.crew_member_files;

            const formattedFirstName = crewJson.first_name.charAt(0).toUpperCase() + crewJson.first_name.slice(1).toLowerCase();
            const formattedLastName = crewJson.last_name.charAt(0).toUpperCase();

            const crewLatitude = Number(crewJson.latitude);
            const crewLongitude = Number(crewJson.longitude);
            const distanceMiles = hasSearchCenter && Number.isFinite(crewLatitude) && Number.isFinite(crewLongitude)
                ? calculateDistance(centerLatitude, centerLongitude, crewLatitude, crewLongitude)
                : null;

            return {
                ...crewJson,
                profile_photo: profilePhoto,
                first_name: formattedFirstName,
                last_name: formattedLastName,
                role_names: matchedRoles.length > 0 ? matchedRoles : ['Unspecified'],
                role: matchedRoles.length > 0 ? matchedRoles.join(', ') : 'Unspecified',
                distance: distanceMiles
            };
        });

        const filteredCrew = hasSearchCenter && !hasGlobalCrewSearch
            ? crewWithRoles
                .filter(crew => crew.distance !== null && crew.distance <= requestedRadius)
                .sort((a, b) => a.distance - b.distance)
            : crewWithRoles.sort((a, b) => {
                if (a.distance === null && b.distance === null) return 0;
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
            });

        res.json({
            success: true,
            project_date: projectDate,
            available_count: filteredCrew.length,
            search_center: hasSearchCenter ? { latitude: centerLatitude, longitude: centerLongitude } : null,
            radius: Number.isFinite(requestedRadius) ? requestedRadius : null,
            search_query: hasGlobalCrewSearch ? normalizedSearchQuery : null,
            search_scope: hasGlobalCrewSearch ? 'all_crew' : 'radius',
            data: filteredCrew
        });

    } catch (error) {
        console.error('searchCrewForLead error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
// const geocoder = NodeGeocoder({ 
//     provider: 'openstreetmap',
//     httpAdapter: 'fetch',
//     fetchOptions: {
//         headers: { 'User-Agent': 'BeigeCreativeSearch/2.0 (admin@yourdomain.com)' }
//     }
// });

// // 2. Global Runtime Cache (Stores coordinates for cities found during searches)
// // This makes the search faster and faster the more you use it.
// const VOLATILE_CITY_CACHE = {
//     'ahmedabad': { lat: 23.0225, lon: 72.5714 },
//     'vadodara': { lat: 22.3072, lon: 73.1812 },
//     'mumbai': { lat: 19.0760, lon: 72.8777 },
//     'new york': { lat: 40.7128, lon: -74.0060 },
//     'los angeles': { lat: 34.0522, lon: -118.2437 }
// };

// // 3. Helper: Extract City from Address String
// const extractCity = (address) => {
//     if (!address) return null;
//     const parts = address.split(/[,،]/);
//     if (parts.length < 2) return address.trim().toLowerCase();
    
//     // For USA: usually "City, State Zip" is at the end. 
//     // We take the last 2-3 parts for better accuracy
//     const cityPart = parts[parts.length - 2] || parts[0];
//     return cityPart.trim().toLowerCase();
// };

// // 4. Helper: Haversine distance
// const getDistanceInMiles = (lat1, lon1, lat2, lon2) => {
//     if (!lat1 || !lon1 || !lat2 || !lon2) return null;
//     const R = 3958.8; 
//     const dLat = (lat2 - lat1) * Math.PI / 180;
//     const dLon = (lon2 - lon1) * Math.PI / 180;
//     const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
//               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
//               Math.sin(dLon / 2) * Math.sin(dLon / 2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
//     return R * c;
// };

// const parseWorkingDistance = (distStr) => {
//     if (!distStr) return 100;
//     const lower = distStr.toLowerCase();
//     if (lower.includes("open to traveling") || lower.includes("anywhere")) return 5000;
//     const numbers = distStr.match(/\d+/g);
//     return numbers ? Math.max(...numbers.map(Number)) : 100;
// };

// const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// exports.searchCrewForLead = async (req, res) => {
//     try {
//         const { lead_id, role_type, search_query, date, radius } = req.query;
//         const requestedRadius = radius ? parseFloat(radius) : 0;

//         let projectDate;
//         let currentBookingId = null;
//         let centerCoords = null;

//         // 1. Get Project Center Coordinates
//         if (search_query) {
//             const cityKey = extractCity(search_query);
//             if (VOLATILE_CITY_CACHE[cityKey]) {
//                 centerCoords = VOLATILE_CITY_CACHE[cityKey];
//             } else {
//                 try {
//                     const geo = await geocoder.geocode(search_query);
//                     if (geo.length > 0) {
//                         centerCoords = { lat: geo[0].latitude, lon: geo[0].longitude };
//                         VOLATILE_CITY_CACHE[cityKey] = centerCoords; // Save to cache
//                     }
//                 } catch (e) { console.error("Center Geocode Error"); }
//             }
//         }

//         // 2. Lead/Date Discovery
//         if (lead_id) {
//             const lead = await sales_leads.findOne({
//                 where: { lead_id },
//                 include: [{ model: stream_project_booking, as: 'booking' }]
//             });
//             if (lead?.booking) {
//                 projectDate = lead.booking.event_date;
//                 currentBookingId = lead.booking.stream_project_booking_id;
//             }
//         } else { projectDate = date; }

//         // 3. Exclude Busy Crew
//         const busyRecords = await assigned_crew.findAll({
//             where: { crew_accept: 1, is_active: 1 },
//             include: [{ model: stream_project_booking, as: 'project', where: { event_date: projectDate } }],
//             attributes: ['crew_member_id']
//         });
//         const excludeIds = busyRecords.map(r => Number(r.crew_member_id));

//         // 4. Database Fetch
//         const ROLE_GROUPS = { videographer: ["9", "1"], photographer: ["10", "2"], cinematographer: ["11", "3"] };
//         const requestedRoles = role_type ? role_type.split(",").map(r => r.trim().toLowerCase()) : [];
//         let targetRoleIds = [];
//         requestedRoles.forEach(role => { if (ROLE_GROUPS[role]) targetRoleIds.push(...ROLE_GROUPS[role]); });

//         let crewWhere = {
//             is_active: true,
//             is_crew_verified: 1,
//             crew_member_id: { [Op.notIn]: excludeIds.length ? excludeIds : [0] }
//         };
//         if (targetRoleIds.length > 0) {
//             crewWhere[Op.or] = targetRoleIds.map(id => ({ primary_role: { [Op.like]: `%${id}%` } }));
//         }

//         const allCandidates = await crew_members.findAll({
//             where: crewWhere,
//             include: [{ model: crew_member_files, as: "crew_member_files", where: { is_active: 1, file_type: "profile_photo" }, required: false }],
//         });

//         // 5. SMART RADIUS FILTERING
//         const finalResults = [];

//         for (const crew of allCandidates) {
//             const crewJson = crew.toJSON();
//             let distance = null;
//             let isWithinRange = requestedRadius > 0 ? false : true;

//             if (requestedRadius > 0 && crewJson.location) {
//                 const crewCity = extractCity(crewJson.location);
                
//                 // Text Match Optimization (Instant)
//                 if (search_query && crewJson.location.toLowerCase().includes(search_query.toLowerCase())) {
//                     isWithinRange = true;
//                     distance = 0;
//                 } 
//                 // Coordinate Math
//                 else if (centerCoords) {
//                     let crewCoords = VOLATILE_CITY_CACHE[crewCity];

//                     if (!crewCoords) {
//                         try {
//                             await delay(800); // Prevent 429
//                             const res = await geocoder.geocode(crewCity); // Geocode ONLY the city
//                             if (res.length > 0) {
//                                 crewCoords = { lat: res[0].latitude, lon: res[0].longitude };
//                                 VOLATILE_CITY_CACHE[crewCity] = crewCoords; // Cache it
//                             }
//                         } catch (e) { console.error("Crew geocode fail"); }
//                     }

//                     if (crewCoords) {
//                         distance = getDistanceInMiles(centerCoords.lat, centerCoords.lon, crewCoords.lat, crewCoords.lon);
//                         const travelLimit = parseWorkingDistance(crewJson.working_distance);
//                         if (distance !== null && distance <= requestedRadius && distance <= travelLimit) {
//                             isWithinRange = true;
//                         }
//                     }
//                 }
//             }

//             if (!isWithinRange) continue;

//             // Role formatting
//             let matchedRoles = [];
//             let rawRoles = [];
//             try {
//                 const parsed = typeof crewJson.primary_role === "string" ? JSON.parse(crewJson.primary_role) : crewJson.primary_role;
//                 rawRoles = Array.isArray(parsed) ? parsed : [parsed];
//             } catch (e) { rawRoles = []; }
//             const strRoles = rawRoles.map(String);
//             if (strRoles.some(id => ROLE_GROUPS.videographer.includes(id))) matchedRoles.push("videographer");
//             if (strRoles.some(id => ROLE_GROUPS.photographer.includes(id))) matchedRoles.push("photographer");

//             finalResults.push({
//                 ...crewJson,
//                 profile_photo: crewJson.crew_member_files?.[0]?.file_path || null,
//                 role_names: matchedRoles.length > 0 ? matchedRoles : ["Unspecified"],
//                 role: matchedRoles.join(", "),
//                 distance_miles: distance !== null ? Math.round(distance * 10) / 10 : 0
//             });
//         }

//         res.json({
//             success: true,
//             search_query: search_query,
//             radius: requestedRadius,
//             available_count: finalResults.length,
//             data: finalResults
//         });

//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

exports.assignCrewBulkSmart = async (req, res) => {
    try {
        const assigned_by_user_id = req.user?.userId;
        const { lead_id, client_lead_id, crew_member_ids } = req.body;

        if (!lead_id && !client_lead_id) {
            return res.status(400).json({ success: false, message: "lead_id or client_lead_id is required." });
        }

        if (!Array.isArray(crew_member_ids) || crew_member_ids.length === 0) {
            return res.status(400).json({ success: false, message: "No crew members selected." });
        }

        const ROLE_GROUPS = {
            videographer: ["9", "1"],
            photographer: ["10", "2"],
            cinematographer: ["11", "3"]
        };

        const ID_TO_ROLE_MAP = {};
        Object.entries(ROLE_GROUPS).forEach(([roleName, ids]) => {
            ids.forEach(id => { ID_TO_ROLE_MAP[String(id)] = roleName; });
        });

        const leadModel = client_lead_id ? client_leads : sales_leads;
        const activityModel = client_lead_id ? client_lead_activities : sales_lead_activities;
        const resolvedLeadId = client_lead_id || lead_id;

        const lead = await leadModel.findOne({
          where: { lead_id: resolvedLeadId },
          include: [{
            model: stream_project_booking,
            as: 'booking',
            include: [{
              model: assigned_crew,
              as: 'assigned_crews',
              where: {
                crew_accept: 1,
                is_active: 1
              },
              required: false,
              include: [{ model: crew_members, as: 'crew_member' }]
            }]
          }]
        });

        if (!lead || !lead.booking) {
            return res.status(404).json({ success: false, message: "Lead or booking not found." });
        }

        const booking = lead.booking;
        const requestedLimits = typeof booking.crew_roles === 'string'
          ? JSON.parse(booking.crew_roles)
          : (booking.crew_roles || {});

        const currentCounts = { videographer: 0, photographer: 0, cinematographer: 0 };

        if (booking.assigned_crews) {
          booking.assigned_crews.forEach(ac => {
            if (ac.crew_member?.primary_role) {
              try {
                const parsed = JSON.parse(ac.crew_member.primary_role);
                const roles = Array.isArray(parsed) ? parsed : [parsed];
                roles.forEach(id => {
                  const roleName = ID_TO_ROLE_MAP[String(id)];
                  if (roleName) currentCounts[roleName]++;
                });
              } catch (e) {
                console.error("Parse error in existing crew", e);
              }
            }
          });
        }
        const uniqueCrewIds = [...new Set(crew_member_ids.map(Number).filter(Boolean))];

        const newCrewDetails = await crew_members.findAll({
            where: { crew_member_id: uniqueCrewIds }
        });

        const assignmentsToCreate = [];
        const errors = [];

        newCrewDetails.forEach(crew => {
            let roles = [];
            try {
                const parsed = JSON.parse(crew.primary_role || "[]");
                roles = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                roles = [crew.primary_role];
            }

            let roleDetected = null;
            roles.forEach(id => {
                if (ID_TO_ROLE_MAP[String(id)]) roleDetected = ID_TO_ROLE_MAP[String(id)];
            });

            if (roleDetected) {
              const acceptedCount = currentCounts[roleDetected];
              const limit = requestedLimits[roleDetected];

              if (limit !== undefined && acceptedCount >= limit) {
                errors.push(`Cannot add ${crew.first_name} (${roleDetected}).Limit of ${limit} reached.`);
              } else {
                assignmentsToCreate.push({
                  project_id: booking.stream_project_booking_id,
                  crew_member_id: crew.crew_member_id,
                  assigned_date: new Date(),
                  status: 'selected',
                  crew_accept: 0,
                  is_active: 1,
                  organization_type: 1
                });
              }
            } else {
              assignmentsToCreate.push({
                  project_id: booking.stream_project_booking_id,
                  crew_member_id: crew.crew_member_id,
                  assigned_date: new Date(),
                  status: 'selected',
                  crew_accept: 0,
                  is_active: 1,
                  organization_type: 1
              });
          }
        });

        if (errors.length > 0 && assignmentsToCreate.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Assignments failed validation.", 
                errors: errors 
            });
        }

        if (assignmentsToCreate.length > 0) {
            await assigned_crew.bulkCreate(assignmentsToCreate);
            await activityModel.create({
                lead_id: resolvedLeadId,
                activity_type: 'assigned',
                activity_data: {
                  action: 'bulk_crew_assigned',
                  notes: `Sales rep assigned ${assignmentsToCreate.length} crew members.`,
                  assigned_count: assignmentsToCreate.length
                },
                performed_by_user_id: assigned_by_user_id
            });

          // Non-blocking email trigger
          try {
            const createdIds = assignmentsToCreate.map(a => a.crew_member_id);
            const crews = await crew_members.findAll({
              where: { crew_member_id: createdIds },
              attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
            });

            const dashboardLink =
              process.env.CP_DASHBOARD_LINK ||
              process.env.FRONTEND_URL ||
              'https://beige.app/';

            const emailClientName = await resolveAdminBookingClientName(lead?.booking, lead?.client_name || null);
            const emailShootAmount = await resolveAdminBookingShootAmount(lead?.booking);

            await Promise.allSettled(
              crews
                .filter(c => c.email)
                .map(c =>
                  sendCPNewBookingRequestEmail({
                    to_email: c.email,
                    user_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'there',
                    ...getCPNewBookingEmailFields(lead?.booking, emailClientName, emailShootAmount),
                    dashboardLink
                  })
                )
            );
        } catch (mailErr) {
          console.error('assignCrewBulkSmart email send error:', mailErr?.message || mailErr);
        }
      }

      return res.json({
        success: true,
        message: `${assignmentsToCreate.length} crew members assigned successfully.`,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.removeAssignedCrew = async (req, res) => {
    try {
        const assigned_by_user_id = req.user?.userId;
        const { lead_id, client_lead_id, crew_member_id } = req.body;

        if ((!lead_id && !client_lead_id) || !crew_member_id) {
            return res.status(400).json({
                success: false,
                message: "Either lead_id or client_lead_id and crew_member_id are required."
            });
        }

        let LeadModel;
        let LeadActivityModel;
        let where;

        if (lead_id) {
            LeadModel = sales_leads;
            LeadActivityModel = sales_lead_activities;
            where = { lead_id: lead_id };
        } else {
            LeadModel = client_leads;
            LeadActivityModel = client_lead_activities;
            where = { lead_id: client_lead_id };
        }

        const lead = await LeadModel.findOne({
            where,
            attributes: ['booking_id']
        });

        if (!lead || !lead.booking_id) {
            return res.status(404).json({
                success: false,
                message: "Lead or associated booking not found."
            });
        }

        const assignment = await assigned_crew.findOne({
            where: {
                project_id: lead.booking_id,
                crew_member_id: crew_member_id,
                is_active: 1
            },
            include: [{
                model: crew_members,
                as: 'crew_member',
                attributes: ['first_name', 'last_name']
            }]
        });

        if (!assignment) {
            return res.status(404).json({ 
                success: false, 
                message: "This crew member is not currently assigned to this project or is already inactive." 
            });
        }

        await assignment.update({ is_active: 0 });

        const crewName = assignment.crew_member
            ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}`
            : `ID: ${crew_member_id}`;

        await LeadActivityModel.create({
            lead_id: lead_id || client_lead_id,
            activity_type: 'status_changed',
            activity_data: {
                action: 'crew_removed',
                notes: `Sales rep removed ${crewName} from the project.`,
                crew_member_id
            },
            performed_by_user_id: assigned_by_user_id,
            created_at: new Date()
        });

        res.json({
            success: true,
            message: "Crew member removed from project successfully."
        });

    } catch (error) {
        console.error('RemoveCrew Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};



exports.getClientFullDetailsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    let { status, event_type, search, limit, page, range, start_date, end_date } = req.query;

    if (!userId) {
      return res.status(400).json({ error: true, message: "User ID is required" });
    }

    // 1️⃣ Get User, Client, and Affiliate Details
    const [user, client, affiliate] = await Promise.all([
      users.findOne({
        where: { id: userId },
        attributes: { exclude: ['password_hash'] }
      }),
      clients.findOne({
        where: { user_id: userId, is_active: 1 }
      }),
      affiliates.findOne({
        where: { user_id: userId }
      })
    ]);

    if (!user) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }

    const today = new Date();

    // -------- 2️⃣ PAGINATION LOGIC --------
    const noPagination = !limit && !page;
    let pageNumber = parseInt(page ?? 1, 10);
    let pageSize = parseInt(limit ?? 10, 10);
    let offset = (pageNumber - 1) * pageSize;

    // -------- 3️⃣ DATE FILTER LOGIC --------
    let dateFilter = {};
    if (start_date && end_date) {
      dateFilter = {
        event_date: { [Sequelize.Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`] }
      };
    } else if (range === 'month') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('event_date')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
          Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('event_date')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
        ]
      };
    } else if (range === 'week') {
      dateFilter = {
        [Sequelize.Op.and]: [
          Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('event_date'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
        ]
      };
    }

    // -------- 4️⃣ BASE WHERE CONDITIONS --------
    const whereConditions = {
      user_id: userId,
      is_active: 1,
      ...dateFilter
    };

    if (status) {
      switch (status) {
        case 'cancelled': whereConditions.is_cancelled = 1; break;
        case 'completed': whereConditions.is_completed = 1; break;
        case 'upcoming':
          whereConditions.is_cancelled = 0;
          whereConditions.is_draft = 0;
          whereConditions.event_date = { ...(dateFilter.event_date || {}), [Sequelize.Op.gt]: today };
          break;
        case 'draft': whereConditions.is_draft = 1; break;
      }
    }

    if (event_type) whereConditions.event_type = event_type;
    if (search) {
      whereConditions.project_name = Sequelize.where(
        Sequelize.fn('LOWER', Sequelize.col('project_name')),
        { [Sequelize.Op.like]: `%${search.toLowerCase()}%` }
      );
    }

    // -------- 5️⃣ STATS COUNTS --------
    const [
      total_active, total_cancelled, total_completed, total_upcoming, total_draft
    ] = await Promise.all([
      stream_project_booking.count({ where: { user_id: userId, is_active: 1, is_cancelled: 0, is_completed: 0, is_draft: 0 } }),
      stream_project_booking.count({ where: { user_id: userId, is_cancelled: 1 } }),
      stream_project_booking.count({ where: { user_id: userId, is_completed: 1 } }),
      stream_project_booking.count({ where: { user_id: userId, is_cancelled: 0, is_draft: 0, event_date: { [Sequelize.Op.gt]: today } } }),
      stream_project_booking.count({ where: { user_id: userId, is_draft: 1 } }),
    ]);

    // -------- 6️⃣ FETCH PROJECTS & ASSOCIATED DATA --------
    const projects = await stream_project_booking.findAll({
      where: whereConditions,
      ...(noPagination ? {} : { limit: pageSize, offset }),
      order: [['event_date', 'DESC']]
    });

    const projectDetails = await Promise.all(
      projects.map(async (project) => {
        const [assignedCrew, assignedEquipment, assignedPostProd, paymentData] = await Promise.all([
          assigned_crew.findAll({
            where: { project_id: project.stream_project_booking_id, is_active: 1 },
            include: [{ model: crew_members, as: 'crew_member' }]
          }),
          assigned_equipment.findAll({
            where: { project_id: project.stream_project_booking_id, is_active: 1 },
            include: [{ model: equipment, as: 'equipment' }]
          }),
          assigned_post_production_member.findAll({
            where: { project_id: project.stream_project_booking_id, is_active: 1 },
            include: [{ model: post_production_members, as: 'post_production_member' }]
          }),
          payment_transactions.findOne({
            where: { payment_id: project.payment_id },
            attributes: ['total_amount']
          })
        ]);

        // Format event types
        const rawTypes = project.event_type ? project.event_type.split(',') : [];
        const formattedTypes = rawTypes.map(t => {
          const val = t.trim().toLowerCase();
          const map = { 'videographer': 'Videography', 'photographer': 'Photography' };
          return map[val] || val.charAt(0).toUpperCase() + val.slice(1);
        });

        return {
          ...project.toJSON(),
          total_paid_amount: paymentData ? paymentData.total_amount : 0,
          event_type_labels: formattedTypes.join(', '),
          event_location_formatted: (() => {
            try {
              const loc = project.event_location;
              if (typeof loc === "string" && (loc.startsWith("{") || loc.startsWith("["))) {
                const parsed = JSON.parse(loc);
                return parsed.address || parsed;
              }
              return loc;
            } catch (e) { return project.event_location; }
          })(),
          assignedCrew,
          assignedEquipment,
          assignedPostProductionMembers: assignedPostProd
        };
      })
    );

    // -------- 7️⃣ SEPARATE PAID & UNPAID --------
    const paid = [];
    const unpaid_or_draft = [];
    projectDetails.forEach(item => {
      if (item.payment_id && item.is_draft !== 1) {
        paid.push(item);
      } else {
        unpaid_or_draft.push(item);
      }
    });

    // -------- 8️⃣ FINAL RESPONSE --------
    return res.status(200).json({
      error: false,
      message: 'Client full details and shoots fetched successfully',
      data: {
        profile: {
          user,
          client,
          affiliate
        },
        stats: {
          total_active,
          total_cancelled,
          total_completed,
          total_upcoming,
          total_draft
        },
        projects: {
          paid,
          unpaid_or_draft
        },
        pagination: noPagination ? null : {
          page: pageNumber,
          limit: pageSize
        }
      }
    });

  } catch (error) {
    console.error('Get Full Client Details Error:', error);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
};

exports.getBookingSummaryById = async (req, res) => {
    try {
        const { bookingId } = req.params;

        // 1. Fetch data with correct aliases from models
        const booking = await stream_project_booking.findOne({
            where: { stream_project_booking_id: bookingId },
            include: [
                {
                    model: db.stream_project_booking_days,
                    as: "booking_days",
                    required: false
                },
                {
                    model: sales_leads,
                    as: "sales_leads", 
                    include: [{ model: users, as: "assigned_sales_rep", attributes: ["name"] }]
                },
                {
                    model: quotes,
                    as: "primary_quote",
                    include: [{ model: quote_line_items, as: "line_items" }]
                }
            ]
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" });
        }

        const bookingJson = booking.toJSON();
        const primaryQuote = bookingJson.primary_quote || {};
        const bookingDayEntries = Array.isArray(bookingJson.booking_days) && bookingJson.booking_days.length
            ? [...bookingJson.booking_days].sort((a, b) => {
                const dateCompare = String(a?.event_date || "").localeCompare(String(b?.event_date || ""));
                if (dateCompare !== 0) return dateCompare;
                return String(a?.start_time || "").localeCompare(String(b?.start_time || ""));
            })
            : [{
                event_date: bookingJson.event_date,
                start_time: bookingJson.start_time,
                end_time: bookingJson.end_time,
                duration_hours: bookingJson.duration_hours,
                time_zone: null
            }];
        const primarySchedule = bookingDayEntries[0] || {};

        // 2. Helper to handle Double-Stringified JSON or Object data
        const safeParseJSON = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try {
                const parsed = JSON.parse(val);
                return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            } catch (e) {
                return [];
            }
        };

        // 3. Map Shoot Type & Event Type Label
        const fullShootType = SHOOT_TYPE_TITLES[bookingJson.shoot_type] || bookingJson.shoot_type;

        let formattedEventType = "Photography & Videography";
        const rawEvent = (bookingJson.event_type || "").toLowerCase();
        const hasVideo = rawEvent.includes('videographer');
        const hasPhoto = rawEvent.includes('photographer');
        if (hasVideo && hasPhoto) formattedEventType = "Videography & Photography";
        else if (hasVideo) formattedEventType = "Videography";
        else if (hasPhoto) formattedEventType = "Photography";

        // 4. Handle Editing Details
        const vKeys = safeParseJSON(bookingJson.video_edit_types);
        const pKeys = safeParseJSON(bookingJson.photo_edit_types);

        let editing = {
            is_needed: (!!bookingJson.edits_needed || bookingJson.edits_needed == 1 || vKeys.length > 0 || pKeys.length > 0),
            video_edits: vKeys.map(key => VIDEO_EDIT_TITLES[key] || key),
            photo_edits: pKeys.map(key => PHOTO_EDIT_TITLES[key] || key)
        };

        // 5. Parse Crew Counts
        let crewCounts = [];
        try {
            const roles = safeParseJSON(bookingJson.crew_roles);
            if (roles && typeof roles === 'object') {
                crewCounts = Object.entries(roles).map(([role, count]) => ({
                    role: role.charAt(0).toUpperCase() + role.slice(1),
                    count: count
                }));
            }
        } catch (e) { crewCounts = []; }

        const paymentSummary = await bookingPaymentSummaryService.getBookingPaymentSummary(
            bookingJson.stream_project_booking_id
        );
        const linkedLeadIds = Array.isArray(bookingJson.sales_leads)
            ? bookingJson.sales_leads.map((lead) => lead.lead_id).filter(Boolean)
            : (bookingJson.sales_leads?.lead_id ? [bookingJson.sales_leads.lead_id] : []);
        const customQuote = await db.sales_quotes.findOne({
            where: paymentSummary?.sales_quote_id
                ? { sales_quote_id: paymentSummary.sales_quote_id }
                : (linkedLeadIds.length ? { lead_id: { [Op.in]: linkedLeadIds } } : { sales_quote_id: null }),
            include: [{
                model: db.sales_quote_line_items,
                as: 'line_items',
                required: false,
                where: { is_active: 1 }
            }],
            order: [[{ model: db.sales_quote_line_items, as: 'line_items' }, 'sort_order', 'ASC']]
        });
        const usableCustomQuote = customQuote?.sales_quote_id
            ? await quoteService.getCurrentUsableQuoteVersionSnapshot(customQuote.sales_quote_id, null)
            : null;
        const activeQuote = usableCustomQuote || (customQuote ? customQuote.toJSON() : primaryQuote);

        // 6. Pricing Breakdown & Discount Logic
        
        // Total discount recorded in the DB column (e.g., 5706.25)
        const totalDiscountFromDb = parseFloat(activeQuote.discount_amount || 0);
        const summaryQuoteTotal = paymentSummary ? parseFloat(paymentSummary.quote_total || 0) : 0;
        const subtotal = parseFloat(activeQuote.subtotal || summaryQuoteTotal || 0);
        const quoteTotal = summaryQuoteTotal || parseFloat(activeQuote.total || 0);

        let pricing = {
            shoot_cost: 0,
            editing_cost: 0,
            subtotal: subtotal,
            total: quoteTotal,
            discount: totalDiscountFromDb 
        };

        // Categorize Line Items into Shoot vs Editing
        const items = activeQuote.line_items || [];
        items.forEach(item => {
            const name = (item.item_name || "").toLowerCase();
            const total = parseFloat(item.line_total || 0);
            if (name.includes('reel') || name.includes('edit') || name.includes('highlight') || name.includes('photo')) {
                pricing.editing_cost += total;
            } else {
                pricing.shoot_cost += total;
            }
        });

        // 7. EXTRACT REFERRAL DATA FROM NOTES (Regex Fix)
        let referralDiscount = 0;
        let referralCode = null;
        let paymentData = null;
        let latestPaymentData = null;
        const notes = activeQuote.notes || primaryQuote.notes || '';

        // Matches: Referral applied (7321F9): -$518.75
        const referralAmountMatch = String(notes).match(/Referral applied.*?-\$([\d,.]+)/i);
        const referralCodeMatch = String(notes).match(/Referral applied \((.*?)\)/i);

        if (referralAmountMatch && referralAmountMatch[1]) {
            referralDiscount = parseFloat(referralAmountMatch[1].replace(/,/g, ''));
        }
        if (referralCodeMatch && referralCodeMatch[1]) {
            referralCode = referralCodeMatch[1];
        }

        // Check if there is a payment record for more accurate referral info
        if (bookingJson.payment_id) {
            paymentData = await db.payment_transactions.findByPk(bookingJson.payment_id);
            if (paymentData && paymentData.referral_code) {
                referralCode = paymentData.referral_code;
            }
        }
        if (paymentData) {
            latestPaymentData = paymentData;
        }

        const identityOr = [
            ...(bookingJson.guest_email ? [{ guest_email: bookingJson.guest_email }] : []),
            ...(bookingJson.user_id ? [{ user_id: bookingJson.user_id }] : [])
        ];

        if (identityOr.length > 0 && bookingJson.payment_id) {
            const followupPayment = await db.payment_transactions.findOne({
                where: {
                    status: 'succeeded',
                    payment_id: { [Sequelize.Op.gt]: Number(bookingJson.payment_id) || 0 },
                    payment_source: { [Sequelize.Op.in]: ['additional_invoice', 'quote_invoice'] },
                    [Sequelize.Op.or]: identityOr
                },
                order: [['payment_id', 'DESC']]
            });
            if (followupPayment) {
                latestPaymentData = followupPayment;
            }
        }

        if (!latestPaymentData && identityOr.length > 0) {
            latestPaymentData = await db.payment_transactions.findOne({
                where: {
                    status: 'succeeded',
                    payment_source: { [Sequelize.Op.in]: ['quote_invoice', 'additional_invoice', 'booking_checkout'] },
                    [Sequelize.Op.or]: identityOr
                },
                order: [['payment_id', 'DESC']]
            });
        }
        if (!paymentData && latestPaymentData?.referral_code) {
            referralCode = latestPaymentData.referral_code;
        }

        // Logic: The "Promo Code" discount is whatever is left over after the Referral Discount
        const discountCodeDiscount = Math.max(0, totalDiscountFromDb - referralDiscount);
        const paidAmountRaw = paymentSummary
            ? parseFloat(paymentSummary.paid_amount || 0)
            : (latestPaymentData
                ? parseFloat(latestPaymentData.total_amount || 0)
                : (paymentData ? parseFloat(paymentData.total_amount || 0) : quoteTotal));
        const normalizedPaidAmount = Number.isFinite(paidAmountRaw) ? paidAmountRaw : quoteTotal;
        const isAdditionalPaymentFlow = String(latestPaymentData?.payment_source || '').toLowerCase() === 'additional_invoice';
        const creditApplied = paymentSummary
            ? parseFloat(paymentSummary.credit_used_amount || 0)
            : (isAdditionalPaymentFlow ? 0 : Math.max(0, quoteTotal - normalizedPaidAmount));
        const totalAfterCredit = paymentSummary
            ? Math.max(0, quoteTotal - creditApplied)
            : (isAdditionalPaymentFlow
                ? normalizedPaidAmount
                : Math.max(0, quoteTotal - creditApplied));

        pricing.total_paid = parseFloat(normalizedPaidAmount.toFixed(2));
        pricing.discount_code_discount = parseFloat(discountCodeDiscount.toFixed(2));
        pricing.referral_discount = parseFloat(referralDiscount.toFixed(2));
        pricing.total_before_discounts = subtotal;
        pricing.referral_code = referralCode;
        pricing.total_before_credit = parseFloat(quoteTotal.toFixed(2));
        pricing.credit_applied = parseFloat(creditApplied.toFixed(2));
        pricing.total_after_credit = parseFloat(totalAfterCredit.toFixed(2));
        pricing.due_amount = paymentSummary
            ? parseFloat(Number(paymentSummary.due_amount || 0).toFixed(2))
            : Math.max(0, parseFloat((quoteTotal - normalizedPaidAmount - creditApplied).toFixed(2)));
        pricing.payment_summary = paymentSummary || null;

        // 8. Final Response
        res.json({
            success: true,
            data: {
                booking_id: bookingJson.stream_project_booking_id,
                project_name: bookingJson.project_name,
                client_email: bookingJson.guest_email,
                shoot_type: fullShootType,
                event_type: formattedEventType,
                location: bookingJson.event_location,
                date: primarySchedule.event_date || bookingJson.event_date,
                estimated_delivery_date: bookingJson.estimated_delivery_date || null,
                start_time: primarySchedule.start_time || bookingJson.start_time,
                end_time: primarySchedule.end_time || bookingJson.end_time,
                booking_days: bookingDayEntries.map((day) => ({
                    event_date: day.event_date,
                    start_time: day.start_time,
                    end_time: day.end_time,
                    duration_hours: day.duration_hours,
                    time_zone: day.time_zone || null
                })),
                special_instructions: bookingJson.special_instructions || "",
                editing: editing,
                crew_counts: crewCounts,
                pricing: pricing
            }
        });

    } catch (error) {
        console.error("Booking Summary API Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.checkDeleteStatus = async (req, res) => {
  try {
    const { crew_member_id } = req.query; // Usually GET for checks

    if (!crew_member_id) {
      return res.status(400).json({ success: false, message: "crew_member_id is required" });
    }

    const crew = await crew_members.findOne({ where: { crew_member_id } });
    if (!crew) {
      return res.status(404).json({ success: false, message: "Crew member not found" });
    }

    const today = new Date().toISOString().split('T')[0];

    // 1. Check for Future Active Projects (Blocking Condition)
    const futureProjects = await assigned_crew.findAll({
      where: {
        crew_member_id: crew_member_id,
        is_active: 1 // Only consider active assignments
      },
      include: [{
        model: stream_project_booking,
        as: 'project',
        where: { event_date: { [Op.gte]: today } },
        attributes: ['stream_project_booking_id', 'project_name', 'event_date']
      }]
    });

    if (futureProjects.length > 0) {
      return res.json({
        success: true,
        action_type: 'blocked',
        message: "Action Blocked: This CP is assigned to upcoming shoots.",
        data: futureProjects.map(f => ({
          id: f.project.stream_project_booking_id,
          name: f.project.project_name,
          date: f.project.event_date
        }))
      });
    }

    // 2. Check for Past Active History (Determines Soft vs Hard Delete)
    const activeHistoryCount = await assigned_crew.count({
      where: { 
        crew_member_id: crew_member_id,
        is_active: 1 // Only consider active assignments as history
      }
    });

    if (activeHistoryCount > 0) {
      return res.json({
        success: true,
        action_type: 'soft_delete',
        message: "This crew member has project history. They will be deactivated (soft delete).",
        history_count: activeHistoryCount
      });
    }

    // 3. Default to Hard Delete
    return res.json({
      success: true,
      action_type: 'hard_delete',
      message: "No active project history found. This member and their user account will be permanently deleted."
    });

  } catch (error) {
    console.error('CheckDeleteStatus Error:', error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.executeDeleteCrewMember = async (req, res) => {
  const transaction = await crew_members.sequelize.transaction();
  
  try {
    const { crew_member_id } = req.body;

    const crew = await crew_members.findOne({ where: { crew_member_id } });
    if (!crew) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Crew member not found" });
    }

    // Double check for future projects (Safety check in case data changed between 'Check' and 'Confirm')
    const today = new Date().toISOString().split('T')[0];
    const hasFuture = await assigned_crew.count({
      where: { crew_member_id, is_active: 1 },
      include: [{
        model: stream_project_booking,
        as: 'project',
        where: { event_date: { [Op.gte]: today } }
      }]
    });

    if (hasFuture > 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: "Cannot delete: Future projects detected." });
    }

    // Check for active history to decide logic
    const activeHistoryCount = await assigned_crew.count({
      where: { crew_member_id, is_active: 1 }
    });

    const associatedUser = await users.findOne({ where: { email: crew.email } });

    if (activeHistoryCount > 0) {
      // --- SOFT DELETE LOGIC ---
      await crew_members.update({ is_active: 0 }, { where: { crew_member_id }, transaction });
      if (associatedUser) {
        await users.update({ is_active: 0 }, { where: { email: crew.email }, transaction });
      }

      await transaction.commit();
      return res.json({ success: true, message: "Crew member deactivated (Soft Delete)." });

    } else {
      // --- HARD DELETE LOGIC ---
      await crew_member_files.destroy({ where: { crew_member_id }, transaction });
      
      // Note: We destroy all assigned_crew records for this ID, even if is_active was 0, 
      // because we are doing a full clean-up (Hard Delete).
      await assigned_crew.destroy({ where: { crew_member_id }, transaction });
      await crew_members.destroy({ where: { crew_member_id }, transaction });

      if (associatedUser) {
        await users.destroy({ where: { email: crew.email }, transaction });
      }

      await transaction.commit();
      return res.json({ success: true, message: "Crew member permanently deleted (Hard Delete)." });
    }

  } catch (error) {
    if (transaction) await transaction.rollback();
    res.status(500).json({ success: false, message: "Internal server error", details: error.message });
  }
};

exports.getProjectFulfillmentStatus = async (req, res) => {
  try {
    const { project_id } = req.params;

    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id },
      attributes: ['stream_project_booking_id', 'event_location', 'crew_roles'],
      include: [
        {
          model: sales_leads,
          as: 'sales_leads',
          attributes: ['lead_id'],
          required: false
        },
        {
          model: assigned_crew,
          as: 'assigned_crews',
          where: { is_active: 1 },
          required: false,
          attributes: ['crew_accept'],
          include: [
            {
              model: crew_members,
              as: 'crew_member',
              attributes: ['primary_role']
            }
          ]
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Project Booking not found' });
    }

    let requestedRoles = {};
    try {
      requestedRoles = typeof booking.crew_roles === 'string' 
        ? JSON.parse(booking.crew_roles) 
        : (booking.crew_roles || {});
    } catch (e) {
      requestedRoles = {};
    }

    const ROLE_GROUPS = { 
      videographer: ['9', '1'], 
      photographer: ['10', '2'], 
      cinematographer: ['11', '3'] 
    };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([role, ids]) => {
      ids.forEach(id => (ID_TO_ROLE_MAP[String(id)] = role));
    });

    let fulfillment = {};
    Object.keys(requestedRoles).forEach(role => {
      fulfillment[role] = {
        accepted: 0,
        required: parseInt(requestedRoles[role]) || 0
      };
    });

    if (booking.assigned_crews) {
      booking.assigned_crews.forEach(ac => {
        if (ac.crew_accept === 1) {
          let crewRoleIds = [];
          try {
            const rawRole = ac.crew_member?.primary_role;
            crewRoleIds = (typeof rawRole === 'string' && rawRole.startsWith('[')) 
              ? JSON.parse(rawRole) 
              : (Array.isArray(rawRole) ? rawRole : [rawRole]);
          } catch (e) { crewRoleIds = []; }

          const categories = [...new Set(crewRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];
          
          const targetCategory = categories.find(cat => fulfillment[cat] && fulfillment[cat].accepted < fulfillment[cat].required);
          
          if (targetCategory) {
            fulfillment[targetCategory].accepted += 1;
          }
        }
      });
    }

    const result = {};
    Object.keys(fulfillment).forEach(key => {
      result[key] = `${fulfillment[key].accepted}/${fulfillment[key].required}`;
    });

    const leadId = booking.sales_leads?.[0]?.lead_id || null;

    res.json({
      success: true,
      data: {
        project_id: booking.stream_project_booking_id,
        lead_id: leadId,
        location: booking.event_location,
        fulfillment_stats: result
      }
    });

  } catch (error) {
    console.error('Project Fulfillment Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.searchCrewForProject = async (req, res) => {
    try {
        const {
            project_id,
            role_type,
            search_query,
            max_distance,
            radius,
            latitude,
            longitude,
            date
        } = req.query;

        const requestedRadius = Number(max_distance ?? radius ?? 50);
        const normalizedSearchQuery = typeof search_query === 'string' ? search_query.trim() : '';
        const hasGlobalCrewSearch = normalizedSearchQuery.length > 0;

        let projectDate;
        let currentBookingId = null;
        let eventLocation = null;
        let centerLatitude = null;
        let centerLongitude = null;

        if (project_id) {
            const booking = await stream_project_booking.findOne({
                where: { stream_project_booking_id: project_id }
            });

            if (!booking) {
                return res.status(404).json({
                    success: false,
                    message: 'Project Booking not found'
                });
            }

            projectDate = booking.event_date;
            currentBookingId = booking.stream_project_booking_id;
            eventLocation = booking.event_location;
            centerLatitude = Number(booking.event_latitude);
            centerLongitude = Number(booking.event_longitude);
        } else {
            if (!date && !hasGlobalCrewSearch) {
                return res.status(400).json({
                    success: false,
                    message: 'Date is required when project_id is not provided'
                });
            }
            projectDate = date || null;
        }

        if (latitude !== undefined && longitude !== undefined) {
            centerLatitude = Number(latitude);
            centerLongitude = Number(longitude);
        } else if ((!Number.isFinite(centerLatitude) || !Number.isFinite(centerLongitude)) && eventLocation) {
            const coords = extractCoordinatesFromPayload({}, eventLocation);
            centerLatitude = Number(coords.latitude);
            centerLongitude = Number(coords.longitude);
        }

        const hasSearchCenter = Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude);

        const busyCrewRecords = projectDate && !hasGlobalCrewSearch
            ? await assigned_crew.findAll({
                where: {
                    crew_accept: 1,
                    is_active: 1
                },
                include: [{
                    model: stream_project_booking,
                    as: 'project',
                    where: { event_date: projectDate }
                }],
                attributes: ['crew_member_id']
            })
            : [];

        let alreadyAssignedToThisProject = [];
        if (currentBookingId) {
            const currentAssignments = await assigned_crew.findAll({
                where: {
                    project_id: currentBookingId,
                    is_active: 1,
                    crew_accept: { [Op.in]: [0, 1] }
                },
                attributes: ['crew_member_id']
            });

            alreadyAssignedToThisProject = currentAssignments.map(a => Number(a.crew_member_id));
        }

        const busyIds = busyCrewRecords.map(r => Number(r.crew_member_id));
        const excludeIds = [...new Set([...busyIds, ...alreadyAssignedToThisProject])];

        const ROLE_GROUPS = {
            videographer: ['9', '1'],
            photographer: ['10', '2'],
            cinematographer: ['11', '3']
        };

        const requestedRoles = role_type
            ? role_type.split(',').map(r => r.trim().toLowerCase())
            : [];

        let targetRoleIds = [];
        requestedRoles.forEach(role => {
            if (ROLE_GROUPS[role]) {
                targetRoleIds.push(...ROLE_GROUPS[role]);
            }
        });
        targetRoleIds = [...new Set(targetRoleIds)];

        const crewWhere = {
            is_active: true,
            is_crew_verified: 1,
            crew_member_id: { [Op.notIn]: excludeIds.length ? excludeIds : [0] }
        };

        if (!hasGlobalCrewSearch) {
            crewWhere.is_available = true;
        }

        if (targetRoleIds.length > 0 && !hasGlobalCrewSearch) {
            crewWhere[Op.or] = targetRoleIds.map(id => ({
                primary_role: { [Op.like]: `%${id}%` }
            }));
        }

        if (hasGlobalCrewSearch) {
            crewWhere[Op.and] = [{
                [Op.or]: [
                    { first_name: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    { last_name: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    Sequelize.where(
                        Sequelize.fn('CONCAT', Sequelize.col('first_name'), ' ', Sequelize.col('last_name')),
                        { [Op.like]: `%${normalizedSearchQuery}%` }
                    ),
                    { email: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    { phone_number: { [Op.like]: `%${normalizedSearchQuery}%` } },
                    { location: { [Op.like]: `%${normalizedSearchQuery}%` } }
                ]
            }];
        }

        const availableCrew = await crew_members.findAll({
            where: crewWhere,
            include: [
                {
                    model: crew_member_files,
                    as: 'crew_member_files',
                    attributes: ['file_path'],
                    where: { is_active: 1, file_type: 'profile_photo' },
                    required: false,
                }
            ],
            limit: 200
        });

        const crewWithRoles = availableCrew.map(crewMember => {
            let matchedRoles = [];
            let rawRoles = [];

            try {
                if (crewMember.primary_role) {
                    const roleData = crewMember.primary_role;
                    rawRoles = (typeof roleData === 'string' && roleData.startsWith('['))
                        ? JSON.parse(roleData)
                        : (Array.isArray(roleData) ? roleData : [roleData]);
                }
            } catch (e) { rawRoles = []; }

            const stringRoleIds = rawRoles.map(String);
            if (stringRoleIds.some(id => ROLE_GROUPS.videographer.includes(id))) matchedRoles.push('videographer');
            if (stringRoleIds.some(id => ROLE_GROUPS.photographer.includes(id))) matchedRoles.push('photographer');
            if (stringRoleIds.some(id => ROLE_GROUPS.cinematographer.includes(id))) matchedRoles.push('cinematographer');

            const profilePhoto = crewMember.crew_member_files?.[0]?.file_path || null;
            const crewJson = crewMember.toJSON();
            delete crewJson.crew_member_files;

            const crewLatitude = Number(crewJson.latitude);
            const crewLongitude = Number(crewJson.longitude);
            const distanceMiles = hasSearchCenter && Number.isFinite(crewLatitude) && Number.isFinite(crewLongitude)
                ? calculateDistance(centerLatitude, centerLongitude, crewLatitude, crewLongitude)
                : null;

            return {
                ...crewJson,
                profile_photo: profilePhoto,
                first_name: crewJson.first_name.charAt(0).toUpperCase() + crewJson.first_name.slice(1).toLowerCase(),
                last_name: crewJson.last_name.charAt(0).toUpperCase(),
                role_names: matchedRoles.length > 0 ? matchedRoles : ['Unspecified'],
                role: matchedRoles.length > 0 ? matchedRoles.join(', ') : 'Unspecified',
                distance: distanceMiles
            };
        });

        const filteredCrew = hasSearchCenter && !hasGlobalCrewSearch
            ? crewWithRoles
                .filter(crew => crew.distance !== null && crew.distance <= requestedRadius)
                .sort((a, b) => a.distance - b.distance)
            : crewWithRoles.sort((a, b) => {
                if (a.distance === null && b.distance === null) return 0;
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
            });

        res.json({
            success: true,
            project_id: currentBookingId,
            project_date: projectDate,
            available_count: filteredCrew.length,
            search_center: hasSearchCenter ? { latitude: centerLatitude, longitude: centerLongitude } : null,
            radius: Number.isFinite(requestedRadius) ? requestedRadius : null,
            search_query: hasGlobalCrewSearch ? normalizedSearchQuery : null,
            search_scope: hasGlobalCrewSearch ? 'all_crew' : 'radius',
            data: filteredCrew
        });

    } catch (error) {
        console.error('searchCrewForProject error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.assignProjectCrewBulk = async (req, res) => {
    try {
        const assigned_by_user_id = req.user?.userId;
        const { project_id, crew_member_ids } = req.body;

        if (!project_id) {
            return res.status(400).json({ success: false, message: "Project ID is required." });
        }

        if (!Array.isArray(crew_member_ids) || crew_member_ids.length === 0) {
            return res.status(400).json({ success: false, message: "No crew members selected." });
        }

        const ROLE_GROUPS = {
            videographer: ["9", "1"],
            photographer: ["10", "2"],
            cinematographer: ["11", "3"]
        };

        const ID_TO_ROLE_MAP = {};
        Object.entries(ROLE_GROUPS).forEach(([roleName, ids]) => {
            ids.forEach(id => { ID_TO_ROLE_MAP[String(id)] = roleName; });
        });

        const booking = await stream_project_booking.findOne({
          where: { stream_project_booking_id: project_id },
          include: [
            {
              model: assigned_crew,
              as: 'assigned_crews',
              where: { crew_accept: 1, is_active: 1 },
              required: false,
              include: [{ model: crew_members, as: 'crew_member' }]
            },
            {
              model: sales_leads,
              as: 'sales_leads',
              limit: 1
            }
          ]
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: "Project booking not found." });
        }

        const leadId = booking.sales_leads?.[0]?.lead_id || null;

        const requestedLimits = typeof booking.crew_roles === 'string'
          ? JSON.parse(booking.crew_roles)
          : (booking.crew_roles || {});

        const currentCounts = { videographer: 0, photographer: 0, cinematographer: 0 };

        if (booking.assigned_crews) {
          booking.assigned_crews.forEach(ac => {
            if (ac.crew_member?.primary_role) {
              try {
                const raw = ac.crew_member.primary_role;
                const roles = (typeof raw === 'string' && raw.startsWith('[')) ? JSON.parse(raw) : [raw];
                roles.forEach(id => {
                  const roleName = ID_TO_ROLE_MAP[String(id)];
                  if (roleName) currentCounts[roleName]++;
                });
              } catch (e) { console.error("Parse error", e); }
            }
          });
        }

        const uniqueCrewIds = [...new Set(crew_member_ids.map(Number).filter(Boolean))];
        const newCrewDetails = await crew_members.findAll({
            where: { crew_member_id: uniqueCrewIds }
        });

        const assignmentsToCreate = [];
        const errors = [];

        newCrewDetails.forEach(crew => {
            let roles = [];
            try {
                const raw = crew.primary_role;
                roles = (typeof raw === 'string' && raw.startsWith('[')) ? JSON.parse(raw) : [raw];
            } catch (e) { roles = [crew.primary_role]; }

            let roleDetected = null;
            roles.forEach(id => {
                if (ID_TO_ROLE_MAP[String(id)]) roleDetected = ID_TO_ROLE_MAP[String(id)];
            });

            if (roleDetected) {
              const acceptedCount = currentCounts[roleDetected];
              const limit = requestedLimits[roleDetected] || 0;

              if (limit > 0 && acceptedCount >= limit) {
                errors.push(`Cannot add ${crew.first_name} (${roleDetected}). Limit of ${limit} reached.`);
              } else {
                assignmentsToCreate.push({
                  project_id: booking.stream_project_booking_id,
                  crew_member_id: crew.crew_member_id,
                  assigned_date: new Date(),
                  status: 'selected',
                  crew_accept: 0,
                  is_active: 1,
                  organization_type: 1
                });
              }
            } else {
                errors.push(`Crew member ${crew.first_name} has no valid role mapping.`);
            }
        });

        if (assignmentsToCreate.length === 0 && errors.length > 0) {
            return res.status(400).json({ success: false, message: "Assignments failed validation.", errors });
        }

        if (assignmentsToCreate.length > 0) {
            await assigned_crew.bulkCreate(assignmentsToCreate);

            if (leadId) {
                await sales_lead_activities.create({
                    lead_id: leadId,
                    activity_type: 'assigned',
                    activity_data: {
                        action: 'bulk_crew_assigned',
                        notes: `Assigned ${assignmentsToCreate.length} crew members to project via Project ID.`,
                        assigned_count: assignmentsToCreate.length
                    },
                    performed_by_user_id: assigned_by_user_id
                });
            }

            try {
                const createdIds = assignmentsToCreate.map(a => a.crew_member_id);
                const crews = await crew_members.findAll({
                    where: { crew_member_id: createdIds },
                    attributes: ['first_name', 'last_name', 'email']
                });

                const dashboardLink = process.env.CP_DASHBOARD_LINK || 'https://beige.app/';

                const emailClientName = await resolveAdminBookingClientName(
                    booking,
                    booking?.sales_leads?.[0]?.client_name || null
                );
                const emailShootAmount = await resolveAdminBookingShootAmount(booking);

                await Promise.allSettled(
                    crews.filter(c => c.email).map(c =>
                        sendCPNewBookingRequestEmail({
                            to_email: c.email,
                            user_name: c.first_name,
                            ...getCPNewBookingEmailFields(booking, emailClientName, emailShootAmount),
                            dashboardLink
                        })
                    )
                );
            } catch (mailErr) {
                console.error('Mail trigger error:', mailErr);
            }
        }

        return res.json({
            success: true,
            message: `${assignmentsToCreate.length} crew members assigned successfully.`,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error("assignProjectCrewBulk error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.removeProjectAssignedCrew = async (req, res) => {
    try {
        const assigned_by_user_id = req.user?.userId;
        const { project_id, crew_member_id } = req.body; // Changed lead_id to project_id

        if (!project_id || !crew_member_id) {
            return res.status(400).json({ 
                success: false, 
                message: "project_id and crew_member_id are required." 
            });
        }

        // 1. Find the assignment directly using project_id
        const assignment = await assigned_crew.findOne({
            where: {
                project_id: project_id,
                crew_member_id: crew_member_id,
                is_active: 1
            },
            include: [{ 
                model: crew_members, 
                as: 'crew_member', 
                attributes: ['first_name', 'last_name'] 
            }]
        });

        if (!assignment) {
            return res.status(404).json({ 
                success: false, 
                message: "This crew member is not currently assigned to this project or is already inactive." 
            });
        }

        // 2. Set the assignment to inactive (Soft Delete)
        await assignment.update({ is_active: 0 });

        // 3. Optional: Log activity if a lead exists for this project
        const lead = await sales_leads.findOne({
            where: { booking_id: project_id },
            attributes: ['lead_id']
        });

        if (lead) {
            const crewName = assignment.crew_member 
                ? `${assignment.crew_member.first_name} ${assignment.crew_member.last_name}` 
                : `ID: ${crew_member_id}`;

            await sales_lead_activities.create({
                lead_id: lead.lead_id,
                activity_type: 'status_changed',
                activity_data: {
                    action: 'crew_removed',
                    notes: `Removed ${crewName} from the project via Project ID.`,
                    crew_member_id
                },
                performed_by_user_id: assigned_by_user_id,
                created_at: new Date()
            });
        }

        res.json({
            success: true,
            message: "Crew member removed from project successfully."
        });

    } catch (error) {
        console.error('RemoveProjectCrew Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getProjectFormByProjectId = async (req, res) => {
    try {
        const { project_id } = req.params;
        const user_id = req.user?.userId;

        if (!project_id) {
            return res.status(400).json({ 
                error: true, 
                message: "project_id is required as a parameter." 
            });
        }

        // 1. Security Check: Ensure the project belongs to the requesting user
        const project = await stream_project_booking.findOne({
            where: { 
                stream_project_booking_id: project_id,
                // user_id: user_id 
            }
        });

        if (!project) {
            return res.status(403).json({ 
                error: true, 
                message: "Access denied. You do not have permission to view this project's details." 
            });
        }

        // 2. Fetch the Form Submission
        const formDetails = await project_form_submissions.findOne({
            where: { 
                project_id: project_id,
                is_active: 1 
            },
            order: [['created_at', 'DESC']] // Get the most recent submission
        });

        if (!formDetails) {
            return res.status(200).json({ 
                error: true, 
                message: "No form submission found for this project.",
                is_submitted: false 
            });
        }

        // 3. Return the details
        return res.status(200).json({
            error: false,
            message: "Project form details retrieved successfully.",
            is_submitted: true,
            data: formDetails
        });

    } catch (error) {
        console.error('Error fetching project form details:', error);
        return res.status(500).json({ 
            error: true, 
            message: "Internal server error", 
            details: error.message 
        });
    }
};

exports.sendOnboardingFormReminder = async (req, res) => {
    try {
        const project_id = req.params?.project_id || req.body?.project_id;
        const admin_user_id = req.user?.userId || null;

        if (!project_id) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required."
            });
        }

        const booking = await stream_project_booking.findOne({
            where: { stream_project_booking_id: project_id, is_active: 1 },
            include: [{
                model: users,
                as: 'user',
                required: false,
                attributes: ['id', 'name', 'email', 'phone_number']
            }]
        });

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Project/Booking not found."
            });
        }

        const formSubmission = await project_form_submissions.findOne({
            where: { project_id, is_active: 1 },
            attributes: ['id'],
            raw: true
        });

        if (formSubmission) {
            return res.status(400).json({
                success: false,
                message: "Onboarding form is already submitted for this project."
            });
        }

        const [clientDetails, lead, clientLead] = await Promise.all([
            resolveAdminBookingClientContact(booking),
            sales_leads.findOne({
                where: { booking_id: project_id, is_active: 1 },
                attributes: ['lead_id', 'client_name', 'guest_email'],
                raw: true
            }),
            client_leads.findOne({
                where: { booking_id: project_id, is_active: 1 },
                attributes: ['lead_id', 'client_name', 'guest_email'],
                raw: true
            })
        ]);

        const toEmail =
            clientDetails.email ||
            booking.user?.email ||
            booking.guest_email ||
            lead?.guest_email ||
            clientLead?.guest_email ||
            null;

        if (!toEmail) {
            return res.status(400).json({
                success: false,
                message: "Client email is missing for this project."
            });
        }

        const displayName =
            clientDetails.full_name ||
            lead?.client_name ||
            clientLead?.client_name ||
            booking.user?.name ||
            null;
        const firstName = getFirstNameForEmail(displayName, toEmail);
        const frontendUrl = (process.env.FRONTEND_URL || 'https://beige.app').replace(/\/+$/, '');

        const emailResult = await sendOnboardingFormCriticalEmail({
            to_email: toEmail,
            booking_id: project_id,
            shoot_id: project_id,
            user_name: firstName,
            first_name: firstName,
            form_link: `${frontendUrl}/project-form/${project_id}`,
            dashboard_link: `${frontendUrl}/affiliate/dashboard`
        });

        if (!emailResult?.success) {
            return res.status(502).json({
                success: false,
                message: "Failed to send onboarding reminder email.",
                error: emailResult?.error || 'Unknown email error'
            });
        }

        const activityData = {
            email_event: 'onboarding_form_manual_reminder',
            booking_id: Number(project_id),
            recipient_email: toEmail,
            message_id: emailResult.messageId || null
        };

        if (lead?.lead_id) {
            await sales_lead_activities.create({
                lead_id: lead.lead_id,
                activity_type: 'status_changed',
                activity_data: activityData,
                performed_by_user_id: admin_user_id,
                created_at: new Date()
            });
        } else if (clientLead?.lead_id) {
            await client_lead_activities.create({
                lead_id: clientLead.lead_id,
                activity_type: 'status_changed',
                activity_data: activityData,
                performed_by_user_id: admin_user_id,
                created_at: new Date()
            });
        }

        return res.status(200).json({
            success: true,
            message: "Onboarding reminder email sent successfully.",
            data: {
                project_id: Number(project_id),
                to_email: toEmail,
                message_id: emailResult.messageId || null
            }
        });
    } catch (error) {
        console.error('SendOnboardingFormReminder Error:', error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

exports.submitProjectFormByAdmin = async (req, res) => {
    try {
        const admin_user_id = req.user?.userId || null;
        const {
            onsite_contact_info,
            project_types,
            project_type_other,
            brief_overview,
            num_people_attending,
            event_agenda,
            location_address,
            location_specification,
            location_scouting_refs,
            shot_list,
            visual_references,
            specific_instructions,
            creative_dress_code,
            post_production_ideas,
            preferred_songs,
            additional_info,
            wants_to_learn_more,
            form_user_friendliness_rating
        } = req.body || {};
        const project_id = req.body?.project_id;

        if (!project_id || !brief_overview) {
            return res.status(400).json({
                success: false,
                message: "Project ID and brief overview are required."
            });
        }

        const booking = await stream_project_booking.findByPk(project_id);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Project/Booking not found."
            });
        }
        const clientDetails = await resolveAdminBookingClientContact(booking);

        const formPayload = {
            project_id,
            onsite_contact_info: onsite_contact_info || 'N/A',
            project_types,
            project_type_other,
            brief_overview,
            num_people_attending,
            event_agenda: event_agenda || 'TBD',
            location_address,
            location_specification: location_specification || 'Indoors',
            location_scouting_refs,
            shot_list: shot_list || 'TBD',
            visual_references: visual_references || 'TBD',
            specific_instructions,
            creative_dress_code: creative_dress_code || 'None',
            post_production_ideas,
            preferred_songs,
            additional_info,
            wants_to_learn_more: wants_to_learn_more ? 1 : 0,
            form_user_friendliness_rating,
            created_by: admin_user_id
        };

        const existingSubmission = await project_form_submissions.findOne({
            where: { project_id, is_active: 1 },
            order: [['created_at', 'DESC']]
        });

        let submission = existingSubmission;
        const isUpdate = !!existingSubmission;

        if (existingSubmission) {
            await existingSubmission.update(formPayload);
        } else {
            submission = await project_form_submissions.create({
                ...formPayload,
                created_at: new Date()
            });
        }

        const lead = await sales_leads.findOne({
            where: { booking_id: project_id },
            attributes: ['lead_id']
        });

        if (lead) {
            await sales_lead_activities.create({
                lead_id: lead.lead_id,
                activity_type: 'form_submitted',
                notes: isUpdate
                    ? 'Admin updated the detailed Project Form.'
                    : 'Admin submitted the detailed Project Form.',
                performed_by_user_id: admin_user_id,
                created_at: new Date()
            });
        }

        return res.status(200).json({
            success: true,
            message: isUpdate
                ? "Project form updated successfully."
                : "Project form submitted and saved successfully.",
            is_submitted: true,
            client_details: clientDetails,
            data: {
                submission_id: submission.id,
                project_id: submission.project_id,
                needs_attention: buildShootNeedsAttention(
                    {
                        ...booking.toJSON(),
                        booking_days: await db.stream_project_booking_days.findAll({
                            where: { stream_project_booking_id: booking.stream_project_booking_id },
                            attributes: ['event_date'],
                            raw: true
                        })
                    },
                    submission
                )
            }
        });

    } catch (error) {
        console.error('SubmitProjectFormByAdmin Error:', error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

exports.getAllAssignedRequests = async (req, res) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: "crew_member_id is required",
      });
    }

    const STATUS_MAP = {
      0: "pending",
      1: "accepted",
      2: "rejected",
    };

    const assignedRequests = await assigned_crew.findAll({
      where: { crew_member_id },
      attributes: ['id', 'project_id', 'crew_member_id', 'crew_accept', 'status', 'created_at'],
      include: [
        {
          model: stream_project_booking,
          as: "project",
          required: true,
          where: {
            is_active: 1,
            payment_id: {
              [Op.ne]: null,
            },
          },
          attributes: [
            'stream_project_booking_id',
            'project_name',
            'content_type',
            'shoot_type',
            'event_type',
            'budget',
            'quote_id',
            'payment_id',
          ],
          include: [
            {
              model: quotes,
              as: 'primary_quote',
              required: false,
              attributes: ['quote_id', 'total', 'price_after_discount', 'subtotal'],
            },
            {
              model: quotes,
              as: 'quotes',
              required: false,
              attributes: ['quote_id', 'total', 'price_after_discount', 'subtotal'],
              separate: true,
              limit: 1,
              order: [['quote_id', 'DESC']],
            },
          ],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    const paymentIds = [
      ...new Set(
        assignedRequests
          .map((assignment) => assignment.project?.payment_id)
          .filter((paymentId) => paymentId !== null && paymentId !== undefined)
      ),
    ];

    const paymentRecords = paymentIds.length
      ? await payment_transactions.findAll({
          where: {
            payment_id: {
              [Op.in]: paymentIds,
            },
          },
          attributes: ['payment_id', 'total_amount'],
          raw: true,
        })
      : [];

    const paymentAmountById = paymentRecords.reduce((acc, payment) => {
      acc[payment.payment_id] = payment.total_amount;
      return acc;
    }, {});

    const data = assignedRequests.map((assignment) => {
      const project = assignment.project || {};
      const fallbackQuote = Array.isArray(project.quotes) ? project.quotes[0] : null;
      const quoteSource = project.primary_quote || fallbackQuote;
      const price =
        paymentAmountById[project.payment_id] ??
        quoteSource?.total ??
        quoteSource?.price_after_discount ??
        quoteSource?.subtotal ??
        project.budget ??
        null;

      return {
        booking_id: project.stream_project_booking_id || null,
        project_name: project.project_name || null,
        category: project.content_type || project.shoot_type || null,
        event_type: project.event_type || null,
        price,
        status: STATUS_MAP[assignment.crew_accept] || assignment.status || "unknown",
      };
    });

    return res.status(200).json({
      error: false,
      message: "Assigned project details fetched successfully",
      data,
    });
  } catch (error) {
    console.error('Error fetching assigned project details:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error',
    });
  }
};

const formatUserTypeAsRole = (role, totalUsers = 0) => ({
  role_id: role.user_type_id,
  name: role.user_role,
  description: role.description || null,
  is_system: 0,
  is_active: role.is_active,
  created_by: role.created_by || null,
  updated_by: role.updated_by || null,
  created_at: role.created_at || null,
  updated_at: role.updated_at || null,
  total_users: totalUsers
});

const SUPER_ADMIN_ROLE_NAMES = ['super_admin', 'superadmin', 'super admin', 'Super Admin', 'Super_Admin'];

const isSuperAdminRoleName = (roleName) => {
  const normalized = String(roleName || '').trim().toLowerCase().replace(/\s+/g, '_');
  return normalized === 'super_admin' || normalized === 'superadmin';
};

const normalizePermissionScope = (scope) => String(scope || '').trim().toLowerCase();

const formatPermissionLabel = (key) => String(key || '')
  .split('_')
  .filter(Boolean)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const getPermissionScopeKey = (permission = {}) => {
  if (permission.role_key) return permission.role_key;
  return 'other';
};

const getLegacyModuleKey = (moduleKey, scopeKey) => {
  const prefix = String(scopeKey || '');
  if (prefix && prefix !== 'other' && String(moduleKey || '').startsWith(`${prefix}_`)) {
    return String(moduleKey).slice(`${prefix}_`.length);
  }

  return moduleKey;
};

const formatModuleDisplayName = (moduleKey, scopeKey) => formatPermissionLabel(getLegacyModuleKey(moduleKey, scopeKey));

const buildPermissionEntries = (permissions = {}, includeDenied = false) => {
  const permissionEntries = [];

  Object.keys(permissions || {}).forEach(module => {
    const actions = permissions[module];

    if (Array.isArray(actions)) {
      actions.forEach(action => {
        permissionEntries.push({
          permission_key: `${module}.${action}`,
          is_allowed: 1
        });
      });
      return;
    }

    if (actions && typeof actions === 'object') {
      Object.keys(actions).forEach(action => {
        const isAllowed = Boolean(actions[action]);
        if (isAllowed || includeDenied) {
          permissionEntries.push({
            permission_key: `${module}.${action}`,
            is_allowed: isAllowed ? 1 : 0
          });
        }
      });
    }
  });

  return permissionEntries;
};

const buildPermissionKeys = (permissions = {}) => {
  return buildPermissionEntries(permissions).map(entry => entry.permission_key);
};

const syncRolePermissions = async (roleId, permissions = {}) => {
  const permissionKeys = buildPermissionKeys(permissions);

  await db.role_permissions.update(
    { is_active: 0 },
    { where: { role_id: roleId } }
  );

  if (!permissionKeys.length) {
    return;
  }

  const permissionRecords = await db.permissions.findAll({
    where: {
      permission_key: {
        [Op.in]: permissionKeys
      },
      is_active: 1
    }
  });

  const rolePermissionData = permissionRecords.map(permission => ({
    role_id: roleId,
    permission_id: permission.permission_id,
    is_active: 1
  }));

  if (rolePermissionData.length) {
    await db.role_permissions.bulkCreate(rolePermissionData);
  }
};

const formatRolePermissions = async (roleId) => {
  const rolePermissions = await db.role_permissions.findAll({
    where: {
      role_id: roleId,
      is_active: 1
    },
    include: [
      {
        model: db.permissions,
        as: 'permission',
        required: false
      }
    ]
  });

  const formattedPermissions = {};

  rolePermissions.forEach(item => {
    const permission = item.permission;

    if (!permission) {
      return;
    }

    const module = permission.module_key;
    const action = permission.action_key;

    if (!formattedPermissions[module]) {
      formattedPermissions[module] = {
        view: false,
        create: false,
        edit: false,
        delete: false
      };
    }

    formattedPermissions[module][action] = true;
  });

  return formattedPermissions;
};

const syncUserPermissions = async (userId, permissions = {}) => {
  const permissionEntries = buildPermissionEntries(permissions, true);
  const permissionKeys = permissionEntries.map(entry => entry.permission_key);
  const permissionEntryMap = permissionEntries.reduce((map, entry) => {
    map[entry.permission_key] = entry.is_allowed;
    return map;
  }, {});

  await db.user_permissions.update(
    { is_active: 0 },
    {
      where: { user_id: userId }
    }
  );

  if (!permissionKeys.length) return;

  const permissionRecords = await db.permissions.findAll({
    where: {
      permission_key: {
        [Op.in]: permissionKeys
      },
      is_active: 1
    }
  });

  const userPermissionData = permissionRecords.map(permission => ({
    user_id: userId,
    permission_id: permission.permission_id,
    is_allowed: permissionEntryMap[permission.permission_key] === 1 ? 1 : 0,
    is_active: 1
  }));

  if (userPermissionData.length) {
    await db.user_permissions.bulkCreate(userPermissionData, {
      updateOnDuplicate: ['is_active', 'is_allowed']
    });
  }
};

const syncUserPermissionsFromRole = async (userId, roleId, transaction = null) => {
  const queryOptions = transaction ? { transaction } : {};

  await db.user_permissions.update(
    {
      is_active: 0,
      is_allowed: 0
    },
    {
      where: { user_id: userId },
      ...queryOptions
    }
  );

  const rolePermissions = await db.role_permissions.findAll({
    where: {
      role_id: roleId,
      is_active: 1
    },
    attributes: ['permission_id'],
    ...queryOptions
  });

  const permissionIds = [
    ...new Set(
      rolePermissions
        .map(item => Number(item.permission_id))
        .filter(permissionId => Number.isInteger(permissionId) && permissionId > 0)
    )
  ];

  if (!permissionIds.length) {
    return 0;
  }

  const userPermissionData = permissionIds.map(permissionId => ({
    user_id: userId,
    permission_id: permissionId,
    is_allowed: 1,
    is_active: 1
  }));

  await db.user_permissions.bulkCreate(userPermissionData, {
    updateOnDuplicate: ['is_active', 'is_allowed'],
    ...queryOptions
  });

  return userPermissionData.length;
};

const formatUserPermissions = async (userId) => {
  const userPermissions = await db.user_permissions.findAll({
    where: {
      user_id: userId,
      is_active: 1
    },
    include: [
      {
        model: db.permissions,
        as: 'permission'
      }
    ]
  });

  const formattedPermissions = {};

  userPermissions.forEach(item => {
    const permission = item.permission;
    if (!permission) return;

    const module = permission.module_key;
    const action = permission.action_key;

    if (!formattedPermissions[module]) {
      formattedPermissions[module] = {
        view: false,
        create: false,
        edit: false,
        delete: false
      };
    }

    formattedPermissions[module][action] = item.is_allowed === 1;
  });

  return formattedPermissions;
};

const getCombinedUserPermissions = async (userId, roleId) => {
  const rolePermissions = await formatRolePermissions(roleId);
  const userPermissions = await formatUserPermissions(userId);

  Object.keys(userPermissions).forEach(module => {
    if (!rolePermissions[module]) {
      rolePermissions[module] = {
        view: false,
        create: false,
        edit: false,
        delete: false
      };
    }

    Object.keys(userPermissions[module]).forEach(action => {
      rolePermissions[module][action] = userPermissions[module][action];
    });
  });

  return rolePermissions;
};

exports.createRole = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required'
      });
    }

    const existingRole = await db.user_type.findOne({
      where: {
        user_role: name,
        is_active: 1
      }
    });

    if (existingRole) {
      return res.status(409).json({
        success: false,
        message: 'Role already exists'
      });
    }

    if (isSuperAdminRoleName(name)) {
      return res.status(400).json({
        success: false,
        message: 'Super admin role is system managed'
      });
    }

    const newRole = await db.user_type.create({
      user_role: name,
      description,
      is_active: 1
    });

    return res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: formatUserTypeAsRole(newRole)
    });

  } catch (error) {
    console.error('Create Role Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const {
      search = '',
      month = '', // 1-12
      year = '', // optional
      sort_by = 'role_id',
      order = 'DESC'
    } = req.query;

    const sortMap = {
      role_id: 'user_type_id',
      name: 'user_role',
      is_active: 'is_active',
      created_at: 'created_at'
    };

    const sortField = sortMap[sort_by] || 'user_type_id';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const whereCondition = {
      is_active: 1,
      user_type_id: {
        [Op.notIn]: [2, 3]
      }
    };

    // Search filter
    if (search) {
      whereCondition.user_role = {
        [Op.like]: `%${search}%`
      };
    }

    // Month + Year filter for "Sort by Date"
    if (month) {
      const selectedYear = year || new Date().getFullYear();

      const startDate = new Date(selectedYear, month - 1, 1);
      const endDate = new Date(selectedYear, month, 1);

      whereCondition.created_at = {
        [Op.gte]: startDate,
        [Op.lt]: endDate
      };
    }

    const roles = await db.user_type.findAll({
      where: whereCondition,
      order: [[sortField, sortOrder]]
    });

    const formattedRoles = await Promise.all(
      roles.map(async (role) => {
        const totalUsers = await db.users.count({
          where: {
            user_type: role.user_type_id,
            is_active: 1
          }
        });

        return formatUserTypeAsRole(role, totalUsers);
      })
    );

    return res.status(200).json({
      success: true,
      total_roles: formattedRoles.length,
      data: formattedRoles
    });

  } catch (error) {
    console.error('Get Roles Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching roles',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

exports.assignRoleToUser = async (req, res) => {
  let transaction;

  try {
    const userId = Number(req.body.user_id);
    const roleId = Number(req.body.role_id);

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(roleId) || roleId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid User ID and Role ID are required'
      });
    }

    const user = await db.users.findOne({
      where: {
        id: userId,
        is_active: 1
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const role = await db.user_type.findOne({
      where: {
        user_type_id: roleId,
        is_active: 1
      }
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found or inactive'
      });
    }

    transaction = await db.sequelize.transaction();

    await db.user_roles.update(
      { is_active: 0 },
      {
        where: { user_id: userId },
        transaction
      }
    );

    await db.user_roles.create({
      user_id: userId,
      role_id: roleId,
      is_active: 1
    }, {
      transaction
    });

    await db.users.update(
      {
        user_type: roleId,
        role: role.user_role,
        permissions_version: Sequelize.literal(
          'permissions_version + 1'
        )
      },
      {
        where: { id: userId },
        transaction
      }
    );

    // await db.users.increment(
    //   { permissions_version: 1 },
    //   {
    //     where: { id: userId },
    //     transaction
    //   }
    // );

    // await db.users.update(
    //   {
    //     user_type: roleId,
    //     role: role.user_role
    //   },
    //   {
    //     where: { id: userId },
    //     transaction
    //   }
    // );

    const assignedPermissionsCount = await syncUserPermissionsFromRole(userId, roleId, transaction);

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Role assigned successfully',
      data: {
        user_id: userId,
        role_id: roleId,
        permissions_assigned: assignedPermissionsCount
      }
    });

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }

    console.error('Assign Role Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while assigning role',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { role_id, name, description, permissions } = req.body;

    if (!role_id) {
      return res.status(400).json({
        success: false,
        message: 'Role ID is required'
      });
    }

    const existingRole = await db.user_type.findOne({
      where: {
        user_type_id: role_id,
        is_active: 1
      }
    });

    if (!existingRole) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const roleUpdateData = {};

    if (name !== undefined) {
      roleUpdateData.user_role = name;
    }

    if (description !== undefined) {
      roleUpdateData.description = description;
    }

    if (Object.keys(roleUpdateData).length) {
      await db.user_type.update(roleUpdateData, {
        where: { user_type_id: role_id }
      });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'permissions')) {
      await syncRolePermissions(role_id, permissions);

      // Enable this when role permission updates should force logout for all users on the role.
      // await db.users.update(
      //   {
      //     permissions_version: Sequelize.literal('permissions_version + 1')
      //   },
      //   {
      //     where: {
      //       user_type: role_id,
      //       is_active: 1
      //     }
      //   }
      // );
    }

    return res.status(200).json({
      success: true,
      message: 'Role updated successfully'
    });

  } catch (error) {
    console.error('Update Role Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating role'
    });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { role_id } = req.params;

    if (!role_id) {
      return res.status(400).json({
        success: false,
        message: 'Role ID is required'
      });
    }

    const role = await db.user_type.findOne({
      where: {
        user_type_id: role_id,
        is_active: 1
      }
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const assignedUsers = await db.users.count({
      where: {
        user_type: role_id
      }
    });

    if (assignedUsers > 0) {
      return res.status(400).json({
        success: false,
        message: 'Role is assigned to users and cannot be deleted'
      });
    }

    await db.user_type.update({
      is_active: 0
    }, {
      where: { user_type_id: role_id }
    });

    await db.role_permissions.update({
      is_active: 0
    }, {
      where: { role_id }
    });

    return res.status(200).json({
      success: true,
      message: 'Role deleted successfully'
    });

  } catch (error) {
    console.error('Delete Role Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting role'
    });
  }
};

exports.getRoleById = async (req, res) => {
  try {
    const { role_id } = req.params;

    const role = await db.user_type.findOne({
      where: {
        user_type_id: role_id,
        is_active: 1
      }
    });

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const totalUsers = await db.users.count({
      where: {
        user_type: role_id,
        is_active: 1
      }
    });

    const formattedPermissions = await formatRolePermissions(role_id);

    return res.status(200).json({
      success: true,
      data: {
        role: formatUserTypeAsRole(role, totalUsers),
        permissions: formattedPermissions
      }
    });

  } catch (error) {
    console.error('Get Role By ID Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching role details',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

exports.getUsersWithRoles = async (req, res) => {
  try {
    const {
      search = '',
      status = '',
      role_id = '',
      month = '',
      year = '',
      sort_by = 'id',
      order = 'DESC'
    } = req.query;

    const validSortFields = ['id', 'name', 'created_at', 'updated_at'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'id';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const userWhereCondition = {};

    // Status filter
    if (status !== '') {
      userWhereCondition.is_active = status;
    }

    // Search filter
    if (search) {
      userWhereCondition[Op.or] = [
        {
          name: {
            [Op.like]: `%${search}%`
          }
        },
        {
          email: {
            [Op.like]: `%${search}%`
          }
        }
      ];
    }

    // Month + Year filter
    if (month) {
      const selectedYear = year || new Date().getFullYear();

      const startDate = new Date(selectedYear, month - 1, 1);
      const endDate = new Date(selectedYear, month, 1);

      userWhereCondition.created_at = {
        [Op.gte]: startDate,
        [Op.lt]: endDate
      };
    }

    // Role filter
    if (role_id) {
      userWhereCondition.user_type = role_id;
    } else {
      userWhereCondition.user_type = {
        [Op.notIn]: [2, 3]
      };
    }

    const users = await db.users.scope('all').findAll({
      where: userWhereCondition,
      attributes: [
        'id',
        'name',
        'email',
        'user_type',
        'created_at',
        'updated_at',
        'is_active'
      ],
      order: [[sortField, sortOrder]]
    });

    const userIds = users.map((user) => Number(user.id)).filter(Boolean);
    const archiveHistoryRows = userIds.length
      ? await user_archive_history.findAll({
          where: {
            target_type: 'internal_user',
            target_id: { [Op.in]: userIds }
          },
          order: [['created_at', 'DESC']],
          raw: true
        })
      : [];

    const archiveHistoryMap = new Map();
    archiveHistoryRows.forEach((row) => {
      const key = Number(row.target_id);
      const currentRows = archiveHistoryMap.get(key) || [];
      currentRows.push({
        history_id: row.history_id,
        target_type: row.target_type,
        target_id: row.target_id,
        user_id: row.user_id,
        action: row.action,
        reason: row.reason,
        performed_by_user_id: row.performed_by_user_id,
        performed_by_name: row.performed_by_name,
        performed_by_role: row.performed_by_role,
        previous_status: row.previous_status,
        new_status: row.new_status,
        metadata: row.metadata,
        created_at: row.created_at
      });
      archiveHistoryMap.set(key, currentRows);
    });

    const userTypes = await db.user_type.findAll({
      where: {
        is_active: 1
      }
    });

    const userTypeMap = {};

    userTypes.forEach(type => {
      userTypeMap[type.user_type_id] = type.user_role;
    });

    const formattedUsers = users.map(user => {
      const archiveHistory = archiveHistoryMap.get(Number(user.id)) || [];
      const latestArchiveEvent = archiveHistory[0] || null;

      return {
        user_id: user.id,
        name: user.name,
        email: user.email,
        role_id: user.user_type,
        role_name: userTypeMap[user.user_type] || null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        is_active: user.is_active,
        status_label: user.is_active ? 'Active' : 'In-Active',
        archive_history: archiveHistory,
        last_archive_event: latestArchiveEvent,
        deleted_by_name: latestArchiveEvent?.action === 'deleted' ? latestArchiveEvent.performed_by_name : null,
        deleted_at: latestArchiveEvent?.action === 'deleted' ? latestArchiveEvent.created_at : null,
        restored_by_name: latestArchiveEvent?.action === 'restored' ? latestArchiveEvent.performed_by_name : null,
        restored_at: latestArchiveEvent?.action === 'restored' ? latestArchiveEvent.created_at : null
      };
    });

    return res.status(200).json({
      success: true,
      total_users: formattedUsers.length,
      data: formattedUsers
    });

  } catch (error) {
    console.error('Get Users With Roles Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching users with roles',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

exports.getUserRoleDetails = async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const user = await db.users.scope('all').findOne({
      where: {
        id: user_id
      },
      attributes: [
        'id',
        'name',
        'email',
        'user_type',
        'created_at',
        'updated_at',
        'is_active'
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const role = await db.user_type.findOne({
      where: {
        user_type_id: user.user_type,
        is_active: 1
      }
    });

    let formattedPermissions = {};

    if (role) {
      formattedPermissions = await getCombinedUserPermissions(
        user.id,
        role.user_type_id
      );
    }

    const archiveHistory = await getArchiveHistoryForInternalUser(user.id);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          user_id: user.id,
          name: user.name,
          email: user.email,
          user_type: user.user_type,
          user_type_name: role ? role.user_role : null,
          is_active: user.is_active,
          status_label: user.is_active ? 'Active' : 'In-Active',
          created_at: user.created_at,
          updated_at:user.updated_at
        },

        role: role
          ? {
              role_id: role.user_type_id,
              name: role.user_role,
              description: role.description || null,
              is_active: role.is_active,
              created_at: role.created_at,
              updated_at: role.updated_at
            }
          : null,

        display_role: role ? role.user_role : null,

        archive_history: archiveHistory,

        permissions: formattedPermissions
      }
    });

  } catch (error) {
    console.error('Get User Role Details Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching user role details',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

exports.getPermissionModules = async (req, res) => {
  try {
    const requestedScope = normalizePermissionScope(req.query.scope);
    const grouped = !['0', 'false', 'no'].includes(String(req.query.grouped || 'true').toLowerCase());
    const requestedScopeKey = requestedScope || null;

    const permissions = await db.permissions.findAll({
      where: {
        is_active: 1
      },
      attributes: [
        'permission_id',
        'role_key',
        'module_key',
        'action_key',
        'permission_key'
      ],
      order: [
        ['role_key', 'ASC'],
        ['module_key', 'ASC'],
        ['action_key', 'ASC']
      ]
    });

    const scopeMap = {};

    permissions.forEach(permission => {
      const scopeKey = getPermissionScopeKey(permission);
      const module = permission.module_key;
      const action = permission.action_key;

      if (requestedScopeKey && scopeKey !== requestedScopeKey) {
        return;
      }

      if (!scopeMap[scopeKey]) {
        scopeMap[scopeKey] = {
          scope: scopeKey,
          scope_label: formatPermissionLabel(scopeKey),
          modules: {}
        };
      }

      if (!scopeMap[scopeKey].modules[module]) {
        const legacyModuleKey = getLegacyModuleKey(module, scopeKey);
        scopeMap[scopeKey].modules[module] = {
          module_key: module,
          display_name: formatModuleDisplayName(module, scopeKey),
          legacy_module_key: legacyModuleKey,
          actions: []
        };
      }

      if (!scopeMap[scopeKey].modules[module].actions.some(item => item.action_key === action)) {
        scopeMap[scopeKey].modules[module].actions.push({
          permission_id: permission.permission_id,
          action_key: action,
          permission_key: permission.permission_key
        });
      }
    });

    const sortModules = (modules) => (
      modules.sort((first, second) => first.module_key.localeCompare(second.module_key))
    );

    const formatScope = (scopeData) => {
      const modules = sortModules(Object.values(scopeData.modules));
      return {
        scope: scopeData.scope,
        scope_label: scopeData.scope_label,
        total_modules: modules.length,
        modules
      };
    };

    if (grouped && !requestedScope) {
      const groupedData = Object.values(scopeMap)
        .map(formatScope)
        .sort((first, second) => first.scope.localeCompare(second.scope));

      return res.status(200).json({
        success: true,
        total_scopes: groupedData.length,
        data: groupedData
      });
    }

    const requestedScopeData = requestedScopeKey ? scopeMap[requestedScopeKey] : null;
    const formattedModules = requestedScopeData
      ? sortModules(Object.values(requestedScopeData.modules))
      : [];

    return res.status(200).json({
      success: true,
      scope: requestedScopeKey || null,
      scope_label: requestedScopeData?.scope_label || (requestedScopeKey ? formatPermissionLabel(requestedScopeKey) : null),
      total_modules: formattedModules.length,
      data: formattedModules
    });

  } catch (error) {
    console.error('Get Permission Modules Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching permission modules',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

exports.deleteUser = async (req, res) => {
  const user_id = Number(req.params.user_id);
  const { reason = null } = req.body || {};

  if (!Number.isInteger(user_id) || user_id <= 0) {
    return res.status(400).json({
      error: true,
      message: 'Valid user_id is required'
    });
  }

  const transaction = await db.sequelize.transaction();

  try {
    const actor = await getRequestActor(req);

    if (!actor) {
      await transaction.rollback();
      return res.status(401).json({
        error: true,
        message: 'Authentication required to delete user'
      });
    }

    const user = await users.scope('all').findOne({
      where: {
        id: user_id,
        is_active: 1
      },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'User not found or inactive'
      });
    }

    const role = await db.user_type.findOne({
      where: { user_type_id: user.user_type },
      attributes: ['user_type_id', 'user_role'],
      raw: true,
      transaction
    });

    // ================= CLIENT DELETE =================
    if (user.user_type == 3) {
      const client = await clients.findOne({
        where: {
          user_id,
          is_active: 1
        },
        transaction
      });

      if (client) {
        await client.update(
          { is_active: 0 },
          { transaction }
        );

        const clientLeadRows = await db.client_leads.findAll({
          where: { user_id },
          attributes: ['lead_id', 'booking_id'],
          transaction
        });

        const unbookedLeadIdList = clientLeadRows
          .filter(lead => !lead.booking_id)
          .map(lead => lead.lead_id);

        if (unbookedLeadIdList.length > 0) {
          await db.client_leads.update(
            { is_active: 0 },
            {
              where: {
                lead_id: { [Op.in]: unbookedLeadIdList }
              },
              transaction
            }
          );

          await db.client_lead_activities.update(
            { is_active: 0 },
            {
              where: {
                lead_id: { [Op.in]: unbookedLeadIdList }
              },
              transaction
            }
          );
        }
      }
    }

    // ================= CREW MEMBER DELETE =================
    else if (user.user_type == 2 || user.user_type == 4) {
      const crew_member = await crew_members.findOne({
        where: {
          user_id,
          is_active: 1
        },
        transaction
      });

      if (crew_member) {
        // Deactivate crew member
        await crew_member.update(
          { is_active: 0 },
          { transaction }
        );

        await crew_member_files.update(
          { is_active: 0 },
          {
            where: {
              crew_member_id: crew_member.crew_member_id
            },
            transaction
          }
        );
      }
    }

    // ================= AFFILIATE DELETE =================
    await db.affiliates.update(
      { is_active: 0 },
      {
        where: {
          user_id
        },
        transaction
      }
    );

    // ================= USER ROLE DELETE =================
    await db.user_roles.update(
      { is_active: 0 },
      {
        where: {
          user_id
        },
        transaction
      }
    );

    // ================= USER DELETE =================
    await user.update(
      { is_active: 0 },
      { transaction }
    );

    await writeInternalUserArchiveHistory({
      user,
      action: 'deleted',
      reason: reason || 'Deleted from roles and permissions',
      actor,
      previousStatus: 'active',
      newStatus: 'inactive',
      metadata: {
        source_endpoint: 'DELETE /admin/delete-user/:user_id',
        role_id: user.user_type,
        role_name: role?.user_role || user.role || null
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      error: false,
      message: 'User deactivated successfully'
    });

  } catch (error) {
    await transaction.rollback();

    console.error('Error deleting user:', error);

    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.restoreUser = async (req, res) => {
  const user_id = Number(req.params.user_id);
  const { reason = null } = req.body || {};

  if (!Number.isInteger(user_id) || user_id <= 0) {
    return res.status(400).json({
      error: true,
      message: 'Valid user_id is required'
    });
  }

  const transaction = await db.sequelize.transaction();

  try {
    const actor = await getRequestActor(req);

    if (!actor) {
      await transaction.rollback();
      return res.status(401).json({
        error: true,
        message: 'Authentication required to restore user'
      });
    }

    const user = await users.scope('all').findOne({
      where: { id: user_id },
      transaction
    });

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'User not found'
      });
    }

    if (Number(user.is_active) === 1) {
      await transaction.rollback();
      return res.status(409).json({
        error: true,
        message: 'User is already active'
      });
    }

    const role = await db.user_type.findOne({
      where: {
        user_type_id: user.user_type,
        is_active: 1
      },
      attributes: ['user_type_id', 'user_role'],
      raw: true,
      transaction
    });

    if (!role) {
      await transaction.rollback();
      return res.status(404).json({
        error: true,
        message: 'Assigned role not found or inactive'
      });
    }

    await user.update({
      is_active: 1,
      permissions_version: Sequelize.literal('permissions_version + 1')
    }, { transaction });

    await db.user_roles.update(
      { is_active: 0 },
      {
        where: { user_id },
        transaction
      }
    );

    const existingUserRole = await db.user_roles.findOne({
      where: {
        user_id,
        role_id: user.user_type
      },
      transaction
    });

    if (existingUserRole) {
      await existingUserRole.update({ is_active: 1 }, { transaction });
    } else {
      await db.user_roles.create({
        user_id,
        role_id: user.user_type,
        is_active: 1
      }, { transaction });
    }

    await writeInternalUserArchiveHistory({
      user,
      action: 'restored',
      reason: reason || 'Restored from roles and permissions',
      actor,
      previousStatus: 'inactive',
      newStatus: 'active',
      metadata: {
        source_endpoint: 'POST /admin/restore-user/:user_id',
        role_id: user.user_type,
        role_name: role.user_role
      },
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      error: false,
      success: true,
      message: 'User restored successfully',
      data: {
        user_id,
        is_active: 1,
        status_label: 'Active',
        role_id: user.user_type,
        role_name: role.user_role
      }
    });

  } catch (error) {
    await transaction.rollback();

    console.error('Error restoring user:', error);

    return res.status(500).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.assignPermissionsToUser = async (req, res) => {
  try {
    const { user_id, permissions } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const user = await db.users.findOne({
      where: {
        id: user_id,
        is_active: 1
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await syncUserPermissions(user_id, permissions);

    await db.users.update(
      {
        permissions_version: Sequelize.literal('permissions_version + 1')
      },
      {
        where: { id: user_id }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'User permissions assigned successfully'
    });

  } catch (error) {
    console.error('Assign User Permissions Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while assigning permissions'
    });
  }
};

exports.updateUserPermissions = async (req, res) => {
  try {
    const { user_id, permissions } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const user = await db.users.findOne({
      where: {
        id: user_id,
        is_active: 1
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await syncUserPermissions(user_id, permissions);

    await db.users.update(
      {
        permissions_version: Sequelize.literal('permissions_version + 1')
      },
      {
        where: { id: user_id }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'User permissions updated successfully'
    });

  } catch (error) {
    console.error('Update User Permissions Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while updating permissions'
    });
  }
};

exports.getUserPermissions = async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await db.users.findOne({
      where: {
        id: user_id,
        is_active: 1
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const permissions = await getCombinedUserPermissions(
      user.id,
      user.user_type
    );

    return res.status(200).json({
      success: true,
      data: {
        user_id: user.id,
        permissions
      }
    });

  } catch (error) {
    console.error('Get User Permissions Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while fetching permissions'
    });
  }
};

exports.deleteUserPermission = async (req, res) => {
  try {
    const { user_id, permission_id, module_key, action_key } = req.params;

    const user = await db.users.findOne({
      where: {
        id: user_id,
        is_active: 1
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const permissionWhere = {
      is_active: 1
    };

    if (module_key && action_key) {
      permissionWhere.module_key = module_key;
      permissionWhere.action_key = action_key;
    } else if (permission_id && /^\d+$/.test(String(permission_id))) {
      permissionWhere.permission_id = permission_id;
    } else if (permission_id) {
      permissionWhere.permission_key = permission_id;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Permission identifier is required'
      });
    }

    const permission = await db.permissions.findOne({
      where: permissionWhere
    });

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permission not found'
      });
    }

    const rolePermission = await db.role_permissions.findOne({
      where: {
        role_id: user.user_type,
        permission_id: permission.permission_id,
        is_active: 1
      }
    });

    if (rolePermission) {
      await db.user_permissions.bulkCreate(
        [{
          user_id,
          permission_id: permission.permission_id,
          is_allowed: 0,
          is_active: 1
        }],
        {
          updateOnDuplicate: ['is_active', 'is_allowed']
        }
      );
    } else {
      await db.user_permissions.update(
        {
          is_active: 0
        },
        {
          where: {
            user_id,
            permission_id: permission.permission_id
          }
        }
      );
    }

    await db.users.update(
      {
        permissions_version: Sequelize.literal('permissions_version + 1')
      },
      {
        where: { id: user_id }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Permission removed successfully'
    });

  } catch (error) {
    console.error('Delete User Permission Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error while deleting permission'
    });
  }
};

const getAuthenticatedUserId = (req) => {
  const userId = Number(req.user?.userId || req.user?.id || req.body?.user_id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
};

const getNoteBody = (body = {}) => {
  const value = body.note ?? body.message ?? body.body ?? '';
  return String(value).trim();
};

const getSafeReactionType = (value) => {
  const normalized = String(value || 'like').trim().toLowerCase();
  const allowed = new Set(['like', 'love', 'laugh', 'wow', 'sad']);
  return allowed.has(normalized) ? normalized : 'like';
};

const formatNoteAuthor = (user = null) => {
  if (!user) return null;
  const plain = typeof user.get === 'function' ? user.get({ plain: true }) : user;
  return {
    user_id: plain.id,
    name: plain.name || plain.email || `User ${plain.id}`,
    email: plain.email || null,
    role_id: plain.user_type || null,
    role_name: plain.userType?.user_role || plain.role || null
  };
};

const formatProjectNote = (note, currentUserId, repliesByParentId) => {
  const plain = typeof note.get === 'function' ? note.get({ plain: true }) : note;
  const reactions = Array.isArray(plain.reactions) ? plain.reactions : [];
  const reactionUsersByType = {};
  const myReactionsSet = new Set();

  reactions.forEach((reaction) => {
    const key = String(reaction?.reaction_type || '').toLowerCase().trim();
    if (!key) return;
    if (!reactionUsersByType[key]) reactionUsersByType[key] = [];

    const userId = Number(reaction?.user_id || reaction?.user?.id || 0);
    const userName =
      reaction?.user?.name ||
      reaction?.user?.email ||
      (userId > 0 ? `User ${userId}` : 'Unknown User');

    if (!reactionUsersByType[key].some((user) => Number(user.user_id) === userId)) {
      reactionUsersByType[key].push({
        user_id: userId,
        name: userName,
      });
    }

    if (userId > 0 && Number(userId) === Number(currentUserId)) {
      myReactionsSet.add(key);
    }
  });

  const myReactions = Array.from(myReactionsSet);
  const attachments = (Array.isArray(plain.attachments) ? plain.attachments : [])
    .filter((attachment) => Number(attachment.is_active) === 1 || attachment.is_active === undefined)
    .map((attachment) => ({
      attachment_id: attachment.attachment_id,
      file_name: attachment.file_name,
      file_path: toAbsoluteBeigeAssetUrl(attachment.file_path),
      mime_type: attachment.mime_type || null,
      file_size_bytes: attachment.file_size_bytes !== undefined ? Number(attachment.file_size_bytes) : null,
      uploaded_by_user_id: attachment.uploaded_by_user_id,
      created_at: attachment.created_at
    }));
  const children = repliesByParentId.get(Number(plain.note_id)) || [];

  return {
    note_id: plain.note_id,
    booking_id: plain.booking_id,
    parent_note_id: plain.parent_note_id,
    message: plain.message,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    created_by: formatNoteAuthor(plain.created_by),
    attachments,
    like_count: reactions.filter((reaction) => reaction.reaction_type === 'like').length,
    reaction_count: reactions.length,
    reacted_by_me: reactions.some((reaction) => Number(reaction.user_id) === Number(currentUserId)),
    my_reactions: myReactions,
    reaction_users_by_type: reactionUsersByType,
    replies: children.map((reply) => formatProjectNote(reply, currentUserId, repliesByParentId))
  };
};

const loadShootNotes = async (bookingId, currentUserId) => {
  const notes = await db.project_notes.findAll({
    where: {
      booking_id: bookingId,
      is_active: 1
    },
    include: [
      {
        model: db.users,
        as: 'created_by',
        required: false,
        attributes: ['id', 'name', 'email', 'user_type', 'role'],
        include: [
          {
            model: db.user_type,
            as: 'userType',
            required: false,
            attributes: ['user_type_id', 'user_role']
          }
        ]
      },
      {
        model: db.project_note_attachments,
        as: 'attachments',
        required: false,
        where: { is_active: 1 },
        attributes: [
          'attachment_id',
          'note_id',
          'uploaded_by_user_id',
          'file_name',
          'file_path',
          'mime_type',
          'file_size_bytes',
          'is_active',
          'created_at'
        ]
      },
      {
        model: db.project_note_reactions,
        as: 'reactions',
        required: false,
        attributes: ['reaction_id', 'user_id', 'reaction_type', 'created_at'],
        include: [
          {
            model: db.users,
            as: 'user',
            required: false,
            attributes: ['id', 'name', 'email']
          }
        ]
      }
    ],
    order: [
      ['created_at', 'ASC'],
      ['note_id', 'ASC']
    ]
  });

  const repliesByParentId = new Map();
  const rootNotes = [];

  notes.forEach((note) => {
    const parentId = Number(note.parent_note_id || 0);
    if (parentId > 0) {
      if (!repliesByParentId.has(parentId)) repliesByParentId.set(parentId, []);
      repliesByParentId.get(parentId).push(note);
    } else {
      rootNotes.push(note);
    }
  });

  return rootNotes.map((note) => formatProjectNote(note, currentUserId, repliesByParentId));
};

const uploadShootNoteAttachmentsToS3 = async (files = []) => {
  if (!Array.isArray(files) || files.length === 0) return [];
  const uploaded = await S3UploadFiles({ attachments: files });
  return uploaded.map((item, index) => ({
    file_path: item.file_path,
    file_name: files[index]?.originalname || files[index]?.filename || 'attachment',
    mime_type: files[index]?.mimetype || null,
    file_size_bytes: files[index]?.size || null
  }));
};

const findActiveShoot = async (bookingId) => stream_project_booking.findOne({
  where: {
    stream_project_booking_id: bookingId,
    is_active: 1
  }
});

const findActiveShootNote = async (bookingId, noteId) => db.project_notes.findOne({
  where: {
    note_id: noteId,
    booking_id: bookingId,
    is_active: 1
  }
});

const isAdminShootNotesRole = (role) => (
  ['admin', 'production_manager'].includes(String(role || '').toLowerCase().replace(/\s+/g, '_'))
);

const ensureShootNotesAccess = async (bookingId, req, res) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: 'Authenticated user is required' });
    return null;
  }

  const booking = await findActiveShoot(bookingId);
  if (!booking) {
    res.status(404).json({ success: false, message: 'Shoot not found' });
    return null;
  }

  return booking;
};

exports.getShootNotes = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const currentUserId = getAuthenticatedUserId(req);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bookingId is required' });
    }

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required' });
    }

    const booking = await ensureShootNotesAccess(bookingId, req, res);
    if (!booking) return null;

    const notes = await loadShootNotes(bookingId, currentUserId);

    return res.status(200).json({
      success: true,
      message: 'Shoot notes fetched successfully',
      data: notes
    });
  } catch (error) {
    console.error('Get shoot notes error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.addShootNote = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const currentUserId = getAuthenticatedUserId(req);
    const message = getNoteBody(req.body);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bookingId is required' });
    }

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required' });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'Note message is required' });
    }

    const booking = await ensureShootNotesAccess(bookingId, req, res);
    if (!booking) return null;

    const user = await db.users.findOne({ where: { id: currentUserId }, attributes: ['id'] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const note = await db.project_notes.create({
      booking_id: bookingId,
      created_by_user_id: currentUserId,
      message
    });

    const uploadedAttachments = await uploadShootNoteAttachmentsToS3(req.files);
    if (uploadedAttachments.length > 0) {
      await db.project_note_attachments.bulkCreate(
        uploadedAttachments.map((file) => ({
          note_id: note.note_id,
          uploaded_by_user_id: currentUserId,
          file_name: file.file_name,
          file_path: file.file_path,
          mime_type: file.mime_type,
          file_size_bytes: file.file_size_bytes
        }))
      );
    }

    const notes = await loadShootNotes(bookingId, currentUserId);
    const createdNote = notes.find((item) => Number(item.note_id) === Number(note.note_id));

    return res.status(201).json({
      success: true,
      message: 'Shoot note added successfully',
      data: createdNote || note
    });
  } catch (error) {
    console.error('Add shoot note error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.replyToShootNote = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const noteId = Number(req.params.noteId);
    const currentUserId = getAuthenticatedUserId(req);
    const message = getNoteBody(req.body);

    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(noteId) || noteId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bookingId and noteId are required' });
    }

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required' });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'Reply message is required' });
    }

    const booking = await ensureShootNotesAccess(bookingId, req, res);
    if (!booking) return null;

    const parentNote = await findActiveShootNote(bookingId, noteId);
    if (!parentNote) {
      return res.status(404).json({ success: false, message: 'Parent note not found for this shoot' });
    }

    const reply = await db.project_notes.create({
      booking_id: bookingId,
      parent_note_id: noteId,
      created_by_user_id: currentUserId,
      message
    });

    const uploadedAttachments = await uploadShootNoteAttachmentsToS3(req.files);
    if (uploadedAttachments.length > 0) {
      await db.project_note_attachments.bulkCreate(
        uploadedAttachments.map((file) => ({
          note_id: reply.note_id,
          uploaded_by_user_id: currentUserId,
          file_name: file.file_name,
          file_path: file.file_path,
          mime_type: file.mime_type,
          file_size_bytes: file.file_size_bytes
        }))
      );
    }

    const notes = await loadShootNotes(bookingId, currentUserId);
    const parent = notes.find((item) => Number(item.note_id) === Number(noteId));
    const createdReply = parent?.replies?.find((item) => Number(item.note_id) === Number(reply.note_id));

    return res.status(201).json({
      success: true,
      message: 'Shoot note reply added successfully',
      data: createdReply || reply
    });
  } catch (error) {
    console.error('Reply to shoot note error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.toggleShootNoteReaction = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const noteId = Number(req.params.noteId);
    const currentUserId = getAuthenticatedUserId(req);
    const reactionType = getSafeReactionType(req.body?.reaction || req.body?.reaction_type);

    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(noteId) || noteId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bookingId and noteId are required' });
    }

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required' });
    }

    const booking = await ensureShootNotesAccess(bookingId, req, res);
    if (!booking) return null;

    const note = await findActiveShootNote(bookingId, noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found for this shoot' });
    }

    const existingUserReactions = await db.project_note_reactions.findAll({
      where: {
        note_id: noteId,
        user_id: currentUserId,
      }
    });

    const existingSameReaction = existingUserReactions.find(
      (item) => String(item.reaction_type || '').toLowerCase() === reactionType
    );

    let reactedByMe = false;

    if (existingSameReaction) {
      // Toggle off when tapping the same reaction again.
      await db.project_note_reactions.destroy({
        where: {
          note_id: noteId,
          user_id: currentUserId,
        }
      });
    } else {
      // Keep one reaction per user per note (replace old reaction with new one).
      await db.project_note_reactions.destroy({
        where: {
          note_id: noteId,
          user_id: currentUserId,
        }
      });

      await db.project_note_reactions.create({
        note_id: noteId,
        user_id: currentUserId,
        reaction_type: reactionType
      });
      reactedByMe = true;
    }

    const [likeCount, reactionCount] = await Promise.all([
      db.project_note_reactions.count({ where: { note_id: noteId, reaction_type: 'like' } }),
      db.project_note_reactions.count({ where: { note_id: noteId } })
    ]);

    return res.status(200).json({
      success: true,
      message: reactedByMe ? 'Reaction added successfully' : 'Reaction removed successfully',
      data: {
        note_id: noteId,
        reaction: reactionType,
        reacted_by_me: reactedByMe,
        like_count: likeCount,
        reaction_count: reactionCount
      }
    });
  } catch (error) {
    console.error('Toggle shoot note reaction error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteShootNote = async (req, res) => {
  try {
    const bookingId = Number(req.params.bookingId);
    const noteId = Number(req.params.noteId);
    const currentUserId = getAuthenticatedUserId(req);
    const userRole = String(req.user?.userRole || '').toLowerCase().replace(/\s+/g, '_');

    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(noteId) || noteId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid bookingId and noteId are required' });
    }

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required' });
    }

    const booking = await ensureShootNotesAccess(bookingId, req, res);
    if (!booking) return null;

    const note = await findActiveShootNote(bookingId, noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found for this shoot' });
    }

    const canDelete = (
      Number(note.created_by_user_id) === Number(currentUserId) ||
      isAdminShootNotesRole(userRole)
    );

    if (!canDelete) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this note' });
    }

    await db.project_notes.update(
      { is_active: 0 },
      {
        where: {
          [Op.or]: [
            { note_id: noteId },
            { parent_note_id: noteId }
          ]
        }
      }
    );

    await db.project_note_attachments.update(
      { is_active: 0 },
      {
        where: {
          note_id: {
            [Op.in]: [
              noteId,
              ...(
                await db.project_notes.findAll({
                  where: { parent_note_id: noteId, booking_id: bookingId },
                  attributes: ['note_id'],
                  raw: true
                })
              ).map((item) => Number(item.note_id))
            ]
          }
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Shoot note deleted successfully'
    });
  } catch (error) {
    console.error('Delete shoot note error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
