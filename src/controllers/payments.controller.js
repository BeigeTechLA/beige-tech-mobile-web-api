const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../models');
const affiliateController = require('./affiliate.controller');
const { appendToSheet, updateSheetRow } = require('../utils/googleSheets');
const googleSheetService = require('../utils/googleSheetsService');
// Get Beige margin percentage from environment, default to 25%
const BEIGE_MARGIN_PERCENT = parseFloat(process.env.BEIGE_MARGIN_PERCENT || '25.00');
const emailService = require('../utils/emailService');

/**
 * Calculate pricing breakdown for CP + equipment booking
 * @param {number} hours - Number of hours
 * @param {number} hourlyRate - CP hourly rate
 * @param {Array} equipmentItems - Array of equipment with prices
 * @param {number} marginPercent - Platform margin percentage
 * @returns {Object} Pricing breakdown
 */
function calculatePricing(hours, hourlyRate, equipmentItems = [], marginPercent = BEIGE_MARGIN_PERCENT) {
  const cp_cost = parseFloat((hours * hourlyRate).toFixed(2));
  const equipment_cost = equipmentItems.reduce((sum, item) => sum + parseFloat(item.price), 0);
  const subtotal = parseFloat((cp_cost + equipment_cost).toFixed(2));
  const beige_margin_amount = parseFloat((subtotal * (marginPercent / 100)).toFixed(2));
  const total_amount = parseFloat((subtotal + beige_margin_amount).toFixed(2));

  return {
    cp_cost,
    equipment_cost,
    subtotal,
    beige_margin_percent: marginPercent,
    beige_margin_amount,
    total_amount
  };
}

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime = (value) => {
  if (!value) return '';
  const text = String(value);
  const [hh, mm] = text.split(':');
  if (hh === undefined || mm === undefined) return text;
  const hours = Number(hh);
  if (Number.isNaN(hours)) return text;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
};

const formatLocation = (location) => {
  if (!location) return 'TBD';
  if (typeof location !== 'string') {
    if (location && typeof location === 'object') {
      return (
        location.address ||
        location.full_address ||
        location.formatted_address ||
        location.place_name ||
        location.name ||
        location.text ||
        location.address_line_1 ||
        location.location ||
        location.venue ||
        'TBD'
      );
    }
    return String(location);
  }
  const trimmed = location.trim();
  if (!trimmed) return 'TBD';
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      return (
        parsed.address ||
        parsed.full_address ||
        parsed.formatted_address ||
        parsed.place_name ||
        parsed.name ||
        parsed.text ||
        parsed.address_line_1 ||
        parsed.location ||
        parsed.venue ||
        trimmed
      );
    }
  } catch (_) {
    // Keep raw value when not JSON
  }
  return trimmed;
};

const toTitleCase = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const normalizeServiceType = (contentType) => {
  const raw = String(contentType || '').trim();
  if (!raw) return '';

  const mapToken = (token) => {
    const key = token.trim().toLowerCase();
    if (!key) return '';
    if (key === 'videographer' || key === 'videography') return 'Videography';
    if (key === 'photographer' || key === 'photography') return 'Photography';
    return toTitleCase(token);
  };

  const parts = raw
    .split(/[,+/|]/)
    .map(mapToken)
    .filter(Boolean);

  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(' + ') : toTitleCase(raw);
};

const parseRoleIds = (value) => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(v => Number(v)).filter(Number.isFinite);

  const raw = String(value).trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(v => Number(v)).filter(Number.isFinite);
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).map(v => Number(v)).filter(Number.isFinite);
    }
  } catch (_) {
    // non-JSON input, continue
  }

  if (/^\d+$/.test(raw)) return [Number(raw)];
  return raw
    .split(/[,+/|]/)
    .map(v => Number(v.trim()))
    .filter(Number.isFinite);
};

