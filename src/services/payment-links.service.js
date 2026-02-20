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
  const email = booking.guest_email || (booking.user ? booking.user.email : null);
  
  if (!email) {
    throw new Error("Booking must have an email address to generate an invoice.");
  }

  // Determine Customer Name (Same logic as your email service)
  let recipientName = 'Valued Guest';
  if (booking.user && booking.user.name) {
    recipientName = booking.user.name;
  } else if (booking.project_name) {
    recipientName = booking.project_name.split(' - ')[1] || 'Valued Guest';
  }

  // 1. Find or Create Customer in Stripe
  const customers = await stripe.customers.list({ email: email, limit: 1 });
  let customer;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: email,
      name: recipientName,
      metadata: { booking_id: booking.stream_project_booking_id.toString() }
    });
  }

  // 2. Reuse existing open invoice for this booking to avoid duplicates.
  const openInvoices = await stripe.invoices.list({
    customer: customer.id,
    status: 'open',
    limit: 100
  });

  const existingOpenInvoice = openInvoices.data.find(
    (inv) => inv.metadata?.booking_id === booking.stream_project_booking_id.toString()
  );

  if (existingOpenInvoice) {
    return existingOpenInvoice;
  }

  // 3. If a draft already exists for this booking, finalize and reuse it.
  const draftInvoices = await stripe.invoices.list({
    customer: customer.id,
    status: 'draft',
    limit: 100
  });

  const existingDraftInvoice = draftInvoices.data.find(
    (inv) => inv.metadata?.booking_id === booking.stream_project_booking_id.toString()
  );

  if (existingDraftInvoice) {
    const finalizedExistingDraft = await stripe.invoices.finalizeInvoice(existingDraftInvoice.id);
    return finalizedExistingDraft;
  }

  // 4. Create the Draft Invoice
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice', // This emails the invoice automatically
    days_until_due: 7,
    description: `Service Invoice for ${booking.project_name || 'Project'}`,
    footer: "Beige AI Platform - 123 Creative Studio Way, New York, NY 10001",
    metadata: { 
      booking_id: booking.stream_project_booking_id.toString() 
    }
  });

  // 5. Add Line Items (Calculated from your pricing data)
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

  // 6. Handle Discount (if any)
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

  // 7. Finalize the invoice (This generates the PDF link and the hosted URL)
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  return finalizedInvoice;
}
/**
 * Creates a formal invoice for a payment that HAS ALREADY been received.
 * This is used to generate a professional PDF for historical records.
 */
async function createPaidStripeInvoice(booking, pricingData) {
  const email = (booking.user && booking.user.email) ? booking.user.email : booking.guest_email;
  const recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

  // 1. Get/Create Customer
  const customers = await stripe.customers.list({ email: email, limit: 1 });
  let customer = customers.data.length > 0 ? customers.data[0] : await stripe.customers.create({ email, name: recipientName });

  // 2. Create the Draft Invoice
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    auto_advance: false, 
    collection_method: 'send_invoice',
    days_until_due: 1, // <--- ADD THIS LINE TO FIX THE ERROR
    description: `PAID: Service Invoice for ${booking.project_name || 'Project'}`,
    footer: "Beige AI Platform - Payment Received. Thank you.",
    metadata: { 
      booking_id: booking.stream_project_booking_id.toString(), 
      status: 'retrospective_paid' 
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

  // 4. Finalize the invoice (Generates the PDF)
  let finalized = await stripe.invoices.finalizeInvoice(invoice.id);

  // 5. Mark as paid immediately so it shows as "Paid" on the PDF
  finalized = await stripe.invoices.pay(finalized.id, {
    paid_out_of_band: true
  });

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
  createPaidStripeInvoice
};
