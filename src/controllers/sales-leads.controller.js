const { sales_leads, client_leads, sales_lead_activities, client_lead_activities, stream_project_booking, stream_project_booking_days, users, user_type, discount_codes, payment_links,  quotes, sales_quotes, assigned_crew, crew_members,
  quote_line_items, crew_member_files, assigned_equipment } = require('../models');
const { Op, Sequelize } = require('sequelize');
const multer = require('multer');
const path = require('path');
const constants = require('../utils/constants');
const leadAssignmentService = require('../services/lead-assignment.service');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');
const pricingService = require('../services/pricing.service');
const pricingController = require('../controllers/pricing.controller');
const externalFileManagerController = require('../controllers/external-file-manager.controller');
const paymentService = require('../services/payment-links.service');
const accountCreditService = require('../services/account-credit.service');
const bookingPaymentSummaryService = require('../services/booking-payment-summary.service');
const quoteService = require('../services/sales-quote.service');
const emailService = require('../utils/emailService');
const { sendCPNewBookingRequestEmail } = require('../utils/emailService');
const { resolveEventDateAndStartTime, normalizeTime, splitDateTime } = require('../utils/timezone');
const { extractCoordinatesFromPayload } = require('../utils/locationHelpers');
const { S3UploadFiles } = require('../utils/common.js');

const sequelize = require('../db');
const db = require('../models');
const EXTERNAL_FILE_MANAGER_API_BASE_URL = process.env.EXTERNAL_FILE_MANAGER_API_BASE_URL || 'http://localhost:5002/v1/external-file-manager';
const EXTERNAL_FILE_MANAGER_KEY = process.env.EXTERNAL_FILE_MANAGER_KEY || 'beige-internal-dev-key';

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
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/jfif',
      'image/jpg',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and PDF are allowed.'));
    }
    cb(null, true);
  },
});

const normalizeDateOnlyInput = (value) => {
  const { date } = splitDateTime(value);
  return date || null;
};

const BOOK_A_SHOOT_SERVICE_TYPES = new Set([
  'photography',
  'videography',
  'studios',
  'videography_studios',
]);

const normalizeBookAShootServiceType = (value) => {
  const normalized = String(value || 'photography')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'studio') return 'studios';
  if (normalized === 'video') return 'videography';
  if (normalized === 'videography_studio') return 'videography_studios';
  return normalized;
};

const buildBookAShootMetadata = (body, serviceType) => ({
  serviceType,
  bookingFlow: serviceType,
  studio_details: body.studio_details || body.studioDetails || null,
  videography_details: body.videography_details || body.videographyDetails || null,
  pricing: body.pricing || body.price_details || body.priceDetails || null,
  selected_package: body.selected_package || body.selectedPackage || body.package || null,
  location: body.location || null,
  latitude: body.latitude ?? body.lat ?? body.location_latitude ?? null,
  longitude: body.longitude ?? body.lng ?? body.location_longitude ?? null,
  shootDate: body.shootDate || body.start_date || body.startDate || null,
  shootTime: body.shootTime || body.start_time || null,
  notes: body.notes || body.message || body.specialInstructions || null,
});

const getBookAShootSelectedPackage = (body) =>
  body.selected_package ||
  body.selectedPackage ||
  body.package ||
  body.studio_details?.package ||
  body.studioDetails?.package ||
  body.videography_details?.package ||
  body.videographyDetails?.package ||
  null;

const normalizeBookAShootCrewRoles = (crewRoles = {}) => {
  const allowedRoles = new Set(['photographer', 'videographer', 'studio']);
  return Object.entries(crewRoles).reduce((acc, [role, count]) => {
    const key = String(role || '').trim().toLowerCase();
    const numericCount = Number(count);
    if (allowedRoles.has(key) && Number.isFinite(numericCount) && numericCount > 0) {
      acc[key] = numericCount;
    }
    return acc;
  }, {});
};

const validateBookAShootFlowDetails = ({ serviceType, studioDetails, videographyDetails }) => {
  if ((serviceType === 'videography' || serviceType === 'videography_studios') && !videographyDetails) {
    return 'videography_details is required for this serviceType';
  }
  if ((serviceType === 'studios' || serviceType === 'videography_studios') && !studioDetails) {
    return 'studio_details is required for this serviceType';
  }
  return null;
};

const parseQuoteActivityMetadata = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const buildDealProjectName = ({ shootType = null, contentType = null, clientName = null, guestEmail = null }) => {
  const normalizedShootType = String(shootType || '').trim();
  const normalizedContentType = String(contentType || '').trim();
  const normalizedClientName = String(clientName || '').trim();
  const normalizedGuestEmail = String(guestEmail || '').trim();

  const titleSource = normalizedShootType || normalizedContentType || 'New';
  const clientLabel = normalizedClientName || normalizedGuestEmail || 'Client';

  return `${titleSource.toUpperCase()} Shoot - ${clientLabel}`;
};

const normalizeStatusFilterValue = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[\s_-]+/g, '')
);

const normalizeDisplayStatusValue = (value) => (
  String(value || '')
    .replace(/â€“|Ã¢â‚¬â€œ/g, '-')
    .replace(/[–—]/g, '-')
    .trim()
);

const isShootStatusFilterValue = (value) => (
  [
    'initiated',
    'preproduction',
    'shootday',
    'postproduction',
    'revision',
    'completed',
    'assetsdelivered',
    'cancelled',
    'upcoming',
    'draft'
  ].includes(normalizeStatusFilterValue(value))
);

const formatLocalDateParts = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateOnlyString = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
      return trimmedValue;
    }

    const parsedStringDate = new Date(trimmedValue);
    if (Number.isNaN(parsedStringDate.getTime())) return null;
    return formatLocalDateParts(parsedStringDate);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatLocalDateParts(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalDateParts(parsed);
};

const getTodayDateOnlyString = () => formatLocalDateParts(new Date());

