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

/**
 * Create a Stripe Invoice for an unpaid booking
 */
async function createStripeInvoice(booking, pricingData, options = {}) {
  const { transaction } = options;
  const email = booking.guest_email || (booking.user ? booking.user.email : null);
  const expectedTotalCents = getExpectedInvoiceTotalCents(pricingData);
  const pricingKey = `${booking.stream_project_booking_id}-${expectedTotalCents}`;
  const createAttemptKey = `${pricingKey}-${Date.now()}`;
  
  if (!email) throw new Error("Booking must have an email address.");

  let recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

  let customer = null;
  if (booking.stripe_customer_id) customer = await getStripeCustomerById(booking.stripe_customer_id);
  if (!customer) {
    customer = await getOrCreateStripeCustomer({ email, name: recipientName, bookingId: booking.stream_project_booking_id });
    await booking.update({ stripe_customer_id: customer.id }, { transaction });
  }

  let existingInvoice = null;

  if (booking.stripe_invoice_id) {
    try {
      existingInvoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
    } catch (_) {
      existingInvoice = null;
    }
  }

  if (!existingInvoice) {
    const relatedCustomerIds = [customer.id];
    if (booking.stripe_customer_id) {
      relatedCustomerIds.push(booking.stripe_customer_id);
    }

    existingInvoice = await findExistingInvoiceAcrossCustomers({
      bookingId: booking.stream_project_booking_id,
      customerIds: relatedCustomerIds
    });
  }

  if (existingInvoice) {
    if (isInvoiceTotalMismatch(existingInvoice, expectedTotalCents)) {
      await replaceMismatchedInvoice(existingInvoice, booking.stream_project_booking_id);
      existingInvoice = null;
    } else {
      if (existingInvoice.status === 'draft') {
        const finalizedExistingInvoice = await stripe.invoices.finalizeInvoice(existingInvoice.id);
        await booking.update({ stripe_invoice_id: finalizedExistingInvoice.id }, { transaction });
        return finalizedExistingInvoice;
      }

      if (['open', 'paid', 'uncollectible', 'void'].includes(existingInvoice.status)) {
        await booking.update({ stripe_invoice_id: existingInvoice.id }, { transaction });
        return existingInvoice;
      }
    }
  }

  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 7,
    description: `Service Invoice for ${booking.project_name || 'Project'}`,
    metadata: { booking_id: booking.stream_project_booking_id.toString() }
  }, { idempotencyKey: `inv-create-${createAttemptKey}` });

  // --- ITEM CREATION WITH QUANTITY ---
  let addedItemsTotalCents = 0;
  if (pricingData.line_items && pricingData.line_items.length > 0) {
    for (const [index, item] of pricingData.line_items.entries()) {
      const lineTotalCents = Math.round(parseFloat(item.total || 0) * 100);
      const qty = parseInt(item.quantity) || 1;
      
      if (lineTotalCents > 0) {
        addedItemsTotalCents += lineTotalCents;
        // Calculate unit amount by dividing total by quantity
        const unitAmountCents = Math.round(lineTotalCents / qty);

        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          unit_amount: unitAmountCents, // <--- Corrects Unit Price
          quantity: qty,               // <--- Corrects Quantity
          currency: 'usd',
          description: item.name,
        }, { idempotencyKey: `inv-item-${pricingKey}-${invoice.id}-${index}` });
      }
    }
  }

  // Fallback for subtotal if no line items
  const pricingSubtotalCents = Math.round(parseFloat(pricingData.subtotal || 0) * 100);
  if (addedItemsTotalCents <= 0 && pricingSubtotalCents > 0) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: pricingSubtotalCents,
      currency: 'usd',
      description: `Service Base Price`,
    });
  }

  // Handle Discounts (Negative amounts)
  const totalDiscountAmount = parseFloat(pricingData.discount_amount || 0);
  if (totalDiscountAmount > 0) {
    const quote = booking.primary_quote;
    const totalSubtotal = parseFloat(pricingData.subtotal || 0);
    let promoDiscountCents = 0;

    if (quote) {
      promoDiscountCents = quote.applied_discount_type === 'percentage' 
        ? Math.round((totalSubtotal * (parseFloat(quote.applied_discount_value) / 100)) * 100)
        : Math.round(parseFloat(quote.applied_discount_value || 0) * 100);
    }

    if (promoDiscountCents > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        amount: -promoDiscountCents,
        currency: 'usd',
        description: `Discount Code Applied`,
      });
    }

    const totalDiscountCents = Math.round(totalDiscountAmount * 100);
    const referralDiscountCents = totalDiscountCents - promoDiscountCents;
    if (referralDiscountCents > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        amount: -referralDiscountCents,
        currency: 'usd',
        description: `Referral Discount Applied`,
      });
    }
  }

  const totalTaxAmount = parseFloat(pricingData.tax_amount || 0);
  if (totalTaxAmount > 0) {
    const taxDescriptionParts = [];
    if (pricingData.tax_type) {
      taxDescriptionParts.push(String(pricingData.tax_type).trim());
    } else {
      taxDescriptionParts.push('Tax');
    }
    if (pricingData.tax_rate != null && pricingData.tax_rate !== '') {
      taxDescriptionParts.push(`(${parseFloat(pricingData.tax_rate)}%)`);
    }

    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: Math.round(totalTaxAmount * 100),
      currency: 'usd',
      description: taxDescriptionParts.join(' ')
    });
  }

  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
  await booking.update({ stripe_invoice_id: finalizedInvoice.id }, { transaction });
  return finalizedInvoice;
}
/**
 * Creates a formal invoice/receipt for a payment that HAS ALREADY been received.
 * Improved to provide better context for manual/out-of-band payments.
 */
