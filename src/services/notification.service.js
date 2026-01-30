/**
 * Notification Service
 *
 * Handles notification creation, delivery, and preference management
 * for the CMS Approval States workflow.
 */

const db = require('../models');
const { Op } = require('sequelize');
const { STATE_METADATA, ROLES } = require('../config/stateTransitions');

// ============================================================================
// CONSTANTS
// ============================================================================

const NOTIFICATION_TYPES = {
  STATE_TRANSITION: 'STATE_TRANSITION',
  NEW_ASSIGNMENT: 'NEW_ASSIGNMENT',
  FEEDBACK_RECEIVED: 'FEEDBACK_RECEIVED',
  DEADLINE_APPROACHING: 'DEADLINE_APPROACHING',
  FILE_UPLOADED: 'FILE_UPLOADED',
  FILE_VALIDATION_FAILED: 'FILE_VALIDATION_FAILED',
  PROJECT_DELIVERED: 'PROJECT_DELIVERED',
  ASSIGNMENT_ACCEPTED: 'ASSIGNMENT_ACCEPTED',
  ASSIGNMENT_DECLINED: 'ASSIGNMENT_DECLINED',
  QC_REJECTION: 'QC_REJECTION',
  CLIENT_APPROVAL: 'CLIENT_APPROVAL',
  GENERAL_MESSAGE: 'GENERAL_MESSAGE',
};

const PRIORITY_LEVELS = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
};

// Map notification types to preference field names
const TYPE_TO_PREFERENCE_MAP = {
  STATE_TRANSITION: 'state_transitions',
  NEW_ASSIGNMENT: 'new_assignments',
  FEEDBACK_RECEIVED: 'feedback_received',
  DEADLINE_APPROACHING: 'deadline_approaching',
  FILE_UPLOADED: 'file_uploaded',
  FILE_VALIDATION_FAILED: 'file_validation_failed',
  PROJECT_DELIVERED: 'project_delivered',
  ASSIGNMENT_ACCEPTED: 'assignment_responses',
  ASSIGNMENT_DECLINED: 'assignment_responses',
  QC_REJECTION: 'qc_rejections',
  CLIENT_APPROVAL: 'client_approvals',
  GENERAL_MESSAGE: 'general_messages',
};

// ============================================================================
// CORE NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Create a notification for a user
 * @param {number} userId - User to notify
 * @param {string} type - Notification type (from NOTIFICATION_TYPES)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Created notification
 */
