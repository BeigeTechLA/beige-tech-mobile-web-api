const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../models');
const { generateConfirmationNumber } = require('../utils/confirmationNumber');

/**
 * Process payment and create booking
 * POST /api/payments/confirm
 */
exports.confirmPayment = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const {
      paymentIntentId,
      bookingData,
      amount,
      currency = 'USD'
    } = req.body;

    // Validate required fields
    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'Payment intent ID is required'
      });
    }

    if (!bookingData) {
      return res.status(400).json({
        success: false,
        message: 'Booking data is required'
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

    // Create booking in stream_project_booking table
    const booking = await db.stream_project_booking.create({
      project_name: bookingData.project_name,
      description: bookingData.description,
      event_type: bookingData.event_type,
      event_date: bookingData.event_date,
      duration_hours: bookingData.duration_hours,
      start_time: bookingData.start_time,
      end_time: bookingData.end_time,
      budget: amount,
      expected_viewers: bookingData.expected_viewers,
      stream_quality: bookingData.stream_quality,
      crew_size_needed: bookingData.crew_size_needed,
      event_location: bookingData.event_location,
      streaming_platforms: JSON.stringify(bookingData.streaming_platforms || []),
      crew_roles: JSON.stringify(bookingData.crew_roles || []),
      skills_needed: JSON.stringify(bookingData.skills_needed || []),
      equipments_needed: JSON.stringify(bookingData.equipments_needed || []),
      is_draft: false,
      is_completed: false,
      is_cancelled: false,
      is_active: true
    }, { transaction });

    // Generate confirmation number
    let confirmationNumber;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      confirmationNumber = generateConfirmationNumber();
      const existingPayment = await db.payments.findOne({
        where: { confirmation_number: confirmationNumber }
      });
      if (!existingPayment) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Failed to generate unique confirmation number');
    }

    // Create payment record
    const payment = await db.payments.create({
      booking_id: booking.stream_project_booking_id,
      user_id: req.userId || null,
      amount: amount,
      currency: currency.toUpperCase(),
      stripe_transaction_id: paymentIntent.id,
      status: 'succeeded',
      confirmation_number: confirmationNumber
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Payment confirmed and booking created',
      data: {
        payment_id: payment.payment_id,
        booking_id: booking.stream_project_booking_id,
        confirmation_number: confirmationNumber,
        transaction_id: paymentIntent.id,
        amount: amount,
        currency: currency,
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
 * Get payment status
 * GET /api/payments/:id/status
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Find payment by payment_id or confirmation_number
    const payment = await db.payments.findOne({
      where: db.Sequelize.or(
        { payment_id: id },
        { confirmation_number: id }
      ),
      include: [
        {
          model: db.stream_project_booking,
          as: 'booking',
          attributes: [
            'stream_project_booking_id',
            'project_name',
            'event_date',
            'event_location',
            'is_completed',
            'is_cancelled'
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
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        confirmation_number: payment.confirmation_number,
        transaction_id: payment.stripe_transaction_id,
        created_at: payment.created_at,
        booking: payment.booking
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
 * Create payment intent (for frontend to initiate payment)
 * POST /api/payments/create-intent
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'USD', metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        userId: req.userId || 'guest',
        ...metadata
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
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