const resolveCrewRoleLabel = async (rawPrimaryRole, fallbackText) => {
  const roleIds = parseRoleIds(rawPrimaryRole);
  if (roleIds.length === 0) {
    return normalizeServiceType(rawPrimaryRole || fallbackText);
  }

  try {
    const roles = await db.crew_roles.findAll({
      where: { role_id: roleIds },
      attributes: ['role_id', 'role_name'],
      raw: true
    });

    if (!roles || roles.length === 0) {
      return normalizeServiceType(fallbackText);
    }

    const byId = new Map(roles.map(r => [Number(r.role_id), r.role_name]));
    const names = roleIds.map(id => byId.get(Number(id))).filter(Boolean);
    return names.length > 0 ? names.join(', ') : normalizeServiceType(fallbackText);
  } catch (error) {
    console.error('Failed to resolve crew role labels:', error.message);
    return normalizeServiceType(fallbackText);
  }
};

const toAbsoluteBeigeAssetUrl = (pathValue) => {
  const fallbackBase = 'https://beige-web-prod.s3.us-east-1.amazonaws.com/beige/';
  const configuredBase = (process.env.BEIGE_ASSET_BASE_URL || fallbackBase).replace(/\/+$/, '/') ;

  const raw = String(pathValue || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  // DB stores values after "beige/" so join directly.
  return `${configuredBase}${raw.replace(/^\/+/, '')}`;
};

const sendBookingConfirmationForBooking = async ({
  bookingId,
  amountPaid,
  paymentMethod,
  transactionId
}) => {
  try {
    const booking = await db.stream_project_booking.findByPk(bookingId, {
      include: [
        {
          model: db.users,
          as: 'user',
          attributes: ['name', 'email'],
          required: false
        },
        {
          model: db.assigned_crew,
          as: 'assigned_crews',
          required: false,
          where: { is_active: 1 },
          attributes: ['crew_member_id', 'crew_accept', 'status', 'updated_at', 'assigned_date'],
          include: [
            {
              model: db.crew_members,
              as: 'crew_member',
              attributes: ['first_name', 'last_name', 'primary_role'],
              include: [
                {
                  model: db.crew_member_files,
                  as: 'crew_member_files',
                  required: false,
                  attributes: ['file_type', 'file_path', 'created_at', 'is_active']
                }
              ],
              required: false
            }
          ]
        }
      ]
    });

    if (!booking) return;

    const toEmail = booking.user?.email || booking.guest_email;
    if (!toEmail) {
      console.warn(`Skipping booking confirmation email for ${bookingId}: no recipient email found`);
      return;
    }

    let clientName = booking.user?.name || '';
    if (!clientName) {
      const lead = await db.sales_leads.findOne({
        where: { booking_id: bookingId },
        attributes: ['client_name', 'guest_email']
      });
      clientName = lead?.client_name || '';
      if (!clientName) {
        const emailForName = booking.guest_email || lead?.guest_email || '';
        const localPart = emailForName.includes('@') ? emailForName.split('@')[0] : '';
        clientName = localPart.replace(/[._-]+/g, ' ').trim();
      }
    }
    if (!clientName && booking.description) {
      const m = String(booking.description).match(/Contact Name:\s*([^\n\r]+)/i);
      if (m && m[1]) clientName = m[1].trim();
    }
    const firstName = clientName ? clientName.trim().split(/\s+/)[0] : 'there';
    const assignments = Array.isArray(booking.assigned_crews)
      ? [...booking.assigned_crews].sort((a, b) => {
          const ta = new Date(a?.updated_at || a?.assigned_date || 0).getTime();
          const tb = new Date(b?.updated_at || b?.assigned_date || 0).getTime();
          return tb - ta;
        })
      : [];
    const selectedAssignment =
      assignments.find(a => a?.crew_accept === 1) ||
      assignments.find(a => ['selected', 'assigned', 'confirmed'].includes(String(a?.status || '').toLowerCase())) ||
      assignments[0] ||
      null;
    const cpFirstName = selectedAssignment?.crew_member?.first_name || '';
    const cpLastName = selectedAssignment?.crew_member?.last_name || '';
    const cpName = [cpFirstName, cpLastName].filter(Boolean).join(' ');
    const cpFiles = Array.isArray(selectedAssignment?.crew_member?.crew_member_files)
      ? [...selectedAssignment.crew_member.crew_member_files]
          .filter(f => f?.is_active === 1 || f?.is_active === true || typeof f?.is_active === 'undefined')
          .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      : [];
    const cpPhoto =
      cpFiles.find(f => String(f?.file_type || '').toLowerCase() === 'profile_photo') ||
      cpFiles.find(f => String(f?.file_type || '').toLowerCase() === 'profile_image') ||
      cpFiles.find(f => String(f?.file_type || '').toLowerCase().includes('image')) ||
      null;
    const cpPhotoUrl =
      toAbsoluteBeigeAssetUrl(cpPhoto?.file_path) ||
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&h=120';
    const rawPrimaryRole = selectedAssignment?.crew_member?.primary_role;
    const cpRole = await resolveCrewRoleLabel(
      rawPrimaryRole,
      booking.content_type || booking.event_type || booking.shoot_type
    );

    console.log(
      `Attempting booking confirmation email for booking ${bookingId} to ${toEmail}`
    );

    const emailResult = await emailService.sendBookingConfirmationEmail({
      to_email: toEmail,
      first_name: firstName,
      booking_id: booking.stream_project_booking_id,
      shoot_type: booking.shoot_type || booking.event_type || '',
      service_type: normalizeServiceType(booking.content_type || booking.event_type || booking.shoot_type),
      shoot_date: formatDate(booking.event_date || booking.shoot_date),
      start_time: formatTime(booking.start_time),
      end_time: formatTime(booking.end_time),
      duration: booking.duration_hours ? `${booking.duration_hours} hours` : '',
      shoot_location_address: formatLocation(booking.event_location),
      amount_paid: typeof amountPaid === 'number' ? `$${amountPaid.toFixed(2)}` : (amountPaid || ''),
      payment_method: paymentMethod || 'Card',
      transaction_id: transactionId || '',
      cp_assigned: !!selectedAssignment,
      cp_firstname: cpFirstName,
      cp_name: cpName,
      cp_role: cpRole,
      cp_photo_url: cpPhotoUrl
    });

    if (!emailResult?.success) {
      console.error(
        `Booking confirmation email not sent for booking ${bookingId}:`,
        emailResult?.error || 'Unknown error'
      );
      return;
    }

    console.log(`Booking confirmation email completed for booking ${bookingId}`);
  } catch (error) {
    console.error(`Booking confirmation email flow failed for booking ${bookingId}:`, error.message);
  }
};

/**
 * Create payment intent for CP + equipment booking
 * POST /api/payments/create-intent
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const {
      creator_id,
      hours,
      hourly_rate,
      equipment = [], // Array of { equipment_id, price }
      shoot_date,
      location,
      shoot_type,
      notes,
      user_id,
      guest_email,
      referral_code
    } = req.body;

    // Validation
    if (!creator_id) {
      return res.status(400).json({
        success: false,
        message: 'Creator ID (CP) is required'
      });
    }

    if (!hours || hours <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid hours value is required'
      });
    }

    if (!hourly_rate || hourly_rate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid hourly rate is required'
      });
    }

    if (!shoot_date) {
      return res.status(400).json({
        success: false,
        message: 'Shoot date is required'
      });
    }

    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'Location is required'
      });
    }

    // Validate guest or user
    if (!user_id && !guest_email) {
      return res.status(400).json({
        success: false,
        message: 'Either user_id or guest_email is required'
      });
    }

    // Verify creator exists
    const creator = await db.crew_members.findByPk(creator_id);
    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator (CP) not found'
      });
    }

    // Verify equipment exists if provided
    if (equipment.length > 0) {
      const equipmentIds = equipment.map(e => e.equipment_id);
      const foundEquipment = await db.equipment.findAll({
        where: { equipment_id: equipmentIds }
      });

      if (foundEquipment.length !== equipmentIds.length) {
        return res.status(404).json({
          success: false,
          message: 'One or more equipment items not found'
        });
      }
    }

    // Calculate pricing
    const pricing = calculatePricing(hours, hourly_rate, equipment);

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(pricing.total_amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        creator_id: creator_id.toString(),
        user_id: user_id ? user_id.toString() : 'guest',
        guest_email: guest_email || '',
        hours: hours.toString(),
        hourly_rate: hourly_rate.toString(),
        shoot_date: shoot_date,
        location: location,
        cp_cost: pricing.cp_cost.toString(),
        equipment_cost: pricing.equipment_cost.toString(),
        subtotal: pricing.subtotal.toString(),
        beige_margin_percent: pricing.beige_margin_percent.toString(),
        beige_margin_amount: pricing.beige_margin_amount.toString(),
        referral_code: referral_code || ''
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        pricing: {
          hours,
          hourly_rate,
          cp_cost: pricing.cp_cost,
          equipment_cost: pricing.equipment_cost,
          subtotal: pricing.subtotal,
          beige_margin_percent: pricing.beige_margin_percent,
          beige_margin_amount: pricing.beige_margin_amount,
          total_amount: pricing.total_amount
        }
      }
    });

  } catch (error) {
    console.error('Create Payment Intent Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Confirm payment and save to payment_transactions
 * POST /api/payments/confirm
 */
exports.confirmPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const {
      paymentIntentId,
      creator_id,
      user_id,
      guest_email,
      hours,
      hourly_rate,
      equipment = [], // Array of { equipment_id, price }
      shoot_date,
      location,
      shoot_type,
      notes,
      referral_code,
      booking_id // Guest booking ID to update status
    } = req.body;

    // Validation
    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required'
      });
    }

    if (!creator_id || !hours || !hourly_rate || !shoot_date || !location) {
      return res.status(400).json({
        success: false,
        message: 'Missing required booking data'
      });
    }

    if (!user_id && !guest_email) {
      return res.status(400).json({
        success: false,
        message: 'Either user_id or guest_email is required'
      });
    }

    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed',
        paymentStatus: paymentIntent.status
      });
    }

    // Check if payment already processed
    const existingPayment = await db.payment_transactions.findOne({
      where: { stripe_payment_intent_id: paymentIntentId }
    });

    if (existingPayment) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: 'Payment already processed',
        data: {
          payment_id: existingPayment.payment_id
        }
      });
    }

    // Calculate pricing
    const pricing = calculatePricing(hours, hourly_rate, equipment);

    // Get charge ID from payment intent
    const chargeId = paymentIntent.charges?.data[0]?.id || null;

    // Create payment transaction record
    const payment = await db.payment_transactions.create({
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      creator_id,
      user_id: user_id || null,
      guest_email: guest_email || null,
      hours: parseFloat(hours) > 0 ? parseFloat(hours) : 1,
      hourly_rate,
      cp_cost: pricing.cp_cost,
      equipment_cost: pricing.equipment_cost,
      subtotal: pricing.subtotal,
      beige_margin_percent: pricing.beige_margin_percent,
      beige_margin_amount: pricing.beige_margin_amount,
      total_amount: pricing.total_amount,
      shoot_date,
      location,
      shoot_type: shoot_type || null,
      notes: notes || null,
      referral_code: referral_code || null,
      status: 'succeeded'
    }, { transaction });

    // Create payment_equipment records if equipment provided
    if (equipment.length > 0) {
      const equipmentRecords = equipment.map(item => ({
        payment_id: payment.payment_id,
        equipment_id: item.equipment_id,
        equipment_price: item.price
      }));

      await db.payment_equipment.bulkCreate(equipmentRecords, { transaction });
    }

    // Process referral if referral code was provided
    let referralData = null;
    if (referral_code) {
      try {
        const referral = await affiliateController.processReferral(
          referral_code,
          payment.payment_id,
          pricing.total_amount,
          user_id || null,
          guest_email || null,
          transaction
        );
        if (referral) {
          referralData = {
            referral_id: referral.referral_id,
            commission_amount: parseFloat(referral.commission_amount)
          };
          // Update payment with referral_id
          payment.referral_id = referral.referral_id;
          await payment.save({ transaction });
        }
      } catch (referralError) {
        console.error('Failed to process referral:', referralError);
        // Don't fail the payment if referral processing fails
      }
    }

    // Update booking status to payment completed if booking_id provided
    if (booking_id) {
      try {
        await db.stream_project_booking.update(
          {
            is_completed: 1,
            payment_completed_at: new Date(),
            payment_id: payment.payment_id,
          },
          {
            where: { stream_project_booking_id: booking_id },
            transaction
          }
        );
        console.log(`Booking ${booking_id} marked as payment completed`);
      } catch (bookingUpdateError) {
        console.error('Failed to update booking status:', bookingUpdateError);
        // Don't fail the payment if booking update fails
      }
    }

    await transaction.commit();

    // if (booking_id) {
    //   const paymentMethod =
    //     paymentIntent.charges?.data?.[0]?.payment_method_details?.type ||
    //     paymentIntent.payment_method_types?.[0] ||
    //     'card';

    //   sendBookingConfirmationForBooking({
    //     bookingId: booking_id,
    //     amountPaid: pricing.total_amount,
    //     paymentMethod,
    //     transactionId: paymentIntentId
    //   }).catch(err => console.error('Booking Confirmation Email Error:', err));
    // }

    return res.status(201).json({
      success: true,
      message: 'Payment confirmed and booking created',
      data: {
        payment_id: payment.payment_id,
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: chargeId,
        creator_id,
        shoot_date,
        location,
        pricing: {
          cp_cost: pricing.cp_cost,
          equipment_cost: pricing.equipment_cost,
          subtotal: pricing.subtotal,
          beige_margin_amount: pricing.beige_margin_amount,
          total_amount: pricing.total_amount
        },
        status: 'succeeded',
        booking_id: booking_id || null,
        booking_payment_updated: !!booking_id
      }
    });

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error('Payment Confirmation Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to process payment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Create payment intent for multi-creator booking
 * POST /api/payments/create-intent-multi
 */
exports.createPaymentIntentMulti = async (req, res) => {
  try {
    const {
      booking_id,
      amount,
      guest_email
    } = req.body;

    // 1. Validation
    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // 2. Verify booking exists
    const booking = await db.stream_project_booking.findByPk(booking_id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // 3. Handle 100% Discount ($0.00) Case
    // Stripe does not allow creating intents for $0.00
    if (parseFloat(amount) === 0) {
      return res.status(200).json({
        success: true,
        data: {
          clientSecret: 'free_checkout_intent_' + booking_id, // Mock secret for frontend
          paymentIntentId: 'free_promo_' + Date.now(),
          amount: 0,
          isFree: true
        }
      });
    }

    // 4. Standard Stripe logic for paid bookings
    if (!amount || amount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        booking_id: booking_id.toString(),
        guest_email: guest_email || booking.guest_email || '',
        type: 'multi-creator',
        shoot_name: booking.shoot_name || '',
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: amount,
        isFree: false
      }
    });

  } catch (error) {
    console.error('Create Multi-Creator Payment Intent Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Confirm multi-creator payment and update booking status + Google Sheet
 * POST /api/payments/confirm-multi
 */
/**
 * Confirm multi-creator payment and update booking status
 * POST /api/payments/confirm-multi
 */
exports.confirmPaymentMulti = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { paymentIntentId, booking_id, referral_code } = req.body;

    if (!paymentIntentId || !booking_id) {
      if (transaction) await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Missing paymentIntentId or booking_id' });
    }

    // 1. Fetch the Booking and the Quote to verify details
    const booking = await db.stream_project_booking.findOne({
      where: { stream_project_booking_id: booking_id },
      include: [{ model: db.quotes, as: 'primary_quote' }]
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    let totalAmount = 0;
    let chargeId = null;

    // --- UPDATED LOGIC HERE ---
    // 2. Check if this is a Free Checkout mock ID
    if (paymentIntentId.startsWith('free_checkout_intent_')) {
      
      // SECURITY CHECK: Verify the quote in our DB is actually 0
      // This prevents users from manually sending a "free_checkout" ID for a paid booking
      if (!booking.primary_quote || parseFloat(booking.primary_quote.total) !== 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'Security mismatch: This booking is not eligible for free checkout.' 
        });
      }
      
      totalAmount = 0;
      chargeId = 'PROMO_100_PERCENT'; // Use a placeholder for free bookings

    } else {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status !== 'succeeded') {
          if (transaction) await transaction.rollback();
          return res.status(400).json({ success: false, message: 'Payment not successful' });
        }
        
        totalAmount = paymentIntent.amount / 100;
        chargeId = paymentIntent.charges?.data[0]?.id || null;
      } catch (stripeError) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({ success: false, message: stripeError.message });
      }
    }

    // 4. Prevent duplicate processing
    const existingPayment = await db.payment_transactions.findOne({
      where: { stripe_payment_intent_id: paymentIntentId }
    });

    if (existingPayment) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: "Payment already processed",
        data: { payment_id: existingPayment.payment_id, booking_id },
      });
    }

    // 5. Determine Creator ID (existing logic)
    let validCreatorId = null;
    if (booking.creator_id) {
      const check = await db.crew_members.findByPk(booking.creator_id);
      if (check) validCreatorId = booking.creator_id;
    }
    if (!validCreatorId) {
      const assigned = await db.assigned_crew.findOne({ where: { project_id: booking_id } });
      if (assigned) validCreatorId = assigned.crew_member_id;
    }
    if (!validCreatorId) {
      const firstCreator = await db.crew_members.findOne({ attributes: ['crew_member_id'] });
      validCreatorId = firstCreator ? firstCreator.crew_member_id : null;
    }

    if (!validCreatorId) {
       throw new Error("Cannot process booking: No valid creator found.");
    }

    // 6. Create Payment Transaction Record
    const finalShootDate = booking.shoot_date || booking.event_date || new Date();
    const rawHours = booking.shoot_hours || booking.duration_hours || 1;
    const finalHours = parseFloat(rawHours) > 0 ? parseFloat(rawHours) : 1;

    const payment = await db.payment_transactions.create({
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      creator_id: validCreatorId,
      user_id: booking.user_id || null,
      guest_email: booking.guest_email || null,
      hours: finalHours,
      hourly_rate: 0,
      cp_cost: 0,
      equipment_cost: 0,
      subtotal: totalAmount,
      beige_margin_percent: 0,
      beige_margin_amount: 0,
      total_amount: totalAmount,
      shoot_date: finalShootDate,
      location: booking.event_location ? (typeof booking.event_location === 'string' ? booking.event_location : JSON.stringify(booking.event_location)) : 'See Booking Details',
      shoot_type: booking.shoot_type || null,
      notes: booking.special_requests || null,
      referral_code: referral_code || null,
      status: 'succeeded'
    }, { transaction });

    // 7. Update Booking and Lead Status
    await db.stream_project_booking.update(
      { 
        payment_completed_at: new Date(), 
        payment_id: payment.payment_id,
        is_draft: 0,
        is_completed: 1
      },
      { where: { stream_project_booking_id: booking_id }, transaction }
    );

    await db.sales_leads.update(
      { lead_status: 'booked' },
      { where: { booking_id: booking_id }, transaction }
    );

    await transaction.commit();

    // 8. Background notifications
    emailService.sendPaymentSuccessSalesNotification({
        guestEmail: booking.guest_email || 'Unknown Client',
        amount: totalAmount,
        shootType: booking.shoot_type || 'Shoot',
        paymentIntentId: paymentIntentId
    }).catch(err => console.error('Sales Notification Error:', err));

    const paymentMethod =
      paymentIntent.charges?.data?.[0]?.payment_method_details?.type ||
      paymentIntent.payment_method_types?.[0] ||
      'card';
    sendBookingConfirmationForBooking({
      bookingId: booking_id,
      amountPaid: totalAmount,
      paymentMethod,
      transactionId: paymentIntentId
    }).catch(err => console.error('Booking Confirmation Email Error:', err));

    try {
      const lead = await db.sales_leads.findOne({ where: { booking_id: booking_id } });
      if (lead) {
        await updateSheetRow('leads_data', lead.lead_id, {
          'J': 'Paid',
          'L': 'No',
          'M': new Date().toLocaleString()
        });
      }
    } catch (sheetError) {
      console.error('Google Sheet Sync Error:', sheetError.message);
    }

    return res.status(201).json({
      success: true,
      message: totalAmount === 0 ? 'Booking confirmed (Free)' : 'Payment confirmed successfully',
      data: { payment_id: payment.payment_id, booking_id }
    });

  } catch (error) {
    if (transaction && !transaction.finished) {
        await transaction.rollback();
    }
    console.error('Multi-Creator Payment Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
/**
 * Get payment status by payment_id or stripe_payment_intent_id
 * GET /api/payments/:id/status
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Find payment by payment_id or stripe_payment_intent_id
    const payment = await db.payment_transactions.findOne({
      where: db.Sequelize.or(
        { payment_id: id },
        { stripe_payment_intent_id: id }
      ),
      include: [
        {
          model: db.crew_members,
          as: 'creator',
          attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
        },
        {
          model: db.users,
          as: 'user',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: db.payment_equipment,
          as: 'equipment_items',
          include: [
            {
              model: db.equipment,
              as: 'equipment',
              attributes: ['equipment_id', 'equipment_name', 'manufacturer', 'model_number']
            }
          ]
        }
      ]
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        payment_id: payment.payment_id,
        stripe_payment_intent_id: payment.stripe_payment_intent_id,
        stripe_charge_id: payment.stripe_charge_id,
        creator: payment.creator,
        user: payment.user,
        guest_email: payment.guest_email,
        hours: payment.hours,
        hourly_rate: payment.hourly_rate,
        pricing: {
          cp_cost: payment.cp_cost,
          equipment_cost: payment.equipment_cost,
          subtotal: payment.subtotal,
          beige_margin_percent: payment.beige_margin_percent,
          beige_margin_amount: payment.beige_margin_amount,
          total_amount: payment.total_amount
        },
        shoot_date: payment.shoot_date,
        location: payment.location,
        shoot_type: payment.shoot_type,
        notes: payment.notes,
        equipment: payment.equipment_items,
        status: payment.status,
        created_at: payment.created_at,
        updated_at: payment.updated_at
      }
    });

  } catch (error) {
    console.error('Get Payment Status Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Handle Stripe Webhooks
 * POST /v1/payments/webhook
 * CRITICAL: This route must use express.raw({type: 'application/json'})
 */
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).send('Webhook not configured');
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Signature Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type !== 'invoice.paid' && event.type !== 'payment_intent.succeeded') {
      return res.status(200).json({ received: true });
    }

    const dataObject = event.data.object;
    let booking_id = null;
    let paymentIntentId = null;

    if (event.type === 'payment_intent.succeeded') {
      const bookingIdRaw = dataObject.metadata?.booking_id;
      booking_id = bookingIdRaw ? parseInt(bookingIdRaw, 10) : null;
      paymentIntentId = dataObject.id;

      // Fallback: when booking_id is only present on the related invoice metadata.
      if ((!booking_id || Number.isNaN(booking_id)) && dataObject.invoice) {
        try {
          const invoiceId = typeof dataObject.invoice === 'string'
            ? dataObject.invoice
            : dataObject.invoice.id;
          if (invoiceId) {
            const linkedInvoice = await stripe.invoices.retrieve(invoiceId);
            const invoiceBookingIdRaw = linkedInvoice.metadata?.booking_id;
            booking_id = invoiceBookingIdRaw ? parseInt(invoiceBookingIdRaw, 10) : null;
          }
        } catch (invoiceLookupError) {
          console.warn(`Webhook payment_intent.succeeded: failed to fetch linked invoice metadata: ${invoiceLookupError.message}`);
        }
      }
    } else if (event.type === 'invoice.paid') {
      const bookingIdRaw = dataObject.metadata?.booking_id;
      booking_id = bookingIdRaw ? parseInt(bookingIdRaw, 10) : null;
      paymentIntentId = typeof dataObject.payment_intent === 'string'
        ? dataObject.payment_intent
        : dataObject.payment_intent?.id;
    }

    if (!booking_id || Number.isNaN(booking_id)) {
      console.log(`Webhook ${event.type} ignored: missing metadata.booking_id`);
      return res.status(200).json({ received: true });
    }

    const transaction = await db.sequelize.transaction();

    try {
      if (paymentIntentId) {
        const existing = await db.payment_transactions.findOne({
          where: { stripe_payment_intent_id: paymentIntentId },
          transaction
        });

        if (existing) {
          await transaction.rollback();
          console.log(`Webhook: payment already processed for booking ${booking_id}`);
          return res.status(200).json({ received: true, duplicate: true });
        }
      } else {
        console.log(`Webhook ${event.type}: no payment intent id for booking ${booking_id}, continuing with booking-level idempotency`);
      }

      const booking = await db.stream_project_booking.findByPk(booking_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!booking) {
        await transaction.rollback();
        console.log(`Webhook: booking ${booking_id} not found`);
        return res.status(200).json({ received: true, booking_found: false });
      }

      // Booking-level idempotency: do not create a second payment for an already paid booking.
      if (booking.payment_id || booking.is_completed === 1) {
        await transaction.rollback();
        console.log(`Webhook: booking ${booking_id} already marked paid`);
        return res.status(200).json({ received: true, booking_already_paid: true });
      }

      let validCreatorId = null;
      if (booking.creator_id) {
        const creator = await db.crew_members.findByPk(booking.creator_id, { transaction });
        if (creator) validCreatorId = booking.creator_id;
      }
      if (!validCreatorId) {
        const assigned = await db.assigned_crew.findOne({
          where: { project_id: booking_id },
          transaction
        });
        if (assigned) validCreatorId = assigned.crew_member_id;
      }
      if (!validCreatorId) {
        const firstCreator = await db.crew_members.findOne({
          attributes: ['crew_member_id'],
          transaction
        });
        validCreatorId = firstCreator ? firstCreator.crew_member_id : null;
      }
      if (!validCreatorId) {
        throw new Error(`Cannot process webhook for booking ${booking_id}: no valid creator found`);
      }

      const amountInCents =
        dataObject.amount_paid ?? dataObject.amount_received ?? dataObject.amount ?? 0;
      const amountPaid = parseFloat((amountInCents / 100).toFixed(2));

      const chargeId =
        dataObject.charge ||
        dataObject.latest_charge ||
        dataObject.charges?.data?.[0]?.id ||
        null;

      const finalShootDate = booking.shoot_date || booking.event_date || new Date();
      const finalLocation = booking.event_location
        ? (typeof booking.event_location === 'string'
          ? booking.event_location
          : JSON.stringify(booking.event_location))
        : 'Stripe Webhook';

      const payment = await db.payment_transactions.create({
        stripe_payment_intent_id: paymentIntentId || null,
        stripe_charge_id: chargeId,
        creator_id: validCreatorId,
        user_id: booking.user_id || null,
        guest_email: dataObject.customer_email || dataObject.receipt_email || booking.guest_email || null,
        hours: booking.shoot_hours || booking.duration_hours || 0,
        hourly_rate: 0,
        cp_cost: 0,
        equipment_cost: 0,
        subtotal: amountPaid,
        beige_margin_percent: 0,
        beige_margin_amount: 0,
        total_amount: amountPaid,
        shoot_date: finalShootDate,
        location: finalLocation,
        shoot_type: booking.shoot_type || null,
        notes: booking.special_requests || null,
        status: 'succeeded'
      }, { transaction });

      await db.stream_project_booking.update({
        is_completed: 1,
        is_draft: 0,
        payment_id: payment.payment_id,
        payment_completed_at: new Date()
      }, {
        where: { stream_project_booking_id: booking_id },
        transaction
      });

      await db.sales_leads.update({
        lead_status: 'booked'
      }, {
        where: { booking_id: booking_id },
        transaction
      });

      await transaction.commit();
      console.log(`Webhook: booking ${booking_id} marked as paid`);

      const webhookPaymentMethod =
        dataObject.payment_method_details?.type ||
        dataObject.payment_method_types?.[0] ||
        'card';
      sendBookingConfirmationForBooking({
        bookingId: booking_id,
        amountPaid,
        paymentMethod: webhookPaymentMethod,
        transactionId: paymentIntentId
      }).catch(err => console.error('Booking Confirmation Email Error:', err));
    } catch (dbError) {
      await transaction.rollback();
      throw dbError;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).send('Internal Server Error');
  }
};