const matchShootStatusFilter = (booking, rawStatus) => {
  const normalizedStatus = normalizeStatusFilterValue(rawStatus);
  if (!normalizedStatus || normalizedStatus === 'all') {
    return null;
  }

  const supportedStatuses = new Set([
    'initiated',
    'preproduction',
    'shootday',
    'postproduction',
    'revision',
    'completed',
    'assetsdelivered',
    'cancelled',
    'upcoming',
    'draft'
  ]);

  if (!supportedStatuses.has(normalizedStatus)) {
    return null;
  }

  if (!booking) {
    return false;
  }

  const bookingStatus = Number(booking.status);
  const eventDate = getDateOnlyString(booking.event_date);
  const today = getTodayDateOnlyString();
  const isCancelled = Number(booking.is_cancelled || 0) === 1;
  const isDraft = Number(booking.is_draft || 0) === 1;
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

const hasCompletedMeetingOfType = (booking, meetingType) => {
  const meetings = Array.isArray(booking?.meetings) ? booking.meetings : [];
  return meetings.some((meeting) =>
    String(meeting?.meeting_type || '').toLowerCase() === String(meetingType || '').toLowerCase() &&
    String(meeting?.meeting_status || '').toLowerCase() === 'completed'
  );
};

const hasCompletedFileInCategories = (booking, categories = []) => {
  const files = Array.isArray(booking?.cms_project?.files) ? booking.cms_project.files : [];
  const allowed = new Set(categories.map((entry) => String(entry || '').toUpperCase()));
  return files.some((file) => {
    const category = String(file?.file_category || '').toUpperCase();
    const uploadStatus = String(file?.upload_status || '').toUpperCase();
    const isDeleted = Number(file?.is_deleted || 0) === 1;
    return !isDeleted && uploadStatus === 'COMPLETED' && allowed.has(category);
  });
};

const isPostProductionEligible = (booking) => Boolean(
  matchShootStatusFilter(booking, 'postproduction') ||
  matchShootStatusFilter(booking, 'revision') ||
  matchShootStatusFilter(booking, 'completed') ||
  matchShootStatusFilter(booking, 'assetsdelivered')
);

const parseActivityData = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const hasPreProductionUploadEvidence = (lead) => {
  const booking = lead?.booking;

  // Primary signal: file-manager project has at least one completed file.
  const projectFiles = Array.isArray(booking?.cms_project?.files) ? booking.cms_project.files : [];
  const hasCompletedProjectFile = projectFiles.some((file) =>
    Number(file?.is_deleted || 0) !== 1 &&
    String(file?.upload_status || '').toUpperCase() === 'COMPLETED'
  );
  if (hasCompletedProjectFile) return true;

  // Fallback signal: external file manager activity already logged pre-production upload.
  const activities = Array.isArray(lead?.activities) ? lead.activities : [];
  return activities.some((activity) => {
    if (String(activity?.activity_type || '').toLowerCase() !== 'status_changed') return false;
    const payload = parseActivityData(activity?.activity_data);
    const emailEvent = String(payload?.email_event || '').toLowerCase();
    const folderPath = String(payload?.folder_path || '').toLowerCase();
    const filePath = String(payload?.filepath || '').toLowerCase();

    return (
      emailEvent === 'pre_production_brief_uploaded' ||
      folderPath.includes('pre-production') ||
      filePath.includes('pre-production')
    );
  });
};

const fetchExternalWorkspaceFiles = async (bookingId, phase) => {
  const query = new URLSearchParams();
  if (phase) query.set('phase', phase);

  const url = `${EXTERNAL_FILE_MANAGER_API_BASE_URL}/workspace/${encodeURIComponent(String(bookingId))}/files${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': EXTERNAL_FILE_MANAGER_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`External file manager returned ${response.status} for booking ${bookingId}`);
  }

  return response.json();
};

const hasExternalWorkspaceFiles = async (bookingId, phase) => {
  if (!bookingId) return false;
  try {
    const payload = await fetchExternalWorkspaceFiles(bookingId, phase);
    const files = Array.isArray(payload?.data?.files) ? payload.data.files : [];
    const expectedSegment = phase === 'post' ? 'post-production' : phase === 'pre' ? 'pre-production' : '';

    // Guard against external API returning mixed-phase files:
    // count only files that clearly belong to the requested phase path.
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
    console.error('[getLeads] external workspace file check failed:', {
      bookingId,
      phase,
      message: error?.message || error
    });
    return false;
  }
};

async function getCustomQuoteFinancialDetails({ quoteId = null, bookingId = null }) {
  if (!quoteId) return null;

  const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
    bookingId,
    salesQuoteId: quoteId
  });
  const paymentSummary = paymentState.paymentSummary;

  let settledByFollowupTransaction = false;
  if (bookingId) {
    const bookingRecord = await db.stream_project_booking.findByPk(bookingId, {
      attributes: ['payment_id']
    });
    const basePaymentId = Number(bookingRecord?.payment_id || 0);
    if (basePaymentId > 0) {
      const followupPayment = await db.payment_transactions.findOne({
        where: {
          payment_id: { [Op.gt]: basePaymentId },
          status: 'succeeded',
          payment_source: { [Op.in]: ['additional_invoice', 'quote_invoice'] }
        },
        order: [['payment_id', 'DESC']]
      });
      settledByFollowupTransaction = Boolean(followupPayment);
    }
  }

  const [latestInvoiceHistory, recentQuoteUpdates] = await Promise.all([
    db.invoice_send_history?.findOne({
      where: {
        quote_id: quoteId,
        ...(bookingId ? { booking_id: bookingId } : {})
      },
      order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']]
    }) || null,
    db.sales_quote_activities?.findAll({
      where: {
        sales_quote_id: quoteId,
        activity_type: 'updated'
      },
      order: [['created_at', 'DESC'], ['activity_id', 'DESC']],
      limit: 10
    }) || []
  ]);

  const refreshActivity = (recentQuoteUpdates || [])
    .map((activity) => ({
      activity,
      metadata: parseQuoteActivityMetadata(activity?.metadata_json)
    }))
    .find(({ metadata }) => {
      if (!metadata?.invoice_refresh_required) return false;
      if (bookingId && metadata.booking_id && Number(metadata.booking_id) !== Number(bookingId)) return false;
      const approvalStatus = String(metadata.approval_status || '').toLowerCase();
      if (approvalStatus && approvalStatus !== 'approved') return false;
      return parseFloat(metadata.extra_amount || 0) > 0 || parseFloat(metadata.reduced_amount || 0) > 0;
    });

  const refreshInvoiceHistory = refreshActivity?.activity
    ? await db.invoice_send_history?.findOne({
        where: {
          quote_id: quoteId,
          ...(bookingId ? { booking_id: bookingId } : {}),
          sent_at: { [Op.gte]: refreshActivity.activity.created_at }
        },
        order: [['sent_at', 'DESC'], ['invoice_send_history_id', 'DESC']]
      })
    : null;

  const additionalAmount = parseFloat(refreshActivity?.metadata?.extra_amount || 0);
  const reducedAmount = parseFloat(refreshActivity?.metadata?.reduced_amount || 0);
  const previouslyPaidAmount = parseFloat(refreshActivity?.metadata?.previous_total || 0);
  const revisedTotal = parseFloat(refreshActivity?.metadata?.new_total || 0);
  const normalizedRefreshPaymentStatus = String(refreshInvoiceHistory?.payment_status || '').toLowerCase();
  const isRefreshInvoiceSettled =
    settledByFollowupTransaction ||
    ['paid', 'succeeded', 'completed', 'success'].includes(normalizedRefreshPaymentStatus);
  const additionalPaymentStatus = settledByFollowupTransaction
    ? 'paid'
    : (refreshInvoiceHistory?.payment_status || (additionalAmount > 0 ? 'pending' : null));
  const reducedPaymentStatus = refreshInvoiceHistory?.payment_status || (reducedAmount > 0 ? 'refund_pending' : null);

  const creditSummary = await accountCreditService.getQuoteCreditSummary({
    salesQuoteId: quoteId,
    bookingId
  });

  const summaryChangeType = String(paymentState.lastQuoteChangeType || '').toLowerCase();
  const summaryChangeAmount = parseFloat(paymentState.lastQuoteChangeAmount || 0);
  const summaryDueAmount = paymentState.dueAmount;
  const summaryPaymentStatus = String(paymentState.paymentStatus || '').toLowerCase();
  const summaryApprovalStatus = String(paymentSummary?.last_quote_change_status || '').toLowerCase();
  const canExposeSummaryChange = !summaryApprovalStatus || summaryApprovalStatus === 'approved';
  const summaryAdditionalPayment = paymentSummary &&
    canExposeSummaryChange &&
    summaryChangeType === 'increase' &&
    (summaryChangeAmount > 0 || summaryDueAmount > 0)
      ? {
          additional_amount: summaryDueAmount,
          original_increase_amount: summaryChangeAmount || summaryDueAmount,
          previously_paid_amount: paymentState.paidAmount,
          revised_total: paymentState.quoteTotal,
          outstanding_amount: summaryDueAmount,
          payment_status: summaryPaymentStatus || null,
          approval_status: summaryApprovalStatus || null,
          last_sent_at: refreshInvoiceHistory?.sent_at || null,
          invoice_number: refreshInvoiceHistory?.invoice_number || null,
          invoice_url: refreshInvoiceHistory?.invoice_url || null
        }
      : null;

  const activityAdditionalPayment = refreshActivity ? {
    additional_amount: additionalAmount,
    previously_paid_amount: previouslyPaidAmount,
    revised_total: revisedTotal,
    outstanding_amount: (additionalPaymentStatus === 'paid' || isRefreshInvoiceSettled) ? 0 : additionalAmount,
    payment_status: additionalPaymentStatus,
    approval_status: refreshActivity.metadata?.approval_status || null,
    last_sent_at: refreshInvoiceHistory?.sent_at || null,
    invoice_number: refreshInvoiceHistory?.invoice_number || null,
    invoice_url: refreshInvoiceHistory?.invoice_url || null
  } : null;
  const additionalPayment = paymentSummary
    ? summaryAdditionalPayment
    : activityAdditionalPayment;
  const currentInvoiceHistory = additionalPayment
    ? refreshInvoiceHistory
    : latestInvoiceHistory;

  const reducedPayment = refreshActivity && reducedAmount > 0 ? {
    reduced_amount: reducedAmount,
    previously_paid_amount: previouslyPaidAmount,
    revised_total: revisedTotal,
    refund_pending_amount: reducedAmount,
    payment_status: reducedPaymentStatus,
    last_sent_at: refreshInvoiceHistory?.sent_at || null,
    invoice_number: refreshInvoiceHistory?.invoice_number || null,
    invoice_url: refreshInvoiceHistory?.invoice_url || null
  } : null;

  return {
    latest_invoice: currentInvoiceHistory ? {
      invoice_send_history_id: currentInvoiceHistory.invoice_send_history_id,
      invoice_number: currentInvoiceHistory.invoice_number || null,
      invoice_url: currentInvoiceHistory.invoice_url || null,
      invoice_pdf: currentInvoiceHistory.invoice_pdf || null,
      payment_status: currentInvoiceHistory.payment_status || null,
      sent_at: currentInvoiceHistory.sent_at || null
    } : null,
    additional_payment: additionalPayment,
    partial_payment: additionalPayment,
    reduced_payment: reducedPayment,
    credit_summary: creditSummary,
    payment_summary: paymentSummary
  };
}

function hasOutstandingAdditionalPayment(customQuoteFinancials = null) {
  const additionalPayment = customQuoteFinancials?.additional_payment || customQuoteFinancials?.partial_payment;
  if (!additionalPayment) return false;

  const outstandingAmount = parseFloat(additionalPayment.outstanding_amount || 0);
  const paymentStatus = String(additionalPayment.payment_status || '').toLowerCase();

  return outstandingAmount > 0 && paymentStatus !== 'paid';
}

function resolveLeadPaymentStatus({ booking = null, activePaymentLink = null, customQuoteFinancials = null }) {
  const summaryStatus = String(customQuoteFinancials?.payment_summary?.payment_status || '').toLowerCase();
  const summaryApprovalStatus = String(customQuoteFinancials?.payment_summary?.last_quote_change_status || '').toLowerCase();
  if (summaryStatus && (!summaryApprovalStatus || summaryApprovalStatus === 'approved')) {
    return summaryStatus;
  }

  if (hasOutstandingAdditionalPayment(customQuoteFinancials)) {
    return 'partial_paid';
  }

  let paymentStatus = booking?.payment_id ? 'paid' : 'unpaid';
  if (paymentStatus === 'unpaid' && activePaymentLink) {
    paymentStatus = activePaymentLink.is_expired ? 'link_expired' : 'link_sent';
  }

  return paymentStatus;
}

function resolveLeadQuoteAmounts({ linkedSalesQuote = null, booking = null, customQuoteFinancials = null }) {
  const additionalPayment = customQuoteFinancials?.additional_payment || customQuoteFinancials?.partial_payment || null;
  if (additionalPayment) {
    return {
      collected_amount: parseFloat(additionalPayment.previously_paid_amount || 0),
      outstanding_amount: parseFloat(additionalPayment.outstanding_amount || 0)
    };
  }

  if (!linkedSalesQuote) {
    return {
      collected_amount: null,
      outstanding_amount: null
    };
  }

  const quoteTotal = parseFloat(linkedSalesQuote.total || 0);
  if (booking?.payment_id) {
    return {
      collected_amount: quoteTotal,
      outstanding_amount: 0
    };
  }

  return {
    collected_amount: 0,
    outstanding_amount: quoteTotal
  };
}

/**
 * Internal helper to reuse calculateFromCreators safely.
 * DO NOT pass real res here.
 */
async function calculateFromCreatorsInternally(pricingPayload) {
  let pricingResult;

  const fakeRes = {
    status: () => fakeRes,
    json: (payload) => {
      pricingResult = payload;
      return payload;
    }
  };

  const fakeReq = {
    body: {
      ...pricingPayload,
      is_return: true
    }
  };

  const breakdown = await pricingController.calculateFromCreators(fakeReq, fakeRes);
  const pricingData = breakdown ?? pricingResult?.data;

  if (!pricingData || !pricingData.quote) {
    throw new Error('Pricing calculation failed');
  }

  return pricingData;
}

async function notifyAssignedCreators(
  creatorIds = [],
  booking = null,
  fallbackClientName = '',
  fallbackShootAmount = null
) {
  try {
    const uniqueIds = [...new Set((creatorIds || []).map(Number).filter(Boolean))];
    if (!uniqueIds.length) return;

    const creators = await crew_members.findAll({
      where: { crew_member_id: uniqueIds, is_active: 1 },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
    });

    const dashboardLink =
      process.env.CP_DASHBOARD_LINK ||
      process.env.FRONTEND_URL ||
      'https://beige.app/';

    await Promise.allSettled(
      creators
        .filter(c => c.email)
        .map(c =>
          sendCPNewBookingRequestEmail({
            to_email: c.email,
            user_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'there',
            ...getCPNewBookingEmailFields(booking, fallbackClientName, fallbackShootAmount),
            dashboardLink
          })
        )
    );
  } catch (e) {
    console.error('notifyAssignedCreators failed:', e?.message || e);
  }
}

function getCPNewBookingEmailFields(booking = {}, fallbackClientName = '', fallbackShootAmount = null) {
  return {
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
  };
}

function getEmailShootAmountFromFinalizeResult(finalizeResult = {}) {
  return (
    finalizeResult?.quote?.quote?.total ??
    finalizeResult?.quote?.quote?.priceAfterDiscount ??
    finalizeResult?.quote?.quote?.subtotal ??
    finalizeResult?.quote?.total ??
    finalizeResult?.quote?.price_after_discount ??
    finalizeResult?.quote?.subtotal ??
    null
  );
}

async function resolveAssignableSalesRep(salesRepId) {
  const salesRep = await users.findOne({
    where: {
      id: salesRepId,
      is_active: 1,
      assign_lead: 1
    },
    include: [
      {
        model: user_type,
        as: 'userType',
        attributes: ['user_role'],
        required: false
      }
    ],
    attributes: ['id', 'name', 'email']
  });

  if (!salesRep) {
    throw new Error('Sales rep not found or inactive');
  }

  const userRole = String(salesRep.userType?.user_role || '').toLowerCase();
  if (userRole !== 'admin') {
    throw new Error('Selected user is not a valid assignable admin');
  }

  return salesRep;
}

async function resolveEmailClientNameForBooking(booking = null, fallbackClientName = null, options = {}) {
  if (fallbackClientName) {
    return fallbackClientName;
  }

  if (!booking) {
    return null;
  }

  const transaction = options.transaction;

  if (booking.client_name) {
    return booking.client_name;
  }

  if (booking.user?.name) {
    return booking.user.name;
  }

  if (booking.user_id) {
    const bookingUser = await users.findOne({
      where: { id: booking.user_id },
      attributes: ['name'],
      transaction
    });

    if (bookingUser?.name) {
      return bookingUser.name;
    }
  }

  const linkedLead = await sales_leads.findOne({
    where: { booking_id: booking.stream_project_booking_id },
    attributes: ['client_name'],
    transaction
  });

  if (linkedLead?.client_name) {
    return linkedLead.client_name;
  }

  const linkedClientLead = await client_leads.findOne({
    where: { booking_id: booking.stream_project_booking_id },
    attributes: ['client_name'],
    transaction
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
}

async function confirmCreativePartnerForLead({
  leadId,
  crewMemberId,
  performedByUserId = null,
  isClientLead = false
}) {
  const LeadModel = isClientLead ? client_leads : sales_leads;
  const LeadActivityModel = isClientLead ? client_lead_activities : sales_lead_activities;

  const lead = await LeadModel.findOne({
    where: { lead_id: leadId },
    attributes: ['lead_id', 'booking_id']
  });

  if (!lead) {
    return {
      status: 404,
      body: { success: false, message: isClientLead ? 'Client lead not found' : 'Lead not found' }
    };
  }

  if (!lead.booking_id) {
    return {
      status: 400,
      body: { success: false, message: 'No booking is linked to this lead' }
    };
  }

  const assignment = await assigned_crew.findOne({
    where: {
      project_id: lead.booking_id,
      crew_member_id: crewMemberId,
      is_active: 1
    },
    include: [
      {
        model: crew_members,
        as: 'crew_member',
        attributes: ['crew_member_id', 'first_name', 'last_name']
      }
    ]
  });

  if (!assignment) {
    return {
      status: 404,
      body: { success: false, message: 'Creative Partner assignment not found for this booking' }
    };
  }

  if (Number(assignment.crew_accept) !== 1) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Creative Partner must accept the booking before it can be confirmed'
      }
    };
  }

  const currentStatus = String(assignment.status || '').toLowerCase();
  if (currentStatus === 'confirmed') {
    return {
      status: 200,
      body: {
        success: true,
        message: 'Creative Partner is already confirmed for this booking'
      }
    };
  }

  await assignment.update({
    status: 'confirmed',
    updated_at: new Date()
  });

  const cpName =
    [assignment?.crew_member?.first_name, assignment?.crew_member?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || `Crew ID ${crewMemberId}`;

  await LeadActivityModel.create({
    lead_id: lead.lead_id,
    activity_type: 'booking_updated',
    activity_data: {
      source: 'sales_portal_cp_confirmed',
      booking_id: lead.booking_id,
      crew_member_id: crewMemberId,
      cp_name: cpName
    },
    performed_by_user_id: performedByUserId
  });

  const emailResult = await emailService.sendCPConfirmedEmailByRequest({
    project_id: lead.booking_id,
    crew_member_id: crewMemberId
  });

  if (!emailResult?.success) {
    console.error('CP confirmed email send failed:', emailResult?.error || 'Unknown error');
    return {
      status: 500,
      body: {
        success: false,
        message: emailResult?.error || 'Failed to send CP confirmed email'
      }
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Creative Partner confirmed and client email sent successfully',
      data: {
        lead_id: lead.lead_id,
        booking_id: lead.booking_id,
        crew_member_id: crewMemberId,
        status: 'confirmed'
      }
    }
  };
}

async function softDeleteLeadById({
  leadId,
  performedByUserId = null,
  isClientLead = false
}) {
  const LeadModel = isClientLead ? client_leads : sales_leads;
  const LeadActivityModel = isClientLead ? client_lead_activities : sales_lead_activities;

  const lead = await LeadModel.findOne({
    where: { lead_id: leadId },
    attributes: ['lead_id', 'booking_id', 'client_name', 'guest_email', 'user_id', 'lead_status', 'is_active']
  });

  if (!lead || Number(lead.is_active) === 0) {
    return {
      status: constants.NOT_FOUND.code,
      body: {
        success: false,
        message: isClientLead ? 'Client lead not found' : 'Lead not found'
      }
    };
  }

  await lead.update({
    is_active: 0,
    last_activity_at: new Date()
  });

  await LeadActivityModel.create({
    lead_id: lead.lead_id,
    activity_type: 'status_changed',
    activity_data: {
      old_status: lead.lead_status,
      new_status: lead.lead_status,
      action: 'soft_deleted',
      source: 'admin_soft_delete',
      booking_id: lead.booking_id || null
    },
    performed_by_user_id: performedByUserId
  });

  return {
    status: constants.OK.code,
    body: {
      success: true,
      message: isClientLead ? 'Client lead deleted successfully' : 'Lead deleted successfully',
      data: {
        lead_id: lead.lead_id,
        booking_id: lead.booking_id,
        is_active: 0
      }
    }
  };
}

function safeJsonStringify(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val); } catch { return String(val); }
}

function parseStartDateTime({ start_date_time, start_date, start_time }) {
  return resolveEventDateAndStartTime({ start_date_time, start_date, start_time });
}

function normalizeIsDraft(is_draft) {
  // allow boolean or 0/1
  if (typeof is_draft === 'boolean') return is_draft ? 1 : 0;
  if (typeof is_draft === 'number') return is_draft ? 1 : 0;
  if (typeof is_draft === 'string') return is_draft === 'true' || is_draft === '1' ? 1 : 0;
  return null;
}

async function resolveUserId(userId, guestEmail) {
  if (userId) return parseInt(userId);
  if (!guestEmail) return null;

  const normalizedEmail = String(guestEmail).trim().toLowerCase();
  if (!normalizedEmail) return null;

  const existingUser = await users.findOne({
    where: { email: normalizedEmail },
    attributes: ['id']
  });

  return existingUser ? existingUser.id : null;
}

async function resolveAssignedSalesRepId({
  requestedSalesRepId,
  req,
  currentAssignedSalesRepId = null,
  tx
}) {
  const actorRole = String(req.userRole || '').toLowerCase();

  if (actorRole === 'sales_rep' || actorRole === 'sales_admin' || actorRole === 'admin') {
    return req.userId || currentAssignedSalesRepId || null;
  }

  const normalizedRequestedSalesRepId =
    requestedSalesRepId !== undefined && requestedSalesRepId !== null && requestedSalesRepId !== ''
      ? parseInt(requestedSalesRepId, 10)
      : null;

  if (normalizedRequestedSalesRepId == null) {
    return currentAssignedSalesRepId || null;
  }

  if (Number.isNaN(normalizedRequestedSalesRepId)) {
    throw new Error('Invalid sales_rep_id');
  }

  const requestedSalesRep = await users.findByPk(normalizedRequestedSalesRepId, {
    include: [
      {
        model: db.user_type,
        as: 'userType',
        attributes: ['user_role']
      }
    ],
    transaction: tx
  });

  const requestedUserRole = String(requestedSalesRep?.userType?.user_role || '').toLowerCase();
  if (!requestedSalesRep || requestedUserRole !== 'admin' || Number(requestedSalesRep.assign_lead) !== 1) {
    throw new Error('Selected sales_rep_id is not a valid assignable admin');
  }

  return normalizedRequestedSalesRepId;
}

/**
 * Create quote row + quote_line_items.
 */
async function persistQuoteFromBreakdown({ bookingId, guest_email, shootHours, breakdown, tx }) {
  const quote = await quotes.create(
    {
      booking_id: bookingId,
      guest_email,
      pricing_mode: breakdown?.pricingMode ?? null,
      shoot_hours: shootHours,
      subtotal: breakdown?.subtotal ?? null,
      discount_percent: breakdown?.discountPercent ?? null,
      discount_amount: breakdown?.discountAmount ?? null,
      price_after_discount: breakdown?.priceAfterDiscount ?? null,
      margin_percent: breakdown?.marginPercent ?? null,
      margin_amount: breakdown?.marginAmount ?? null,
      total: breakdown?.total ?? null,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    { transaction: tx }
  );

  const items = Array.isArray(breakdown?.lineItems) ? breakdown.lineItems : [];
  if (items.length) {
    const rows = items.map((li) => ({
      quote_id: quote.quote_id || quote.id,
      item_id: li.item_id ?? null,
      item_name: li.name ?? null,
      quantity: li.quantity ?? 1,
      unit_price: li.unit_price ?? null,
      line_total: li.total_price ?? null
    }));
    await quote_line_items.bulkCreate(rows, { transaction: tx });
  }

  return quote;
}

const calculateLeadPricing = async (booking) => {
    if (!booking) return null;

    try {
        const q = booking.primary_quote; 
        
        if (q) {
            return {
                source: 'database',
                quote_id: q.quote_id,
                total: parseFloat(q.price_after_discount || q.total || 0),
                subtotal: parseFloat(q.subtotal || 0),
                discount_amount: parseFloat(q.discount_amount || 0),
                shoot_hours: q.shoot_hours,
                line_items: (q.line_items || []).map(item => ({
                    item_id: item.item_id,
                    name: item.item_name,
                    quantity: item.quantity,
                    unit_price: parseFloat(item.unit_price),
                    total: parseFloat(item.line_total)
                }))
            };
        }

        const ROLE_TO_ITEM_MAP = {
            videographer: 11,
            photographer: 10,
            cinematographer: 12,
        };

        let crewRoles = {};
        try {
            crewRoles = typeof booking.crew_roles === 'string' 
                ? JSON.parse(booking.crew_roles || '{}') 
                : (booking.crew_roles || {});
        } catch (e) { crewRoles = {}; }

        const isRolesEmpty = !crewRoles || 
                           (Array.isArray(crewRoles) && crewRoles.length === 0) || 
                           (typeof crewRoles === 'object' && Object.keys(crewRoles).length === 0);

        if (isRolesEmpty && booking.event_type) {
            const types = booking.event_type.toLowerCase();
            crewRoles = {};
            if (types.includes('videographer')) crewRoles.videographer = 1;
            if (types.includes('photographer')) crewRoles.photographer = 1;
            if (types.includes('cinematographer')) crewRoles.cinematographer = 1;
        }

        const items = Object.entries(crewRoles).map(([role, count]) => ({
            item_id: ROLE_TO_ITEM_MAP[role.toLowerCase()],
            quantity: count
        })).filter(item => item.item_id);

        let hours = Number(booking.duration_hours);
        if (!hours || hours <= 0) {
            if (booking.start_time && booking.end_time) {
                const [sH, sM] = booking.start_time.split(':').map(Number);
                const [eH, eM] = booking.end_time.split(':').map(Number);
                const start = new Date(2000, 0, 1, sH, sM);
                const end = new Date(2000, 0, 1, eH, eM);
                let diff = (end - start) / (1000 * 60 * 60);
                if (diff < 0) diff += 24;
                hours = diff; 
            } else {
                hours = 8; 
            }
        }

        const parseEdits = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try { return JSON.parse(val); } catch { return []; }
        };

        const calculatedQuote = await pricingService.calculateQuote({
            items: items,
            shootHours: hours, 
            eventType: booking.shoot_type || booking.event_type || 'general',
            shootStartDate: booking.event_date,
            videoEditTypes: parseEdits(booking.video_edit_types),
            photoEditTypes: parseEdits(booking.photo_edit_types),
            skipDiscount: true, 
            skipMargin: true
        });

        return {
            source: 'calculated',
            total: calculatedQuote?.total || 0,
            subtotal: calculatedQuote?.subtotal || 0,
            line_items: calculatedQuote?.lineItems || [] 
        };

    } catch (error) {
        console.error('Lead Pricing calculation failed:', error);
        return null;
    }
};

function canEditBooking(lead, booking) {
  if (!booking) return false;

  if (booking.payment_id) return false;
  if (lead.lead_status === 'booked') return false;
  if (lead.lead_status === 'abandoned') return false;

  return true;
}

/**
 * Track early booking interest - Create draft booking and lead when user shows interest
 * POST /api/sales/leads/track-early-interest
 */
// exports.trackEarlyBookingInterest = async (req, res) => {
//   try {
//     const {
//       guest_email,
//       user_id,
//       content_type,
//       shoot_type,
//       client_name
//     } = req.body;

//     // 1. Validate required fields
//     if (!guest_email) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Email is required'
//       });
//     }

//     // Basic email validation
//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(guest_email)) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Invalid email format'
//       });
//     }

//     // 2. Create minimal draft booking
//     const bookingData = {
//       user_id: user_id ? parseInt(user_id) : null,
//       guest_email: guest_email,
//       project_name: `Draft - ${shoot_type || content_type || 'Booking'}`,
//       event_type: shoot_type || content_type || 'general',
//       streaming_platforms: JSON.stringify([]),
//       crew_roles: JSON.stringify([]),
//       is_draft: 1,
//       is_completed: 0,
//       is_cancelled: 0,
//       is_active: 1
//     };

//     const booking = await stream_project_booking.create(bookingData);

//     // 3. Check if lead already exists
//     const existingLead = await sales_leads.findOne({
//       where: { 
//         guest_email,
//         lead_status: 'in_progress_self_serve'
//       },
//       order: [['created_at', 'DESC']]
//     });

//     if (existingLead) {
//       // Update existing lead
//       await existingLead.update({
//         booking_id: booking.stream_project_booking_id,
//         last_activity_at: new Date()
//       });

//       // SYNC ALL DATA TO SHEET FOR EXISTING LEAD
//       appendToSheet('leads_data', [
//         existingLead.lead_id,                 // A: Lead ID
//         booking.stream_project_booking_id,    // B: Booking ID
//         user_id || 'Guest',                     // C: User ID
//         client_name || 'N/A',                 // D: Client Name
//         guest_email,                          // E: Email
//         booking.project_name,                 // F: Project Name
//         content_type || 'N/A',                // G: Content Type
//         shoot_type || 'N/A',                  // H: Shoot Type
//         existingLead.lead_type,               // I: Lead Type
//         'Interaction Updated',                // J: Status
//         new Date().toLocaleString()           // M: Timestamp
//       ]).catch(err => console.error('Sheet Sync Error:', err.message));

//       return res.json({
//         success: true,
//         message: 'Lead tracking updated',
//         data: {
//           lead_id: existingLead.lead_id,
//           booking_id: booking.stream_project_booking_id,
//           is_new: false
//         }
//       });
//     }

//     // 4. Create new lead
//     const lead = await sales_leads.create({
//       booking_id: booking.stream_project_booking_id,
//       user_id: user_id || null,
//       guest_email: guest_email,
//       client_name: client_name || null,
//       lead_type: 'self_serve',
//       lead_status: 'in_progress_self_serve'
//     });

//     // 5. Log activity
//     await sales_lead_activities.create({
//       lead_id: lead.lead_id,
//       activity_type: 'created',
//       activity_data: {
//         source: 'early_interest',
//         user_id,
//         guest_email,
//         content_type,
//         shoot_type
//       }
//     });

//     // 6. Auto-assign lead
//     const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);

//     // 7. --- SYNC ALL DATA TO SHEET FOR NEW LEAD ---
//     appendToSheet('leads_data', [
//       lead.lead_id,                         // A: Lead ID
//       booking.stream_project_booking_id,    // B: Booking ID
//       user_id || 'Guest',                   // C: User ID
//       client_name || 'N/A',                 // D: Client Name
//       guest_email,                          // E: Email
//       booking.project_name,                 // F: Project Name
//       content_type || 'N/A',                // G: Content Type
//       shoot_type || 'N/A',                  // H: Shoot Type
//       lead.lead_type,                       // I: Lead Type
//       lead.lead_status,                     // J: Status
//       assignedRep ? JSON.stringify(assignedRep) : 'Pending', // K: Assigned Rep
//       booking.is_draft === 1 ? 'Yes' : 'No',// L: Is Draft
//       new Date().toLocaleString()           // M: Timestamp
//     ]).catch(err => console.error('Sheet Sync Error:', err.message));

//     res.status(constants.CREATED.code).json({
//       success: true,
//       message: 'Lead tracking started',
//       data: {
//         lead_id: lead.lead_id,
//         booking_id: booking.stream_project_booking_id,
//         is_new: true,
//         assigned_to: assignedRep
//       }
//     });

//   } catch (error) {
//     console.error('Error tracking early booking interest:', error);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to track booking interest',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// exports.trackEarlyBookingInterest = async (req, res) => {
//   try {
//     const { guest_email, user_id, content_type, shoot_type, client_name } = req.body;

//     // 1. Validate required fields
//     if (!guest_email) {
//       return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Email is required' });
//     }

//     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//     if (!emailRegex.test(guest_email)) {
//       return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Invalid email format' });
//     }

//     // 2. Create minimal draft booking
//     const bookingData = {
//       user_id: user_id ? parseInt(user_id) : null,
//       guest_email: guest_email,
//       project_name: `Draft - ${shoot_type || content_type || 'Booking'}`,
//       event_type: shoot_type || content_type || 'general',
//       streaming_platforms: JSON.stringify([]),
//       crew_roles: JSON.stringify([]),
//       is_draft: 1,
//       is_completed: 0,
//       is_cancelled: 0,
//       is_active: 1
//     };

//     const booking = await stream_project_booking.create(bookingData);

//     // 3. Check if lead already exists
//     const existingLead = await sales_leads.findOne({
//       where: { guest_email, lead_status: 'in_progress_self_serve' },
//       order: [['created_at', 'DESC']]
//     });

//     if (existingLead) {
//       await existingLead.update({
//         booking_id: booking.stream_project_booking_id,
//         last_activity_at: new Date()
//       });

//       updateSheetRow('leads_data', existingLead.lead_id, [
//         existingLead.lead_id,                 // A: Lead ID (Key)
//         booking.stream_project_booking_id,    // B: Booking ID
//         user_id || 'Guest',                   // C: User ID
//         client_name || 'N/A',                 // D: Client Name
//         guest_email,                          // E: Email
//         booking.project_name,                 // F: Project Name
//         content_type || 'N/A',                // G: Content Type
//         shoot_type || 'N/A',                  // H: Shoot Type
//         existingLead.lead_type,               // I: Lead Type
//         'Interaction Updated',                // J: Status
//         '',                                   // K: (Keep Rep Same)
//         'Yes',                                // L: Is Draft
//         new Date().toLocaleString()           // M: Timestamp (Updates in same row)
//       ]).catch(err => console.error('Sheet Update Error:', err.message));

//       return res.json({
//         success: true,
//         message: 'Lead tracking updated',
//         data: { lead_id: existingLead.lead_id, booking_id: booking.stream_project_booking_id, is_new: false }
//       });
//     }

//     // 4. Create new lead
//     const lead = await sales_leads.create({
//       booking_id: booking.stream_project_booking_id,
//       user_id: user_id || null,
//       guest_email: guest_email,
//       client_name: client_name || null,
//       lead_type: 'self_serve',
//       lead_status: 'in_progress_self_serve'
//     });

//     // 5. Log activity
//     await sales_lead_activities.create({
//       lead_id: lead.lead_id,
//       activity_type: 'created',
//       activity_data: { source: 'early_interest', user_id, guest_email, content_type, shoot_type }
//     });

//     // 6. Auto-assign lead
//     const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);

//     // 7. --- FIX: ONLY STORE NAME AND APPEND NEW ROW ---
//     appendToSheet('leads_data', [
//       lead.lead_id,                         // A: Lead ID
//       booking.stream_project_booking_id,    // B: Booking ID
//       user_id || 'Guest',                   // C: User ID
//       client_name || 'N/A',                 // D: Client Name
//       guest_email,                          // E: Email
//       booking.project_name,                 // F: Project Name
//       content_type || 'N/A',                // G: Content Type
//       shoot_type || 'N/A',                  // H: Shoot Type
//       lead.lead_type,                       // I: Lead Type
//       lead.lead_status,                     // J: Status
//       assignedRep ? assignedRep.name : 'Pending', // <--- FIX: Access .name only
//       booking.is_draft === 1 ? 'Yes' : 'No',// L: Is Draft
//       new Date().toLocaleString()           // M: Timestamp
//     ]).catch(err => console.error('Sheet Sync Error:', err.message));

//     res.status(constants.CREATED.code).json({
//       success: true,
//       message: 'Lead tracking started',
//       data: { lead_id: lead.lead_id, booking_id: booking.stream_project_booking_id, is_new: true, assigned_to: assignedRep }
//     });

//   } catch (error) {
//     console.error('Error tracking early booking interest:', error);
//     res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to track booking interest'
//     });
//   }
// };

exports.trackEarlyBookingInterest = async (req, res) => {
    try {
        const { 
            booking_id, 
            guest_email, 
            email,
            user_id, 
            content_type, 
            shoot_type, 
            client_name,
            name,
            startDate, 
            endDate,
            start_date,
            shootDate,
            start_time,
            shootTime,
            end_time,
            estimated_delivery_date,
            time_zone,
            booking_type,
            booking_days,
            location,
            specialInstructions,
            message,
            reference_links,
            video_edit_types, 
            photo_edit_types, 
            edits_needed 
        } = req.body;

        const serviceType = normalizeBookAShootServiceType(
            req.body.serviceType || req.body.service_type || req.body.bookingFlow || req.body.booking_flow
        );

        if (!BOOK_A_SHOOT_SERVICE_TYPES.has(serviceType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid serviceType. Allowed values: photography, videography, studios, videography_studios'
            });
        }

        const studioDetails = req.body.studio_details || req.body.studioDetails || null;
        const videographyDetails = req.body.videography_details || req.body.videographyDetails || null;
        const pricingDetails = req.body.pricing || req.body.price_details || req.body.priceDetails || null;
        const selectedPackage = getBookAShootSelectedPackage(req.body);
        const flowValidationError = validateBookAShootFlowDetails({
            serviceType,
            studioDetails,
            videographyDetails
        });

        if (flowValidationError) {
            return res.status(400).json({ success: false, message: flowValidationError });
        }

        const resolvedGuestEmailInput = guest_email || email;
        const resolvedClientName = client_name || name;
        const resolvedStartDate = start_date || shootDate;
        const resolvedStartTime = start_time || shootTime;
        const resolvedInstructions = specialInstructions || message;

        if (!resolvedGuestEmailInput) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const normalizedGuestEmail = String(resolvedGuestEmailInput).trim().toLowerCase();
        const resolvedUserId = await resolveUserId(user_id, normalizedGuestEmail);
        const normalizedEstimatedDeliveryDate = normalizeDateOnlyInput(estimated_delivery_date);

        if (estimated_delivery_date && !normalizedEstimatedDeliveryDate) {
            return res.status(400).json({ success: false, message: 'estimated_delivery_date must be a valid date' });
        }

        const toTimeParts = (timeStr) => {
            if (!timeStr) return null;
            const parts = String(timeStr).split(':').map(Number);
            if (!parts.length || parts.some((p) => Number.isNaN(p))) return null;
            const [h, m, s = 0] = parts;
            return { h, m, s };
        };

        const calculateDurationHours = (startTime, endTime) => {
            const startParts = toTimeParts(startTime);
            const endParts = toTimeParts(endTime);
            if (!startParts || !endParts) return null;
            const startMinutes = startParts.h * 60 + startParts.m + startParts.s / 60;
            const endMinutes = endParts.h * 60 + endParts.m + endParts.s / 60;
            const diffMinutes = endMinutes - startMinutes;
            if (diffMinutes <= 0) return null;
            return Math.round((diffMinutes / 60) * 100) / 100;
        };

        let normalizedBookingDays = Array.isArray(booking_days) ? booking_days : [];
        normalizedBookingDays = normalizedBookingDays
            .filter((d) => d && d.date)
            .map((d) => ({
                date: d.date,
                start_time: normalizeTime(d.start_time || d.startTime) || null,
                end_time: normalizeTime(d.end_time || d.endTime) || null,
                duration_hours: d.duration_hours != null ? Number(d.duration_hours) : null,
                time_zone: d.time_zone || d.timeZone || time_zone || null
            }));

        const resolvedSingleDay = resolveEventDateAndStartTime({
            start_date: resolvedStartDate,
            start_time: resolvedStartTime,
            start_date_time: startDate
        });
        let event_date = resolvedSingleDay.event_date;
        let start_time_final = resolvedSingleDay.start_time;
        let end_time_final = normalizeTime(end_time || endDate);
        let totalDurationHours = null;

        if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {
            normalizedBookingDays.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            event_date = normalizedBookingDays[0].date;
            start_time_final = normalizeTime(normalizedBookingDays[0].start_time) || null;
            end_time_final = normalizeTime(normalizedBookingDays[0].end_time) || null;
            totalDurationHours = normalizedBookingDays.reduce((sum, d) => {
                const hours = d.duration_hours != null ? d.duration_hours : calculateDurationHours(d.start_time, d.end_time);
                return sum + (hours || 0);
            }, 0);
            if (totalDurationHours > 0) {
                totalDurationHours = Math.round(totalDurationHours * 100) / 100;
            } else {
                totalDurationHours = null;
            }
        }

        const { latitude, longitude } = extractCoordinatesFromPayload(req.body, location);

        const bookingData = {
            user_id: resolvedUserId,
            guest_email: normalizedGuestEmail,
            project_name: `${(shoot_type || serviceType)?.toUpperCase() || 'NEW'} Shoot - ${resolvedClientName || normalizedGuestEmail}`,
            event_type: content_type || serviceType,
            shoot_type: shoot_type || serviceType,
            content_type: content_type || serviceType,
            service_type: serviceType,
            booking_flow: serviceType,
            streaming_platforms: JSON.stringify([]),
            crew_roles: JSON.stringify([]),
            event_date: event_date,
            estimated_delivery_date: normalizedEstimatedDeliveryDate,
            start_time: start_time_final,
            end_time: end_time_final,
            time_zone: time_zone || null,
            duration_hours: totalDurationHours,
            event_location: location || null,
            event_latitude: latitude,
            event_longitude: longitude,
            description: resolvedInstructions || null,
            reference_links: JSON.stringify({
                original_reference_links: reference_links || null,
                book_a_shoot: buildBookAShootMetadata(req.body, serviceType)
            }),
            studio_details: studioDetails,
            videography_details: videographyDetails,
            pricing_details: pricingDetails,
            selected_package: selectedPackage,
            edits_needed: edits_needed ? 1 : 0,
            video_edit_types: video_edit_types || [], 
            photo_edit_types: photo_edit_types || [],
            is_draft: 1,
            is_completed: 0,
            is_cancelled: 0,
            is_active: 1
        };

        let booking;
        const tx = await db.sequelize.transaction();
        try {
            if (booking_id) {
                booking = await stream_project_booking.findByPk(booking_id);
                if (booking) {
                    await booking.update(bookingData, { transaction: tx });
                }
            } 
            
            if (!booking) {
                booking = await stream_project_booking.create(bookingData, { transaction: tx });
            }

            if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {
                await stream_project_booking_days.destroy({
                    where: { stream_project_booking_id: booking.stream_project_booking_id },
                    transaction: tx
                });
                const dayRows = normalizedBookingDays.map((d) => ({
                    stream_project_booking_id: booking.stream_project_booking_id,
                    event_date: d.date,
                    start_time: normalizeTime(d.start_time) || null,
                    end_time: normalizeTime(d.end_time) || null,
                    duration_hours: d.duration_hours != null ? d.duration_hours : calculateDurationHours(d.start_time, d.end_time),
                    time_zone: d.time_zone || null
                }));
                await stream_project_booking_days.bulkCreate(dayRows, { transaction: tx });
            }
            if (booking_type === 'single_day') {
                await stream_project_booking_days.destroy({
                    where: { stream_project_booking_id: booking.stream_project_booking_id },
                    transaction: tx
                });
            }

            await tx.commit();
        } catch (err) {
            await tx.rollback();
            throw err;
        }

        let lead = await sales_leads.findOne({
            where: { booking_id: booking.stream_project_booking_id }
        });

        let isNewLead = false;
        let assignedRep = null;

        if (!lead) {
            isNewLead = true;
            lead = await sales_leads.create({
                booking_id: booking.stream_project_booking_id,
                user_id: resolvedUserId,
                guest_email: normalizedGuestEmail,
                client_name: resolvedClientName || null,
                phone: req.body.phone || null,
                lead_source: req.body.source || null,
                service_type: serviceType,
                booking_flow: serviceType,
                studio_details: studioDetails,
                videography_details: videographyDetails,
                pricing_details: pricingDetails,
                selected_package: selectedPackage,
                lead_type: 'self_serve',
                lead_status: 'book_a_shoot_lead_created',
                created_from: 1 // 1 = web
            });
            
            await sales_lead_activities.create({
                lead_id: lead.lead_id,
                activity_type: 'created',
                activity_data: {
                    source: 'step_1_capture',
                    user_id: resolvedUserId,
                    guest_email: normalizedGuestEmail,
                    serviceType,
                    studio_details: studioDetails,
                    videography_details: videographyDetails,
                    pricing: req.body.pricing || null
                }
            });

            // Force assignment to default sales inbox owner for this branch flow.
            assignedRep = await users.findOne({
                where: {
                    email: 'sales@beigecorporation.io',
                    is_active: 1
                },
                attributes: ['id', 'name', 'email']
            });

            if (assignedRep?.id) {
                await lead.update({ assigned_sales_rep_id: assignedRep.id });
            } else {
                assignedRep = null;
            }

          // emailService.sendSalesLeadNotification({
          //   guestEmail: normalizedGuestEmail,
          //   shootType: shoot_type,
          //   contentType: content_type,
          //   eventDate: event_date,
          //   startTime: start_time,
          //   endTime: end_time,
          //   editsNeeded: edits_needed
          // }).catch(err => console.error('Sales Email Error:', err));
          // console.log(assignedRep);

          emailService.sendProductionLeadNotification({
            client_name: client_name,
            guestEmail: normalizedGuestEmail,
            shootType: shoot_type,
            contentType: content_type,
            eventDate: event_date,
            startTime: start_time,
            endTime: end_time,
            editsNeeded: edits_needed,
            sales_rep_email: assignedRep?.email || null
          }).catch(err => console.error('Production Email Error:', err));
        } else {
          await lead.update({
            last_activity_at: new Date(),
            client_name: resolvedClientName || lead.client_name,
            phone: req.body.phone || lead.phone,
            lead_source: req.body.source || lead.lead_source,
            service_type: serviceType,
            booking_flow: serviceType,
            studio_details: studioDetails,
            videography_details: videographyDetails,
            pricing_details: pricingDetails,
            selected_package: selectedPackage
          });
        }

        const sheetRowData = [
            lead.lead_id,                         // A: Lead ID
            booking.stream_project_booking_id,    // B: Booking ID
            resolvedUserId || 'Guest',            // C: User ID
            client_name || 'N/A',                 // D: Client Name
            normalizedGuestEmail,                 // E: Email
            booking.project_name,                 // F: Project Name
            content_type || 'N/A',                // G: Content Type
            shoot_type || 'N/A',                  // H: Shoot Type
            lead.lead_type,                       // I: Lead Type
            isNewLead ? lead.lead_status : 'Interaction Updated', // J: Status
            assignedRep ? assignedRep.name : 'Existing/Pending', // K: Rep Name
            'Yes',                                // L: Is Draft
            new Date().toLocaleString()           // M: Timestamp
        ];

        if (isNewLead) {
            appendToSheet('leads_data', sheetRowData)
                .catch(err => console.error('Sheet Append Error:', err.message));
        } else {
            updateSheetRow('leads_data', lead.lead_id, sheetRowData)
                .catch(err => console.error('Sheet Update Error:', err.message));
        }

        return res.status(isNewLead ? 201 : 200).json({
            success: true,
            message: isNewLead ? 'Lead tracking started' : 'Progress saved successfully',
            data: { 
                booking_id: booking.stream_project_booking_id, 
                lead_id: lead.lead_id,
                is_new: isNewLead,
                assigned_to: assignedRep ? assignedRep.name : null
            }
        });

    } catch (error) {
        console.error('Error in trackEarlyBookingInterest:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error',
            error: error.message 
        });
    }
};
/**
 * Track booking start - Create lead when client starts booking flow
 * POST /api/sales/leads/track-start
 */
exports.trackBookingStart = async (req, res) => {
  try {
    const {
      booking_id,
      user_id,
      guest_email,
      client_name
    } = req.body;

    // Validate required fields
    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Check if lead already exists for this booking
    const existingLead = await sales_leads.findOne({
      where: { booking_id }
    });

    if (existingLead) {
      // Update last activity
      await existingLead.update({
        last_activity_at: new Date()
      });

      return res.json({
        success: true,
        message: 'Lead tracking updated',
        data: {
          lead_id: existingLead.lead_id,
          is_new: false
        }
      });
    }

    // Create new lead
    const lead = await sales_leads.create({
      booking_id,
      user_id: user_id || null,
      guest_email: guest_email || null,
      client_name: client_name || null,
      lead_type: 'self_serve',
      lead_status: 'in_progress_self_serve'
    });

    // Log activity
    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'created',
      activity_data: {
        source: 'booking_start',
        user_id,
        guest_email
      }
    });

    // TEMP FLOW: direct book-a-shoot leads stay unassigned for now.
    // const assignedRep = await leadAssignmentService.autoAssignLead(lead.lead_id);
    const assignedRep = null;

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Lead tracking started',
      data: {
        lead_id: lead.lead_id,
        is_new: true,
        assigned_to: assignedRep
      }
    });

  } catch (error) {
    console.error('Error tracking booking start:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to track booking start',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Track payment page reached
 * POST /api/sales/leads/track-payment-page
 */
exports.trackPaymentPageReached = async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Find lead by booking_id
    const lead = await sales_leads.findOne({
      where: { booking_id }
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Update booking to mark payment page reached
    await stream_project_booking.update(
      { payment_page_reached_at: new Date() },
      { where: { stream_project_booking_id: booking_id } }
    );

    // Update lead activity
    await lead.update({
      last_activity_at: new Date()
    });

    res.json({
      success: true,
      message: 'Payment page tracking recorded'
    });

  } catch (error) {
    console.error('Error tracking payment page:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to track payment page',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create sales-assisted lead when "Contact Sales" is clicked
 * POST /api/sales/leads/contact-sales
 */
exports.createSalesAssistedLead = async (req, res) => {
  try {
    const {
      booking_id,
      user_id,
      guest_email,
      client_name
    } = req.body;

    if (!booking_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Update booking to mark as sales assisted
    await stream_project_booking.update(
      { 
        sales_assisted: 1,
        is_draft: 1 // Save as draft
      },
      { where: { stream_project_booking_id: booking_id } }
    );

    // Check if lead already exists
    let lead = await sales_leads.findOne({
      where: { booking_id }
    });

    if (lead) {
      // Update existing lead to sales-assisted
      await lead.update({
        lead_type: 'sales_assisted',
        lead_status: 'in_progress_sales_assisted',
        contacted_sales_at: new Date(),
        last_activity_at: new Date()
      });
    } else {
      // Create new sales-assisted lead
      lead = await sales_leads.create({
        booking_id,
        user_id: user_id || null,
        guest_email: guest_email || null,
        client_name: client_name || null,
        lead_type: 'sales_assisted',
        lead_status: 'in_progress_sales_assisted',
        contacted_sales_at: new Date()
      });
    }

    // Log activity
    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'contacted_sales',
      activity_data: {
        source: 'contact_sales_button'
      }
    });

    // TEMP FLOW: direct book-a-shoot leads stay unassigned for now.
    // if (!lead.assigned_sales_rep_id) {
    //   await leadAssignmentService.autoAssignLead(lead.lead_id);
    // }

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Sales team has been notified. Someone will contact you shortly.',
      data: {
        lead_id: lead.lead_id
      }
    });

  } catch (error) {
    console.error('Error creating sales-assisted lead:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to contact sales team',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all leads with filters and pagination
 * GET /api/sales/leads
 */
// Ensure these are at the top of sales-leads.controller.js
// const { Op, Sequelize } = require('sequelize'); 

// exports.getLeads = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 20,
//       status,
//       lead_type,
//       assigned_to,
//       search,
//       range,        // Added
//       start_date,   // Added
//       end_date      // Added
//     } = req.query;

//     const offset = (parseInt(page) - 1) * parseInt(limit);

//     const whereClause = {};

//     if (start_date && end_date) {
//       whereClause.created_at = {
//         [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
//       };
//     } else if (range === 'month') {
//       whereClause[Op.and] = [
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('sales_leads.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ];
//     } else if (range === 'week') {
//       whereClause[Op.and] = [
//         Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('sales_leads.created_at'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
//       ];
//     } else if (range === 'year') {
//       whereClause[Op.and] = [
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       ];
//     }

//     if (status) {
//       whereClause.lead_status = status;
//     }

//     if (lead_type) {
//       whereClause.lead_type = lead_type;
//     }

//     if (assigned_to) {
//       if (assigned_to === 'unassigned') {
//         whereClause.assigned_sales_rep_id = null;
//       } else {
//         whereClause.assigned_sales_rep_id = parseInt(assigned_to);
//       }
//     }

//     if (search) {
//       const searchCondition = {
//         [Op.or]: [
//           { client_name: { [Op.like]: `%${search}%` } },
//           { guest_email: { [Op.like]: `%${search}%` } }
//         ]
//       };
      
//       if (whereClause[Op.and]) {
//         whereClause[Op.and].push(searchCondition);
//       } else {
//         whereClause[Op.and] = [searchCondition];
//       }
//     }

//     // Fetch leads
//     const { count, rows: leads } = await sales_leads.findAndCountAll({
//       where: whereClause,
//       include: [
//         {
//           model: users,
//           as: 'assigned_sales_rep',
//           attributes: ['id', 'name', 'email']
//         },
//         {
//           model: stream_project_booking,
//           as: 'booking',
//           attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'event_type', 'budget']
//         }
//       ],
//       limit: parseInt(limit),
//       offset: offset,
//       order: [['created_at', 'DESC']] 
//     });

//     res.json({
//       success: true,
//       data: {
//         leads: leads.map(lead => ({
//           lead_id: lead.lead_id,
//           client_name: lead.client_name,
//           guest_email: lead.guest_email || lead.user?.email,
//           lead_type: lead.lead_type,
//           lead_status: lead.lead_status,
//           assigned_sales_rep: lead.assigned_sales_rep,
//           booking: lead.booking,
//           last_activity_at: lead.last_activity_at,
//           contacted_sales_at: lead.contacted_sales_at,
//           created_at: lead.created_at
//         })),
//         pagination: {
//           total: count,
//           page: parseInt(page),
//           limit: parseInt(limit),
//           totalPages: Math.ceil(count / parseInt(limit))
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching leads:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch leads',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// exports.getLeads = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 20,
//       status,
//       lead_type,
//       assigned_to,
//       search,
//       range,
//       start_date,
//       end_date
//     } = req.query;

//     const offset = (parseInt(page) - 1) * parseInt(limit);
//     const whereClause = { [Op.and]: [] };

//     if (start_date && end_date) {
//       whereClause.created_at = {
//         [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
//       };
//     } else if (range === 'month') {
//       whereClause[Op.and].push(
//         Sequelize.where(Sequelize.fn('MONTH', Sequelize.col('sales_leads.created_at')), Sequelize.fn('MONTH', Sequelize.fn('CURDATE'))),
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       );
//     } else if (range === 'week') {
//       whereClause[Op.and].push(
//         Sequelize.where(Sequelize.fn('YEARWEEK', Sequelize.col('sales_leads.created_at'), 1), Sequelize.fn('YEARWEEK', Sequelize.fn('CURDATE'), 1))
//       );
//     } else if (range === 'year') {
//       whereClause[Op.and].push(
//         Sequelize.where(Sequelize.fn('YEAR', Sequelize.col('sales_leads.created_at')), Sequelize.fn('YEAR', Sequelize.fn('CURDATE')))
//       );
//     }

//     // Status & Type
//     if (status) whereClause.lead_status = status;
//     if (lead_type) whereClause.lead_type = lead_type;

//     // Assignment Logic
//     if (assigned_to) {
//       if (assigned_to === 'unassigned') {
//         whereClause.assigned_sales_rep_id = null;
//       } else {
//         whereClause.assigned_sales_rep_id = parseInt(assigned_to);
//       }
//     }

//     if (search) {
//       whereClause[Op.and].push({
//         [Op.or]: [
//           { client_name: { [Op.like]: `%${search}%` } },
//           { guest_email: { [Op.like]: `%${search}%` } }
//         ]
//       });
//     }

//     // Fetch leads
//     const { count, rows: leads } = await sales_leads.findAndCountAll({
//       where: whereClause,
//       include: [
//         {
//           model: users,
//           as: 'assigned_sales_rep',
//           attributes: ['id', 'name', 'email']
//         },
//         {
//           model: stream_project_booking,
//           as: 'booking',
//           attributes: ['stream_project_booking_id', 'project_name', 'event_date', 'event_type', 'budget']
//         }
//       ],
//       limit: parseInt(limit),
//       offset: offset,
//       order: [
//         ['created_at', 'DESC'],
//         ['lead_id', 'DESC'] 
//       ] 
//     });

//     res.json({
//       success: true,
//       data: {
//         leads: leads.map(lead => ({
//           lead_id: lead.lead_id,
//           client_name: lead.client_name,
//           guest_email: lead.guest_email || lead.user?.email,
//           lead_type: lead.lead_type,
//           lead_status: lead.lead_status,
//           assigned_sales_rep: lead.assigned_sales_rep,
//           booking: lead.booking,
//           last_activity_at: lead.last_activity_at,
//           contacted_sales_at: lead.contacted_sales_at,
//           created_at: lead.created_at
//         })),
//         pagination: {
//           total: count,
//           page: parseInt(page),
//           limit: parseInt(limit),
//           totalPages: Math.ceil(count / parseInt(limit))
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching leads:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch leads',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };


exports.getLeads = async (req, res) => {
  const requestId = req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'] || `getLeads-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const requestStartedAt = Date.now();
  const logContext = { requestId };
  try {
    const {
      page = 1,
      limit = 20,
      status,        // UI Label: "Signed Up - Lead Created"
      lead_type,     // "self_serve" or "sales_assisted"
      assigned_to,
      search,
      booking_id,
      start_date,
      end_date,
      intent,
      booking_status, // Fallback key
      cp_assignment,
      production_filter
    } = req.query;

    const pageNumber = parseInt(page);
    const pageLimit = parseInt(limit);
    const offset = (pageNumber - 1) * pageLimit;
    const safeQueryLog = {
      page: pageNumber,
      limit: pageLimit,
      status: status || null,
      booking_status: booking_status || null,
      lead_type: lead_type || null,
      assigned_to: assigned_to ? String(assigned_to) : null,
      has_search: Boolean(search?.trim()),
      has_booking_id: Boolean(booking_id),
      start_date: start_date || null,
      end_date: end_date || null,
      intent: intent || null,
      cp_assignment: cp_assignment || null,
      production_filter: production_filter || null,
      user_id: req.userId || null,
      user_role: req.userRole || null
    };

    getLeadsSafeLog('info', 'request started', {
      request_id: requestId,
      query: safeQueryLog,
      batch_size: GET_LEADS_BATCH_SIZE,
      process_concurrency: GET_LEADS_PROCESS_CONCURRENCY
    });

    const whereClause = { is_active: 1 };
    // if (req.userRole === 'sales_rep') {
    //   whereClause.assigned_sales_rep_id = req.userId;
    // }

    if (start_date && end_date) {
      whereClause.created_at = {
        [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
      };
    }

    if (lead_type) whereClause.lead_type = lead_type;

    if (assigned_to) {
      const normalizedAssignedTo = String(assigned_to).trim().toLowerCase();

      if (normalizedAssignedTo === 'all' || normalizedAssignedTo === '') {
      } else if (normalizedAssignedTo === 'unassigned') {
        whereClause.assigned_sales_rep_id = null;
      } else {
        const assignedToId = Number.parseInt(String(assigned_to), 10);
        if (Number.isFinite(assignedToId)) {
          whereClause.assigned_sales_rep_id = assignedToId;
        }
      }
    }

    if (search?.trim()) {
      const normalizedSearch = search.trim();
      whereClause[Op.or] = [
        { client_name: { [Op.like]: `%${normalizedSearch}%` } },
        { guest_email: { [Op.like]: `%${normalizedSearch}%` } },
        { phone: { [Op.like]: `%${normalizedSearch}%` } },
        Sequelize.where(
          Sequelize.cast(Sequelize.col('sales_leads.booking_id'), 'CHAR'),
          { [Op.like]: `%${normalizedSearch}%` }
        )
      ];
    }
    
    if (booking_id) {
      whereClause.booking_id = parseInt(booking_id, 10);
    }

    if (booking_id) {
      whereClause[Op.or] = [
        { client_name: { [Op.like]: `%${search}%` } },
        { guest_email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }

    getLeadsSafeLog('info', 'filters normalized', {
      request_id: requestId,
      where_keys: Object.keys(whereClause),
      query: safeQueryLog
    });

    const activeStatusFilter = (status || booking_status);
    const shootStatusRequested = isShootStatusFilterValue(activeStatusFilter);
    const listFilters = {
      activeStatusFilter,
      shootStatusRequested,
      intent,
      cp_assignment,
      production_filter
    };

    const leadIdQueryStartedAt = Date.now();
    const leadIdRows = await sales_leads.findAll({
      where: whereClause,
      attributes: ['lead_id'],
      order: [['created_at', 'DESC']],
      raw: true
    });
    getLeadsSafeLog('info', 'lead id query completed', {
      request_id: requestId,
      lead_id_count: leadIdRows.length,
      duration_ms: Date.now() - leadIdQueryStartedAt
    });

    const leadIds = leadIdRows
      .map((row) => Number(row.lead_id))
      .filter((id) => Number.isFinite(id));

    let total = 0;
    const paginatedLeads = [];
    const externalFileCache = new Map();

    for (let index = 0; index < leadIds.length; index += GET_LEADS_BATCH_SIZE) {
      const batchNumber = Math.floor(index / GET_LEADS_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(leadIds.length / GET_LEADS_BATCH_SIZE);
      const batchStartedAt = Date.now();
      const batchIds = leadIds.slice(index, index + GET_LEADS_BATCH_SIZE);
      try {
        getLeadsSafeLog('info', 'batch started', {
          request_id: requestId,
          batch_number: batchNumber,
          total_batches: totalBatches,
          batch_size: batchIds.length,
          first_lead_id: batchIds[0] || null,
          last_lead_id: batchIds[batchIds.length - 1] || null
        });

        const batchQueryStartedAt = Date.now();
        const batchLeads = await sales_leads.findAll({
          where: {
            lead_id: { [Op.in]: batchIds },
            is_active: 1
          },
          include: getSalesLeadListIncludes(),
          order: [['created_at', 'DESC']]
        });
        getLeadsSafeLog('info', 'batch query completed', {
          request_id: requestId,
          batch_number: batchNumber,
          loaded_count: batchLeads.length,
          duration_ms: Date.now() - batchQueryStartedAt
        });

        const processStartedAt = Date.now();
        const processedBatch = await mapWithConcurrency(
          batchLeads,
          GET_LEADS_PROCESS_CONCURRENCY,
          (lead) => processSalesLeadForList(lead, logContext)
        );
        getLeadsSafeLog('info', 'batch processing completed', {
          request_id: requestId,
          batch_number: batchNumber,
          processed_count: processedBatch.length,
          duration_ms: Date.now() - processStartedAt
        });

        let batchMatched = 0;
        for (const processedLead of processedBatch) {
          try {
            const matchesFilters = await salesLeadMatchesListFilters(
              processedLead,
              listFilters,
              externalFileCache,
              logContext
            );
            if (!matchesFilters) continue;

            batchMatched += 1;
            if (total >= offset && paginatedLeads.length < pageLimit) {
              paginatedLeads.push(processedLead);
            }
            total += 1;
          } catch (filterError) {
            getLeadsSafeLog('error', 'filter evaluation failed; skipping lead', {
              request_id: requestId,
              batch_number: batchNumber,
              lead_id: processedLead?.lead_id || null,
              booking_id: processedLead?.booking?.stream_project_booking_id || processedLead?.booking_id || null,
              error: getSafeErrorLog(filterError)
            });
          }
        }

        getLeadsSafeLog('info', 'batch completed', {
          request_id: requestId,
          batch_number: batchNumber,
          matched_count: batchMatched,
          running_total: total,
          page_items_collected: paginatedLeads.length,
          duration_ms: Date.now() - batchStartedAt
        });
      } catch (batchError) {
        getLeadsSafeLog('error', 'batch failed; continuing with next batch', {
          request_id: requestId,
          batch_number: batchNumber,
          batch_size: batchIds.length,
          first_lead_id: batchIds[0] || null,
          last_lead_id: batchIds[batchIds.length - 1] || null,
          error: getSafeErrorLog(batchError)
        });
      }
    }

    getLeadsSafeLog('info', 'request completed', {
      request_id: requestId,
      total,
      returned_count: paginatedLeads.length,
      external_file_cache_entries: externalFileCache.size,
      duration_ms: Date.now() - requestStartedAt
    });

    return res.json({
      success: true,
      data: {
        leads: paginatedLeads,
        pagination: {
          total,
          page: pageNumber,
          totalPages: Math.ceil(total / pageLimit)
        }
      }
    });

  } catch (error) {
    getLeadsSafeLog('error', 'request failed', {
      request_id: requestId,
      duration_ms: Date.now() - requestStartedAt,
      error: getSafeErrorLog(error)
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
      error: error.message
    });
  }
};

const BOARD_STATUSES = [
  'Signed Up - Lead Created',
  'Book a shoot - Lead Created',
  'Manual - Lead Created',
  'Booking In Progress',
  'Proposal Sent',
  'Ready for Payment',
  'Payment Sent',
  'Booked',
  'Closed - Lost',
];

const BOARD_SOURCE_LIMIT = 5000;

const normalizeBoardStatusLabel = (rawStatus) => {
  const value = String(rawStatus || '').replace(/â€“|—|–/g, '-').trim().toLowerCase();
  if (!value) return 'Unknown';
  if (value === 'signed up' || value === 'singed up' || value.includes('signed up - lead created')) return 'Signed Up - Lead Created';
  if (value.includes('book a shoot - lead created')) return 'Book a shoot - Lead Created';
  if (value.includes('manual - lead created')) return 'Manual - Lead Created';
  if (value === 'booking in progress' || value === 'in-progress') return 'Booking In Progress';
  if (value === 'proposal sent' || value === 'payment link sent' || value === 'link sent') return 'Proposal Sent';
  if (value === 'ready for payment') return 'Ready for Payment';
  if (value === 'payment sent') return 'Payment Sent';
  if (value === 'booked' || value === 'paid') return 'Booked';
  if (value.includes('closed - lost') || value === 'cancelled') return 'Closed - Lost';
  if (value === 'partially paid') return 'Partially Paid';
  return String(rawStatus || '').trim() || 'Unknown';
};

const invokeGetLeadsSnapshot = async (baseReq, queryOverrides = {}) => {
  return new Promise((resolve, reject) => {
    const mergedQuery = { ...baseReq.query, ...queryOverrides };
    const reqLike = {
      ...baseReq,
      query: mergedQuery,
    };

    const resLike = {
      json: (payload) => resolve(payload),
      status: (statusCode) => ({
        json: (payload) => reject(new Error(payload?.message || `getLeads failed with status ${statusCode}`)),
      }),
    };

    exports.getLeads(reqLike, resLike);
  });
};

exports.getLeadsBoard = async (req, res) => {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit || 10), 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10;
    const requestedStatus = String(req.query.status || '').trim();
    const page = Number.parseInt(String(req.query.page || 1), 10) || 1;
    const snapshot = await invokeGetLeadsSnapshot(req, {
      status: undefined,
      page: 1,
      limit: BOARD_SOURCE_LIMIT,
    });

    const payload = snapshot?.data || {};
    const allLeads = Array.isArray(payload.leads) ? payload.leads : [];
    const filteredTotal = Number(payload?.pagination?.total || allLeads.length);

    const groupedByStatus = new Map();
    allLeads.forEach((lead) => {
      const normalizedStatus = normalizeBoardStatusLabel(lead?.booking_status);
      if (!groupedByStatus.has(normalizedStatus)) {
        groupedByStatus.set(normalizedStatus, []);
      }
      groupedByStatus.get(normalizedStatus).push(lead);
    });

    const extraStatuses = Array.from(groupedByStatus.keys()).filter(
      (statusLabel) => !BOARD_STATUSES.includes(statusLabel)
    );
    const statuses = requestedStatus ? [requestedStatus] : [...BOARD_STATUSES, ...extraStatuses];

    const columns = {};
    statuses.forEach((statusLabel) => {
      const fullStatusLeads = groupedByStatus.get(statusLabel) || [];
      const total = fullStatusLeads.length;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
      const safePage = Math.max(1, page);
      const offset = (safePage - 1) * limit;
      const leads = fullStatusLeads.slice(offset, offset + limit);

      columns[statusLabel] = {
        status: statusLabel,
        leads,
        pagination: {
          total,
          page: safePage,
          limit,
          totalPages,
          hasMore: safePage < totalPages,
        },
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        columns,
        statuses,
        pagination: {
          total: filteredTotal,
          page,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('getLeadsBoard Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch leads board',
      error: error.message,
    });
  }
};

exports.getClientLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      lead_type,
      assigned_to,
      search,
      start_date,
      end_date,
      intent,
      booking_status
    } = req.query;

    const pageNumber = parseInt(page, 10);
    const pageLimit = parseInt(limit, 10);
    const offset = (pageNumber - 1) * pageLimit;

    const whereClause = { is_active: 1 };
    if (req.userRole === 'sales_rep') {
      whereClause.assigned_sales_rep_id = req.userId;
    }

    if (start_date && end_date) {
      whereClause.created_at = {
        [Op.between]: [`${start_date} 00:00:00`, `${end_date} 23:59:59`]
      };
    }

    if (lead_type) whereClause.lead_type = lead_type;

    if (assigned_to) {
      whereClause.assigned_sales_rep_id =
        assigned_to === 'unassigned' ? null : parseInt(assigned_to, 10);
    }

    if (search) {
      whereClause[Op.or] = [
        { client_name: { [Op.like]: `%${search}%` } },
        { guest_email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }
      ];
    }

    const leads = await client_leads.findAll({
      where: whereClause,
      include: [
        {
          model: users,
          required: false,
          as: 'assigned_sales_rep',
          attributes: ['id', 'name', 'email']
        },
        { model: client_lead_activities, as: "activities", required: false },
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: quotes,
              as: 'primary_quote',
              required: false,
              include: [{ model: quote_line_items, as: 'line_items' }]
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    let processedLeads = await Promise.all(
      leads.map(async (lead) => {
        const leadJson = lead.toJSON();
        const pricingData = await calculateLeadPricing(lead.booking);
        const manualProgress = computeManualPaymentProgress(
          leadJson.activities || [],
          pricingData?.total || 0
        );
        const computedIntent = lead.intent ?? leadAssignmentService.getClientIntent({ lead, booking: lead.booking });
        let computedBookingStatus = leadAssignmentService.getClientBookingStatus(lead, lead.booking);
        if (manualProgress.hasFullPayment) {
          computedBookingStatus = 'Booked';
        } else if (manualProgress.isPartiallyPaid) {
          computedBookingStatus = 'Partially Paid';
        }

        return {
          ...leadJson,
          potential_value: pricingData ? pricingData.total : 0,
          booking_status: computedBookingStatus,
          intent: computedIntent,
          payment_status: lead.booking?.payment_id ? 'paid' : 'unpaid',
          manual_payment_summary: manualProgress,
        };
      })
    );

    const activeStatusFilter = (status || booking_status);
    const shootStatusRequested = isShootStatusFilterValue(activeStatusFilter);

    if (shootStatusRequested) {
      processedLeads = processedLeads.filter((lead) => matchShootStatusFilter(lead.booking, activeStatusFilter));
    }
    if (!shootStatusRequested && activeStatusFilter && activeStatusFilter !== 'All') {
      processedLeads = processedLeads.filter((lead) => {
        const shootStatusMatch = matchShootStatusFilter(lead.booking, activeStatusFilter);
        if (shootStatusMatch !== null) {
          return shootStatusMatch;
        }

        const leadStat = normalizeDisplayStatusValue(lead.booking_status);
        const filterStat = normalizeDisplayStatusValue(activeStatusFilter);
        return leadStat === filterStat;
      });
    }

    if (intent && intent !== 'All') {
      processedLeads = processedLeads.filter(
        (lead) => lead.intent.toLowerCase() === intent.toLowerCase().trim()
      );
    }

    const total = processedLeads.length;
    const paginatedLeads = processedLeads.slice(offset, offset + pageLimit);

    res.json({
      success: true,
      data: {
        leads: paginatedLeads,
        pagination: {
          total,
          page: pageNumber,
          totalPages: Math.ceil(total / pageLimit)
        }
      }
    });
  } catch (error) {
    console.error('getClientLeads Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client leads',
      error: error.message
    });
  }
};
exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    let whereClause = { lead_id: id, is_active: 1 };

    // if (req.userRole === 'sales_rep') {
    //   whereClause.assigned_sales_rep_id = req.userId;
    // }

    const lead = await sales_leads.findOne({
      where: whereClause,
      include: [
        {
          model: users,
          as: "assigned_sales_rep",
          attributes: ["id", "name", "email"],
          required: false
        },
        {
          model: stream_project_booking,
          as: "booking",
          include: [
            {
              model: quotes,
              as: "primary_quote",
              include: [{ model: quote_line_items, as: "line_items" }],
            },
            {
              model: assigned_crew,
              as: "assigned_crews",
              required: false,
              where: { is_active: 1 },
              attributes: [
                "crew_member_id",
                "crew_accept",
                "status",
                "is_active",
                "created_at",
                "responded_at",
              ],
              include: [
                {
                  model: crew_members,
                  as: "crew_member",
                  attributes: [
                    "crew_member_id",
                    "first_name",
                    "last_name",
                    "primary_role",
                    "hourly_rate",
                  ],
                  include: [
                    {
                      model: crew_member_files,
                      as: "crew_member_files",
                      attributes: ["file_path"],
                      where: {
                        is_active: 1,
                        file_type: "profile_photo",
                      },
                      required: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        { model: discount_codes, as: "discount_codes" },
        { model: payment_links, as: "payment_links" },
        {
          model: sales_lead_activities,
          as: "activities",
          include: [
            { model: users, as: "performed_by", attributes: ["id", "name"] },
          ],
        },
      ],
      order: [
        [
          { model: sales_lead_activities, as: "activities" },
          "created_at",
          "DESC",
        ],
      ],
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const leadJson = lead.toJSON();
    const linkedSalesQuote = await sales_quotes.findOne({
      where: { lead_id: lead.lead_id },
      attributes: ['sales_quote_id', 'quote_number', 'status', 'subtotal', 'discount_amount', 'total'],
      order: [['updated_at', 'DESC']]
    });
    const overallChangeSummary = linkedSalesQuote?.sales_quote_id
      ? await quoteService.getQuoteOverallChangeSummary(linkedSalesQuote.sales_quote_id, null)
      : null;
    const customQuoteFinancials = await getCustomQuoteFinancialDetails({
      quoteId: linkedSalesQuote?.sales_quote_id || null,
      bookingId: leadJson.booking?.stream_project_booking_id || null
    });
    const usableLinkedSalesQuote = linkedSalesQuote?.sales_quote_id
      ? await quoteService.getCurrentUsableQuoteVersionSnapshot(linkedSalesQuote.sales_quote_id, null)
      : null;

    if (leadJson.booking && !Array.isArray(leadJson.booking.booking_days)) {
      const days = await stream_project_booking_days.findAll({
        where: { stream_project_booking_id: leadJson.booking.stream_project_booking_id }
      });
      leadJson.booking.booking_days = days.map((d) => ({
        event_date: d.event_date,
        start_time: normalizeTime(d.start_time),
        end_time: normalizeTime(d.end_time),
        duration_hours: d.duration_hours,
        time_zone: d.time_zone
      }));
    }

    let final_phone = leadJson.phone || leadJson.phone_number;
    if (!final_phone && leadJson.booking?.description) {
        const phoneMatch = leadJson.booking.description.match(/Phone:\s*(\d+)/i);
        if (phoneMatch && phoneMatch[1]) final_phone = phoneMatch[1];
    }
    if (!final_phone && (leadJson.user_id || leadJson.booking?.user_id)) {
        const targetUserId = leadJson.user_id || leadJson.booking.user_id;
        const userRecord = await users.findByPk(targetUserId, { attributes: ['phone_number'] });
        if (userRecord) final_phone = userRecord.phone_number;
    }

    let active_payment_link = null;
    const pLinks = leadJson.payment_links || leadJson.paymentLinks || [];
    const dCodes = leadJson.discount_codes || leadJson.discountCodes || [];

    if (pLinks.length > 0) {
      const latestLink = [...pLinks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const attachedDiscount = dCodes.find((d) => d.discount_code_id === latestLink.discount_code_id);
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      if (latestLink.link_token) {
        let fullUrl = `${baseUrl}/payment-link/${latestLink.link_token}`;
        if (attachedDiscount && attachedDiscount.code) fullUrl += `?discount=${attachedDiscount.code}`;
        const now = new Date();
        const expiryDate = latestLink.expires_at ? new Date(latestLink.expires_at) : null;
        active_payment_link = {
          payment_link_id: latestLink.payment_link_id || latestLink.id,
          full_url: fullUrl,
          token: latestLink.link_token,
          expires_at: latestLink.expires_at,
          is_used: !!latestLink.is_used,
          is_expired: expiryDate ? expiryDate < now : false,
          discount_details: attachedDiscount ? {
            code: attachedDiscount.code,
            type: attachedDiscount.discount_type,
            value: parseFloat(attachedDiscount.discount_value),
            is_active: attachedDiscount.is_active
          } : null
        };
      }
    }

    const payment_status = resolveLeadPaymentStatus({
      booking: lead.booking,
      activePaymentLink: active_payment_link,
      customQuoteFinancials
    });
    const quoteAmounts = resolveLeadQuoteAmounts({
      linkedSalesQuote: usableLinkedSalesQuote || linkedSalesQuote,
      booking: lead.booking,
      customQuoteFinancials
    });

    const projectedQuote = await calculateLeadPricing(lead.booking);
    const activeQuoteSource = usableLinkedSalesQuote || leadJson.booking?.primary_quote || projectedQuote;

    let pricing_breakdown = {
        shoot_cost: 0,
        editing_cost: 0,
        additional_creatives_cost: 0,
        discount: 0,
        total: 0
    };

    const itemsToProcess = activeQuoteSource?.line_items || [];
    let subtotal = 0;

    itemsToProcess.forEach(item => {
        const name = (item.item_name || item.name || '').toLowerCase();
        const lineTotal = parseFloat(item.line_total || item.total || 0);
        const quantity = parseInt(item.quantity || 1);

        subtotal += lineTotal;

        if (name.includes('videographer') || name.includes('photographer')) {
            const unitPrice = lineTotal / quantity;
            pricing_breakdown.shoot_cost += unitPrice;
            if (quantity > 1) {
                pricing_breakdown.additional_creatives_cost += (unitPrice * (quantity - 1));
            }
        } 
        else if (name.includes('reel') || name.includes('edit') || name.includes('highlight')) {
            pricing_breakdown.editing_cost += lineTotal;
        } 
        else {
            pricing_breakdown.shoot_cost += lineTotal;
        }
    });

    if (payment_status === 'paid') {
        pricing_breakdown.discount = parseFloat(leadJson.booking?.primary_quote?.discount_amount || 0);
    } else if (active_payment_link && active_payment_link.discount_details) {
        const disc = active_payment_link.discount_details;
        if (disc.type === 'percentage') {
            pricing_breakdown.discount = (subtotal * (disc.value / 100));
        } else {
            pricing_breakdown.discount = disc.value; 
        }
    } else {
        pricing_breakdown.discount = parseFloat(leadJson.booking?.primary_quote?.discount_amount || 0);
    }

    const totalBeforeCredit = parseFloat((subtotal - pricing_breakdown.discount).toFixed(2));
    let creditApplied = 0;
    let totalPaid = null;
    const paymentSummary = customQuoteFinancials?.payment_summary || null;
    const paymentSummaryChangeStatus = String(paymentSummary?.last_quote_change_status || '').toLowerCase();
    const canUsePaymentSummaryChange = !paymentSummaryChangeStatus || paymentSummaryChangeStatus === 'approved';

    if (paymentSummary && canUsePaymentSummaryChange) {
      creditApplied = parseFloat(paymentSummary.credit_used_amount || 0);
      totalPaid = parseFloat(paymentSummary.paid_amount || 0);
    } else if (leadJson.booking?.payment_id) {
      const paymentData = await db.payment_transactions.findByPk(leadJson.booking.payment_id);
      if (paymentData) {
        totalPaid = parseFloat(paymentData.total_amount || 0);
        if (Number.isFinite(totalPaid)) {
          creditApplied = Math.max(0, totalBeforeCredit - totalPaid);
        }
      }
    }

    const totalAfterCredit = Math.max(0, totalBeforeCredit - creditApplied);
    pricing_breakdown.total_before_credit = totalBeforeCredit;
    pricing_breakdown.credit_applied = parseFloat(creditApplied.toFixed(2));
    pricing_breakdown.total_after_credit = parseFloat(totalAfterCredit.toFixed(2));
    pricing_breakdown.total_paid = Number.isFinite(totalPaid) ? parseFloat(totalPaid.toFixed(2)) : null;
    pricing_breakdown.total = pricing_breakdown.total_after_credit;

    const selectedCrewIds = lead.booking?.assigned_crews?.map(c => c.crew_member_id).filter(Boolean) || [];
    
    // --- STANDARDIZED STATUS & INTENT CALLS ---
    const intent = lead.intent ?? leadAssignmentService.getLeadIntent({ lead, booking: lead.booking });
    let booking_status = leadAssignmentService.getLeadBookingStatus(lead, lead.booking);
    if (hasOutstandingAdditionalPayment(customQuoteFinancials)) {
      booking_status = 'Partially Paid';
    }
    // ------------------------------------------

    const booking_step = leadAssignmentService.getLeadBookingStep(lead, lead.booking, lead.activities);
    const can_edit_booking = canEditBooking(lead, lead.booking);

    const ROLE_GROUPS = { videographer: ['9', '1'], photographer: ['10', '2'], cinematographer: ['11', '3'] };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([role, ids]) => { ids.forEach(id => (ID_TO_ROLE_MAP[id] = role)); });

    let fulfillmentSummary = {};
    if (leadJson.booking && leadJson.booking.crew_roles) {
      let requestedRoles = {};
      try { requestedRoles = typeof leadJson.booking.crew_roles === 'string' ? JSON.parse(leadJson.booking.crew_roles) : leadJson.booking.crew_roles; } catch (e) { requestedRoles = {}; }
      
      if (requestedRoles && typeof requestedRoles === 'object') {
          Object.keys(requestedRoles).forEach(role => {
            fulfillmentSummary[role] = { required: requestedRoles[role], pending: 0, accepted: 0, rejected: 0, display: `0/${requestedRoles[role]}` };
          });
      }

      if (leadJson.booking.assigned_crews) {
        leadJson.booking.assigned_crews.forEach(ac => {
          let crewRoleIds = [];
          let rawRole = ac.crew_member?.primary_role;
          if (typeof rawRole === 'string') { try { crewRoleIds = JSON.parse(rawRole); } catch (e) { crewRoleIds = [rawRole]; } }
          else if (rawRole != null) { crewRoleIds = rawRole; }
          if (!Array.isArray(crewRoleIds)) crewRoleIds = crewRoleIds ? [crewRoleIds] : [];

          const potentialCategories = [...new Set(crewRoleIds.map(id => ID_TO_ROLE_MAP[String(id)]).filter(Boolean))];
          
          let assignedToCategory = null;
          if (ac.crew_accept === 1) assignedToCategory = potentialCategories.find(cat => fulfillmentSummary[cat] && fulfillmentSummary[cat].accepted < fulfillmentSummary[cat].required);
          if (!assignedToCategory && ac.crew_accept !== 2) assignedToCategory = potentialCategories.find(cat => fulfillmentSummary[cat] && (fulfillmentSummary[cat].accepted + fulfillmentSummary[cat].pending) < fulfillmentSummary[cat].required);
          if (!assignedToCategory) assignedToCategory = potentialCategories[0];
          
          if (assignedToCategory && fulfillmentSummary[assignedToCategory]) {
            const role = fulfillmentSummary[assignedToCategory];
            if (ac.crew_accept === 1) role.accepted += 1;
            else if (ac.crew_accept === 0 || ac.crew_accept === null) role.pending += 1;
            else if (ac.crew_accept === 2) role.rejected += 1;
          }
        });
      }
      Object.keys(fulfillmentSummary).forEach(key => {
        const item = fulfillmentSummary[key];
        item.display = `${item.accepted}/${item.required}`;
        item.needs_attention = item.accepted < item.required;
      });
    }

    const statusMap = { 0: 'pending', 1: 'accepted', 2: 'rejected' };
    
    if (leadJson.booking?.assigned_crews) {
      leadJson.booking.assigned_crews = leadJson.booking.assigned_crews.map(ac => {
        const formattedFirstName = ac.crew_member.first_name.charAt(0).toUpperCase() + ac.crew_member.first_name.slice(1).toLowerCase();
        const formattedLastName = ac.crew_member.last_name.charAt(0).toUpperCase();

        return {
          ...ac,
          crew_member: {
            ...ac.crew_member,
            first_name: formattedFirstName,
            last_name: formattedLastName,
          },
          acceptance_status: statusMap[ac.crew_accept] || 'pending',
        };
      });
    }

    const allCrews = leadJson.booking?.assigned_crews || [];

    const accepted_cp = allCrews
      .filter(ac => ac.crew_accept === 1)
      .sort((a, b) => new Date(a.responded_at || 0) - new Date(b.responded_at || 0));

    const rejected_ap = allCrews
      .filter(ac => ac.crew_accept === 2)
      .sort((a, b) => new Date(a.responded_at || 0) - new Date(b.responded_at || 0));

    const hasMultipleDays = Array.isArray(leadJson.booking?.booking_days) && leadJson.booking.booking_days.length > 0;
    if (leadJson.booking) {
      leadJson.booking.is_multiple_day_shoot = hasMultipleDays;
    }

    res.json({
      success: true,
      data: {
        ...leadJson,
        phone: final_phone,
        selected_crew_ids: selectedCrewIds,
        accepted_cp,
        rejected_ap,
        intent,
        intent_source: lead.intent ? 'manual' : 'system',
        booking_status,
        payment_status,
        collected_amount: quoteAmounts.collected_amount,
        outstanding_amount: quoteAmounts.outstanding_amount,
        active_payment_link,
        booking_step,
        can_edit_booking,
        fulfillmentSummary,
        pricing_breakdown,
        projected_quote: projectedQuote,
        custom_quote: linkedSalesQuote ? {
          sales_quote_id: linkedSalesQuote.sales_quote_id,
          quote_number: linkedSalesQuote.quote_number,
          status: linkedSalesQuote.status,
          subtotal: parseFloat(usableLinkedSalesQuote?.subtotal ?? linkedSalesQuote.subtotal ?? 0),
          discount_amount: parseFloat(usableLinkedSalesQuote?.discount_amount ?? linkedSalesQuote.discount_amount ?? 0),
          total: parseFloat(usableLinkedSalesQuote?.total ?? linkedSalesQuote.total ?? 0),
          version_number: usableLinkedSalesQuote?.version_number || null,
          ...customQuoteFinancials
        } : null,
        custom_quote_id: linkedSalesQuote?.sales_quote_id || null,
        custom_quote_number: linkedSalesQuote?.quote_number || null,
        custom_quote_status: linkedSalesQuote?.status || null,
        overall_change_summary: overallChangeSummary
      }
    });
  } catch (error) {
    console.error('GetLeadById Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lead details', error: error.message });
  }
};
exports.getLeadFulfillmentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await sales_leads.findOne({
      where: { lead_id: id, is_active: 1 },
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          attributes: ['event_location', 'crew_roles'],
          include: [
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
        }
      ]
    });

    if (!lead || !lead.booking) {
      return res.status(404).json({ success: false, message: 'Lead or Booking not found' });
    }

    const booking = lead.booking;
    
    let requestedRoles = {};
    try {
      requestedRoles = typeof booking.crew_roles === 'string' ? JSON.parse(booking.crew_roles) : (booking.crew_roles || {});
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

    // 3. Initialize Summary
    let fulfillment = {};
    Object.keys(requestedRoles).forEach(role => {
      fulfillment[role] = {
        accepted: 0,
        required: parseInt(requestedRoles[role]) || 0,
        status_display: `0/${requestedRoles[role]}`
      };
    });

    if (booking.assigned_crews) {
      booking.assigned_crews.forEach(ac => {
        if (ac.crew_accept === 1) {
          let crewRoleIds = [];
          try {
            crewRoleIds = typeof ac.crew_member?.primary_role === 'string' 
              ? JSON.parse(ac.crew_member.primary_role) 
              : (ac.crew_member?.primary_role || []);
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

    res.json({
      success: true,
      data: {
        lead_id: id,
        location: booking.event_location,
        fulfillment_stats: result
      }
    });

  } catch (error) {
    console.error('Fulfillment Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
exports.getClientLeadFulfillmentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await client_leads.findOne({
      where: { lead_id: id, is_active: 1 },
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          attributes: ['event_location', 'crew_roles'],
          include: [
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
        }
      ]
    });

    if (!lead || !lead.booking) {
      return res.status(404).json({ success: false, message: 'Lead or Booking not found' });
    }

    const booking = lead.booking;
    
    let requestedRoles = {};
    try {
      requestedRoles = typeof booking.crew_roles === 'string' ? JSON.parse(booking.crew_roles) : (booking.crew_roles || {});
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

    // 3. Initialize Summary
    let fulfillment = {};
    Object.keys(requestedRoles).forEach(role => {
      fulfillment[role] = {
        accepted: 0,
        required: parseInt(requestedRoles[role]) || 0,
        status_display: `0/${requestedRoles[role]}`
      };
    });

    if (booking.assigned_crews) {
      booking.assigned_crews.forEach(ac => {
        if (ac.crew_accept === 1) {
          let crewRoleIds = [];
          try {
            crewRoleIds = typeof ac.crew_member?.primary_role === 'string' 
              ? JSON.parse(ac.crew_member.primary_role) 
              : (ac.crew_member?.primary_role || []);
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

    res.json({
      success: true,
      data: {
        lead_id: id,
        location: booking.event_location,
        fulfillment_stats: result
      }
    });

  } catch (error) {
    console.error('Fulfillment Status Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Assign or reassign lead to sales rep
 * PUT /api/sales/leads/:id/assign
 */
exports.assignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { sales_rep_id } = req.body;
    const performedBy = req.userId; // From auth middleware

    if (!sales_rep_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Sales rep ID is required'
      });
    }

    await leadAssignmentService.manuallyAssignLead(
      parseInt(id),
      parseInt(sales_rep_id),
      performedBy
    );

    res.json({
      success: true,
      message: 'Lead assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: error.message || 'Failed to assign lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.assignLeadToSelf = async (req, res) => {
  try {
    const { id } = req.params;
    const sales_rep_id = req.userId;
    const performedBy = req.userId;

    const role = req.userRole?.toLowerCase();

    if (!['admin', 'sales_admin'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or sales admin can assign leads to themselves'
      });
    }

    await leadAssignmentService.manuallyAssignLead(
      parseInt(id),
      parseInt(sales_rep_id),
      performedBy
    );

    res.json({
      success: true,
      message: 'Lead assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning lead:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: error.message || 'Failed to assign lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Change sales rep for a sales lead
 * PUT /api/sales/leads/:id/change-sales-rep
 * Admin only
 */
exports.changeLeadSalesRep = async (req, res) => {
  try {
    const { id } = req.params;
    const { sales_rep_id } = req.body;

    if (!sales_rep_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Sales rep ID is required'
      });
    }

    const lead = await sales_leads.findOne({
      where: { lead_id: id, is_active: 1 },
      attributes: ['lead_id', 'assigned_sales_rep_id', 'client_name', 'guest_email']
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const salesRep = await resolveAssignableSalesRep(parseInt(sales_rep_id, 10));

    if (lead.assigned_sales_rep_id === salesRep.id) {
      return res.json({
        success: true,
        message: 'Sales rep already assigned to this lead',
        data: {
          lead_id: lead.lead_id,
          assigned_sales_rep_id: salesRep.id,
          assigned_sales_rep: salesRep
        }
      });
    }

    const previousRepId = lead.assigned_sales_rep_id;

    await lead.update({
      assigned_sales_rep_id: salesRep.id
    });

    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'assigned',
      activity_data: {
        previous_rep_id: previousRepId,
        new_rep_id: salesRep.id,
        assignment_type: 'admin_change_sales_rep'
      },
      performed_by_user_id: req.userId
    });

    return res.json({
      success: true,
      message: 'Sales rep changed successfully',
      data: {
        lead_id: lead.lead_id,
        client_name: lead.client_name,
        guest_email: lead.guest_email,
        previous_sales_rep_id: previousRepId,
        assigned_sales_rep_id: salesRep.id,
        assigned_sales_rep: salesRep
      }
    });
  } catch (error) {
    console.error('Error changing lead sales rep:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: error.message || 'Failed to change sales rep',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Change sales rep for a client lead
 * PUT /api/sales/client-leads/:id/change-sales-rep
 * Admin only
 */
exports.changeClientLeadSalesRep = async (req, res) => {
  try {
    const { id } = req.params;
    const { sales_rep_id } = req.body;

    if (!sales_rep_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Sales rep ID is required'
      });
    }

    const lead = await client_leads.findOne({
      where: { lead_id: id, is_active: 1 },
      attributes: ['lead_id', 'assigned_sales_rep_id', 'client_name', 'user_id']
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Client lead not found'
      });
    }

    const salesRep = await resolveAssignableSalesRep(parseInt(sales_rep_id, 10));

    if (lead.assigned_sales_rep_id === salesRep.id) {
      return res.json({
        success: true,
        message: 'Sales rep already assigned to this client lead',
        data: {
          lead_id: lead.lead_id,
          assigned_sales_rep_id: salesRep.id,
          assigned_sales_rep: salesRep
        }
      });
    }

    const previousRepId = lead.assigned_sales_rep_id;

    await lead.update({
      assigned_sales_rep_id: salesRep.id
    });

    await client_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'assigned',
      activity_data: {
        previous_rep_id: previousRepId,
        new_rep_id: salesRep.id,
        assignment_type: 'admin_change_sales_rep'
      },
      performed_by_user_id: req.userId
    });

    return res.json({
      success: true,
      message: 'Sales rep changed successfully',
      data: {
        lead_id: lead.lead_id,
        client_name: lead.client_name,
        user_id: lead.user_id,
        previous_sales_rep_id: previousRepId,
        assigned_sales_rep_id: salesRep.id,
        assigned_sales_rep: salesRep
      }
    });
  } catch (error) {
    console.error('Error changing client lead sales rep:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: error.message || 'Failed to change sales rep',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update lead status
 * PUT /api/sales/leads/:id/status
 */
exports.updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const performedBy = req.userId;

    const validStatuses = [
      'in_progress_self_serve',
      'in_progress_sales_assisted',
      'payment_link_sent',
      'discount_applied',
      'booked',
      'abandoned'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const lead = await sales_leads.findOne({ where: { lead_id: id, is_active: 1 } });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const oldStatus = lead.lead_status;

    await lead.update({
      lead_status: status,
      last_activity_at: new Date()
    });

    // Log activity
    await sales_lead_activities.create({
      lead_id: parseInt(id),
      activity_type: 'status_changed',
      activity_data: {
        old_status: oldStatus,
        new_status: status
      },
      performed_by_user_id: performedBy
    });

    res.json({
      success: true,
      message: 'Lead status updated'
    });

  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update lead status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.updateClientLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const performedBy = req.userId;

    const validStatuses = [
      'in_progress_self_serve',
      'in_progress_sales_assisted',
      'payment_link_sent',
      'discount_applied',
      'booked',
      'abandoned',
      'manual_lead_created',
      'book_a_shoot_lead_created',
      'booking_in_progress',
      'signed_up'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const lead = await client_leads.findOne({ where: { lead_id: id, is_active: 1 } });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Client lead not found'
      });
    }

    const oldStatus = lead.lead_status;

    await lead.update({
      lead_status: status,
      last_activity_at: new Date()
    });

    await client_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        old_status: oldStatus,
        new_status: status
      },
      performed_by_user_id: performedBy
    });

    res.json({
      success: true,
      message: 'Client lead status updated'
    });
  } catch (error) {
    console.error('Error updating client lead status:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update client lead status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const MANUAL_PAYMENT_MODES = ['cash', 'wire', 'ach', 'zelle', 'venmo', 'cashapp', 'applepay', 'other', 'net30'];

const parseJsonIfNeeded = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const computeManualPaymentProgress = (activities = [], totalAmount = 0) => {
  const manualEntries = (activities || [])
    .map((activity) => parseJsonIfNeeded(activity?.activity_data))
    .filter((entry) => entry && entry.payment_method === 'manual');

  const hasFullPayment = manualEntries.some((entry) => entry.payment_type === 'full');
  const partialPaid = manualEntries.reduce((sum, entry) => {
    if (entry.payment_type !== 'partial') return sum;
    const numeric = Number(entry.amount || 0);
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);

  const paidAmount = hasFullPayment ? Number(totalAmount || 0) : partialPaid;
  const pendingAmount = Math.max(Number(totalAmount || 0) - paidAmount, 0);

  return {
    hasFullPayment,
    paidAmount,
    pendingAmount,
    isPartiallyPaid: !hasFullPayment && paidAmount > 0 && pendingAmount > 0,
  };
};

const GET_LEADS_BATCH_SIZE = Math.max(parseInt(process.env.GET_LEADS_BATCH_SIZE || '50', 10), 1);
const GET_LEADS_PROCESS_CONCURRENCY = Math.max(parseInt(process.env.GET_LEADS_PROCESS_CONCURRENCY || '5', 10), 1);

function getSafeErrorLog(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error || 'Unknown error'),
    code: error?.code || null,
    errno: error?.errno || null,
    sqlState: error?.parent?.sqlState || error?.original?.sqlState || null,
    sqlMessage: error?.parent?.sqlMessage || error?.original?.sqlMessage || null,
    stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
  };
}

function getMemoryLog() {
  const memory = process.memoryUsage();
  return {
    rss_mb: Math.round(memory.rss / 1024 / 1024),
    heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    external_mb: Math.round(memory.external / 1024 / 1024)
  };
}

function getLeadsSafeLog(level, message, meta = {}) {
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logger(`[getLeads] ${message}`, {
    ...meta,
    memory: getMemoryLog()
  });
}

const getSalesLeadListIncludes = () => ([
  {
    model: users,
    as: 'assigned_sales_rep',
    attributes: ['id', 'name', 'email'],
    required: false
  },
  { model: discount_codes, as: "discount_codes" },
  { model: payment_links, as: "payment_links" },
  { model: sales_lead_activities, as: "activities", required: false },
  {
    model: stream_project_booking,
    as: 'booking',
    include: [
      {
        model: assigned_crew,
        as: 'assigned_crews',
        required: false,
        attributes: ['id', 'crew_member_id', 'status', 'project_id']
      },
      {
        model: db.project_meetings,
        as: 'meetings',
        required: false,
        attributes: ['meeting_id', 'meeting_type', 'meeting_status']
      },
      {
        model: db.projects,
        as: 'cms_project',
        required: false,
        attributes: ['project_id'],
        include: [
          {
            model: db.project_files,
            as: 'files',
            required: false,
            attributes: ['file_id', 'file_category', 'upload_status', 'is_deleted']
          }
        ]
      },
      {
        model: quotes,
        as: 'primary_quote',
        include: [{ model: quote_line_items, as: 'line_items' }]
      }
    ]
  }
]);

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );

  return results;
}

async function getCachedExternalWorkspaceFiles(cache, bookingId, phase) {
  if (!bookingId) return false;
  const cacheKey = `${phase}:${bookingId}`;
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, hasExternalWorkspaceFiles(bookingId, phase));
  }
  return cache.get(cacheKey);
}

async function processSalesLeadForList(lead, context = {}) {
  try {
    const startedAt = Date.now();
    console.log("[getLeads] Processing lead:", {
      request_id: context.requestId,
      lead_id: lead?.lead_id
    });

    const leadJson = lead?.toJSON ? lead.toJSON() : {};

    const pricingData = await calculateLeadPricing(lead?.booking).catch((err) => {
      getLeadsSafeLog('warn', 'calculateLeadPricing failed', {
        request_id: context.requestId,
        lead_id: lead?.lead_id,
        error: getSafeErrorLog(err)
      });
      return { total: 0 };
    });

    const manualProgress = computeManualPaymentProgress(
      leadJson.activities || [],
      pricingData?.total || 0
    );

    const linkedSalesQuote = await sales_quotes.findOne({
      where: { lead_id: lead?.lead_id },
      attributes: ['sales_quote_id'],
      order: [['updated_at', 'DESC']]
    }).catch((err) => {
      getLeadsSafeLog('warn', 'sales_quotes.findOne failed', {
        request_id: context.requestId,
        lead_id: lead?.lead_id,
        error: getSafeErrorLog(err)
      });
      return null;
    });

    const customQuoteFinancials = await getCustomQuoteFinancialDetails({
      quoteId: linkedSalesQuote?.sales_quote_id || null,
      bookingId: leadJson.booking?.stream_project_booking_id || null
    }).catch((err) => {
      getLeadsSafeLog('warn', 'getCustomQuoteFinancialDetails failed', {
        request_id: context.requestId,
        lead_id: lead?.lead_id,
        booking_id: leadJson.booking?.stream_project_booking_id || null,
        error: getSafeErrorLog(err)
      });
      return null;
    });

    const computedIntent =
      lead?.intent ??
      leadAssignmentService.getLeadIntent({
        lead,
        booking: lead?.booking
      });

    let computedBookingStatus =
      leadAssignmentService.getLeadBookingStatus(
        lead,
        lead?.booking
      );

    if (manualProgress.hasFullPayment) {
      computedBookingStatus = 'Booked';
    } else if (manualProgress.isPartiallyPaid) {
      computedBookingStatus = 'Partially Paid';
    } else if (hasOutstandingAdditionalPayment(customQuoteFinancials)) {
      computedBookingStatus = 'Partially Paid';
    }

    const pLinks = leadJson.payment_links || [];
    let activePaymentLink = null;

    if (pLinks.length > 0) {
      const latestLink = [...pLinks].sort(
        (a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
      )[0];

      const now = new Date();
      const expiryDate = latestLink.expires_at
        ? new Date(latestLink.expires_at)
        : null;

      activePaymentLink = {
        ...latestLink,
        is_expired: expiryDate
          ? expiryDate < now
          : false
      };
    }

    const payment_status = resolveLeadPaymentStatus({
      booking: lead?.booking,
      activePaymentLink,
      customQuoteFinancials
    });

    const quoteAmounts = resolveLeadQuoteAmounts({
      linkedSalesQuote,
      booking: lead?.booking,
      customQuoteFinancials
    });

    const processedLead = {
      ...leadJson,
      potential_value: pricingData
        ? pricingData.total
        : 0,
      booking_status:
        computedBookingStatus || 'Unknown',
      intent: computedIntent || '',
      payment_status:
        payment_status || 'Unknown',
      collected_amount:
        quoteAmounts?.collected_amount || 0,
      outstanding_amount:
        quoteAmounts?.outstanding_amount || 0,
      manual_payment_summary:
        manualProgress || {
          hasFullPayment: false,
          isPartiallyPaid: false
        }
    };

    if (Date.now() - startedAt > 3000) {
      getLeadsSafeLog('warn', 'slow lead processing', {
        request_id: context.requestId,
        lead_id: lead?.lead_id,
        duration_ms: Date.now() - startedAt
      });
    }

    return processedLead;

  } catch (leadError) {
    getLeadsSafeLog('error', 'Lead processing failed; returning fallback lead payload', {
      request_id: context.requestId,
      lead_id: lead?.lead_id,
      error: getSafeErrorLog(leadError)
    });

    return {
      ...(lead?.toJSON ? lead.toJSON() : {}),
      potential_value: 0,
      booking_status: 'Unknown',
      intent: lead?.intent || '',
      payment_status: 'Unknown',
      collected_amount: 0,
      outstanding_amount: 0,
      manual_payment_summary: {
        hasFullPayment: false,
        isPartiallyPaid: false
      }
    };
  }
}

async function salesLeadMatchesListFilters(lead, filters, externalFileCache, context = {}) {
  const {
    activeStatusFilter,
    shootStatusRequested,
    intent,
    cp_assignment,
    production_filter
  } = filters;

  if (shootStatusRequested && !matchShootStatusFilter(lead?.booking, activeStatusFilter)) {
    return false;
  }

  if (!shootStatusRequested && activeStatusFilter && activeStatusFilter !== 'All') {
    const leadStat = String(lead?.booking_status || '')
      .replace('â€“', '-')
      .trim();

    const filterStat = String(activeStatusFilter || '')
      .replace('â€“', '-')
      .trim();

    if (leadStat !== filterStat) return false;
  }

  if (intent && intent !== 'All') {
    if (
      String(lead?.intent || '')
        .toLowerCase() !==
      String(intent)
        .toLowerCase()
        .trim()
    ) {
      return false;
    }
  }

  if (cp_assignment && cp_assignment !== 'all') {
    const normalizedCpAssignment = String(cp_assignment).toLowerCase().trim();
    const assignedCrews = Array.isArray(lead?.booking?.assigned_crews) ? lead.booking.assigned_crews : [];
    const hasAssignedCrew = assignedCrews.length > 0;

    if (normalizedCpAssignment === 'assigned' && !hasAssignedCrew) return false;
    if (normalizedCpAssignment === 'not_assigned' && hasAssignedCrew) return false;
  }

  if (production_filter && production_filter !== 'all') {
    const normalizedProductionFilter = String(production_filter).toLowerCase().trim();
    const booking = lead?.booking;
    if (!booking) return false;
    const bookingId = Number(booking?.stream_project_booking_id || lead?.booking_id || 0);

    if (normalizedProductionFilter === 'pre_production_file_not_provided') {
      const startedAt = Date.now();
      const hasExternalPreFiles = await getCachedExternalWorkspaceFiles(externalFileCache, bookingId, 'pre');
      if (Date.now() - startedAt > 3000) {
        getLeadsSafeLog('warn', 'slow external pre-production file check', {
          request_id: context.requestId,
          lead_id: lead?.lead_id,
          booking_id: bookingId,
          duration_ms: Date.now() - startedAt
        });
      }
      if (hasExternalPreFiles) return false;
      return !hasPreProductionUploadEvidence(lead);
    }

    if (normalizedProductionFilter === 'pre_production_meeting_not_done') {
      return !hasCompletedMeetingOfType(booking, 'pre_production');
    }

    if (normalizedProductionFilter === 'post_production_meeting_not_done') {
      if (!isPostProductionEligible(booking)) return false;
      return !hasCompletedMeetingOfType(booking, 'post_production');
    }

    if (normalizedProductionFilter === 'post_production_file_not_uploaded') {
      if (!isPostProductionEligible(booking)) return false;
      const startedAt = Date.now();
      const hasExternalPostFiles = await getCachedExternalWorkspaceFiles(externalFileCache, bookingId, 'post');
      if (Date.now() - startedAt > 3000) {
        getLeadsSafeLog('warn', 'slow external post-production file check', {
          request_id: context.requestId,
          lead_id: lead?.lead_id,
          booking_id: bookingId,
          duration_ms: Date.now() - startedAt
        });
      }
      if (hasExternalPostFiles) return false;
      return !hasCompletedFileInCategories(booking, ['EDIT_FINAL', 'CLIENT_DELIVERABLE']);
    }
  }

  return true;
}

const resolveLeadTotalAmount = (leadRecord, bookingRecord) => {
  const pricing = parseJsonIfNeeded(leadRecord?.pricing_breakdown);
  const pricingTotalCandidates = [
    pricing?.total_after_credit,
    pricing?.total,
    pricing?.total_before_credit
  ];

  for (const candidate of pricingTotalCandidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  const quote = bookingRecord?.primary_quote || null;
  const quoteTotal = Number(quote?.total);
  if (Number.isFinite(quoteTotal) && quoteTotal > 0) return quoteTotal;

  return 0;
};

const syncExternalWorkspaceAfterManualPayment = async (bookingRecord) => {
  if (!bookingRecord?.stream_project_booking_id) {
    return { success: false, message: 'No booking linked for workspace sync' };
  }

  try {
    return await externalFileManagerController.syncWorkspaceForBookingFromRecord(bookingRecord);
  } catch (error) {
    console.error(
      `External workspace sync failed for manual payment booking ${bookingRecord.stream_project_booking_id}:`,
      error.message
    );
    return { success: false, message: error.message };
  }
};

const buildManualPaymentMeta = async ({ leadModel, leadId, req, res, leadLabel }) => {
  const {
    payment_type,
    amount,
    payment_mode,
    other_payment_mode,
    proof_url,
    proof_file_path,
    proof_file_name,
    notes,
    sales_quote_id
  } = req.body || {};
  const performedBy = req.userId;

  if (!['full', 'partial'].includes(String(payment_type || '').trim().toLowerCase())) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'payment_type must be either "full" or "partial"',
    });
  }

  const normalizedPaymentType = String(payment_type).trim().toLowerCase();
  const normalizedPaymentMode = String(payment_mode || '').trim().toLowerCase();

  if (!MANUAL_PAYMENT_MODES.includes(normalizedPaymentMode)) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'payment_mode must be one of cash, wire, ach, zelle, venmo, cashapp, applepay, other, or net30',
    });
  }

  const normalizedProofUrl = String(proof_url || '').trim();
  if (!normalizedProofUrl) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'proof_url is required for manual payment updates',
    });
  }

  if (normalizedPaymentMode === 'other' && !String(other_payment_mode || '').trim()) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'other_payment_mode is required when payment_mode is other',
    });
  }

  const lead = await leadModel.findOne({
    where: { lead_id: leadId, is_active: 1 },
    include: [{
      model: stream_project_booking,
      as: 'booking',
      include: [{
        model: quotes,
        as: 'primary_quote',
        required: false
      }]
    }]
  });

  if (!lead) {
    return res.status(constants.NOT_FOUND.code).json({
      success: false,
      message: `${leadLabel} not found`,
    });
  }

  const bookingId = Number(lead?.booking?.stream_project_booking_id || lead?.booking_id || 0);
  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'Booking is required to record manual payment',
    });
  }

  const existingSummary = await bookingPaymentSummaryService.getBookingPaymentSummary(bookingId);
  const summaryQuoteTotal = Number(existingSummary?.quote_total || 0);
  const totalAmount = Math.max(resolveLeadTotalAmount(lead, lead.booking), summaryQuoteTotal, 0);
  const previouslyPaidAmount = Number(existingSummary?.paid_amount || 0);
  const creditUsedAmount = Number(existingSummary?.credit_used_amount || 0);
  const dueFromSummary = Number(existingSummary?.due_amount);
  const remainingBefore = Number.isFinite(dueFromSummary)
    ? Math.max(dueFromSummary, 0)
    : Math.max(totalAmount - previouslyPaidAmount - creditUsedAmount, 0);
  const alreadyFullyPaid = remainingBefore <= 0 && previouslyPaidAmount > 0;

  if (alreadyFullyPaid) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'This lead is already marked fully paid',
    });
  }

  const numericAmount = amount === undefined || amount === null || amount === ''
    ? null
    : Number(amount);

  const isNet30Mode = normalizedPaymentMode === 'net30';

  if (normalizedPaymentType === 'partial' && !isNet30Mode) {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'For partial payments, amount must be greater than 0',
      });
    }

    if (remainingBefore > 0 && numericAmount > remainingBefore) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Partial amount cannot exceed remaining booking amount',
      });
    }
  }

  if (normalizedPaymentType === 'full' && remainingBefore <= 0 && totalAmount > 0 && !isNet30Mode) {
    return res.status(constants.BAD_REQUEST.code).json({
      success: false,
      message: 'No remaining amount to settle',
    });
  }

  const amountToApply = isNet30Mode
    ? 0
    : normalizedPaymentType === 'partial'
    ? Number(numericAmount || 0)
    : remainingBefore;
  const paidAmountAfter = Math.max(previouslyPaidAmount + amountToApply, 0);

  const normalizedSalesQuoteId = Number(sales_quote_id || 0);
  const latestLeadSalesQuote = Number.isFinite(normalizedSalesQuoteId) && normalizedSalesQuoteId > 0
    ? null
    : await sales_quotes.findOne({
        where: { lead_id: Number(leadId) },
        attributes: ['sales_quote_id'],
        order: [['updated_at', 'DESC'], ['sales_quote_id', 'DESC']]
      });
  const resolvedSalesQuoteId = Number.isFinite(normalizedSalesQuoteId) && normalizedSalesQuoteId > 0
    ? normalizedSalesQuoteId
    : (existingSummary?.sales_quote_id || latestLeadSalesQuote?.sales_quote_id || null);
  const normalizedOtherPaymentMode = normalizedPaymentMode === 'other' ? String(other_payment_mode).trim() : null;
  const normalizedProofFilePath = String(proof_file_path || '').trim() || null;
  const normalizedProofFileName = String(proof_file_name || '').trim() || null;
  const normalizedNotes = String(notes || '').trim() || null;

  await db.sequelize.query(
    `
      INSERT INTO booking_manual_payments (
        booking_id,
        lead_id,
        sales_quote_id,
        payment_type,
        amount,
        payment_mode,
        other_payment_mode,
        proof_url,
        proof_file_path,
        proof_file_name,
        notes,
        performed_by_user_id
      ) VALUES (
        :bookingId,
        :leadId,
        :salesQuoteId,
        :paymentType,
        :amount,
        :paymentMode,
        :otherPaymentMode,
        :proofUrl,
        :proofFilePath,
        :proofFileName,
        :notes,
        :performedBy
      )
    `,
    {
      replacements: {
        bookingId,
        leadId: Number(leadId),
        salesQuoteId: resolvedSalesQuoteId,
        paymentType: normalizedPaymentType,
        amount: Number(amountToApply || 0),
        paymentMode: normalizedPaymentMode,
        otherPaymentMode: normalizedOtherPaymentMode,
        proofUrl: normalizedProofUrl,
        proofFilePath: normalizedProofFilePath,
        proofFileName: normalizedProofFileName,
        notes: normalizedNotes,
        performedBy: performedBy || null,
      },
      type: Sequelize.QueryTypes.INSERT,
    }
  );

  await bookingPaymentSummaryService.upsertBookingPaymentSummary({
    bookingId,
    leadId: Number(leadId),
    salesQuoteId: resolvedSalesQuoteId,
    quoteTotal: totalAmount,
    paidAmount: paidAmountAfter,
    creditUsedAmount,
    creditCreatedAmount: Number(existingSummary?.credit_created_amount || 0),
    manualPaymentMode: normalizedPaymentMode,
    manualPaymentOtherMode: normalizedOtherPaymentMode,
    manualPaymentProofUrl: normalizedProofUrl,
    manualPaymentProofFilePath: normalizedProofFilePath,
    manualPaymentProofFileName: normalizedProofFileName,
    manualPaymentNotes: normalizedNotes,
    manualPaymentUpdatedByUserId: performedBy || null,
    manualPaymentUpdatedAt: new Date(),
    lastQuoteChangeType: existingSummary?.last_quote_change_type || 'none',
    lastQuoteChangeAmount: Number(existingSummary?.last_quote_change_amount || 0),
    lastQuoteChangeStatus: existingSummary?.last_quote_change_status || 'none',
  });

  const activityModel = leadModel === client_leads
    ? client_lead_activities
    : sales_lead_activities;
  await activityModel.create({
    lead_id: Number(leadId),
    activity_type: 'payment_completed',
    activity_data: {
      source: 'manual_payment',
      payment_method: 'manual',
      payment_type: isNet30Mode ? 'net30' : normalizedPaymentType,
      payment_mode: normalizedPaymentMode,
      other_payment_mode: normalizedOtherPaymentMode,
      amount: Number(amountToApply || 0),
      total_amount: totalAmount,
      paid_amount_before: previouslyPaidAmount,
      paid_amount_after: paidAmountAfter,
      remaining_before_payment: remainingBefore,
      remaining_after_payment: Math.max(remainingBefore - amountToApply, 0),
      proof_url: normalizedProofUrl,
      proof_file_path: normalizedProofFilePath,
      proof_file_name: normalizedProofFileName,
      notes: normalizedNotes,
      updated_by: performedBy || null,
      previously_paid_amount: previouslyPaidAmount,
      booking_id: bookingId,
      sales_quote_id: resolvedSalesQuoteId
    },
    performed_by_user_id: performedBy || null
  });

  const leadUpdate = { last_activity_at: new Date() };
  if (isNet30Mode) {
    leadUpdate.lead_status = 'payment_pending';
  } else if (normalizedPaymentType === 'full') {
    leadUpdate.lead_status = 'booked';
  }
  await lead.update(leadUpdate);

  const externalWorkspaceSync = await syncExternalWorkspaceAfterManualPayment(lead.booking);

  return res.json({
    success: true,
    message: isNet30Mode
      ? 'Net30 manual payment recorded and lead marked as payment pending'
      : normalizedPaymentType === 'full'
      ? 'Manual full payment recorded and lead marked as booked'
      : 'Manual partial payment recorded',
    data: {
      lead_id: Number(leadId),
      payment_type: isNet30Mode ? 'net30' : normalizedPaymentType,
      payment_mode: normalizedPaymentMode,
      amount: normalizedPaymentType === 'partial' ? Number(numericAmount) : null,
      total_amount: totalAmount > 0 ? Number(totalAmount) : null,
      paid_amount_total:
        normalizedPaymentType === 'partial'
          ? Number(previouslyPaidAmount + Number(numericAmount || 0))
          : totalAmount > 0
            ? Number(totalAmount)
            : null,
      pending_amount:
        normalizedPaymentType === 'partial'
          ? Math.max(remainingBefore - Number(numericAmount || 0), 0)
          : 0,
      proof_url: normalizedProofUrl,
      lead_status: isNet30Mode
        ? 'payment_pending'
        : (normalizedPaymentType === 'full' ? 'booked' : lead.lead_status),
      external_workspace_synced: !!externalWorkspaceSync.success,
      external_workspace_message: externalWorkspaceSync.message || null,
    }
  });
};

