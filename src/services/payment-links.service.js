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

async function createStripeInvoice(booking, pricingData, options = {}) {
  const { transaction } = options;
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

  // 0. If we already stored an invoice id, reuse it.
  if (booking.stripe_invoice_id) {
    try {
      const existing = await stripe.invoices.retrieve(booking.stripe_invoice_id);
      if (existing) {
        if (existing.status === 'void' || existing.status === 'uncollectible') {
          await booking.update({ stripe_invoice_id: null }, { transaction });
        } else {
          return existing;
        }
      }
    } catch (error) {
      if (error && error.statusCode === 404) {
        await booking.update({ stripe_invoice_id: null }, { transaction });
      } else {
        throw error;
      }
    }
  }

  // 1. Find or Create Customer in Stripe
  let customer = null;
  let customersByEmail = [];
  if (!booking.stripe_customer_id && email) {
    customersByEmail = await listStripeCustomersByEmail(email);
  }

  if (customersByEmail.length > 0) {
    const invoiceFromAnyCustomer = await findExistingInvoiceAcrossCustomers({
      bookingId: booking.stream_project_booking_id,
      customerIds: customersByEmail.map((c) => c.id)
    });

    if (invoiceFromAnyCustomer) {
      const invoiceCustomerId = typeof invoiceFromAnyCustomer.customer === 'string'
        ? invoiceFromAnyCustomer.customer
        : invoiceFromAnyCustomer.customer?.id;
      if (invoiceCustomerId) {
        await booking.update({
          stripe_customer_id: invoiceCustomerId,
          stripe_invoice_id: invoiceFromAnyCustomer.id
        }, { transaction });
      }
      if (invoiceFromAnyCustomer.status === 'draft') {
        return stripe.invoices.finalizeInvoice(invoiceFromAnyCustomer.id, {}, {
          idempotencyKey: `inv-finalize-${booking.stream_project_booking_id}`
        });
      }
      if (invoiceFromAnyCustomer.status === 'open' || invoiceFromAnyCustomer.status === 'paid') {
        return invoiceFromAnyCustomer;
      }
    }
  }

  if (booking.stripe_customer_id) {
    customer = await getStripeCustomerById(booking.stripe_customer_id);
  }
  if (!customer) {
    customer = await getOrCreateStripeCustomer({
      email,
      name: recipientName,
      bookingId: booking.stream_project_booking_id
    });
    if (booking.stripe_customer_id !== customer.id) {
      await booking.update({ stripe_customer_id: customer.id }, { transaction });
    }
  }

  // 2. Reuse any existing invoice for this booking to avoid duplicates.
  const existingInvoice = await findExistingInvoiceForBooking(
    customer.id,
    booking.stream_project_booking_id
  );

  if (existingInvoice) {
    if (!booking.stripe_invoice_id || booking.stripe_invoice_id !== existingInvoice.id) {
      await booking.update({ stripe_invoice_id: existingInvoice.id }, { transaction });
    }

    if (existingInvoice.status === 'draft') {
      const draftWithLines = await stripe.invoices.retrieve(existingInvoice.id, {
        expand: ['lines']
      });

      const hasLines = (draftWithLines.lines?.data || []).length > 0;

      if (!hasLines) {
        for (const [index, item] of (pricingData.line_items || []).entries()) {
          const amountCents = Math.round(parseFloat(item.total || 0) * 100);
          if (amountCents > 0) {
            await stripe.invoiceItems.create({
              customer: customer.id,
              invoice: existingInvoice.id,
              amount: amountCents,
              currency: 'usd',
              description: `${item.name} (Qty: ${item.quantity || 1})`,
            }, {
              idempotencyKey: `inv-item-${booking.stream_project_booking_id}-${index}-${amountCents}`
            });
          }
        }

        const discountCents = Math.round(parseFloat(pricingData.discount_amount || 0) * 100);
        if (discountCents > 0) {
          await stripe.invoiceItems.create({
            customer: customer.id,
            invoice: existingInvoice.id,
            amount: -discountCents,
            currency: 'usd',
            description: `Applied Discount`,
          }, {
            idempotencyKey: `inv-discount-${booking.stream_project_booking_id}-${discountCents}`
          });
        }
      }

      return stripe.invoices.finalizeInvoice(existingInvoice.id, {}, {
        idempotencyKey: `inv-finalize-${booking.stream_project_booking_id}`
      });
    }

    if (existingInvoice.status === 'open' || existingInvoice.status === 'paid') {
      return existingInvoice;
    }
  }

  // 3. Create the Draft Invoice
  const invoice = await stripe.invoices.create({
    customer: customer.id,
    collection_method: 'send_invoice', // This emails the invoice automatically
    days_until_due: 7,
    description: `Service Invoice for ${booking.project_name || 'Project'}`,
    footer: "Beige AI Platform - 123 Creative Studio Way, New York, NY 10001",
    metadata: { 
      booking_id: booking.stream_project_booking_id.toString() 
    }
  }, {
    idempotencyKey: `inv-create-${booking.stream_project_booking_id}`
  });

  // 4. Add Line Items (Calculated from your pricing data)
  if (pricingData.line_items && pricingData.line_items.length > 0) {
    for (const [index, item] of pricingData.line_items.entries()) {
      const amountCents = Math.round(parseFloat(item.total || 0) * 100);
      if (amountCents > 0) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          amount: amountCents,
          currency: 'usd',
          description: `${item.name} (Qty: ${item.quantity || 1})`,
        }, {
          idempotencyKey: `inv-item-${booking.stream_project_booking_id}-${index}-${amountCents}`
        });
      }
    }
  }

  // 5. Handle Discount (if any)
  const discountCents = Math.round(parseFloat(pricingData.discount_amount || 0) * 100);
  if (discountCents > 0) {
    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: invoice.id,
      amount: -discountCents,
      currency: 'usd',
      description: `Applied Discount`,
    }, {
      idempotencyKey: `inv-discount-${booking.stream_project_booking_id}-${discountCents}`
    });
  }

  // 6. Finalize the invoice (This generates the PDF link and the hosted URL)
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {}, {
    idempotencyKey: `inv-finalize-${booking.stream_project_booking_id}`
  });

  if (!booking.stripe_invoice_id || booking.stripe_invoice_id !== finalizedInvoice.id) {
    await booking.update({ stripe_invoice_id: finalizedInvoice.id }, { transaction });
  }

  return finalizedInvoice;
}
/**
 * Creates a formal invoice for a payment that HAS ALREADY been received.
 * This is used to generate a professional PDF for historical records.
 */
