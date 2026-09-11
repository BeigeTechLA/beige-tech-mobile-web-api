const multer = require('multer');
const path = require('path');
const config = require('../config/config');
const db = require('../models');
const { S3UploadFiles, toAbsoluteBeigeAssetUrl } = require('../utils/common');

const PAYMENT_METHODS = new Set(['wire_transfer', 'zelle']);
const REVIEW_STATUSES = new Set(['paid', 'partially_paid', 'rejected', 'needs_follow_up']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, done) => done(null, path.join(__dirname, '../../public/uploads/media')),
    filename: (req, file, done) => done(null, `${Date.now()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, done) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    done(allowed.includes(file.mimetype) ? null : new Error('Proof file must be a JPEG, PNG, WEBP, or PDF.'), allowed.includes(file.mimetype));
  }
});

async function findUsablePaymentLink(token) {
  const paymentLink = await db.payment_links.findOne({ where: { link_token: token } });
  if (!paymentLink) return { error: 'Payment link was not found.', status: 404 };
  if (paymentLink.is_used) return { error: 'This payment link has already been used.', status: 409 };
  if (new Date(paymentLink.expires_at) < new Date()) return { error: 'This payment link has expired.', status: 410 };
  return { paymentLink };
}

function amountDue(paymentLink) {
  return Number(paymentLink.requested_amount || 0);
}

exports.getInstructions = async (req, res) => {
  try {
    const result = await findUsablePaymentLink(req.params.token);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });
    const { paymentLink } = result;
    return res.json({
      success: true,
      data: {
        booking_id: paymentLink.booking_id,
        payment_reference: `BOOKING-${paymentLink.booking_id}`,
        amount_due: amountDue(paymentLink),
        zelle: {
          recipient_name: config.payments.zelleRecipientName,
          recipient_contact: config.payments.zelleRecipientContact
        },
        wire_transfer: {
          bank_name: config.payments.wireBankName,
          account_holder_name: config.payments.wireAccountHolderName,
          routing_number: config.payments.wireRoutingNumber,
          account_number: config.payments.wireAccountNumber,
          swift_bic: config.payments.wireSwiftBic || null
        }
      }
    });
  } catch (error) {
    console.error('Get offline payment instructions error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch payment instructions.' });
  }
};

exports.submitConfirmation = [upload.single('proof_file'), async (req, res) => {
  try {
    const result = await findUsablePaymentLink(req.params.token);
    if (result.error) return res.status(result.status).json({ success: false, message: result.error });
    const { paymentLink } = result;
    const paymentMethod = String(req.body.payment_method || '').trim().toLowerCase();
    const submittedAmount = Number(req.body.payment_amount);
    const paymentReference = String(req.body.payment_reference || '').trim();
    if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ success: false, message: 'payment_method must be wire_transfer or zelle.' });
    if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) return res.status(400).json({ success: false, message: 'payment_amount must be greater than zero.' });
    if (!paymentReference) return res.status(400).json({ success: false, message: 'payment_reference is required.' });
    if (!req.file) return res.status(400).json({ success: false, message: 'proof_file is required.' });

    const uploaded = await S3UploadFiles({ proof_file: [req.file] }, { prefix: 'offline-customer-payments' });
    const proofFileUrl = uploaded?.[0]?.file_path;
    if (!proofFileUrl) return res.status(500).json({ success: false, message: 'Failed to store proof file.' });

    const existing = await db.offline_customer_payment_submissions.findOne({ where: { payment_link_id: paymentLink.payment_link_id } });
    if (existing && existing.status !== 'rejected' && existing.status !== 'needs_follow_up') {
      return res.status(409).json({ success: false, message: 'A payment confirmation is already awaiting review.' });
    }
    const payload = {
      booking_id: paymentLink.booking_id, payment_method: paymentMethod, submitted_amount: submittedAmount,
      payment_reference: paymentReference, proof_file_url: proofFileUrl,
      customer_note: String(req.body.customer_note || '').trim() || null, status: 'pending_verification',
      reviewed_by: null, reviewed_at: null, review_notes: null, updated_at: new Date()
    };
    const submission = existing
      ? await existing.update(payload)
      : await db.offline_customer_payment_submissions.create({ payment_link_id: paymentLink.payment_link_id, ...payload });
    return res.status(existing ? 200 : 201).json({ success: true, data: { submission_id: submission.offline_payment_submission_id, status: submission.status } });
  } catch (error) {
    console.error('Submit offline payment confirmation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit payment confirmation.' });
  }
}];

exports.listSubmissions = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map((value) => value.trim());
      if (statuses.some((status) => !['pending_verification', ...REVIEW_STATUSES].includes(status))) return res.status(400).json({ success: false, message: 'Invalid status filter.' });
      where.status = statuses;
    }
    const rows = await db.offline_customer_payment_submissions.findAll({ where, order: [['created_at', 'DESC']], include: [{ model: db.stream_project_booking, as: 'booking', attributes: ['stream_project_booking_id', 'project_name', 'guest_email'] }, { model: db.users.scope('all'), as: 'reviewer', required: false, attributes: ['id', 'name', 'email'] }] });
    return res.json({ success: true, data: rows.map((row) => ({ ...row.toJSON(), proof_file_url: toAbsoluteBeigeAssetUrl(row.proof_file_url) })) });
  } catch (error) { console.error('List offline payment submissions error:', error); return res.status(500).json({ success: false, message: 'Failed to list payment submissions.' }); }
};

exports.getSubmission = async (req, res) => {
  const submission = await db.offline_customer_payment_submissions.findByPk(req.params.id, { include: [{ model: db.stream_project_booking, as: 'booking', attributes: ['stream_project_booking_id', 'project_name', 'guest_email'] }, { model: db.users.scope('all'), as: 'reviewer', required: false, attributes: ['id', 'name', 'email'] }] });
  if (!submission) return res.status(404).json({ success: false, message: 'Payment submission not found.' });
  return res.json({ success: true, data: { ...submission.toJSON(), proof_file_url: toAbsoluteBeigeAssetUrl(submission.proof_file_url) } });
};

exports.reviewSubmission = async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    if (!REVIEW_STATUSES.has(status)) return res.status(400).json({ success: false, message: 'status must be paid, partially_paid, rejected, or needs_follow_up.' });
    const submission = await db.offline_customer_payment_submissions.findByPk(req.params.id);
    if (!submission) return res.status(404).json({ success: false, message: 'Payment submission not found.' });
    await submission.update({ status, review_notes: String(req.body.review_notes || '').trim() || null, reviewed_by: req.userId, reviewed_at: new Date(), updated_at: new Date() });
    if (status === 'paid') {
      await db.payment_links.update(
        { is_used: 1, used_at: new Date() },
        { where: { payment_link_id: submission.payment_link_id } }
      );
    }
    return res.json({ success: true, data: submission });
  } catch (error) { console.error('Review offline payment submission error:', error); return res.status(500).json({ success: false, message: 'Failed to review payment submission.' }); }
};