exports.recordManualPayment = async (req, res) => {
  try {
    const { id } = req.params;
    return await buildManualPaymentMeta({
      leadModel: sales_leads,
      leadId: id,
      req,
      res,
      leadLabel: 'Lead',
    });
  } catch (error) {
    console.error('Error recording manual payment:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to record manual payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.recordClientManualPayment = async (req, res) => {
  try {
    const { id } = req.params;
    return await buildManualPaymentMeta({
      leadModel: client_leads,
      leadId: id,
      req,
      res,
      leadLabel: 'Client lead',
    });
  } catch (error) {
    console.error('Error recording client manual payment:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to record client manual payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.uploadManualPaymentProof = [
  upload.single('proof_file'),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(constants.BAD_REQUEST.code).json({
          success: false,
          message: 'Proof file is required',
        });
      }

      const uploaded = await S3UploadFiles({ proof_file: [file] });
      const uploadedFilePath = uploaded?.[0]?.file_path || null;

      if (!uploadedFilePath) {
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
          success: false,
          message: 'Failed to upload proof file',
        });
      }

      const s3Prefix = String(process.env.BEIGE_ASSET_BASE_URL || '').replace(/\/+$/, '/');
      const proofUrl = s3Prefix ? `${s3Prefix}${uploadedFilePath}` : uploadedFilePath;

      return res.json({
        success: true,
        message: 'Proof file uploaded successfully',
        data: {
          file_path: uploadedFilePath,
          proof_url: proofUrl,
        },
      });
    } catch (error) {
      console.error('Error uploading manual payment proof:', error);
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: 'Failed to upload proof file',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
];

exports.getClientLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    let whereClause = { lead_id: id, is_active: 1 };

    if (req.userRole === 'sales_rep') {
      whereClause.assigned_sales_rep_id = req.userId;
    }

    const lead = await client_leads.findOne({
      where: whereClause,
      include: [
        {
          model: users,
          required: false,
          as: "assigned_sales_rep",
          attributes: ["id", "name", "email"],
        },
        {
          model: stream_project_booking,
          required: false,
          as: "booking",
          include: [
            {
              model: quotes,
              required: false,
              as: "primary_quote",
              include: [{ model: quote_line_items, as: "line_items" }],
            },
            {
              model: assigned_crew,
              as: "assigned_crews",
              required: false,
              where: { is_active: 1 },
              attributes: [
                "crew_member_id",
                "crew_accept",
                "status",
                "is_active",
                "created_at",
                "responded_at",
              ],
              include: [
                {
                  model: crew_members,
                  required: false,
                  as: "crew_member",
                  attributes: [
                    "crew_member_id",
                    "first_name",
                    "last_name",
                    "primary_role",
                    "hourly_rate",
                  ],
                  include: [
                    {
                      model: crew_member_files,
                      as: "crew_member_files",
                      attributes: ["file_path"],
                      where: {
                        is_active: 1,
                        file_type: "profile_photo",
                      },
                      required: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: client_lead_activities,
          required: false,
          as: "activities",
          include: [
            { model: users, as: "performed_by", attributes: ["id", "name"] },
          ],
        },
      ],
      order: [
        [
          { model: client_lead_activities, as: "activities" },
          "created_at",
          "DESC",
        ],
      ],
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Client lead not found' });
    }

    const leadJson = lead.toJSON();

    if (leadJson.booking && !Array.isArray(leadJson.booking.booking_days)) {
      const days = await stream_project_booking_days.findAll({
        where: { stream_project_booking_id: leadJson.booking.stream_project_booking_id }
      });
      leadJson.booking.booking_days = days.map((d) => ({
        event_date: d.event_date,
        start_time: normalizeTime(d.start_time),
        end_time: normalizeTime(d.end_time),
        duration_hours: d.duration_hours,
        time_zone: d.time_zone
      }));
    }

    const bookingId = leadJson.booking?.stream_project_booking_id || leadJson.booking_id || null;

    leadJson.discount_codes = bookingId
      ? await discount_codes.findAll({ where: { booking_id: bookingId } })
      : [];
    leadJson.payment_links = bookingId
      ? await payment_links.findAll({ where: { booking_id: bookingId } })
      : [];
    const paymentState = await bookingPaymentSummaryService.resolveBookingPaymentState({
      bookingId,
      quoteTotal: leadJson.booking?.primary_quote?.total || leadJson.booking?.primary_quote?.price_after_discount || 0
    });
    const paymentSummary = paymentState.paymentSummary;

    let final_phone = leadJson.phone || leadJson.phone_number;
    if (!final_phone && leadJson.booking?.description) {
      const phoneMatch = leadJson.booking.description.match(/Phone:\s*(\d+)/i);
      if (phoneMatch && phoneMatch[1]) final_phone = phoneMatch[1];
    }
    if (!final_phone && (leadJson.user_id || leadJson.booking?.user_id)) {
      const targetUserId = leadJson.user_id || leadJson.booking.user_id;
      const userRecord = await users.findByPk(targetUserId, { attributes: ['phone_number'] });
      if (userRecord) final_phone = userRecord.phone_number;
    }

    let active_payment_link = null;
    const pLinks = leadJson.payment_links || leadJson.paymentLinks || [];
    const dCodes = leadJson.discount_codes || leadJson.discountCodes || [];

    if (pLinks.length > 0) {
      const latestLink = [...pLinks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const attachedDiscount = dCodes.find((d) => d.discount_code_id === latestLink.discount_code_id);
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      if (latestLink.link_token) {
        let fullUrl = `${baseUrl}/payment-link/${latestLink.link_token}`;
        if (attachedDiscount && attachedDiscount.code) fullUrl += `?discount=${attachedDiscount.code}`;
        const now = new Date();
        const expiryDate = latestLink.expires_at ? new Date(latestLink.expires_at) : null;
        active_payment_link = {
          payment_link_id: latestLink.payment_link_id || latestLink.id,
          full_url: fullUrl,
          token: latestLink.link_token,
          expires_at: latestLink.expires_at,
          is_used: !!latestLink.is_used,
          is_expired: expiryDate ? expiryDate < now : false,
          discount_details: attachedDiscount ? {
            code: attachedDiscount.code,
            type: attachedDiscount.discount_type,
            value: parseFloat(attachedDiscount.discount_value),
            is_active: attachedDiscount.is_active
          } : null
        };
      }
    }

    let payment_status = String(paymentState.hasSummary ? paymentState.paymentStatus : '').toLowerCase() ||
      (lead.booking?.payment_id ? 'paid' : 'unpaid');
    if (payment_status === 'unpaid' && active_payment_link) {
      payment_status = active_payment_link.is_expired ? 'link_expired' : 'link_sent';
    }

    const projectedQuote = await calculateLeadPricing(lead.booking);
    const activeQuoteSource = leadJson.booking?.primary_quote || projectedQuote;

    let pricing_breakdown = {
      shoot_cost: 0,
      editing_cost: 0,
      additional_creatives_cost: 0,
      discount: 0,
      total: 0
    };

    const itemsToProcess = activeQuoteSource?.line_items || [];
    let subtotal = 0;

    itemsToProcess.forEach(item => {
      const name = (item.item_name || item.name || '').toLowerCase();
      const lineTotal = parseFloat(item.line_total || item.total || 0);
      const quantity = parseInt(item.quantity || 1, 10);

      subtotal += lineTotal;

      if (name.includes('videographer') || name.includes('photographer')) {
        const unitPrice = lineTotal / quantity;
        pricing_breakdown.shoot_cost += unitPrice;
        if (quantity > 1) {
          pricing_breakdown.additional_creatives_cost += (unitPrice * (quantity - 1));
        }
      } else if (name.includes('reel') || name.includes('edit') || name.includes('highlight')) {
        pricing_breakdown.editing_cost += lineTotal;
      } else {
        pricing_breakdown.shoot_cost += lineTotal;
      }
    });

    if (payment_status === 'paid') {
      pricing_breakdown.discount = parseFloat(leadJson.booking?.primary_quote?.discount_amount || 0);
    } else if (active_payment_link && active_payment_link.discount_details) {
      const disc = active_payment_link.discount_details;
      if (disc.type === 'percentage') {
        pricing_breakdown.discount = (subtotal * (disc.value / 100));
      } else {
        pricing_breakdown.discount = disc.value;
      }
    } else {
      pricing_breakdown.discount = parseFloat(leadJson.booking?.primary_quote?.discount_amount || 0);
    }

    const totalBeforeCredit = parseFloat((subtotal - pricing_breakdown.discount).toFixed(2));
    let creditApplied = 0;
    let totalPaid = null;

    if (paymentState.hasSummary) {
      creditApplied = paymentState.creditUsedAmount;
      totalPaid = paymentState.paidAmount;
    } else if (leadJson.booking?.payment_id) {
      const paymentData = await db.payment_transactions.findByPk(leadJson.booking.payment_id);
      if (paymentData) {
        totalPaid = parseFloat(paymentData.total_amount || 0);
        if (Number.isFinite(totalPaid)) {
          creditApplied = Math.max(0, totalBeforeCredit - totalPaid);
        }
      }
    }

    const totalAfterCredit = Math.max(0, totalBeforeCredit - creditApplied);
    pricing_breakdown.total_before_credit = totalBeforeCredit;
    pricing_breakdown.credit_applied = parseFloat(creditApplied.toFixed(2));
    pricing_breakdown.total_after_credit = parseFloat(totalAfterCredit.toFixed(2));
    pricing_breakdown.total_paid = Number.isFinite(totalPaid) ? parseFloat(totalPaid.toFixed(2)) : null;
    pricing_breakdown.total = pricing_breakdown.total_after_credit;

    const selectedCrewIds = lead.booking?.assigned_crews?.map(c => c.crew_member_id).filter(Boolean) || [];
    const intent = lead.intent ?? leadAssignmentService.getClientIntent({ lead, booking: lead.booking });
    let booking_status = leadAssignmentService.getClientBookingStatus(lead, lead.booking);
    if (['partially_paid', 'approval_pending'].includes(payment_status)) {
      booking_status = 'Partially Paid';
    } else if (payment_status === 'paid') {
      booking_status = 'Paid';
    }
    const booking_step = leadAssignmentService.getLeadBookingStep(lead, lead.booking, lead.activities);
    const can_edit_booking = canEditBooking(lead, lead.booking);

    const ROLE_GROUPS = { videographer: ['9', '1'], photographer: ['10', '2'], cinematographer: ['11', '3'] };
    const ID_TO_ROLE_MAP = {};
    Object.entries(ROLE_GROUPS).forEach(([role, ids]) => { ids.forEach(roleId => (ID_TO_ROLE_MAP[roleId] = role)); });

    let fulfillmentSummary = {};
    if (leadJson.booking && leadJson.booking.crew_roles) {
      let requestedRoles = {};
      try { requestedRoles = typeof leadJson.booking.crew_roles === 'string' ? JSON.parse(leadJson.booking.crew_roles) : leadJson.booking.crew_roles; } catch (e) { requestedRoles = {}; }

      if (requestedRoles && typeof requestedRoles === 'object') {
        Object.keys(requestedRoles).forEach(role => {
          fulfillmentSummary[role] = { required: requestedRoles[role], pending: 0, accepted: 0, rejected: 0, display: `0/${requestedRoles[role]}` };
        });
      }

      if (leadJson.booking.assigned_crews) {
        leadJson.booking.assigned_crews.forEach(ac => {
          let crewRoleIds = [];
          let rawRole = ac.crew_member?.primary_role;
          if (typeof rawRole === 'string') { try { crewRoleIds = JSON.parse(rawRole); } catch (e) { crewRoleIds = [rawRole]; } }
          else if (rawRole != null) { crewRoleIds = rawRole; }
          if (!Array.isArray(crewRoleIds)) crewRoleIds = crewRoleIds ? [crewRoleIds] : [];

          const potentialCategories = [...new Set(crewRoleIds.map(roleId => ID_TO_ROLE_MAP[String(roleId)]).filter(Boolean))];

          let assignedToCategory = null;
          if (ac.crew_accept === 1) assignedToCategory = potentialCategories.find(cat => fulfillmentSummary[cat] && fulfillmentSummary[cat].accepted < fulfillmentSummary[cat].required);
          if (!assignedToCategory && ac.crew_accept !== 2) assignedToCategory = potentialCategories.find(cat => fulfillmentSummary[cat] && (fulfillmentSummary[cat].accepted + fulfillmentSummary[cat].pending) < fulfillmentSummary[cat].required);
          if (!assignedToCategory) assignedToCategory = potentialCategories[0];

          if (assignedToCategory && fulfillmentSummary[assignedToCategory]) {
            const role = fulfillmentSummary[assignedToCategory];
            if (ac.crew_accept === 1) role.accepted += 1;
            else if (ac.crew_accept === 0 || ac.crew_accept === null) role.pending += 1;
            else if (ac.crew_accept === 2) role.rejected += 1;
          }
        });
      }
      Object.keys(fulfillmentSummary).forEach(key => {
        const item = fulfillmentSummary[key];
        item.display = `${item.accepted}/${item.required}`;
        item.needs_attention = item.accepted < item.required;
      });
    }

    const statusMap = { 0: 'pending', 1: 'accepted', 2: 'rejected' };

    if (leadJson.booking?.assigned_crews) {
      leadJson.booking.assigned_crews = leadJson.booking.assigned_crews.map(ac => {
        const formattedFirstName = ac.crew_member.first_name.charAt(0).toUpperCase() + ac.crew_member.first_name.slice(1).toLowerCase();
        const formattedLastName = ac.crew_member.last_name.charAt(0).toUpperCase();

        return {
          ...ac,
          crew_member: {
            ...ac.crew_member,
            first_name: formattedFirstName,
            last_name: formattedLastName,
          },
          acceptance_status: statusMap[ac.crew_accept] || 'pending',
        };
      });
    }

    const allCrews = leadJson.booking?.assigned_crews || [];

    const accepted_cp = allCrews
      .filter(ac => ac.crew_accept === 1)
      .sort((a, b) => new Date(a.responded_at || 0) - new Date(b.responded_at || 0));

    const rejected_ap = allCrews
      .filter(ac => ac.crew_accept === 2)
      .sort((a, b) => new Date(a.responded_at || 0) - new Date(b.responded_at || 0));

    const hasMultipleDays = Array.isArray(leadJson.booking?.booking_days) && leadJson.booking.booking_days.length > 0;
    if (leadJson.booking) {
      leadJson.booking.is_multiple_day_shoot = hasMultipleDays;
    }

    res.json({
      success: true,
      data: {
        ...leadJson,
        phone: final_phone,
        selected_crew_ids: selectedCrewIds,
        accepted_cp,
        rejected_ap,
        intent,
        intent_source: lead.intent ? 'manual' : 'system',
        booking_status,
        payment_status,
        collected_amount: paymentState.hasSummary
          ? paymentState.paidAmount
          : (Number.isFinite(totalPaid) ? totalPaid : null),
        outstanding_amount: paymentState.hasSummary
          ? paymentState.dueAmount
          : null,
        payment_summary: paymentSummary,
        active_payment_link,
        booking_step,
        can_edit_booking,
        fulfillmentSummary,
        pricing_breakdown,
        projected_quote: projectedQuote
      }
    });
  } catch (error) {
    console.error('GetClientLeadById Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch client lead details', error: error.message });
  }
};

/**
 * Send Post-Production status update email (Email 10)
 * POST /api/sales/leads/:id/post-production-status-update
 * Body: { estimated_delivery_date: "YYYY-MM-DD" }
 */
exports.sendPostProductionStatusUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimated_delivery_start_date, estimated_delivery_end_date } = req.body;
    const performedBy = req.userId || null;

    if (!estimated_delivery_start_date || !estimated_delivery_end_date) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'delivery_start_date and delivery_end_date are required'
      });
    }

    const startDate = new Date(estimated_delivery_start_date);
    const endDate = new Date(estimated_delivery_end_date);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid delivery dates'
      });
    }

    const lead = await sales_leads.findByPk(id, {
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: users,
              as: 'user',
              required: false,
              attributes: ['id', 'name', 'email']
            }
          ],
          attributes: [
            'stream_project_booking_id',
            'guest_email',
            'content_type',
            'edits_needed',
            'video_edit_types',
            'photo_edit_types'
          ]
        }
      ]
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (!lead.booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for this lead'
      });
    }

    const booking = lead.booking;
    const toEmail = booking.user?.email || booking.guest_email || lead.guest_email;
    if (!toEmail) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Client email not found'
      });
    }

    const hasVideoEdits = Array.isArray(booking.video_edit_types) && booking.video_edit_types.length > 0;
    const hasPhotoEdits = Array.isArray(booking.photo_edit_types) && booking.photo_edit_types.length > 0;
    const hasEditingService = booking.edits_needed === 1 || booking.edits_needed === true || hasVideoEdits || hasPhotoEdits;

    if (!hasEditingService) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Post-production status update can be sent only for editing bookings'
      });
    }
    
    const formattedStartDate = startDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const formattedEndDate = endDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    let deliveryDateDisplay;

    if (formattedStartDate === formattedEndDate) {
      deliveryDateDisplay = formattedStartDate;
    } else {
      deliveryDateDisplay = `${formattedStartDate} - ${formattedEndDate}`;
    }

    const baseName = (booking.user?.name || lead.client_name || '').trim();
    let firstName = 'there';
    if (baseName) {
      firstName = baseName.split(/\s+/)[0];
    } else if (toEmail.includes('@')) {
      const local = toEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) firstName = local.split(/\s+/)[0];
    }

    const emailResult = await emailService.sendPostProductionStatusUpdateEmail({
      to_email: toEmail,
      booking_id: booking.stream_project_booking_id,
      first_name: firstName,
      delivery_date: deliveryDateDisplay
    });

    if (!emailResult?.success) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: emailResult?.error || 'Failed to send post-production status update email'
      });
    }

    await sales_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        email_event: 'post_production_status_update',
        booking_id: booking.stream_project_booking_id,
        delivery_start_date: startDate.toISOString().slice(0, 10),
        delivery_end_date: endDate.toISOString().slice(0, 10)
      },
      performed_by_user_id: performedBy
    });

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Post-production status update email sent successfully',
      data: {
        lead_id: parseInt(id, 10),
        booking_id: booking.stream_project_booking_id,
        to_email: toEmail,
        delivery_start_date: startDate.toISOString().slice(0, 10),
        delivery_end_date: endDate.toISOString().slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error sending post-production status update email:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to send post-production status update email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Send Raw Footage Ready email (Email 10b)
 * POST /api/sales/leads/:id/raw-footage-ready
 * Body: { drive_link?: string, file_manager_link?: string }
 */
exports.sendRawFootageReady = async (req, res) => {
  try {
    const { id } = req.params;
    const { drive_link, file_manager_link, access_files_link } = req.body;
    const performedBy = req.userId || null;

    const lead = await sales_leads.findByPk(id, {
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: users,
              as: 'user',
              required: false,
              attributes: ['id', 'name', 'email']
            },
            {
              model: db.projects,
              as: 'cms_project',
              required: false,
              include: [
                {
                  model: db.project_files,
                  as: 'files',
                  required: false,
                  where: {
                    file_category: 'RAW_FOOTAGE',
                    upload_status: 'COMPLETED',
                    is_deleted: 0
                  },
                  attributes: ['file_id']
                }
              ],
              attributes: ['project_id']
            }
          ],
          attributes: [
            'stream_project_booking_id',
            'guest_email',
            'edits_needed',
            'video_edit_types',
            'photo_edit_types'
          ]
        }
      ]
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (!lead.booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for this lead'
      });
    }

    const booking = lead.booking;
    const toEmail = booking.user?.email || booking.guest_email || lead.guest_email;
    if (!toEmail) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Client email not found'
      });
    }

    const hasVideoEdits = Array.isArray(booking.video_edit_types) && booking.video_edit_types.length > 0;
    const hasPhotoEdits = Array.isArray(booking.photo_edit_types) && booking.photo_edit_types.length > 0;
    const hasEditingService = booking.edits_needed === 1 || booking.edits_needed === true || hasVideoEdits || hasPhotoEdits;
    if (hasEditingService) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Raw footage ready email is only for raw-footage-only bookings'
      });
    }

    const rawFilesCount = Array.isArray(booking.cms_project?.files) ? booking.cms_project.files.length : 0;
    if (!booking.cms_project || rawFilesCount === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Raw footage folder is empty. Upload raw footage files before sending this email.'
      });
    }

    const finalAccessLink =
      (drive_link && String(drive_link).trim()) ||
      (access_files_link && String(access_files_link).trim()) ||
      (file_manager_link && String(file_manager_link).trim());

    if (!finalAccessLink) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Provide drive_link or file_manager_link'
      });
    }

    const baseName = (booking.user?.name || lead.client_name || '').trim();
    let firstName = 'there';
    if (baseName) {
      firstName = baseName.split(/\s+/)[0];
    } else if (toEmail.includes('@')) {
      const local = toEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) firstName = local.split(/\s+/)[0];
    }

    const emailResult = await emailService.sendRawFootageReadyEmail({
      to_email: toEmail,
      booking_id: booking.stream_project_booking_id,
      first_name: firstName,
      access_files_link: finalAccessLink
    });

    if (!emailResult?.success) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: emailResult?.error || 'Failed to send raw footage ready email'
      });
    }

    await sales_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        email_event: 'raw_footage_ready',
        booking_id: booking.stream_project_booking_id,
        drive_link: drive_link || null,
        file_manager_link: file_manager_link || null,
        access_files_link: finalAccessLink
      },
      performed_by_user_id: performedBy
    });

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Raw footage ready email sent successfully',
      data: {
        lead_id: parseInt(id, 10),
        booking_id: booking.stream_project_booking_id,
        to_email: toEmail,
        access_files_link: finalAccessLink,
        raw_files_count: rawFilesCount
      }
    });
  } catch (error) {
    console.error('Error sending raw footage ready email:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to send raw footage ready email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Send Final Assets Delivered (without revision) email (Email 11)
 * POST /api/sales/leads/:id/final-assets-delivered-without-revision
 * Body: { drive_link?: string, file_manager_link?: string, view_assets_link?: string }
 */
exports.sendFinalAssetsDeliveredWithoutRevision = async (req, res) => {
  try {
    const { id } = req.params;
    const { drive_link, file_manager_link, view_assets_link } = req.body;
    const performedBy = req.userId || null;

    const lead = await sales_leads.findByPk(id, {
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: users,
              as: 'user',
              required: false,
              attributes: ['id', 'name', 'email']
            },
            {
              model: db.projects,
              as: 'cms_project',
              required: false,
              include: [
                {
                  model: db.project_files,
                  as: 'files',
                  required: false,
                  where: {
                    upload_status: 'COMPLETED',
                    is_deleted: 0
                  },
                  attributes: ['file_id']
                }
              ],
              attributes: ['project_id']
            }
          ],
          attributes: ['stream_project_booking_id', 'guest_email']
        }
      ]
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (!lead.booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for this lead'
      });
    }

    const booking = lead.booking;
    const toEmail = booking.user?.email || booking.guest_email || lead.guest_email;
    if (!toEmail) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Client email not found'
      });
    }

    const filesCount = Array.isArray(booking.cms_project?.files) ? booking.cms_project.files.length : 0;
    if (!booking.cms_project || filesCount === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'File manager folder is empty. Upload deliverables before sending this email.'
      });
    }

    const finalAssetsLink =
      (drive_link && String(drive_link).trim()) ||
      (view_assets_link && String(view_assets_link).trim()) ||
      (file_manager_link && String(file_manager_link).trim());

    if (!finalAssetsLink) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Provide drive_link or file_manager_link'
      });
    }

    const activities = await sales_lead_activities.findAll({
      where: {
        lead_id: parseInt(id, 10),
        activity_type: 'status_changed'
      },
      attributes: ['activity_data']
    });

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

    const hasAlreadySent = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        data.email_event === 'final_assets_delivered_without_revision' &&
        Number(data.booking_id) === Number(booking.stream_project_booking_id)
      );
    });

    if (hasAlreadySent) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Final assets delivered (without revision) email already sent for this booking'
      });
    }

    const hasRevisionFlow = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        Number(data.booking_id) === Number(booking.stream_project_booking_id) &&
        [
          'revision_request_received',
          'revised_content_delivered',
          'final_assets_delivered_with_revision'
        ].includes(String(data.email_event || ''))
      );
    });

    if (hasRevisionFlow) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Cannot send without-revision delivery email after revision flow has started'
      });
    }

    const baseName = (booking.user?.name || lead.client_name || '').trim();
    let firstName = 'there';
    if (baseName) {
      firstName = baseName.split(/\s+/)[0];
    } else if (toEmail.includes('@')) {
      const local = toEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) firstName = local.split(/\s+/)[0];
    }

    const emailResult = await emailService.sendFinalDeliveryCompleteEmail({
      to_email: toEmail,
      booking_id: booking.stream_project_booking_id,
      first_name: firstName,
      view_assets_link: finalAssetsLink
    });

    if (!emailResult?.success) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: emailResult?.error || 'Failed to send final delivery complete email'
      });
    }

    await sales_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        email_event: 'final_assets_delivered_without_revision',
        booking_id: booking.stream_project_booking_id,
        drive_link: drive_link || null,
        file_manager_link: file_manager_link || null,
        view_assets_link: finalAssetsLink
      },
      performed_by_user_id: performedBy
    });

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Final delivery complete email sent successfully',
      data: {
        lead_id: parseInt(id, 10),
        booking_id: booking.stream_project_booking_id,
        to_email: toEmail,
        view_assets_link: finalAssetsLink,
        files_count: filesCount
      }
    });
  } catch (error) {
    console.error('Error sending final delivery complete email:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to send final delivery complete email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Send Revision Request Received email (Email 11b)
 * POST /api/sales/leads/:id/revision-request-received
 * Body: { revision_delivery_date: "YYYY-MM-DD" }
 */
exports.sendRevisionRequestReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { revision_delivery_date, estimated_delivery_date } = req.body;
    const performedBy = req.userId || null;

    const rawRevisionDate = revision_delivery_date || estimated_delivery_date;
    if (!rawRevisionDate) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'revision_delivery_date is required'
      });
    }

    const lead = await sales_leads.findByPk(id, {
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: users,
              as: 'user',
              required: false,
              attributes: ['id', 'name', 'email']
            }
          ],
          attributes: ['stream_project_booking_id', 'guest_email']
        }
      ]
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (!lead.booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for this lead'
      });
    }

    const booking = lead.booking;
    const toEmail = booking.user?.email || booking.guest_email || lead.guest_email;
    if (!toEmail) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Client email not found'
      });
    }

    const parsedDate = new Date(rawRevisionDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'revision_delivery_date is invalid'
      });
    }

    const formattedRevisionDate = parsedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const baseName = (booking.user?.name || lead.client_name || '').trim();
    let firstName = 'there';
    if (baseName) {
      firstName = baseName.split(/\s+/)[0];
    } else if (toEmail.includes('@')) {
      const local = toEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) firstName = local.split(/\s+/)[0];
    }

    const emailResult = await emailService.sendRevisionRequestReceivedEmail({
      to_email: toEmail,
      booking_id: booking.stream_project_booking_id,
      first_name: firstName,
      revision_delivery_date: formattedRevisionDate
    });

    if (!emailResult?.success) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: emailResult?.error || 'Failed to send revision request received email'
      });
    }

    await sales_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        email_event: 'revision_request_received',
        booking_id: booking.stream_project_booking_id,
        revision_delivery_date: parsedDate.toISOString().slice(0, 10)
      },
      performed_by_user_id: performedBy
    });

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Revision request received email sent successfully',
      data: {
        lead_id: parseInt(id, 10),
        booking_id: booking.stream_project_booking_id,
        to_email: toEmail,
        revision_delivery_date: parsedDate.toISOString().slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error sending revision request received email:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to send revision request received email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Send Revised Content Delivered email (Email 11c)
 * POST /api/sales/leads/:id/revised-content-delivered
 * Body: { drive_link?: string, file_manager_link?: string, view_updated_assets_link?: string }
 */
exports.sendRevisedContentDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const { drive_link, file_manager_link, view_updated_assets_link } = req.body;
    const performedBy = req.userId || null;

    const lead = await sales_leads.findByPk(id, {
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: users,
              as: 'user',
              required: false,
              attributes: ['id', 'name', 'email']
            },
            {
              model: db.projects,
              as: 'cms_project',
              required: false,
              include: [
                {
                  model: db.project_files,
                  as: 'files',
                  required: false,
                  where: {
                    file_category: 'EDIT_REVISION',
                    upload_status: 'COMPLETED',
                    is_deleted: 0
                  },
                  attributes: ['file_id', 'version_number', 'created_at']
                }
              ],
              attributes: ['project_id']
            }
          ],
          attributes: ['stream_project_booking_id', 'guest_email']
        }
      ]
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (!lead.booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for this lead'
      });
    }

    const booking = lead.booking;
    const toEmail = booking.user?.email || booking.guest_email || lead.guest_email;
    if (!toEmail) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Client email not found'
      });
    }

    const revisionFiles = Array.isArray(booking.cms_project?.files) ? booking.cms_project.files : [];
    if (!booking.cms_project || revisionFiles.length === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Revision folder is empty. Upload revision files before sending this email.'
      });
    }

    const finalAssetsLink =
      (drive_link && String(drive_link).trim()) ||
      (view_updated_assets_link && String(view_updated_assets_link).trim()) ||
      (file_manager_link && String(file_manager_link).trim());

    if (!finalAssetsLink) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Provide drive_link or file_manager_link'
      });
    }

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

    const activities = await sales_lead_activities.findAll({
      where: {
        lead_id: parseInt(id, 10),
        activity_type: 'status_changed'
      },
      attributes: ['activity_data']
    });

    const hasRevisionRequest = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        Number(data.booking_id) === Number(booking.stream_project_booking_id) &&
        String(data.email_event || '') === 'revision_request_received'
      );
    });

    if (!hasRevisionRequest) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Revision request has not been recorded for this booking'
      });
    }

    const hasAlreadySent = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        Number(data.booking_id) === Number(booking.stream_project_booking_id) &&
        String(data.email_event || '') === 'revised_content_delivered'
      );
    });

    if (hasAlreadySent) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Revised content delivered email already sent for this booking'
      });
    }

    const latestRevisionFile = [...revisionFiles].sort((a, b) => {
      const va = Number(a?.version_number || 0);
      const vb = Number(b?.version_number || 0);
      if (vb !== va) return vb - va;
      return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    })[0];
    const revisionVersion = latestRevisionFile?.version_number ? `v${latestRevisionFile.version_number}` : '';

    const baseName = (booking.user?.name || lead.client_name || '').trim();
    let firstName = 'there';
    if (baseName) {
      firstName = baseName.split(/\s+/)[0];
    } else if (toEmail.includes('@')) {
      const local = toEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) firstName = local.split(/\s+/)[0];
    }

    const emailResult = await emailService.sendRevisedContentDeliveredEmail({
      to_email: toEmail,
      booking_id: booking.stream_project_booking_id,
      first_name: firstName,
      view_updated_assets_link: finalAssetsLink,
      revision_version: revisionVersion
    });

    if (!emailResult?.success) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: emailResult?.error || 'Failed to send revised content delivered email'
      });
    }

    await sales_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        email_event: 'revised_content_delivered',
        booking_id: booking.stream_project_booking_id,
        revision_version: revisionVersion || null,
        drive_link: drive_link || null,
        file_manager_link: file_manager_link || null,
        view_updated_assets_link: finalAssetsLink
      },
      performed_by_user_id: performedBy
    });

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Revised content delivered email sent successfully',
      data: {
        lead_id: parseInt(id, 10),
        booking_id: booking.stream_project_booking_id,
        to_email: toEmail,
        view_updated_assets_link: finalAssetsLink,
        revision_version: revisionVersion || null,
        revision_files_count: revisionFiles.length
      }
    });
  } catch (error) {
    console.error('Error sending revised content delivered email:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to send revised content delivered email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Send Final Assets Delivered with Revision email (Email 11d)
 * POST /api/sales/leads/:id/final-assets-delivered-with-revision
 * Body: { drive_link?: string, file_manager_link?: string, view_final_assets_link?: string }
 */
exports.sendFinalAssetsDeliveredWithRevision = async (req, res) => {
  try {
    const { id } = req.params;
    const { drive_link, file_manager_link, view_final_assets_link } = req.body;
    const performedBy = req.userId || null;

    const lead = await sales_leads.findByPk(id, {
      include: [
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          include: [
            {
              model: users,
              as: 'user',
              required: false,
              attributes: ['id', 'name', 'email']
            },
            {
              model: db.projects,
              as: 'cms_project',
              required: false,
              include: [
                {
                  model: db.project_files,
                  as: 'files',
                  required: false,
                  where: {
                    upload_status: 'COMPLETED',
                    is_deleted: 0
                  },
                  attributes: ['file_id']
                }
              ],
              attributes: ['project_id']
            }
          ],
          attributes: ['stream_project_booking_id', 'guest_email']
        }
      ]
    });

    if (!lead) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (!lead.booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found for this lead'
      });
    }

    const booking = lead.booking;
    const toEmail = booking.user?.email || booking.guest_email || lead.guest_email;
    if (!toEmail) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Client email not found'
      });
    }

    const filesCount = Array.isArray(booking.cms_project?.files) ? booking.cms_project.files.length : 0;
    if (!booking.cms_project || filesCount === 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'File manager folder is empty. Upload final files before sending this email.'
      });
    }

    const finalAssetsLink =
      (drive_link && String(drive_link).trim()) ||
      (view_final_assets_link && String(view_final_assets_link).trim()) ||
      (file_manager_link && String(file_manager_link).trim());

    if (!finalAssetsLink) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Provide drive_link or file_manager_link'
      });
    }

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

    const activities = await sales_lead_activities.findAll({
      where: {
        lead_id: parseInt(id, 10),
        activity_type: 'status_changed'
      },
      attributes: ['activity_data']
    });

    const hasRevisionRequest = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        Number(data.booking_id) === Number(booking.stream_project_booking_id) &&
        String(data.email_event || '') === 'revision_request_received'
      );
    });

    const hasRevisedDelivered = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        Number(data.booking_id) === Number(booking.stream_project_booking_id) &&
        String(data.email_event || '') === 'revised_content_delivered'
      );
    });

    if (!hasRevisionRequest || !hasRevisedDelivered) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Cannot send final with-revision email before revision flow is completed'
      });
    }

    const hasAlreadySent = activities.some((row) => {
      const data = parseActivityData(row.activity_data);
      return (
        Number(data.booking_id) === Number(booking.stream_project_booking_id) &&
        String(data.email_event || '') === 'final_assets_delivered_with_revision'
      );
    });

    if (hasAlreadySent) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Final assets delivered (with revision) email already sent for this booking'
      });
    }

    const baseName = (booking.user?.name || lead.client_name || '').trim();
    let firstName = 'there';
    if (baseName) {
      firstName = baseName.split(/\s+/)[0];
    } else if (toEmail.includes('@')) {
      const local = toEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (local) firstName = local.split(/\s+/)[0];
    }

    const emailResult = await emailService.sendFinalDeliveryWithRevisionEmail({
      to_email: toEmail,
      booking_id: booking.stream_project_booking_id,
      first_name: firstName,
      view_final_assets_link: finalAssetsLink
    });

    if (!emailResult?.success) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: emailResult?.error || 'Failed to send final delivery with revision email'
      });
    }

    await sales_lead_activities.create({
      lead_id: parseInt(id, 10),
      activity_type: 'status_changed',
      activity_data: {
        email_event: 'final_assets_delivered_with_revision',
        booking_id: booking.stream_project_booking_id,
        drive_link: drive_link || null,
        file_manager_link: file_manager_link || null,
        view_final_assets_link: finalAssetsLink
      },
      performed_by_user_id: performedBy
    });

    return res.status(constants.OK.code).json({
      success: true,
      message: 'Final delivery with revision email sent successfully',
      data: {
        lead_id: parseInt(id, 10),
        booking_id: booking.stream_project_booking_id,
        to_email: toEmail,
        view_final_assets_link: finalAssetsLink,
        files_count: filesCount
      }
    });
  } catch (error) {
    console.error('Error sending final delivery with revision email:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to send final delivery with revision email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// exports.updateBookingCrew = async (req, res) => {
//   try {
//     const { bookingId } = req.params;
//     const { crew_roles } = req.body;

//     if (!crew_roles || typeof crew_roles !== 'object') {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'crew_roles object is required'
//       });
//     }

//     const booking = await stream_project_booking.findOne({
//       where: {
//         stream_project_booking_id: bookingId,
//         is_active: 1
//       }
//     });

//     if (!booking) {
//       return res.status(constants.NOT_FOUND.code).json({
//         success: false,
//         message: 'Booking not found'
//       });
//     }

//     if (booking.is_completed === 1) {
//       return res.status(constants.BAD_REQUEST.code).json({
//         success: false,
//         message: 'Cannot modify completed booking'
//       });
//     }

//     // ONLY persist crew selection
//     await booking.update({
//       crew_roles: JSON.stringify(crew_roles)
//     });

//     return res.json({
//       success: true,
//       message: 'Crew roles saved',
//       data: {
//         booking_id: bookingId,
//         crew_roles
//       }
//     });

//   } catch (error) {
//     console.error('Error updating booking crew:', error);
//     return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
//       success: false,
//       message: 'Failed to update crew details'
//     });
//   }
// };

exports.updateBookingCrew = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { crew_roles, location, description, reference_links } = req.body;
    const { latitude, longitude } = extractCoordinatesFromPayload(req.body, location);

    if (!crew_roles || typeof crew_roles !== 'object') {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'crew_roles object is required'
      });
    }

    const serviceType = normalizeBookAShootServiceType(
      req.body.serviceType || req.body.service_type || req.body.bookingFlow || req.body.booking_flow
    );

    if (!BOOK_A_SHOOT_SERVICE_TYPES.has(serviceType)) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid serviceType. Allowed values: photography, videography, studios, videography_studios'
      });
    }

    const normalizedCrewRoles = normalizeBookAShootCrewRoles(crew_roles);
    if (!Object.keys(normalizedCrewRoles).length) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'crew_roles must include photographer, videographer, or studio'
      });
    }

    const studioDetails = req.body.studio_details || req.body.studioDetails || null;
    const videographyDetails = req.body.videography_details || req.body.videographyDetails || null;
    const pricingDetails = req.body.pricing || req.body.price_details || req.body.priceDetails || null;
    const selectedPackage = getBookAShootSelectedPackage(req.body);
    const inferredServiceType = req.body.serviceType || req.body.service_type || req.body.bookingFlow || req.body.booking_flow
      ? serviceType
      : (normalizedCrewRoles.videographer && normalizedCrewRoles.studio
          ? 'videography_studios'
          : normalizedCrewRoles.videographer
            ? 'videography'
            : normalizedCrewRoles.studio
              ? 'studios'
              : 'photography');

    const flowValidationError = validateBookAShootFlowDetails({
      serviceType: inferredServiceType,
      studioDetails,
      videographyDetails
    });

    if (flowValidationError) {
      return res.status(constants.BAD_REQUEST.code).json({ success: false, message: flowValidationError });
    }

    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: bookingId,
        is_active: 1
      }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const updateData = {
      crew_roles: JSON.stringify(normalizedCrewRoles),
      event_type: inferredServiceType,
      shoot_type: inferredServiceType,
      content_type: inferredServiceType,
      service_type: inferredServiceType,
      booking_flow: inferredServiceType,
      studio_details: studioDetails,
      videography_details: videographyDetails,
      pricing_details: pricingDetails,
      selected_package: selectedPackage
    };

    if (location !== undefined || latitude !== null || longitude !== null) {
      updateData.event_location = location ?? booking.event_location;
      updateData.event_latitude = latitude;
      updateData.event_longitude = longitude;
    }
    if (description !== undefined) {
      updateData.special_instructions = description;
    }
    if (reference_links !== undefined) {
      updateData.reference_links = JSON.stringify({
        original_reference_links: reference_links,
        book_a_shoot: buildBookAShootMetadata(req.body, inferredServiceType)
      });
    } else if (studioDetails || videographyDetails || pricingDetails) {
      updateData.reference_links = JSON.stringify({
        book_a_shoot: buildBookAShootMetadata(req.body, inferredServiceType)
      });
    }

    await booking.update(updateData);

    await sales_leads.update(
      {
        lead_status: 'booking_in_progress',
        service_type: inferredServiceType,
        booking_flow: inferredServiceType,
        studio_details: studioDetails,
        videography_details: videographyDetails,
        pricing_details: pricingDetails,
        selected_package: selectedPackage
      },
      {
        where: { booking_id: parseInt(bookingId, 10) },
        limit: 1
      }
    );

    await client_leads.update(
      { lead_status: 'booking_in_progress' },
      {
        where: { booking_id: parseInt(bookingId, 10) },
        limit: 1
      }
    );
    return res.json({
      success: true,
      message: 'Crew roles and project details saved',
      data: {
        booking_id: bookingId,
        crew_roles: normalizedCrewRoles,
        location,
        description,
        serviceType: inferredServiceType,
        studio_details: studioDetails,
        videography_details: videographyDetails
      }
    });

  } catch (error) {
    console.error('Error updating booking details:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update details'
    });
  }
};