async function createPaidStripeInvoice(booking, pricingData, options = {}) {
  const { transaction } = options;
  const email = booking.user?.email || booking.guest_email;
  const recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

  // Ensure customer exists in Stripe
  const customer = await getOrCreateStripeCustomer({ 
    email, 
    name: recipientName, 
    bookingId: booking.stream_project_booking_id 
  });

  const safeNumber = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // Format the total for the footer text
  const totalAmountFormatted = safeNumber(pricingData?.total).toLocaleString('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  });

  // 1. CREATE THE INVOICE OBJECT
  // We add Footer and Custom Fields to clarify the "Out of band" status professionally
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    auto_advance: false, 
    collection_method: 'send_invoice',
    days_until_due: 1,
    // Professional header for a finalized payment
    description: `Payment Receipt: ${booking.project_name || 'Service Project'}`,
    // This adds a professional note at the bottom of the PDF
    footer: `Thank you for your business! This payment of ${totalAmountFormatted} was received and processed manually. Transaction Reference: ${booking.payment_id || 'N/A'}.`,
    // Custom Fields appear as a table on the receipt, clarifying the status
    custom_fields: [
      { name: "Payment Status", value: "Paid in Full" },
      { name: "Payment Method", value: "External / Bank Transfer" }
    ],
    metadata: { 
      booking_id: booking.stream_project_booking_id.toString(), 
      status: 'paid_receipt' 
    }
  });

  // 2. ITEM CREATION WITH QUANTITY
  const lineItems = pricingData?.line_items || [];
  let lineItemsTotalCents = 0;

  for (const item of lineItems) {
    const lineTotalCents = Math.round(safeNumber(item.total) * 100);
    const qty = parseInt(item.quantity) || 1;

    if (lineTotalCents > 0) {
      lineItemsTotalCents += lineTotalCents;
      // Calculate unit amount by dividing total by quantity so columns look correct
      const unitAmountCents = Math.round(lineTotalCents / qty);

      await stripe.invoiceItems.create({ 
        customer: customer.id, 
        invoice: invoice.id, 
        unit_amount: unitAmountCents, 
        quantity: qty,               
        currency: 'usd', 
        description: `${item.name}` 
      });
    }
  }

  // Fallback for subtotal if no specific line items are present
  const pricingSubtotal = safeNumber(pricingData?.subtotal || 0);
  if (lineItemsTotalCents <= 0 && pricingSubtotal > 0) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: Math.round(pricingSubtotal * 100),
      currency: 'usd',
      description: `Service Base Price`
    });
  }

  // 3. HANDLE DISCOUNTS (Negative amounts)
  const totalDiscount = safeNumber(pricingData?.discount_amount || 0);
  if (totalDiscount > 0) {
    const quote = booking.primary_quote;
    let promoCents = 0;
    
    if (quote) {
      promoCents = quote.applied_discount_type === 'percentage' 
        ? Math.round((pricingSubtotal * (parseFloat(quote.applied_discount_value) / 100)) * 100)
        : Math.round(parseFloat(quote.applied_discount_value) * 100);
    }
    
    if (promoCents > 0) {
      await stripe.invoiceItems.create({ 
        customer: customer.id, 
        invoice: invoice.id, 
        amount: -promoCents, 
        currency: 'usd', 
        description: `Discount Code Applied` 
      });
    }
    
    const referralCents = Math.round(totalDiscount * 100) - promoCents;
    if (referralCents > 0) {
      await stripe.invoiceItems.create({ 
        customer: customer.id, 
        invoice: invoice.id, 
        amount: -referralCents, 
        currency: 'usd', 
        description: `Referral Discount Applied` 
      });
    }
  }

  const totalTax = safeNumber(pricingData?.tax_amount || 0);
  if (totalTax > 0) {
    const taxDescriptionParts = [];
    if (pricingData?.tax_type) {
      taxDescriptionParts.push(String(pricingData.tax_type).trim());
    } else {
      taxDescriptionParts.push('Tax');
    }
    if (pricingData?.tax_rate != null && pricingData.tax_rate !== '') {
      taxDescriptionParts.push(`(${parseFloat(pricingData.tax_rate)}%)`);
    }

    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: Math.round(totalTax * 100),
      currency: 'usd',
      description: taxDescriptionParts.join(' ')
    });
  }

  // 4. FINALIZE AND MARK AS PAID
  let finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  
  // This 'paid_out_of_band' flag tells Stripe the money was collected outside of Stripe (Wire, Cash, etc.)
  if (finalized.status !== 'paid' && finalized.total !== 0) {
    finalized = await stripe.invoices.pay(finalized.id, { 
        paid_out_of_band: true 
    });
  }

  // Update Database with the new Receipt details
  await booking.update(
    { stripe_invoice_id: finalized.id, stripe_customer_id: customer.id }, 
    { transaction }
  );

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
