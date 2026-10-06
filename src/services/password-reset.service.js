const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

const OTP_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const hashProof = (value) => crypto.createHash('sha256').update(value).digest('hex');
const millis = (value) => value ? new Date(value).getTime() : 0;
const failure = (status, message, extra = {}) => ({ status, success: false, message, ...extra });

// Inject dependencies to test without connecting to a database or sending email.
module.exports = function createPasswordResetService({ db, emailService, passwordExpiryService, now = Date.now }) {
  async function lockedUser(identity, transaction) {
    return db.users.findOne({
      where: { ...identity, is_active: 1 }, transaction, lock: transaction.LOCK.UPDATE,
      include: [{ model: db.user_type, as: 'userType', attributes: ['user_type_id', 'user_role', 'is_internal_member'] }]
    });
  }

  function blocked(user) {
    const remaining = millis(user.password_reset_blocked_until) - now();
    return remaining > 0 ? failure(429, 'Too many failed OTP attempts. Please try again after the countdown.', {
      code: 'OTP_BLOCKED', retry_after_seconds: Math.ceil(remaining / 1000)
    }) : null;
  }

  async function request(identity, purpose) {
    return db.sequelize.transaction(async (transaction) => {
      const user = await lockedUser(identity, transaction);
      const response = { success: true, retry_after_seconds: 60, message: purpose === 'forgot'
        ? 'If an active account exists for this email, a verification code has been sent.'
        : 'A verification code has been sent to your registered email.' };
      if (!user) return purpose === 'forgot' ? response : failure(403, 'Password expiry verification is not available for this account.');
      if (purpose === 'expiry') {
        const status = await passwordExpiryService.getExpiryStatus(user, Number(user.userType?.is_internal_member) === 1);
        if (!status.expired) return failure(403, 'Password expiry verification is not available for this account.');
      }
      const lockout = blocked(user);
      if (lockout) return lockout;
      const remaining = millis(user.password_reset_sent_at) + RESEND_MS - now();
      if (remaining > 0) return failure(429, 'Please wait before requesting another verification code.', {
        code: 'OTP_COOLDOWN', retry_after_seconds: Math.ceil(remaining / 1000)
      });
      const otp = String(crypto.randomInt(100000, 1000000));
      const sent = await emailService.sendPasswordExpiryOTP({ name: user.name, email: user.email }, otp);
      if (!sent.success) return failure(503, 'We could not send a verification code. Please try again later.');
      await user.update({
        password_expiry_otp_hash: await bcrypt.hash(otp, 10),
        password_expiry_otp_expires_at: new Date(now() + OTP_MS),
        password_expiry_otp_verified_at: null,
        // Resending or switching flows cannot evade the failed-attempt limit.
        password_expiry_otp_attempts: user.password_reset_blocked_until ? 0 : Number(user.password_expiry_otp_attempts || 0),
        password_reset_blocked_until: null, password_reset_sent_at: new Date(now()),
        password_reset_purpose: purpose, password_reset_proof_hash: null,
        password_reset_version: user.permissions_version
      }, { transaction });
      return response;
    });
  }

  async function verify(identity, purpose, otp) {
    return db.sequelize.transaction(async (transaction) => {
      const user = await lockedUser(identity, transaction);
      if (!user) return failure(400, 'Invalid or expired verification code.');
      const lockout = blocked(user);
      if (lockout) return lockout;
      if (user.password_reset_purpose !== purpose || !user.password_expiry_otp_hash ||
          Number(user.password_reset_version) !== Number(user.permissions_version) ||
          millis(user.password_expiry_otp_expires_at) <= now()) {
        return failure(400, 'The verification code is invalid or expired. Please request a new code.', { code: 'OTP_EXPIRED' });
      }
      if (typeof otp !== 'string' || !/^\d{6}$/.test(otp) || !await bcrypt.compare(otp, user.password_expiry_otp_hash)) {
        const attempts = Number(user.password_expiry_otp_attempts || 0) + 1;
        await user.update({
          password_expiry_otp_attempts: attempts,
          ...(attempts >= 5 ? { password_reset_blocked_until: new Date(now() + BLOCK_MS),
            password_expiry_otp_hash: null, password_reset_proof_hash: null } : {})
        }, { transaction });
        return attempts >= 5 ? blocked(user) : failure(400, 'Incorrect verification code. Please try again.', { attempts_remaining: 5 - attempts });
      }
      const resetProof = crypto.randomBytes(32).toString('hex');
      await user.update({ password_expiry_otp_verified_at: new Date(now()),
        password_expiry_otp_hash: null, password_reset_proof_hash: hashProof(resetProof)
      }, { transaction });
      return { success: true, resetProof, message: 'Email verified. You can now set a new password.' };
    });
  }

  async function complete(identity, purpose, body, issueSession) {
    return db.sequelize.transaction(async (transaction) => {
      const user = await lockedUser(identity, transaction);
      const { currentPassword, newPassword, confirmPassword, resetProof } = body || {};
      if (!user || typeof resetProof !== 'string' || !/^[a-f0-9]{64}$/.test(resetProof) ||
          !user.password_reset_proof_hash || hashProof(resetProof) !== user.password_reset_proof_hash ||
          user.password_reset_purpose !== purpose || !user.password_expiry_otp_verified_at ||
          millis(user.password_expiry_otp_verified_at) + OTP_MS <= now() ||
          Number(user.password_reset_version) !== Number(user.permissions_version)) {
        return failure(403, 'Verify your email again before changing your password.', { code: 'RESET_VERIFICATION_REQUIRED' });
      }
      if (purpose === 'expiry' && (typeof currentPassword !== 'string' || !currentPassword)) {
        return failure(400, 'Enter your current password.');
      }
      if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string' || newPassword !== confirmPassword || newPassword.length < 8) {
        return failure(400, 'Passwords must match and be at least 8 characters long.');
      }
      // bcrypt only considers the first 72 bytes; do not silently truncate.
      if (Buffer.byteLength(newPassword, 'utf8') > 72) return failure(400, 'Use a password of at most 72 UTF-8 bytes.');
      if (purpose === 'expiry' && (!user.password_hash || !await bcrypt.compare(currentPassword, user.password_hash))) {
        return failure(400, 'Your current password is incorrect.');
      }
      if (user.password_hash && await bcrypt.compare(newPassword, user.password_hash)) {
        return failure(400, 'Your new password must be different from your current password.');
      }
      const changedAt = new Date(now());
      await user.update({
        password_hash: await bcrypt.hash(newPassword, 10), password_changed_at: changedAt,
        permissions_version: Number(user.permissions_version || 1) + 1, updated_at: changedAt,
        reset_token: null, reset_token_expiry: null,
        password_expiry_otp_hash: null, password_expiry_otp_expires_at: null,
        password_expiry_otp_verified_at: null, password_expiry_otp_attempts: 0,
        password_reset_proof_hash: null, password_reset_purpose: null,
        password_reset_sent_at: null, password_reset_blocked_until: null, password_reset_version: null
      }, { transaction });
      await db.user_login_history.update({ logged_out_at: changedAt }, { where: { user_id: user.id, logged_out_at: null }, transaction });
      // Consume the proof, revoke old sessions and create the new login atomically.
      // Failed session creation must roll the password change back as well.
      const auth = await issueSession(user, transaction);
      return { success: true, message: 'Password updated successfully.', ...auth };
    });
  }

  return { request, verify, complete };
};