exports.updateLeadIntent = async (req, res) => {
  try {
    const { lead_id, intent, notes } = req.body;
    const salesUserId = req.userId;

    if (!['Hot', 'Warm', 'Cold'].includes(intent)) {
      return res.status(400).json({ message: 'Invalid intent' });
    }

    const lead = await sales_leads.findByPk(lead_id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    await lead.update({
      intent,
      intent_updated_by: salesUserId,
      intent_updated_at: new Date()
    });

    await sales_lead_activities.create({
      lead_id,
      activity_type: 'intent_updated',
      activity_data: { intent, notes }
    });

    return res.json({
      success: true,
      message: 'Lead intent updated successfully'
    });
  } catch (error) {
    console.error('Error updating booking crew:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update crew details'
    });
  }
};

exports.updateClientLeadIntent = async (req, res) => {
  try {
    const { lead_id, intent, notes } = req.body;
    const salesUserId = req.userId;

    if (!['Hot', 'Warm', 'Cold'].includes(intent)) {
      return res.status(400).json({ message: 'Invalid intent' });
    }

    const lead = await client_leads.findByPk(lead_id);
    if (!lead) {
      return res.status(404).json({ message: 'Client lead not found' });
    }

    await lead.update({
      intent,
      intent_updated_by: salesUserId,
      intent_updated_at: new Date()
    });

    await client_lead_activities.create({
      lead_id,
      activity_type: 'intent_updated',
      activity_data: { intent, notes },
      performed_by_user_id: salesUserId
    });

    return res.json({
      success: true,
      message: 'Client lead intent updated successfully'
    });
  } catch (error) {
    console.error('Error updating client lead intent:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to update client lead intent'
    });
  }
};