async function createNotification(userId, type, title, message, options = {}) {
  try {
    // Validate notification type
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
      console.warn(`Invalid notification type: ${type}`);
      type = NOTIFICATION_TYPES.GENERAL_MESSAGE;
    }

    // Check user preferences for in-app notifications
    const shouldShowInApp = await shouldShowInAppNotification(userId, type);
    if (!shouldShowInApp && !options.force) {
      console.log(`User ${userId} has disabled in-app notifications for type ${type}`);
      return null;
    }

    // Create notification record
    const notification = await db.notifications.create({
      user_id: userId,
      notification_type: type,
      title,
      message,
      action_url: options.actionUrl || null,
      related_project_id: options.projectId || null,
      related_file_id: options.fileId || null,
      related_feedback_id: options.feedbackId || null,
      related_assignment_id: options.assignmentId || null,
      priority: options.priority || PRIORITY_LEVELS.NORMAL,
      expires_at: options.expiresAt || null,
      is_read: 0,
      email_sent: 0,
      email_delivery_status: 'PENDING',
    });

    // Check if email should be sent
    const shouldEmail = await shouldSendEmail(userId, type);
    if (shouldEmail) {
      // Queue email (non-blocking)
      sendNotificationEmail(notification.notification_id).catch((error) => {
        console.error(`Failed to send notification email for ${notification.notification_id}:`, error);
      });
    }

    console.log(`Notification created: ${notification.notification_id} for user ${userId}`);
    return notification.toJSON();
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create notifications for multiple users
 * @param {Array<number>} userIds - Users to notify
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Results summary
 */
async function createBulkNotifications(userIds, type, title, message, options = {}) {
  const results = {
    total: userIds.length,
    created: 0,
    skipped: 0,
    failed: 0,
    notifications: [],
  };

  // Remove duplicates
  const uniqueUserIds = [...new Set(userIds)];

  for (const userId of uniqueUserIds) {
    try {
      const notification = await createNotification(userId, type, title, message, options);
      if (notification) {
        results.created++;
        results.notifications.push(notification);
      } else {
        results.skipped++;
      }
    } catch (error) {
      console.error(`Failed to create notification for user ${userId}:`, error);
      results.failed++;
    }
  }

  console.log(`Bulk notifications: ${results.created} created, ${results.skipped} skipped, ${results.failed} failed`);
  return results;
}

// ============================================================================
// NOTIFICATION RETRIEVAL
// ============================================================================

/**
 * Get notifications for a user with pagination
 * @param {number} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Paginated notifications
 */
async function getUserNotifications(userId, options = {}) {
  try {
    const { page = 1, limit = 20, unreadOnly = false, type = null } = options;
    const offset = (page - 1) * limit;

    // Build where clause
    const where = { user_id: userId };
    if (unreadOnly) {
      where.is_read = 0;
    }
    if (type) {
      where.notification_type = type;
    }

    // Exclude expired notifications
    where[Op.or] = [
      { expires_at: null },
      { expires_at: { [Op.gt]: new Date() } },
    ];

    // Fetch notifications with related data
    const { count, rows } = await db.notifications.findAndCountAll({
      where,
      include: [
        {
          model: db.projects,
          as: 'project',
          attributes: ['project_id', 'project_code', 'project_name', 'current_state'],
          required: false,
        },
      ],
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC'],
      ],
      limit,
      offset,
    });

    return {
      notifications: rows.map((n) => n.toJSON()),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasMore: offset + rows.length < count,
      },
    };
  } catch (error) {
    console.error('Error fetching user notifications:', error);
    throw error;
  }
}

/**
 * Get unread notification count for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Unread count
 */
