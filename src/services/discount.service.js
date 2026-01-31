const crypto = require('crypto');
const { discount_codes, discount_code_usage } = require('../models');
const { Op } = require('sequelize');

/**
 * Generate a unique discount code
 * Format: PREFIX + 6 random alphanumeric characters (e.g., REV10A2B3)
 * @returns {Promise<string>} Unique code
 */
async function generateUniqueCode() {
  const prefix = process.env.DISCOUNT_CODE_PREFIX || 'REV';
  const length = parseInt(process.env.DISCOUNT_CODE_LENGTH || '8') - prefix.length;
  
  let code;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate random alphanumeric string
    const randomPart = crypto.randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .toUpperCase()
      .slice(0, length);
    
    code = `${prefix}${randomPart}`;
    
    // Check if code already exists
    const existing = await discount_codes.findOne({
      where: { code }
    });
    
    if (!existing) {
      return code;
    }
    
    attempts++;
  }
  
  throw new Error('Failed to generate unique discount code after multiple attempts');
}

/**
 * Validate discount code format
 * @param {string} code - Code to validate
 * @returns {boolean}
 */
function validateCodeFormat(code) {
  if (!code || typeof code !== 'string') {
    return false;
  }
  
  // Code should be alphanumeric, 4-20 characters
  const regex = /^[A-Z0-9]{4,20}$/;
  return regex.test(code);
}

/**
 * Check if a discount code is available and valid
 * @param {string} code - Code to check
 * @param {number|null} bookingId - Optional booking ID to validate discount is for specific booking
 * @returns {Promise<{valid: boolean, reason?: string, discountCode?: Object}>}
 */
async function checkCodeAvailability(code, bookingId = null) {
  if (!validateCodeFormat(code)) {
    return { valid: false, reason: 'Invalid code format' };
  }
  
  const discountCode = await discount_codes.findOne({
    where: { code }
  });
  
  if (!discountCode) {
    return { valid: false, reason: 'Code not found' };
  }
  
  // Check if active
  if (!discountCode.is_active) {
    return { valid: false, reason: 'Code is inactive' };
  }
  
  // Check expiration
  if (discountCode.expires_at && new Date() > new Date(discountCode.expires_at)) {
    return { valid: false, reason: 'Code has expired' };
  }
  
  // Check usage limits
  if (discountCode.usage_type === 'one_time' && discountCode.current_uses >= 1) {
    return { valid: false, reason: 'Code has already been used' };
  }
  
  if (discountCode.usage_type === 'multi_use' && 
      discountCode.max_uses && 
      discountCode.current_uses >= discountCode.max_uses) {
    return { valid: false, reason: 'Code has reached usage limit' };
  }
  
  // Check if discount is restricted to a specific booking
  if (discountCode.booking_id && bookingId && discountCode.booking_id !== parseInt(bookingId)) {
    return { valid: false, reason: 'This discount code is not valid for this booking' };
  }
  
  return { valid: true, discountCode };
}

/**
 * Calculate discount amount based on discount code
 * @param {number} subtotal - Original amount before discount
 * @param {Object} discountCode - Discount code object
 * @returns {{discountAmount: number, finalAmount: number}}
 */
function calculateDiscountAmount(subtotal, discountCode) {
  let discountAmount = 0;
  
  if (discountCode.discount_type === 'percentage') {
    discountAmount = (subtotal * discountCode.discount_value) / 100;
  } else if (discountCode.discount_type === 'fixed_amount') {
    discountAmount = Math.min(discountCode.discount_value, subtotal);
  }
  
  // Round to 2 decimal places
  discountAmount = Math.round(discountAmount * 100) / 100;
  const finalAmount = Math.max(0, subtotal - discountAmount);
  
  return {
    discountAmount,
    finalAmount: Math.round(finalAmount * 100) / 100
  };
}

/**
 * Increment usage count for a discount code
 * @param {number} discountCodeId - Discount code ID
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
async function incrementUsageCount(discountCodeId, transaction = null) {
  const options = {
    where: { discount_code_id: discountCodeId }
  };
  
  if (transaction) {
    options.transaction = transaction;
  }
  
  await discount_codes.increment('current_uses', options);
}

/**
 * Log discount code usage
 * @param {number} discountCodeId - Discount code ID
 * @param {number} bookingId - Booking ID
 * @param {number|null} userId - User ID (null for guest)
 * @param {string|null} guestEmail - Guest email
 * @param {number} originalAmount - Original amount before discount
 * @param {number} discountAmount - Discount amount applied
 * @param {number} finalAmount - Final amount after discount
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} Usage record
 */
async function logUsage(
  discountCodeId,
  bookingId,
  userId,
  guestEmail,
  originalAmount,
  discountAmount,
  finalAmount,
  transaction
) {
  return await discount_code_usage.create({
    discount_code_id: discountCodeId,
    booking_id: bookingId,
    user_id: userId,
    guest_email: guestEmail,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    final_amount: finalAmount
  }, { transaction });
}

/**
 * Get discount code statistics
 * @param {number} discountCodeId - Discount code ID
 * @returns {Promise<Object>} Statistics
 */
async function getCodeStatistics(discountCodeId) {
  const usageRecords = await discount_code_usage.findAll({
    where: { discount_code_id: discountCodeId }
  });
  
  const totalRevenue = usageRecords.reduce((sum, record) => 
    sum + parseFloat(record.final_amount), 0
  );
  
  const totalDiscount = usageRecords.reduce((sum, record) => 
    sum + parseFloat(record.discount_amount), 0
  );
  
  return {
    total_uses: usageRecords.length,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_discount_given: Math.round(totalDiscount * 100) / 100,
    average_order_value: usageRecords.length > 0 
      ? Math.round((totalRevenue / usageRecords.length) * 100) / 100 
      : 0
  };
}

/**
 * Deactivate a discount code
 * @param {number} discountCodeId - Discount code ID
 * @returns {Promise<void>}
 */
async function deactivateCode(discountCodeId) {
  await discount_codes.update(
    { is_active: 0 },
    { where: { discount_code_id: discountCodeId } }
  );
}

/**
 * Get active discount codes for a lead
 * @param {number} leadId - Lead ID
 * @returns {Promise<Array>} Array of active discount codes
 */
async function getActiveCodesForLead(leadId) {
  return await discount_codes.findAll({
    where: {
      lead_id: leadId,
      is_active: 1,
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } }
      ]
    },
    order: [['created_at', 'DESC']]
  });
}

module.exports = {
  generateUniqueCode,
  validateCodeFormat,
  checkCodeAvailability,
  calculateDiscountAmount,
  incrementUsageCount,
  logUsage,
  getCodeStatistics,
  deactivateCode,
  getActiveCodesForLead
};