/**
 * Shared core finalize logic (this is your finalizeGuestBooking logic, reused cleanly).
 * IMPORTANT: no res/json here, pure function.
 */
async function finalizeBookingCore({ booking, bookingId, finalizeBody, tx }) {
  const {
    content_type,
    shoot_type,
    start_date_time,
    start_date,
    start_time,
    end_time,
    duration_hours,
    location,
    crew_roles,
    crew_size,
    selected_crew_ids,
    edits_needed,
    video_edit_types,
    photo_edit_types,
    event_type,
    is_draft,
    skip_discount = true,
    skip_margin = true,
    booking_type,
    booking_days,
    time_zone
  } = finalizeBody;
  const { latitude, longitude } = extractCoordinatesFromPayload(finalizeBody, location);

  /* -----------------------------
  Normalize booking days
  ------------------------------*/

  let normalizedBookingDays = Array.isArray(booking_days) ? booking_days : [];

  normalizedBookingDays = normalizedBookingDays
    .filter((d) => d && d.date)
    .map((d) => ({
      date: d.date,
      start_time: normalizeTime(d.start_time || d.startTime) || null,
      end_time: normalizeTime(d.end_time || d.endTime) || null,
      duration_hours: d.duration_hours != null ? Number(d.duration_hours) : null,
      time_zone: d.time_zone || d.timeZone || time_zone || null
    }));

  const calculateDurationHours = (startTime, endTime) => {
    if (!startTime || !endTime) return null;

    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);

    const diff = (end - start) / 3600000;

    return diff > 0 ? Math.round(diff * 100) / 100 : null;
  };

  /* -----------------------------
  Parse start_date_time
  ------------------------------*/

  const resolvedSingleDay = resolveEventDateAndStartTime({
    start_date,
    start_time,
    start_date_time
  });
  let event_date = resolvedSingleDay.event_date;
  let start_time_final = resolvedSingleDay.start_time;
  let end_time_only = normalizeTime(end_time);

  /* -----------------------------
  Multi-day override
  ------------------------------*/

  let totalDurationHours = null;

  if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {

    normalizedBookingDays.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    event_date = normalizedBookingDays[0].date;
    start_time_final = normalizeTime(normalizedBookingDays[0].start_time) || null;
    end_time_only = normalizeTime(normalizedBookingDays[0].end_time) || null;

    totalDurationHours = normalizedBookingDays.reduce((sum, d) => {

      const hours =
        d.duration_hours ??
        calculateDurationHours(d.start_time, d.end_time);

      return sum + (hours || 0);

    }, 0);

    totalDurationHours =
      totalDurationHours > 0
        ? Math.round(totalDurationHours * 100) / 100
        : null;
  }

  /* -----------------------------
  Booking update
  ------------------------------*/

  const updateData = {};

  if (content_type) updateData.content_type = content_type;
  if (shoot_type) updateData.shoot_type = shoot_type;
  if (event_type) updateData.event_type = event_type;

  if (event_date) updateData.event_date = event_date;
  if (start_time_final) updateData.start_time = start_time_final;
  if (end_time_only) updateData.end_time = end_time_only;

  if (duration_hours != null)
    updateData.duration_hours = parseInt(duration_hours, 10);
  else if (totalDurationHours != null)
    updateData.duration_hours = totalDurationHours;

  if (crew_size != null)
    updateData.crew_size_needed = parseInt(crew_size, 10);

  if (location != null)
    updateData.event_location = safeJsonStringify(location);
  if (location != null || latitude !== null || longitude !== null) {
    updateData.event_latitude = latitude;
    updateData.event_longitude = longitude;
  }

  if (crew_roles != null)
    updateData.crew_roles = safeJsonStringify(crew_roles);

  if (typeof edits_needed !== 'undefined')
    updateData.edits_needed = edits_needed ? 1 : 0;

  if (Array.isArray(video_edit_types))
    updateData.video_edit_types = safeJsonStringify(video_edit_types);

  if (Array.isArray(photo_edit_types))
    updateData.photo_edit_types = safeJsonStringify(photo_edit_types);

  const draftVal = normalizeIsDraft(is_draft);
  if (draftVal !== null) updateData.is_draft = draftVal;

  await booking.update(updateData, { transaction: tx });

  /* -----------------------------
  Save booking days
  ------------------------------*/

  if (booking_type === 'multi_day' && normalizedBookingDays.length > 0) {

    await stream_project_booking_days.destroy({
      where: { stream_project_booking_id: bookingId },
      transaction: tx
    });

    const dayRows = normalizedBookingDays.map((d) => ({
      stream_project_booking_id: bookingId,
      event_date: d.date,
      start_time: normalizeTime(d.start_time),
      end_time: normalizeTime(d.end_time),
      duration_hours:
        d.duration_hours ??
        calculateDurationHours(d.start_time, d.end_time),
      time_zone: d.time_zone
    }));

    await stream_project_booking_days.bulkCreate(dayRows, {
      transaction: tx
    });
  } else if (booking_type === 'single_day') {
    await stream_project_booking_days.destroy({
      where: { stream_project_booking_id: bookingId },
      transaction: tx
    });
  }

  /* -----------------------------
  Assign creators
  ------------------------------*/

  let assignedCreatorIds = [];

  if (Array.isArray(selected_crew_ids)) {

    if (selected_crew_ids.length > 0) {

      const existing = await crew_members.findAll({
        where: { crew_member_id: selected_crew_ids, is_active: 1 },
        attributes: ['crew_member_id'],
        transaction: tx
      });

      const existingIds = new Set(existing.map(x => x.crew_member_id));

      const missing = selected_crew_ids.filter(id => !existingIds.has(id));

      if (missing.length) {
        throw new Error(`Invalid selected_crew_ids: ${missing.join(', ')}`);
      }
    }

    await assigned_crew.destroy({
      where: { project_id: bookingId },
      transaction: tx
    });

    if (selected_crew_ids.length > 0) {

      const assignments = selected_crew_ids.map((creator_id) => ({
        project_id: bookingId,
        crew_member_id: creator_id,
        status: 'selected',
        is_active: 1,
        crew_accept: 0
      }));

      await assigned_crew.bulkCreate(assignments, { transaction: tx });

      assignedCreatorIds =
        [...new Set(selected_crew_ids.map(Number).filter(Boolean))];
    }
  }

  /* -----------------------------
  Pricing
  ------------------------------*/

  const pricingPayload = {
    creator_ids: Array.isArray(selected_crew_ids) ? selected_crew_ids : [],

    shoot_hours:
      duration_hours != null
        ? parseInt(duration_hours, 10)
        : totalDurationHours != null
        ? totalDurationHours
        : booking.duration_hours,

    role_counts: crew_roles || (booking.crew_roles ? JSON.parse(booking.crew_roles) : {}),

    event_type: shoot_type || event_type || booking.shoot_type || booking.event_type,

    shoot_start_date:
      start_date_time ||
      (start_date && (start_time || start_time_final)
        ? `${start_date}T${normalizeTime(start_time || start_time_final)}`
        : null) ||
      (booking.event_date ? `${booking.event_date}T${booking.start_time || '00:00:00'}` : null),

    video_edit_types: Array.isArray(video_edit_types) ? video_edit_types : [],
    photo_edit_types: Array.isArray(photo_edit_types) ? photo_edit_types : [],

    skip_discount: !!skip_discount,
    skip_margin: !!skip_margin
  };

  const pricingData = await calculateFromCreatorsInternally(pricingPayload);

  /* -----------------------------
  Quote management
  ------------------------------*/

  if (booking.quote_id) {
    await quotes.update(
      { status: 'expired' },
      { where: { quote_id: booking.quote_id }, transaction: tx }
    );
  }

  const quote = await persistQuoteFromBreakdown({
    bookingId,
    guest_email: booking.guest_email,
    shootHours: pricingPayload.shoot_hours,
    breakdown: {
      pricingMode: pricingData.quote.pricingMode,
      subtotal: pricingData.quote.subtotal,
      discountPercent: pricingData.quote.discountPercent,
      discountAmount: pricingData.quote.discountAmount,
      priceAfterDiscount: pricingData.quote.priceAfterDiscount,
      marginPercent: pricingData.quote.marginPercent,
      marginAmount: pricingData.quote.marginAmount,
      total: pricingData.quote.total,
      lineItems: pricingData.quote.lineItems.map(li => ({
        item_id: li.item_id,
        name: li.item_name,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total_price: li.line_total
      }))
    },
    tx
  });

  const quoteId = quote.quote_id || quote.id;

  await booking.update({ quote_id: quoteId }, { transaction: tx });

  return {
    quote_id: quoteId,
    assigned_creator_ids: assignedCreatorIds,
    booking: {
      stream_project_booking_id: booking.stream_project_booking_id,
      event_date: booking.event_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      duration_hours: booking.duration_hours,
      event_type: booking.event_type,
      shoot_type: booking.shoot_type,
      content_type: booking.content_type,
      event_location: booking.event_location,
      crew_roles: booking.crew_roles,
      crew_size_needed: booking.crew_size_needed,
      video_edit_types: booking.video_edit_types,
      photo_edit_types: booking.photo_edit_types,
      edits_needed: booking.edits_needed,
      is_draft: booking.is_draft === 1
    },
    quote: pricingData
  };
}

