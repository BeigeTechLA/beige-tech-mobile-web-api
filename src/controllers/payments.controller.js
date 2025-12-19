const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../models');

// Get Beige margin percentage from environment, default to 25%
const BEIGE_MARGIN_PERCENT = parseFloat(process.env.BEIGE_MARGIN_PERCENT || '25.00');

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
      guest_email
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
        beige_margin_amount: pricing.beige_margin_amount.toString()
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
      notes
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
      return res.status(409).json({
        success: false,
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
      hours,
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

    await transaction.commit();

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
        status: 'succeeded'
      }
    });

  } catch (error) {
    await transaction.rollback();

    console.error('Payment Confirmation Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to process payment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
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