async function getUnreadCount(userId) {
  try {
    const count = await db.notifications.count({
      where: {
        user_id: userId,
        is_read: 0,
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: new Date() } },
        ],
      },
    });
    return count;
  } catch (error) {
    console.error('Error getting unread count:', error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATION STATUS UPDATES
// ============================================================================

/**
 * Mark a notification as read
 * @param {number} notificationId - Notification ID
 * @param {number} userId - User ID (for ownership verification)
 * @returns {Promise<boolean>} Success status
 */
async function markAsRead(notificationId, userId) {
  try {
    const [updatedCount] = await db.notifications.update(
      {
        is_read: 1,
        read_at: new Date(),
      },
      {
        where: {
          notification_id: notificationId,
          user_id: userId,
        },
      }
    );

    if (updatedCount === 0) {
      console.warn(`Notification ${notificationId} not found or not owned by user ${userId}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 * @param {number} userId - User ID
 * @returns {Promise<number>} Number of notifications updated
 */
async function markAllAsRead(userId) {
  try {
    const [updatedCount] = await db.notifications.update(
      {
        is_read: 1,
        read_at: new Date(),
      },
      {
        where: {
          user_id: userId,
          is_read: 0,
        },
      }
    );

    console.log(`Marked ${updatedCount} notifications as read for user ${userId}`);
    return updatedCount;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

// ============================================================================
// SPECIALIZED NOTIFICATION CREATORS
// ============================================================================

/**
 * Create state transition notification
 * @param {Object} params - Transition parameters
 */
async function createStateTransitionNotification(params) {
  const {
    projectId,
    projectName,
    projectCode,
    fromState,
    toState,
    transitionedBy,
    recipientIds,
    reason,
  } = params;

  const fromMetadata = STATE_METADATA[fromState] || { displayName: fromState };
  const toMetadata = STATE_METADATA[toState] || { displayName: toState };

  const title = `Project Status Updated: ${projectCode}`;
  const message = `Project "${projectName}" has moved from "${fromMetadata.displayName}" to "${toMetadata.displayName}".${
    reason ? ` Reason: ${reason}` : ''
  }`;

  // Determine priority based on state type
  let priority = PRIORITY_LEVELS.NORMAL;
  if (toMetadata.isRejectionState) {
    priority = PRIORITY_LEVELS.HIGH;
  } else if (toState === 'CLIENT_PREVIEW_READY' || toState === 'DELIVERED') {
    priority = PRIORITY_LEVELS.HIGH;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = `${frontendUrl}/cms/projects/${projectId}`;

  return createBulkNotifications(recipientIds, NOTIFICATION_TYPES.STATE_TRANSITION, title, message, {
    projectId,
    priority,
    actionUrl,
  });
}

/**
 * Create assignment notification
 * @param {Object} params - Assignment parameters
 */
async function notifyAssignment(params) {
  const { projectId, projectName, projectCode, assignedUserId, roleType, assignedByName, deadline } = params;

  const title = `New Assignment: ${projectCode}`;
  let message = `You have been assigned as ${roleType} for project "${projectName}".`;
  if (deadline) {
    const deadlineDate = new Date(deadline).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    message += ` Deadline: ${deadlineDate}`;
  }
  if (assignedByName) {
    message += ` Assigned by: ${assignedByName}`;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = `${frontendUrl}/cms/projects/${projectId}`;

  return createNotification(assignedUserId, NOTIFICATION_TYPES.NEW_ASSIGNMENT, title, message, {
    projectId,
    priority: PRIORITY_LEVELS.HIGH,
    actionUrl,
  });
}

/**
 * Create feedback notification
 * @param {Object} params - Feedback parameters
 */
async function notifyFeedback(params) {
  const { projectId, projectName, projectCode, feedbackType, submittedByName, feedbackSummary, recipientIds } = params;

  const isClientFeedback = feedbackType === 'CLIENT';
  const title = `${isClientFeedback ? 'Client' : 'QC'} Feedback Received: ${projectCode}`;
  let message = `${isClientFeedback ? 'Client' : 'Internal QC'} feedback has been submitted for project "${projectName}".`;
  if (feedbackSummary) {
    message += ` Summary: ${feedbackSummary}`;
  }
  if (submittedByName) {
    message += ` Submitted by: ${submittedByName}`;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = `${frontendUrl}/cms/projects/${projectId}/feedback`;

  return createBulkNotifications(recipientIds, NOTIFICATION_TYPES.FEEDBACK_RECEIVED, title, message, {
    projectId,
    priority: PRIORITY_LEVELS.HIGH,
    actionUrl,
  });
}

/**
 * Create deadline reminder notification
 * @param {Object} params - Deadline parameters
 */
async function notifyDeadlineApproaching(params) {
  const { projectId, projectName, projectCode, deadlineType, deadline, recipientUserId } = params;

  const deadlineDate = new Date(deadline);
  const formattedDeadline = deadlineDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const deadlineTypeDisplay = {
    raw_upload: 'RAW Upload',
    edit_delivery: 'Edit Delivery',
    final_delivery: 'Final Delivery',
  }[deadlineType] || deadlineType;

  const title = `Deadline Approaching: ${projectCode}`;
  const message = `The ${deadlineTypeDisplay} deadline for project "${projectName}" is approaching. Due: ${formattedDeadline}`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = `${frontendUrl}/cms/projects/${projectId}`;

  return createNotification(recipientUserId, NOTIFICATION_TYPES.DEADLINE_APPROACHING, title, message, {
    projectId,
    priority: PRIORITY_LEVELS.URGENT,
    actionUrl,
  });
}

/**
 * Create file upload notification
 * @param {Object} params - File upload parameters
 */
async function notifyFileUploaded(params) {
  const { projectId, projectName, projectCode, fileName, fileType, uploadedByName, recipientIds } = params;

  const title = `New File Uploaded: ${projectCode}`;
  const message = `A new ${fileType} file "${fileName}" has been uploaded to project "${projectName}" by ${uploadedByName}.`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = `${frontendUrl}/cms/projects/${projectId}/files`;

  return createBulkNotifications(recipientIds, NOTIFICATION_TYPES.FILE_UPLOADED, title, message, {
    projectId,
    priority: PRIORITY_LEVELS.NORMAL,
    actionUrl,
  });
}

/**
 * Create delivery notification for client
 * @param {Object} params - Delivery parameters
 */
async function notifyDelivery(params) {
  const { projectId, projectName, projectCode, clientUserId, deliveryLink } = params;

  const title = `Project Delivered: ${projectCode}`;
  const message = `Your project "${projectName}" has been completed and delivered. You can now download your files.`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = deliveryLink || `${frontendUrl}/cms/projects/${projectId}/delivery`;

  return createNotification(clientUserId, NOTIFICATION_TYPES.PROJECT_DELIVERED, title, message, {
    projectId,
    priority: PRIORITY_LEVELS.HIGH,
    actionUrl,
  });
}

/**
 * Create QC rejection notification
 * @param {Object} params - Rejection parameters
 */
async function notifyQCRejection(params) {
  const { projectId, projectName, projectCode, rejectionReason, recipientUserId, qcType } = params;

  const qcTypeDisplay = qcType === 'TECH' ? 'Technical QC' : 'Revision QC';
  const title = `${qcTypeDisplay} Rejected: ${projectCode}`;
  const message = `Your submission for project "${projectName}" did not pass ${qcTypeDisplay}. Reason: ${rejectionReason}`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const actionUrl = `${frontendUrl}/cms/projects/${projectId}`;

  return createNotification(recipientUserId, NOTIFICATION_TYPES.QC_REJECTION, title, message, {
    projectId,
    priority: PRIORITY_LEVELS.HIGH,
    actionUrl,
  });
}

// ============================================================================
// EMAIL FUNCTIONS
// ============================================================================

/**
 * Send email for a notification
 * @param {number} notificationId - Notification ID
 * @returns {Promise<Object>} Email result
 */
async function sendNotificationEmail(notificationId) {
  try {
    // Get notification with user details
    const notification = await db.notifications.findOne({
      where: { notification_id: notificationId },
      include: [
        {
          model: db.users,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.projects,
          as: 'project',
          attributes: ['project_id', 'project_code', 'project_name', 'current_state'],
          required: false,
        },
      ],
    });

    if (!notification) {
      throw new Error(`Notification ${notificationId} not found`);
    }

    if (!notification.user || !notification.user.email) {
      throw new Error(`User email not found for notification ${notificationId}`);
    }

    // Get email service
    const emailService = require('../utils/emailService');

    // Generate email content based on notification type
    const emailContent = generateEmailContent(notification.toJSON());

    // Send email using nodemailer (reuse existing transporter pattern)
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Revure'}" <${process.env.EMAIL_USER}>`,
      to: notification.user.email,
      subject: notification.title,
      html: emailContent,
    };

    const info = await transporter.sendMail(mailOptions);

    // Update notification with email status
    await db.notifications.update(
      {
        email_sent: 1,
        email_sent_at: new Date(),
        email_delivery_status: 'SENT',
      },
      {
        where: { notification_id: notificationId },
      }
    );

    console.log(`Notification email sent: ${info.messageId} for notification ${notificationId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending notification email:', error);

    // Update notification with error status
    await db.notifications.update(
      {
        email_delivery_status: 'FAILED',
        email_delivery_error: error.message,
      },
      {
        where: { notification_id: notificationId },
      }
    );

    return { success: false, error: error.message };
  }
}

/**
 * Generate email HTML content based on notification type
 * @param {Object} notification - Notification object
 * @returns {string} HTML email content
 */
function generateEmailContent(notification) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const project = notification.project;
  const actionUrl = notification.action_url || frontendUrl;

  // Determine color based on notification type/priority
  let headerColor = '#667eea'; // Default purple
  if (notification.notification_type === 'QC_REJECTION' || notification.notification_type === 'FILE_VALIDATION_FAILED') {
    headerColor = '#ef4444'; // Red
  } else if (notification.notification_type === 'PROJECT_DELIVERED' || notification.notification_type === 'CLIENT_APPROVAL') {
    headerColor = '#10b981'; // Green
  } else if (notification.priority === 'URGENT') {
    headerColor = '#f59e0b'; // Orange
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${notification.title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, ${headerColor} 0%, ${adjustColor(headerColor, -20)} 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">${escapeHtml(notification.title)}</h1>
                  ${project ? `<p style="margin: 10px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Project: ${escapeHtml(project.project_code)}</p>` : ''}
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    Hi <strong>${escapeHtml(notification.user?.name || 'there')}</strong>,
                  </p>
                  <p style="margin: 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    ${escapeHtml(notification.message)}
                  </p>

                  ${project ? `
                  <!-- Project Details Card -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
                    <tr>
                      <td style="padding: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="font-size: 14px; color: #6b7280; padding: 8px 0;">
                              <strong style="color: #374151;">Project:</strong>
                            </td>
                            <td style="font-size: 14px; color: #374151; text-align: right; padding: 8px 0;">
                              ${escapeHtml(project.project_name)}
                            </td>
                          </tr>
                          <tr>
                            <td style="font-size: 14px; color: #6b7280; padding: 8px 0;">
                              <strong style="color: #374151;">Status:</strong>
                            </td>
                            <td style="font-size: 14px; color: #374151; text-align: right; padding: 8px 0;">
                              ${formatStateName(project.current_state)}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${actionUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, ${headerColor} 0%, ${adjustColor(headerColor, -20)} 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);">
                      View Details
                    </a>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                    This is an automated notification from Revure.
                  </p>
                  <p style="margin: 10px 0 0; font-size: 12px; color: #9ca3af;">
                    To manage your notification preferences, visit your <a href="${frontendUrl}/settings/notifications" style="color: #667eea; text-decoration: none;">settings</a>.
                  </p>
                  <p style="margin: 10px 0 0; font-size: 13px; color: #9ca3af;">
                    &copy; ${new Date().getFullYear()} Revure. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// ============================================================================
// DAILY DIGEST
// ============================================================================

/**
 * Process daily digest emails for all users with digest enabled
 * @returns {Promise<Object>} Processing results
 */
async function processDailyDigest() {
  try {
    // Get users with daily digest enabled
    const preferences = await db.notification_preferences.findAll({
      where: {
        enable_daily_digest: 1,
      },
      include: [
        {
          model: db.users,
          as: 'user',
          attributes: ['id', 'name', 'email'],
          where: { is_active: 1 },
        },
      ],
    });

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    };

    for (const pref of preferences) {
      results.processed++;

      try {
        // Get unread notifications from last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const notifications = await db.notifications.findAll({
          where: {
            user_id: pref.user_id,
            is_read: 0,
            email_sent: 0,
            created_at: { [Op.gte]: twentyFourHoursAgo },
          },
          include: [
            {
              model: db.projects,
              as: 'project',
              attributes: ['project_id', 'project_code', 'project_name'],
              required: false,
            },
          ],
          order: [['created_at', 'DESC']],
        });

        if (notifications.length === 0) {
          results.skipped++;
          continue;
        }

        // Send digest email
        const digestResult = await sendDigestEmail(pref.user, notifications);
        if (digestResult.success) {
          results.sent++;

          // Mark notifications as email sent
          const notificationIds = notifications.map((n) => n.notification_id);
          await db.notifications.update(
            {
              email_sent: 1,
              email_sent_at: new Date(),
              email_delivery_status: 'SENT',
            },
            {
              where: { notification_id: { [Op.in]: notificationIds } },
            }
          );

          // Update last digest sent timestamp
          await db.notification_preferences.update(
            { last_digest_sent_at: new Date() },
            { where: { preference_id: pref.preference_id } }
          );
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`Error processing digest for user ${pref.user_id}:`, error);
        results.failed++;
      }
    }

    console.log(`Daily digest processing complete:`, results);
    return results;
  } catch (error) {
    console.error('Error processing daily digest:', error);
    throw error;
  }
}

/**
 * Send digest email to a user
 * @param {Object} user - User object
 * @param {Array} notifications - Notifications to include
 * @returns {Promise<Object>} Send result
 */
async function sendDigestEmail(user, notifications) {
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Group notifications by type
    const groupedNotifications = {};
    for (const n of notifications) {
      const type = n.notification_type;
      if (!groupedNotifications[type]) {
        groupedNotifications[type] = [];
      }
      groupedNotifications[type].push(n.toJSON());
    }

    // Generate digest HTML
    let notificationListHtml = '';
    for (const [type, items] of Object.entries(groupedNotifications)) {
      notificationListHtml += `
        <tr>
          <td style="padding: 15px 0; border-bottom: 1px solid #e5e7eb;">
            <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #374151;">
              ${formatNotificationType(type)} (${items.length})
            </p>
            <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.6;">
              ${items
                .slice(0, 5)
                .map((n) => `<li>${escapeHtml(n.title)}</li>`)
                .join('')}
              ${items.length > 5 ? `<li style="font-style: italic;">...and ${items.length - 5} more</li>` : ''}
            </ul>
          </td>
        </tr>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Daily Notification Digest</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Daily Digest</h1>
                    <p style="margin: 10px 0 0; color: #e0e7ff; font-size: 14px;">Your notification summary for ${new Date().toLocaleDateString()}</p>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
                      Hi <strong>${escapeHtml(user.name)}</strong>,
                    </p>
                    <p style="margin: 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                      Here's a summary of your ${notifications.length} unread notification${notifications.length > 1 ? 's' : ''} from the past 24 hours:
                    </p>

                    <!-- Notification Summary -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
                      ${notificationListHtml}
                    </table>

                    <!-- CTA Button -->
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${frontendUrl}/notifications" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                        View All Notifications
                      </a>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                      You're receiving this digest because you have daily notifications enabled.
                    </p>
                    <p style="margin: 10px 0 0; font-size: 12px; color: #9ca3af;">
                      <a href="${frontendUrl}/settings/notifications" style="color: #667eea; text-decoration: none;">Manage preferences</a>
                    </p>
                    <p style="margin: 10px 0 0; font-size: 13px; color: #9ca3af;">
                      &copy; ${new Date().getFullYear()} Revure. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Revure'}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Daily Digest: ${notifications.length} new notification${notifications.length > 1 ? 's' : ''}`,
      html: emailHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Digest email sent to ${user.email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending digest email:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PREFERENCE CHECKING
// ============================================================================

/**
 * Check if email should be sent for a notification type
 * @param {number} userId - User ID
 * @param {string} notificationType - Notification type
 * @returns {Promise<boolean>} Whether email should be sent
 */
async function shouldSendEmail(userId, notificationType) {
  try {
    // Get or create user preferences
    let preferences = await db.notification_preferences.findOne({
      where: { user_id: userId },
    });

    if (!preferences) {
      // Create default preferences
      preferences = await db.notification_preferences.create({
        user_id: userId,
      });
    }

    const prefs = preferences.toJSON();

    // Check master email toggle
    if (!prefs.enable_all_emails) {
      return false;
    }

    // Check quiet hours
    if (prefs.enable_quiet_hours && isQuietHours(prefs)) {
      return false;
    }

    // Check frequency setting - if not realtime, emails go through digest
    if (prefs.notification_frequency !== 'REALTIME') {
      return false;
    }

    // Check type-specific preference
    const preferenceKey = TYPE_TO_PREFERENCE_MAP[notificationType];
    if (preferenceKey) {
      const emailPrefKey = `email_${preferenceKey}`;
      if (prefs[emailPrefKey] === 0) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking email preferences:', error);
    return true; // Default to sending email on error
  }
}

/**
 * Check if in-app notification should be shown
 * @param {number} userId - User ID
 * @param {string} notificationType - Notification type
 * @returns {Promise<boolean>} Whether notification should be shown
 */
async function shouldShowInAppNotification(userId, notificationType) {
  try {
    let preferences = await db.notification_preferences.findOne({
      where: { user_id: userId },
    });

    if (!preferences) {
      return true; // Default to showing if no preferences set
    }

    const prefs = preferences.toJSON();

    // Check master in-app toggle
    if (!prefs.enable_all_inapp) {
      return false;
    }

    // Check type-specific preference
    const preferenceKey = TYPE_TO_PREFERENCE_MAP[notificationType];
    if (preferenceKey) {
      const inappPrefKey = `inapp_${preferenceKey}`;
      if (prefs[inappPrefKey] === 0) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Error checking in-app preferences:', error);
    return true; // Default to showing on error
  }
}

/**
 * Check if current time is within quiet hours
 * @param {Object} prefs - User preferences
 * @returns {boolean} Whether it's quiet hours
 */
function isQuietHours(prefs) {
  try {
    const now = new Date();
    const timezone = prefs.quiet_hours_timezone || 'America/Los_Angeles';

    // Get current time in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentTime = formatter.format(now);
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    // Parse quiet hours
    const [startHour, startMinute] = prefs.quiet_hours_start.split(':').map(Number);
    const [endHour, endMinute] = prefs.quiet_hours_end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch (error) {
    console.error('Error checking quiet hours:', error);
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Adjust hex color brightness
 * @param {string} hex - Hex color
 * @param {number} amount - Amount to adjust (-255 to 255)
 * @returns {string} Adjusted hex color
 */
function adjustColor(hex, amount) {
  const clamp = (num) => Math.min(255, Math.max(0, num));
  hex = hex.replace('#', '');
  const r = clamp(parseInt(hex.substr(0, 2), 16) + amount);
  const g = clamp(parseInt(hex.substr(2, 2), 16) + amount);
  const b = clamp(parseInt(hex.substr(4, 2), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Format state name for display
 * @param {string} state - State constant
 * @returns {string} Formatted state name
 */
function formatStateName(state) {
  if (STATE_METADATA[state]) {
    return STATE_METADATA[state].displayName;
  }
  return state
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format notification type for display
 * @param {string} type - Notification type
 * @returns {string} Formatted type
 */
function formatNotificationType(type) {
  const typeNames = {
    STATE_TRANSITION: 'Status Updates',
    NEW_ASSIGNMENT: 'New Assignments',
    FEEDBACK_RECEIVED: 'Feedback',
    DEADLINE_APPROACHING: 'Deadline Reminders',
    FILE_UPLOADED: 'File Uploads',
    FILE_VALIDATION_FAILED: 'Validation Issues',
    PROJECT_DELIVERED: 'Deliveries',
    ASSIGNMENT_ACCEPTED: 'Assignment Responses',
    ASSIGNMENT_DECLINED: 'Assignment Responses',
    QC_REJECTION: 'QC Rejections',
    CLIENT_APPROVAL: 'Client Approvals',
    GENERAL_MESSAGE: 'General Messages',
  };
  return typeNames[type] || type;
}

/**
 * Delete old notifications (cleanup job)
 * @param {number} daysOld - Delete notifications older than this many days
 * @returns {Promise<number>} Number of deleted notifications
 */
async function cleanupOldNotifications(daysOld = 90) {
  try {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const deletedCount = await db.notifications.destroy({
      where: {
        created_at: { [Op.lt]: cutoffDate },
        is_read: 1, // Only delete read notifications
      },
    });

    console.log(`Cleaned up ${deletedCount} old notifications`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  NOTIFICATION_TYPES,
  PRIORITY_LEVELS,

  // Core functions
  createNotification,
  createBulkNotifications,

  // Retrieval
  getUserNotifications,
  getUnreadCount,

  // Status updates
  markAsRead,
  markAllAsRead,

  // Specialized creators
  createStateTransitionNotification,
  notifyAssignment,
  notifyFeedback,
  notifyDeadlineApproaching,
  notifyFileUploaded,
  notifyDelivery,
  notifyQCRejection,

  // Email functions
  sendNotificationEmail,
  processDailyDigest,

  // Preference checking
  shouldSendEmail,
  shouldShowInAppNotification,

  // Utilities
  cleanupOldNotifications,
};