async function updateBookingScheduleAndLocationCore({ booking, bookingId, payload, tx }) {
  const {
    location,
    booking_type,
    booking_days,
    time_zone,
    start_date_time,
    start_date,
    start_time,
    end_time,
    duration_hours
  } = payload;
  const { latitude, longitude } = extractCoordinatesFromPayload(payload, location);

  let normalizedBookingDays = Array.isArray(booking_days) ? booking_days : [];
  normalizedBookingDays = normalizedBookingDays
    .filter((d) => d && d.date)
    .map((d) => ({
      date: d.date,
      start_time: normalizeTime(d.start_time || d.startTime) || null,
      end_time: normalizeTime(d.end_time || d.endTime) || null,
      duration_hours: d.duration_hours != null ? Number(d.duration_hours) : null,
      time_zone: d.time_zone || d.timeZone || time_zone || null
    }));

  const calculateDurationHours = (startTimeValue, endTimeValue) => {
    if (!startTimeValue || !endTimeValue) return null;
    const start = new Date(`1970-01-01T${startTimeValue}`);
    const end = new Date(`1970-01-01T${endTimeValue}`);
    const diff = (end - start) / 3600000;
    return diff > 0 ? Math.round(diff * 100) / 100 : null;
  };

  let resolvedBookingType = booking_type || null;
  if (!resolvedBookingType) {
    if (normalizedBookingDays.length > 0) {
      resolvedBookingType = 'multi_day';
    } else if (start_date || start_time || start_date_time || end_time) {
      resolvedBookingType = 'single_day';
    }
  }

  const resolvedSingleDay = resolveEventDateAndStartTime({
    start_date,
    start_time,
    start_date_time
  });

  let eventDate = resolvedSingleDay.event_date || booking.event_date || null;
  let startTimeFinal = resolvedSingleDay.start_time || booking.start_time || null;
  let endTimeFinal = normalizeTime(end_time) || booking.end_time || null;
  let totalDurationHours = duration_hours != null ? Number(duration_hours) : null;

  if (resolvedBookingType === 'multi_day' && normalizedBookingDays.length > 0) {
    normalizedBookingDays.sort((a, b) => new Date(a.date) - new Date(b.date));
    eventDate = normalizedBookingDays[0].date;
    startTimeFinal = normalizedBookingDays[0].start_time || null;
    endTimeFinal = normalizedBookingDays[0].end_time || null;
    totalDurationHours = normalizedBookingDays.reduce((sum, day) => {
      const hours = day.duration_hours ?? calculateDurationHours(day.start_time, day.end_time);
      return sum + (hours || 0);
    }, 0);
    totalDurationHours = totalDurationHours > 0 ? Math.round(totalDurationHours * 100) / 100 : null;
  } else if (totalDurationHours == null) {
    totalDurationHours = calculateDurationHours(startTimeFinal, endTimeFinal) ?? booking.duration_hours ?? null;
  }

  const updateData = {};
  if (location !== undefined) {
    updateData.event_location = safeJsonStringify(location);
    updateData.event_latitude = latitude;
    updateData.event_longitude = longitude;
  } else {
    if (latitude !== null) updateData.event_latitude = latitude;
    if (longitude !== null) updateData.event_longitude = longitude;
  }
  if (eventDate) updateData.event_date = eventDate;
  if (startTimeFinal) updateData.start_time = startTimeFinal;
  if (endTimeFinal) updateData.end_time = endTimeFinal;
  if (time_zone !== undefined) updateData.time_zone = time_zone || null;
  if (totalDurationHours != null) updateData.duration_hours = totalDurationHours;

  if (Object.keys(updateData).length > 0) {
    await booking.update(updateData, { transaction: tx });
  }

  const shouldRewriteDays =
    resolvedBookingType === 'multi_day' ||
    resolvedBookingType === 'single_day' ||
    Array.isArray(booking_days);

  if (shouldRewriteDays) {
    await stream_project_booking_days.destroy({
      where: { stream_project_booking_id: bookingId },
      transaction: tx
    });

    if (resolvedBookingType === 'multi_day' && normalizedBookingDays.length > 0) {
      await stream_project_booking_days.bulkCreate(
        normalizedBookingDays.map((day) => ({
          stream_project_booking_id: bookingId,
          event_date: day.date,
          start_time: day.start_time,
          end_time: day.end_time,
          duration_hours: day.duration_hours ?? calculateDurationHours(day.start_time, day.end_time),
          time_zone: day.time_zone
        })),
        { transaction: tx }
      );
    }
  }

  const bookingReloaded = await stream_project_booking.findByPk(bookingId, { transaction: tx });
  const bookingDays = await stream_project_booking_days.findAll({
    where: { stream_project_booking_id: bookingId },
    order: [['event_date', 'ASC']],
    transaction: tx
  });

  return {
    booking: bookingReloaded,
    booking_type: resolvedBookingType,
    booking_days: bookingDays.map((day) => ({
      event_date: day.event_date,
      start_time: day.start_time,
      end_time: day.end_time,
      duration_hours: day.duration_hours,
      time_zone: day.time_zone
    }))
  };
}