async function createPaidStripeInvoice(booking, pricingData, options = {}) {
  const { transaction } = options;
  const email = (booking.user && booking.user.email) ? booking.user.email : booking.guest_email;
  const recipientName = booking.user?.name || (booking.project_name ? booking.project_name.split(' - ')[1] : 'Valued Guest');

  // 1. Get/Create Customer
  let customer = null;
  let customersByEmail = [];
  if (!booking.stripe_customer_id && email) {
    customersByEmail = await listStripeCustomersByEmail(email);
  }

  if (customersByEmail.length > 0) {
    const invoiceFromAnyCustomer = await findExistingInvoiceAcrossCustomers({
      bookingId: booking.stream_project_booking_id,
      customerIds: customersByEmail.map((c) => c.id)
    });

    if (invoiceFromAnyCustomer) {
      const invoiceCustomerId = typeof invoiceFromAnyCustomer.customer === 'string'
        ? invoiceFromAnyCustomer.customer
        : invoiceFromAnyCustomer.customer?.id;
      if (invoiceCustomerId) {
        await booking.update({
          stripe_customer_id: invoiceCustomerId,
          stripe_invoice_id: invoiceFromAnyCustomer.id
        }, { transaction });
      }
      if (invoiceFromAnyCustomer.status === 'draft') {
        const finalized = await stripe.invoices.finalizeInvoice(invoiceFromAnyCustomer.id, {}, {
          idempotencyKey: `inv-finalize-${booking.stream_project_booking_id}`
        });
        return stripe.invoices.pay(finalized.id, {
          paid_out_of_band: true
        }, {
          idempotencyKey: `inv-pay-${booking.stream_project_booking_id}`
        });
      }
      if (invoiceFromAnyCustomer.status === 'open') {
        return stripe.invoices.pay(invoiceFromAnyCustomer.id, {
          paid_out_of_band: true
        }, {
          idempotencyKey: `inv-pay-${booking.stream_project_booking_id}`
        });
      }
      if (invoiceFromAnyCustomer.status === 'paid') {
        return invoiceFromAnyCustomer;
      }
    }
  }

  if (booking.stripe_customer_id) {
    customer = await getStripeCustomerById(booking.stripe_customer_id);
  }
  if (!customer) {
    customer = await getOrCreateStripeCustomer({
      email,
      name: recipientName,
      bookingId: booking.stream_project_booking_id
    });
    if (booking.stripe_customer_id !== customer.id) {
      await booking.update({ stripe_customer_id: customer.id }, { transaction });
    }
  }

  if (booking.stripe_invoice_id) {
    try {
      const existing = await stripe.invoices.retrieve(booking.stripe_invoice_id);
      if (existing) {
        if (existing.status === 'void' || existing.status === 'uncollectible') {
          await booking.update({ stripe_invoice_id: null }, { transaction });
        } else {
          return existing;
        }
      }
    } catch (error) {
      if (error && error.statusCode === 404) {
        await booking.update({ stripe_invoice_id: null }, { transaction });
      } else {
        throw error;
      }
    }
  }

  const existingInvoice = await findExistingInvoiceForBooking(
    customer.id,
    booking.stream_project_booking_id
  );

  if (existingInvoice) {
    if (!booking.stripe_invoice_id || booking.stripe_invoice_id !== existingInvoice.id) {
      await booking.update({ stripe_invoice_id: existingInvoice.id }, { transaction });
    }

    if (existingInvoice.status === 'draft') {
      const finalized = await stripe.invoices.finalizeInvoice(existingInvoice.id, {}, {
        idempotencyKey: `inv-finalize-${booking.stream_project_booking_id}`
      });
      const paid = await stripe.invoices.pay(finalized.id, {
        paid_out_of_band: true
      }, {
        idempotencyKey: `inv-pay-${booking.stream_project_booking_id}`
      });
      return paid;
    }

    if (existingInvoice.status === 'open') {
      const paid = await stripe.invoices.pay(existingInvoice.id, {
        paid_out_of_band: true
      }, {
        idempotencyKey: `inv-pay-${booking.stream_project_booking_id}`
      });
      return paid;
    }

    if (existingInvoice.status === 'paid') {
      return existingInvoice;
    }
  }

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
  }, {
    idempotencyKey: `inv-create-${booking.stream_project_booking_id}`
  });

  // 3. Add Line Items
  if (pricingData.line_items && pricingData.line_items.length > 0) {
    for (const [index, item] of pricingData.line_items.entries()) {
      const amountCents = Math.round(parseFloat(item.total || 0) * 100);
      if (amountCents > 0) {
        await stripe.invoiceItems.create({
          customer: customer.id,
          invoice: invoice.id,
          amount: amountCents,
          currency: 'usd',
          description: `${item.name} (Qty: ${item.quantity || 1})`,
        }, {
          idempotencyKey: `inv-item-${booking.stream_project_booking_id}-${index}-${amountCents}`
        });
      }
    }
  }

  // 4. Finalize the invoice (Generates the PDF)
  let finalized = await stripe.invoices.finalizeInvoice(invoice.id, {}, {
    idempotencyKey: `inv-finalize-${booking.stream_project_booking_id}`
  });

  // 5. Mark as paid immediately so it shows as "Paid" on the PDF
  finalized = await stripe.invoices.pay(finalized.id, {
    paid_out_of_band: true
  }, {
    idempotencyKey: `inv-pay-${booking.stream_project_booking_id}`
  });

  if (!booking.stripe_invoice_id || booking.stripe_invoice_id !== finalized.id) {
    await booking.update({ stripe_invoice_id: finalized.id }, { transaction });
  }

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
