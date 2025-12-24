const crypto = require('crypto');

/**
 * OTP Service
 * Handles OTP generation, validation, and expiry logic
 */

/**
 * Generate random 6-digit OTP
 * @returns {string} 6-digit OTP
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Generate OTP expiry time
 * @param {number} minutes - Minutes until expiry (default: 10)
 * @returns {Date} Expiry timestamp
 */
const generateOTPExpiry = (minutes = 10) => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + minutes);
  return expiry;
};

/**
 * Check if OTP is expired
 * @param {Date} expiryDate - OTP expiry timestamp
 * @returns {boolean} True if expired
 */
const isOTPExpired = (expiryDate) => {
  if (!expiryDate) return true;
  return new Date() > new Date(expiryDate);
};

/**
 * Validate OTP
 * @param {string} inputOTP - OTP entered by user
 * @param {string} storedOTP - OTP stored in database
 * @param {Date} expiryDate - OTP expiry timestamp
 * @returns {Object} Validation result
 */
const validateOTP = (inputOTP, storedOTP, expiryDate) => {
  // Check if OTP exists
  if (!storedOTP) {
    return {
      valid: false,
      error: 'NO_OTP',
      message: 'No OTP found. Please request a new one.'
    };
  }

  // Check if OTP is expired
  if (isOTPExpired(expiryDate)) {
    return {
      valid: false,
      error: 'EXPIRED',
      message: 'OTP has expired. Please request a new one.'
    };
  }

  // Check if OTP matches
  if (inputOTP !== storedOTP) {
    return {
      valid: false,
      error: 'INVALID',
      message: 'Invalid OTP. Please try again.'
    };
  }

  return {
    valid: true,
    message: 'OTP verified successfully'
  };
};

/**
 * Generate reset token for password reset
 * @returns {string} Hex token
 */
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Generate token expiry (default 1 hour)
 * @param {number} hours - Hours until expiry
 * @returns {Date} Expiry timestamp
 */
const generateTokenExpiry = (hours = 1) => {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  return expiry;
};

/**
 * Check rate limiting for OTP requests
 * @param {Date} lastOTPSentAt - Timestamp of last OTP sent
 * @param {number} limitMinutes - Minimum minutes between requests (default: 1)
 * @returns {Object} Rate limit result
 */
const checkOTPRateLimit = (lastOTPSentAt, limitMinutes = 1) => {
  if (!lastOTPSentAt) {
    return {
      allowed: true,
      remainingTime: 0
    };
  }

  const now = new Date();
  const lastSent = new Date(lastOTPSentAt);
  const diffMs = now - lastSent;
  const diffMinutes = diffMs / 1000 / 60;

  if (diffMinutes < limitMinutes) {
    const remainingSeconds = Math.ceil((limitMinutes * 60) - (diffMs / 1000));
    return {
      allowed: false,
      remainingTime: remainingSeconds,
      message: `Please wait ${remainingSeconds} seconds before requesting another OTP`
    };
  }

  return {
    allowed: true,
    remainingTime: 0
  };
};

module.exports = {
  generateOTP,
  generateOTPExpiry,
  isOTPExpired,
  validateOTP,
  generateResetToken,
  generateTokenExpiry,
  checkOTPRateLimit
};