/**
 * 
 * Body: booking fields + creators/roles + edit types + flags
 */
exports.finalizeGuestBooking = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;

    const {
      content_type,
      shoot_type,
      event_type,
      start_date_time,
      start_date,
      start_time,
      end_time,
      time_zone,
      duration_hours,
      location,
      location_latitude,
      location_longitude,
      crew_roles,
      crew_size,
      selected_crew_ids,
      edits_needed,
      video_edit_types,
      photo_edit_types,
      is_draft,
      skip_discount = true,
      skip_margin = true,
      sales_rep_id,
      booking_type,
      booking_days
    } = req.body;

    if (!id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Booking ID is required' });
    }

    // 1) Load booking
    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: id, is_active: 1 },
      transaction: tx
    });

    if (!booking) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // 2) Run shared finalize core
    const finalizeResult = await finalizeBookingCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      finalizeBody: {
        content_type,
        shoot_type,
        event_type,
        start_date_time,
        start_date,
        start_time,
        end_time,
        time_zone,
        duration_hours,
        location,
        location_latitude,
        location_longitude,
        crew_roles,
        crew_size,
        selected_crew_ids,
        edits_needed,
        video_edit_types,
        photo_edit_types,
        is_draft,
        skip_discount,
        skip_margin,
        booking_type,
        booking_days
      },
      tx
    });

    const linkedLead = await sales_leads.findOne({
      where: { booking_id: booking.stream_project_booking_id },
      attributes: ['lead_id', 'client_name', 'assigned_sales_rep_id'],
      transaction: tx
    });

    if (linkedLead) {
      const assignedSalesRepId = await resolveAssignedSalesRepId({
        requestedSalesRepId: sales_rep_id,
        req,
        currentAssignedSalesRepId: linkedLead.assigned_sales_rep_id,
        tx
      });

      if (assignedSalesRepId !== linkedLead.assigned_sales_rep_id) {
        await linkedLead.update(
          { assigned_sales_rep_id: assignedSalesRepId },
          { transaction: tx }
        );
      }
    }

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Booking finalized',
      data: {
        booking_id: booking.stream_project_booking_id,
        quote_id: finalizeResult.quote_id,
        booking: finalizeResult.booking,
        quote: finalizeResult.quote
      }
    });
  } catch (error) {
    try { await tx.rollback(); } catch (_) {}
    return res.status(500).json({
      success: false,
      message: 'Failed to finalize booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.updateLeadBookingSchedule = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Lead ID is required' });
    }

    const lead = await sales_leads.findOne({
      where: { lead_id: id, is_active: 1 },
      transaction: tx
    });

    if (!lead) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (!lead.booking_id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'No booking found for this lead' });
    }

    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: lead.booking_id, is_active: 1 },
      transaction: tx
    });

    if (!booking) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const result = await updateBookingScheduleAndLocationCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      payload: req.body || {},
      tx
    });

    await lead.update({ last_activity_at: new Date() }, { transaction: tx });

    await sales_lead_activities.create({
      lead_id: lead.lead_id,
      activity_type: 'booking_updated',
      activity_data: {
        booking_id: booking.stream_project_booking_id,
        source: 'sales_portal_schedule_location_edit'
      },
      performed_by_user_id: req.userId || null
    }, { transaction: tx });

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Lead booking schedule and location updated successfully',
      data: {
        lead_id: lead.lead_id,
        booking_id: booking.stream_project_booking_id,
        booking_type: result.booking_type,
        booking: result.booking,
        booking_days: result.booking_days
      }
    });
  } catch (error) {
    try { await tx.rollback(); } catch (_) {}
    return res.status(500).json({
      success: false,
      message: 'Failed to update lead booking schedule and location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.finalizeClientLeadBooking = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;

    const {
      content_type,
      shoot_type,
      event_type,
      start_date_time,
      start_date,
      start_time,
      end_time,
      time_zone,
      duration_hours,
      location,
      location_latitude,
      location_longitude,
      crew_roles,
      crew_size,
      selected_crew_ids,
      edits_needed,
      video_edit_types,
      photo_edit_types,
      is_draft,
      skip_discount = true,
      skip_margin = true,
      sales_rep_id,
      booking_type,
      booking_days
    } = req.body;

    if (!id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Client lead ID is required' });
    }

    const clientLead = await client_leads.findOne({
      where: { lead_id: id },
      transaction: tx
    });

    if (!clientLead) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Client lead not found' });
    }

    if (!clientLead.booking_id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'No booking found for this client lead' });
    }

    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: clientLead.booking_id, is_active: 1 },
      transaction: tx
    });

    if (!booking) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const assignedSalesRepId = await resolveAssignedSalesRepId({
      requestedSalesRepId: sales_rep_id,
      req,
      currentAssignedSalesRepId: clientLead.assigned_sales_rep_id,
      tx
    });

    const finalizeResult = await finalizeBookingCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      finalizeBody: {
        content_type,
        shoot_type,
        event_type,
        start_date_time,
        start_date,
        start_time,
        end_time,
        time_zone,
        duration_hours,
        location,
        location_latitude,
        location_longitude,
        crew_roles,
        crew_size,
        selected_crew_ids,
        edits_needed,
        video_edit_types,
        photo_edit_types,
        is_draft,
        skip_discount,
        skip_margin,
        booking_type,
        booking_days
      },
      tx
    });

    if (clientLead.lead_status !== 'booked' && clientLead.lead_status !== 'abandoned') {
      await clientLead.update(
        {
          lead_status: 'booking_in_progress',
          assigned_sales_rep_id: assignedSalesRepId
        },
        { transaction: tx }
      );
    } else if (assignedSalesRepId !== clientLead.assigned_sales_rep_id) {
      await clientLead.update(
        { assigned_sales_rep_id: assignedSalesRepId },
        { transaction: tx }
      );
    }

    await client_lead_activities.create({
      lead_id: clientLead.lead_id,
      activity_type: 'booking_updated',
      activity_data: {
        booking_id: booking.stream_project_booking_id,
        source: 'sales_portal_edit_client_booking'
      },
      performed_by_user_id: req.userId || null
    }, { transaction: tx });

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Client booking updated successfully',
      data: {
        client_lead_id: clientLead.lead_id,
        booking_id: booking.stream_project_booking_id,
        quote_id: finalizeResult.quote_id,
        booking: finalizeResult.booking,
        quote: finalizeResult.quote
      }
    });
  } catch (error) {
    try { await tx.rollback(); } catch (_) {}
    return res.status(500).json({
      success: false,
      message: 'Failed to update client booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.updateClientLeadBookingSchedule = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;

    if (!id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'Client lead ID is required' });
    }

    const clientLead = await client_leads.findOne({
      where: { lead_id: id, is_active: 1 },
      transaction: tx
    });

    if (!clientLead) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Client lead not found' });
    }

    if (!clientLead.booking_id) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'No booking found for this client lead' });
    }

    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: clientLead.booking_id, is_active: 1 },
      transaction: tx
    });

    if (!booking) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const result = await updateBookingScheduleAndLocationCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      payload: req.body || {},
      tx
    });

    await clientLead.update({ last_activity_at: new Date() }, { transaction: tx });

    await client_lead_activities.create({
      lead_id: clientLead.lead_id,
      activity_type: 'booking_updated',
      activity_data: {
        booking_id: booking.stream_project_booking_id,
        source: 'sales_portal_schedule_location_edit'
      },
      performed_by_user_id: req.userId || null
    }, { transaction: tx });

    await tx.commit();

    return res.status(200).json({
      success: true,
      message: 'Client lead booking schedule and location updated successfully',
      data: {
        client_lead_id: clientLead.lead_id,
        booking_id: booking.stream_project_booking_id,
        booking_type: result.booking_type,
        booking: result.booking,
        booking_days: result.booking_days
      }
    });
  } catch (error) {
    try { await tx.rollback(); } catch (_) {}
    return res.status(500).json({
      success: false,
      message: 'Failed to update client lead booking schedule and location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.confirmLeadCreativePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { crew_member_id } = req.body;

    if (!crew_member_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'crew_member_id is required'
      });
    }

    const result = await confirmCreativePartnerForLead({
      leadId: parseInt(id, 10),
      crewMemberId: parseInt(crew_member_id, 10),
      performedByUserId: req.userId || null,
      isClientLead: false
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error confirming Creative Partner for lead:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to confirm Creative Partner',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.confirmClientLeadCreativePartner = async (req, res) => {
  try {
    const { id } = req.params;
    const { crew_member_id } = req.body;

    if (!crew_member_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'crew_member_id is required'
      });
    }

    const result = await confirmCreativePartnerForLead({
      leadId: parseInt(id, 10),
      crewMemberId: parseInt(crew_member_id, 10),
      performedByUserId: req.userId || null,
      isClientLead: true
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error confirming Creative Partner for client lead:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to confirm Creative Partner',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.softDeleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await softDeleteLeadById({
      leadId: parseInt(id, 10),
      performedByUserId: req.userId || null,
      isClientLead: false
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error soft deleting lead:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to delete lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.softDeleteClientLead = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await softDeleteLeadById({
      leadId: parseInt(id, 10),
      performedByUserId: req.userId || null,
      isClientLead: true
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error soft deleting client lead:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to delete client lead',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /v1/sales/deals/finalize
 * Single API for Create New Deal "Continue" button:
 * - Creates sales_leads + stream_project_booking (draft)
 * - Runs finalize flow: booking update + assigned crew + pricing + quote + attach quote_id
 */
exports.finalizeCreateDeal = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const {
      // Client / lead fields
      client_lead_id = null,
      user_id = null,
      client_name = null,
      guest_email = null,
      phone = null,
      lead_type = 'sales_assisted',
      intent = 'Warm',
      lead_source = null,

      // Booking fields
      content_type,
      shoot_type,
      event_type,
      start_date_time,
      start_date,
      start_time,
      end_time,
      time_zone,
      duration_hours,
      location,
      location_latitude,
      location_longitude,
      crew_roles,
      crew_size,
      selected_crew_ids,
      edits_needed,
      video_edit_types,
      photo_edit_types,
      is_draft,
      sales_rep_id,

      // pricing flags
      skip_discount = true,
      skip_margin = true,
      booking_type,
      booking_days
    } = req.body;

    if (!user_id && !guest_email) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: 'guest_email or user_id is required'
      });
    }

    // Load user if provided
    let user = null;
    if (user_id) {
      user = await users.findOne({
        where: { id: user_id, is_active: 1 },
        transaction: tx
      });

      if (!user) {
        await tx.rollback();
        return res.status(404).json({
          success: false,
          message: 'user not found'
        });
      }
    }

    const resolvedEmail = guest_email || user?.email || null;
    const resolvedName = client_name || user?.name || null;
    const resolvedPhone = phone || user?.phone_number || null;

    if (!resolvedEmail) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: 'guest_email is required'
      });
    }

    let existingClientLead = null;
    if (client_lead_id) {
      existingClientLead = await client_leads.findOne({
        where: { lead_id: client_lead_id },
        transaction: tx
      });

      if (!existingClientLead) {
        await tx.rollback();
        return res.status(404).json({
          success: false,
          message: 'client lead not found'
        });
      }
    }

    // 1️⃣ Create booking shell
    const booking = await stream_project_booking.create(
      {
        user_id: user_id || null,
        guest_email: resolvedEmail,
        project_name: buildDealProjectName({
          shootType: shoot_type,
          contentType: content_type,
          clientName: resolvedName,
          guestEmail: resolvedEmail
        }),
        streaming_platforms: JSON.stringify([]),
        crew_roles: JSON.stringify(crew_roles ?? {}),
        is_draft: 1,
        is_active: 1,
      },
      { transaction: tx }
    );

    // 2️⃣ Create or update lead
    const leadModel = user_id ? client_leads : sales_leads;
    let lead = null;

    if (client_lead_id && user_id) {
      await existingClientLead.update(
        {
          booking_id: booking.stream_project_booking_id,
          user_id: user_id || existingClientLead.user_id || null,
          guest_email: resolvedEmail,
          phone: resolvedPhone,
          client_name: resolvedName,
          lead_type,
          intent,
          lead_source,
          lead_status: 'booking_in_progress',
          created_from: 1
        },
        { transaction: tx }
      );
      lead = existingClientLead;
    } else {
      lead = await leadModel.create(
        {
          booking_id: booking.stream_project_booking_id,
          user_id: user_id || null,
          guest_email: resolvedEmail,
          phone: resolvedPhone,
          client_name: resolvedName,
          lead_type,
          intent,
          lead_source,
          lead_status: 'manual_lead_created',
          created_from: 1 // 1 = web
        },
        { transaction: tx }
      );
    }

    // 3️⃣ Create lead activity
    if (!user_id) {
      await sales_lead_activities.create(
        {
          lead_id: lead.lead_id,
          activity_type: 'created',
          activity_data: {
            source: 'sales_portal_create_deal',
            guest_email: resolvedEmail,
            lead_source: lead_source || null
          }
        },
        { transaction: tx }
      );
    } else if (client_lead_id) {
      await client_lead_activities.create(
        {
          lead_id: lead.lead_id,
          activity_type: 'booking_updated',
          activity_data: {
            source: 'sales_portal_create_deal',
            booking_id: booking.stream_project_booking_id,
            guest_email: resolvedEmail,
            lead_source: lead_source || null
          },
          performed_by_user_id: req.userId || null
        },
        { transaction: tx }
      );
    } else {
      await client_lead_activities.create(
        {
          lead_id: lead.lead_id,
          activity_type: 'created',
          activity_data: {
            source: 'sales_portal_create_deal',
            guest_email: resolvedEmail,
            lead_source: lead_source || null
          }
        },
        { transaction: tx }
      );
    }

    // ASSIGN SALES REP
    let assignedRep = null;
    const assignedSalesRepId = await resolveAssignedSalesRepId({
      requestedSalesRepId: sales_rep_id,
      req,
      currentAssignedSalesRepId: lead.assigned_sales_rep_id,
      tx
    });

    if (assignedSalesRepId) {
      assignedRep = await users.findByPk(assignedSalesRepId, {
        attributes: ['id', 'name'],
        transaction: tx
      });
    } else {
      // TEMP FLOW:
      // Admin/Sales Admin created leads should stay with creator (resolveAssignedSalesRepId already handles this).
      // Old random/auto assignment logic kept commented for easy rollback.
      // assignedRep = await leadAssignmentService.autoAssignLead(
      //   lead.lead_id,
      //   { transaction: tx, leadModel }
      // );
      assignedRep = req.userId
        ? await users.findByPk(req.userId, {
            attributes: ['id', 'name'],
            transaction: tx
          })
        : null;
    }
    if (assignedRep?.id) {
      await lead.update(
        { assigned_sales_rep_id: assignedRep.id },
        { transaction: tx }
      );
    }

    // 5️⃣ Finalize booking
    const finalizeResult = await finalizeBookingCore({
      booking,
      bookingId: booking.stream_project_booking_id,
      finalizeBody: {
        content_type,
        shoot_type,
        event_type,
        start_date_time,
        start_date,
        start_time,
        end_time,
        time_zone,
        duration_hours,
        location,
        location_latitude,
        location_longitude,
        crew_roles,
        crew_size,
        selected_crew_ids,
        edits_needed,
        video_edit_types,
        photo_edit_types,
        is_draft,
        skip_discount,
        skip_margin,
        booking_type,
        booking_days
      },
      tx
    });

    await tx.commit();
    
    return res.status(200).json({
      success: true,
      message: 'Deal created & booking finalized',
      data: {
        lead_id: lead.lead_id,
        booking_id: booking.stream_project_booking_id,
        quote_id: finalizeResult.quote_id,
        assigned_to: assignedRep ? assignedRep.name : null,
        booking: finalizeResult.booking,
        quote: finalizeResult.quote
      }
    });

  } catch (error) {
    try { await tx.rollback(); } catch (_) {}

    console.error('Error in finalizeCreateDeal:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create & finalize deal',
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : undefined
    });
  }
};

module.exports = exports;
