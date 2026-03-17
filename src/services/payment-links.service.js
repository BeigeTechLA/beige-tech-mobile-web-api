const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const { payment_links } = require('../models');

async function getOrCreateStripeCustomer({ email, name, bookingId }) {
  const customers = await stripe.customers.list({ email: email, limit: 1 });

  if (customers.data.length > 0) {
    return customers.data[0];
  }

  return stripe.customers.create({
    email: email,
    name: name,
    metadata: bookingId ? { booking_id: bookingId.toString() } : undefined
  });
}

async function getStripeCustomerById(customerId) {
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) {
    return null;
  }
  return customer;
}

async function listStripeCustomersByEmail(email) {
  if (!email) return [];
  const customers = await stripe.customers.list({ email: email, limit: 10 });
  return customers.data || [];
}

async function findExistingInvoiceAcrossCustomers({ bookingId, customerIds }) {
  const uniqueCustomerIds = Array.from(new Set(customerIds.filter(Boolean)));

  for (const customerId of uniqueCustomerIds) {
    const invoice = await findExistingInvoiceForBooking(customerId, bookingId);
    if (invoice) {
      return invoice;
    }
  }

  return null;
}

async function findExistingInvoiceForBooking(customerId, bookingId) {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit: 100
  });

  const matches = invoices.data.filter(
    (inv) => inv.metadata?.booking_id === bookingId.toString()
  );

  if (matches.length === 0) {
    return null;
  }

  const statusPriority = ['paid', 'open', 'draft', 'uncollectible', 'void'];
  for (const status of statusPriority) {
    const match = matches.find((inv) => inv.status === status);
    if (match) return match;
  }

  return matches[0];
}

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

function getExpectedInvoiceTotalCents(pricingData) {
  return Math.round(parseFloat(pricingData?.total || 0) * 100);
}

function isInvoiceTotalMismatch(invoice, expectedTotalCents) {
  if (!invoice || expectedTotalCents <= 0) return false;
  if (!['draft', 'open'].includes(invoice.status)) return false;

  const invoiceTotalCents = typeof invoice.total === 'number'
    ? invoice.total
    : (typeof invoice.amount_due === 'number' ? invoice.amount_due : null);

  if (invoiceTotalCents === null) return false;
  return invoiceTotalCents !== expectedTotalCents;
}

async function replaceMismatchedInvoice(invoice, bookingId) {
  if (invoice.status === 'draft') {
    await stripe.invoices.del(invoice.id);
    return;
  }

  if (invoice.status === 'open') {
    await stripe.invoices.voidInvoice(invoice.id, {}, {
      idempotencyKey: `inv-void-${bookingId}-${invoice.id}`
    });
  }
}

async function createStripeInvoice(booking, pricingData, options = {}) {
  const { transaction } = options;
  const email = booking.guest_email || booking.user?.email;
  const recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

  const customer = await getOrCreateStripeCustomer({ email, name: recipientName, bookingId: booking.stream_project_booking_id });

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 7,
    description: `Invoice for ${booking.project_name}`,
    metadata: { booking_id: booking.stream_project_booking_id.toString() }
  });

  // FIX: Passing unit_amount and quantity properly
  for (const item of (pricingData.line_items || [])) {
    const unitPriceCents = Math.round(parseFloat(item.unit_price || item.unit_amount || 0) * 100);
    const quantity = parseInt(item.quantity || 1);
    
    if (unitPriceCents > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        unit_amount: unitPriceCents, // Price per item
        quantity: quantity,           // Number of items
        currency: 'usd',
        description: item.name || item.item_name,
      });
    }
  }

  // Handle Discounts (Remains the same as before)
  const subtotal = parseFloat(pricingData.subtotal || 0);
  const totalDiscount = parseFloat(pricingData.discount_amount || 0);
  if (totalDiscount > 0) {
    const quote = booking.primary_quote;
    let promoCents = 0;
    if (quote) {
      promoCents = quote.applied_discount_type === 'percentage' 
        ? Math.round((subtotal * (parseFloat(quote.applied_discount_value) / 100)) * 100)
        : Math.round(parseFloat(quote.applied_discount_value) * 100);
    }
    if (promoCents > 0) {
      await stripe.invoiceItems.create({ customer: customer.id, invoice: invoice.id, amount: -promoCents, currency: 'usd', description: `Discount Code Applied` });
    }
    const referralCents = Math.round(totalDiscount * 100) - promoCents;
    if (referralCents > 0) {
      await stripe.invoiceItems.create({ customer: customer.id, invoice: invoice.id, amount: -referralCents, currency: 'usd', description: `Referral Discount Applied` });
    }
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  await booking.update({ stripe_invoice_id: finalized.id, stripe_customer_id: customer.id }, { transaction });
  return finalized;
}
/**
 * Creates a formal invoice for a payment that HAS ALREADY been received.
 * This is used to generate a professional PDF for historical records.
 */
async function createPaidStripeInvoice(booking, pricingData, options = {}) {
  const { transaction } = options;
  const email = booking.user?.email || booking.guest_email;
  const recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

  const customer = await getOrCreateStripeCustomer({ email, name: recipientName, bookingId: booking.stream_project_booking_id });

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    auto_advance: false, 
    collection_method: 'send_invoice',
    days_until_due: 1,
    description: `PAID: Invoice for ${booking.project_name}`,
    metadata: { booking_id: booking.stream_project_booking_id.toString(), status: 'paid_receipt' }
  });

  // FIX: Passing unit_amount and quantity properly
  for (const item of (pricingData.line_items || [])) {
    const unitPriceCents = Math.round(parseFloat(item.unit_price || item.unit_amount || 0) * 100);
    const quantity = parseInt(item.quantity || 1);

    if (unitPriceCents > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        unit_amount: unitPriceCents,
        quantity: quantity,
        currency: 'usd',
        description: item.name || item.item_name
      });
    }
  }

  // Handle Discounts
  const subtotal = parseFloat(pricingData.subtotal || 0);
  const totalDiscount = parseFloat(pricingData.discount_amount || 0);
  if (totalDiscount > 0) {
    const quote = booking.primary_quote;
    let promoCents = 0;
    if (quote) {
      promoCents = quote.applied_discount_type === 'percentage' 
        ? Math.round((subtotal * (parseFloat(quote.applied_discount_value) / 100)) * 100)
        : Math.round(parseFloat(quote.applied_discount_value) * 100);
    }
    if (promoCents > 0) {
      await stripe.invoiceItems.create({ customer: customer.id, invoice: invoice.id, amount: -promoCents, currency: 'usd', description: `Discount Code Applied` });
    }
    const referralCents = Math.round(totalDiscount * 100) - promoCents;
    if (referralCents > 0) {
      await stripe.invoiceItems.create({ customer: customer.id, invoice: invoice.id, amount: -referralCents, currency: 'usd', description: `Referral Discount Applied` });
    }
  }

  let finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  finalized = await stripe.invoices.pay(finalized.id, { paid_out_of_band: true });

  await booking.update({ stripe_invoice_id: finalized.id, stripe_customer_id: customer.id }, { transaction });
  return finalized;
}

module.exports = {
  generateLinkToken,
  buildPaymentUrl,
  checkLinkExpiration,
  getDefaultExpiration,
  markLinkAsUsed,
  getSalesRepLinkStats,
  cleanupExpiredLinks,
  createStripeInvoice,
  createPaidStripeInvoice,
  findExistingInvoiceForBooking
};
