const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const { payment_links } = require('../models');

/**
 * Generate a secure payment link token
 * @returns {string} Secure random token (32 characters)
 */
function generateLinkToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Build complete payment URL
 * @param {string} token - Payment link token
 * @param {string|null} discountCode - Optional discount code to pre-apply
 * @returns {string} Full payment URL
 */
function buildPaymentUrl(token, discountCode = null) {
  const baseUrl = process.env.FRONTEND_URL || 'https://beige.app';
  let url = `${baseUrl}/payment-link/${token}`;
  
  if (discountCode) {
    url += `?discount=${discountCode}`;
  }
  
  return url;
}

/**
 * Check if payment link is valid and not expired
 * @param {string} linkToken - Link token to check
 * @returns {Promise<{valid: boolean, reason?: string, paymentLink?: Object}>}
 */
async function checkLinkExpiration(linkToken) {
  const paymentLink = await payment_links.findOne({
    where: { link_token: linkToken },
    include: [
      { association: 'booking' },
      { association: 'discount_code' },
      { association: 'lead' }
    ]
  });
  
  if (!paymentLink) {
    return { valid: false, reason: 'Payment link not found' };
  }
  
  // Check if already used
  if (paymentLink.is_used) {
    return { 
      valid: false, 
      reason: 'Payment link has already been used',
      paymentLink 
    };
  }
  
  // Check expiration
  if (new Date() > new Date(paymentLink.expires_at)) {
    return { 
      valid: false, 
      reason: 'Payment link has expired',
      paymentLink 
    };
  }
  
  return { valid: true, paymentLink };
}

/**
 * Get default expiration date for payment links
 * @returns {Date} Expiration date (default: 72 hours from now)
 */
function getDefaultExpiration() {
  const hours = parseInt(process.env.PAYMENT_LINK_DEFAULT_EXPIRY_HOURS || '72');
  const expirationDate = new Date();
  expirationDate.setHours(expirationDate.getHours() + hours);
  return expirationDate;
}

/**
 * Mark payment link as used
 * @param {string} linkToken - Link token
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
async function markLinkAsUsed(linkToken, transaction) {
  await payment_links.update(
    { 
      is_used: 1,
      used_at: new Date()
    },
    { 
      where: { link_token: linkToken },
      transaction
    }
  );
}

/**
 * Get payment link statistics for a sales rep
 * @param {number} salesRepId - Sales rep user ID
 * @returns {Promise<Object>} Statistics
 */
async function getSalesRepLinkStats(salesRepId) {
  const { Op } = require('sequelize');
  const db = require('../models');
  
  const links = await payment_links.findAll({
    where: { created_by_user_id: salesRepId },
    include: [
      { 
        association: 'booking',
        attributes: ['is_completed']
      }
    ]
  });
  
  const totalLinks = links.length;
  const usedLinks = links.filter(link => link.is_used).length;
  const expiredLinks = links.filter(link => 
    !link.is_used && new Date() > new Date(link.expires_at)
  ).length;
  const activeLinks = totalLinks - usedLinks - expiredLinks;
  const conversionRate = totalLinks > 0 
    ? Math.round((usedLinks / totalLinks) * 100) 
    : 0;
  
  return {
    total_links: totalLinks,
    used_links: usedLinks,
    active_links: activeLinks,
    expired_links: expiredLinks,
    conversion_rate: conversionRate
  };
}

/**
 * Clean up expired payment links (optional maintenance task)
 * @param {number} daysOld - Number of days to consider for cleanup (default: 30)
 * @returns {Promise<number>} Number of links cleaned up
 */
async function cleanupExpiredLinks(daysOld = 30) {
  const { Op } = require('sequelize');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await payment_links.destroy({
    where: {
      expires_at: { [Op.lt]: cutoffDate },
      is_used: 0
    }
  });
  
  return result;
}

async function createStripeInvoice(booking, pricingData) {
  if (!booking.guest_email) {
    throw new Error("Booking must have a guest_email to generate an invoice.");
  }

  // 1. Find or Create Customer
  const existingCustomers = await stripe.customers.list({
    email: booking.guest_email,
    limit: 1,
  });

  let customer = existingCustomers.data.length > 0 
    ? existingCustomers.data[0] 
    : await stripe.customers.create({
        email: booking.guest_email,
        name: booking.project_name || 'Guest Customer'
      });

  // 2. Create Draft Invoice
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 7,
    description: `Invoice for project: ${booking.project_name || 'Service'}`,
    metadata: { 
      booking_id: booking.stream_project_booking_id.toString(),
      source: pricingData.source 
    }
  });

  // 3. Add Line Items
  if (pricingData.line_items && pricingData.line_items.length > 0) {
    for (const item of pricingData.line_items) {
      const amountCents = Math.round(parseFloat(item.total || 0) * 100);
      if (amountCents > 0) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: invoice.id,
            amount: amountCents,
            currency: 'usd',
            description: `${item.name} (Qty: ${item.quantity || 1})`,
          });
      }
    }
  }

  // 4. Add Discount
  const discountCents = Math.round(parseFloat(pricingData.discount_amount || 0) * 100);
  if (discountCents > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        amount: -discountCents,
        currency: 'usd',
        description: `Applied Discount`,
      });
  }

  // 5. Finalize
  return await stripe.invoices.finalizeInvoice(invoice.id);
}

module.exports = {
  generateLinkToken,
  buildPaymentUrl,
  checkLinkExpiration,
  getDefaultExpiration,
  markLinkAsUsed,
  getSalesRepLinkStats,
  cleanupExpiredLinks,
  createStripeInvoice
};
