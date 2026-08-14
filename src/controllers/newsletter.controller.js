const emailService = require('../utils/emailService');
const db = require('../models');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.subscribeToNewsletter = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const now = new Date();
    const source = String(req.body?.source || 'press-blogs').trim() || 'press-blogs';
    const [subscriber, created] = await db.newsletter_subscribers.findOrCreate({
      where: { email },
      defaults: {
        email,
        source,
        status: 'active',
        subscribed_at: now,
        last_subscribed_at: now,
        created_at: now,
        updated_at: now
      }
    });

    if (!created) {
      await subscriber.update({
        source,
        status: 'active',
        last_subscribed_at: now,
        updated_at: now
      });
    }

    const emailResult = await emailService.sendNewsletterSubscriptionNotification({
      email,
      source,
      submittedAt: now.toISOString()
    });

    if (!emailResult.success) {
      await subscriber.update({
        last_notification_error: String(emailResult.error || 'Email service error').slice(0, 2000),
        updated_at: new Date()
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to send newsletter subscription email',
        data: {
          id: subscriber.id,
          email,
          alreadySubscribed: !created,
          stored: true
        },
        error: process.env.NODE_ENV === 'development' ? emailResult.error : 'Email service error'
      });
    }

    await subscriber.update({
      notification_sent_at: new Date(),
      last_notification_error: null,
      updated_at: new Date()
    });

    return res.status(200).json({
      success: true,
      message: created
        ? 'Newsletter subscription request sent successfully'
        : 'Newsletter subscription already exists. Notification sent successfully',
      data: {
        id: subscriber.id,
        email,
        alreadySubscribed: !created
      }
    });
  } catch (error) {
    console.error('Newsletter Subscription Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit newsletter subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
