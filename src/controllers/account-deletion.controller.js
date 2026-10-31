const db = require('../models');
const accountDeletionRequestService = require('../services/account-deletion-request.service')({ db });
const passwordExpiryService = require('../services/internal-password-expiry.service');
const passwordResetService = require('../services/password-reset.service')({
  db,
  emailService: require('../utils/emailService'),
  passwordExpiryService,
});

exports.verifyOtp = async (req, res) => {
  try {
    const userId = Number(req.user?.userId);
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ success: false, message: 'Authentication is required.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, code: 'OTP_INVALID', message: 'Enter the 6-digit verification code.' });
    }

    const verification = await passwordResetService.verify({ id: userId }, 'deletion', otp);
    const { status: verificationStatus = 200, ...verificationBody } = verification;
    if (!verificationBody.success) {
      if (verificationStatus === 429) res.set('Retry-After', String(verificationBody.retry_after_seconds));
      res.set('Cache-Control', 'no-store');
      return res.status(verificationStatus).json(verificationBody);
    }

    const request = await accountDeletionRequestService.create(userId);
    const { status = 201, ...requestBody } = request;
    if (!requestBody.success) {
      res.set('Cache-Control', 'no-store');
      return res.status(status).json(requestBody);
    }
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Email verified and account deletion request submitted.',
      data: requestBody.data,
    });
  } catch (error) {
    console.error('Verify account deletion OTP failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to verify the code and submit the request.' });
  }
};

exports.listRequests = async (_req, res) => {
  try {
    const requests = await accountDeletionRequestService.list();
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error('List account deletion requests failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load account deletion requests.' });
  }
};

exports.getMyRequest = async (req, res) => {
  try {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ success: false, message: 'Authentication is required.' });
    }
    const request = await accountDeletionRequestService.getActive(userId);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, data: request });
  } catch (error) {
    console.error('Get current account deletion request failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load the account deletion request.' });
  }
};

exports.cancelMyRequest = async (req, res) => {
  try {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ success: false, message: 'Authentication is required.' });
    }
    const result = await accountDeletionRequestService.cancelForUser(userId);
    const { status = 200, ...body } = result;
    res.set('Cache-Control', 'no-store');
    return res.status(status).json(body);
  } catch (error) {
    console.error('Cancel account deletion request failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to cancel the account deletion request.' });
  }
};

exports.cancelByAdmin = async (req, res) => {
  try {
    const requestCode = String(req.params.requestCode || '').trim();
    if (!/^DEL-\d{6,}$/.test(requestCode)) {
      return res.status(400).json({ success: false, message: 'A valid deletion request ID is required.' });
    }
    const result = await accountDeletionRequestService.cancelByAdmin(requestCode);
    const { status = 200, ...body } = result;
    res.set('Cache-Control', 'no-store');
    return res.status(status).json(body);
  } catch (error) {
    console.error('Admin cancel account deletion request failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to cancel the account deletion request.' });
  }
};

exports.acceptByAdmin = async (req, res) => {
  try {
    const requestCode = String(req.params.requestCode || '').trim();
    if (!/^DEL-\d{6,}$/.test(requestCode)) {
      return res.status(400).json({ success: false, message: 'A valid deletion request ID is required.' });
    }
    const result = await accountDeletionRequestService.acceptByAdmin(requestCode);
    const { status = 200, ...body } = result;
    res.set('Cache-Control', 'no-store');
    return res.status(status).json(body);
  } catch (error) {
    console.error('Admin accept account deletion request failed:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to accept the account deletion request.' });
  }
};
