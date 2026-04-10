const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();
const db = require('../models');
const { stream_project_booking, assigned_crew, crew_members } = db;
const { toAbsoluteBeigeAssetUrl } = require('../utils/common');

/**
 * Email service using Gmail SMTP
 * Configure your Gmail App Password in .env file
 * https://support.google.com/accounts/answer/185833
 */

// Create reusable transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD
  }
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Email service configuration error:', error);
  } else {
    console.log('Email service ready to send emails');
  }
});

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const getSendgridFromName = () =>
  (process.env.SENDGRID_FROM_NAME || '').trim() || 'Beige AI';

const getSendgridFromAddress = () =>
  (process.env.SENDGRID_FROM_EMAIL || '').trim();

const {
  CLIENT_SIGNUP_WELCOME_TEMPLATE_ID,
  PAYMENT_CONFIRMED_TEMPLATE_ID,
  SHOOT_LEAD_NOTIFICATION_TEMPLATE_ID,
  PRODUCTION_LEAD_NOTIFICATION_TEMPLATE_ID,
  BOOKING_CONFIRMED_WITH_CP_TEMPLATE_ID,
  BOOKING_CONFIRMED_WITHOUT_CP_TEMPLATE_ID,
  SHOOT_REMINDER_5D_TEMPLATE_ID,
  SHOOT_REMINDER_2H_TEMPLATE_ID,
  SHOOT_COMPLETION_TEMPLATE_ID,
  SHOOT_FINAL_NUDGE_7D_TEMPLATE_ID,
  POST_PRODUCTION_STATUS_UPDATE_TEMPLATE_ID,
  RAW_FOOTAGE_READY_TEMPLATE_ID,
  FINAL_DELIVERY_COMPLETE_TEMPLATE_ID,
  REVISION_REQUEST_RECEIVED_TEMPLATE_ID,
  REVISED_CONTENT_DELIVERED_TEMPLATE_ID,
  FINAL_DELIVERY_WITH_REVISION_TEMPLATE_ID,
  CP_ACCEPT_REJECT_TEMPLATE_ID,
  CP_NEW_BOOKING_REQUEST_TEMPLATE_ID,
  VERIFICATION_OTP_TEMPLATE_ID,
  PASSWORD_RESET_TEMPLATE_ID,
  SALES_PAYMENT_SUCCESS_TEMPLATE_ID,
  SALES_LEAD_NOTIFICATION_TEMPLATE_ID,
  CLIENT_SIGNUP_NOTIFICATION_TEMPLATE_ID,
  CREW_SIGNUP_NOTIFICATION_TEMPLATE_ID,
  CP_SIGNUP_WELCOME_TEMPLATE_ID,
  PRODUCTION_PROPOSAL_TEMPLATE_ID,
  CP_CONFIRMED_TEMPLATE_ID,
  CUSTOM_QUOTE_PROPOSAL_ID
} = require('../config/sendgridTemplates');

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime = (value) => {
  if (!value) return '';
  const txt = String(value);
  const [hh, mm] = txt.split(':');
  if (hh === undefined || mm === undefined) return txt;
  const h = Number(hh);
  if (Number.isNaN(h)) return txt;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
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
        trimmed
      );
    }
  } catch (_) {}
  return trimmed;
};

const getFirstName = (name, fallbackFirstName) => {
  if (fallbackFirstName && fallbackFirstName.trim()) return fallbackFirstName.trim();
  if (!name || !name.trim()) return 'there';
  return name.trim().split(/\s+/)[0];
};

const splitName = (fullName = '', fallbackEmail = '') => {
  const normalizedName = String(fullName || '').trim();
  if (normalizedName) {
    const parts = normalizedName.split(/\s+/);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ')
    };
  }

  const emailLocalPart = String(fallbackEmail || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!emailLocalPart) {
    return { firstName: '', lastName: '' };
  }

  const parts = emailLocalPart.split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ')
  };
};

const formatEditingStatus = (value) => (value ? 'Yes' : 'No');

const formatContentTypes = (value) => {
  const labelMap = {
    videographer: 'Videography',
    photographer: 'Photography'
  };

  const items = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  return items
    .map((item) => {
      const normalized = String(item || '').trim();
      return labelMap[normalized.toLowerCase()] || normalized;
    })
    .join(', ');
};

const formatShootTypes = (value) => {
  const labelMap = {
    corporate: 'Corporate Event',
    wedding: 'Wedding',
    private: 'Private Event',
    commercial: 'Commercial & Advertising',
    social_content: 'Social Content',
    podcast: 'Podcasts & Shows',
    music: 'Music Videos',
    short_film: 'Short Films & Narrative',
    brand_product: 'Brand & Product',
    people_teams: 'People & Teams',
    behind_scenes: 'Behind-the-Scenes'
  };

  const items = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  return items
    .map((item) => {
      const normalized = String(item || '').trim();
      return labelMap[normalized.toLowerCase()] || normalized;
    })
    .join(', ');
};

const formatAmount = (value) => Number(value || 0).toFixed(2);

const parseLocationParts = (location) => {
  if (!location) {
    return {
      name: '',
      address: 'TBD'
    };
  }

  const fallback = formatLocation(location);

  const extractParts = (value) => {
    if (!value || typeof value !== 'object') return null;
    return {
      name:
        value.place_name ||
        value.location_name ||
        value.name ||
        value.title ||
        '',
      address:
        value.address ||
        value.full_address ||
        value.formatted_address ||
        fallback
    };
  };

  if (typeof location === 'object') {
    return extractParts(location) || { name: '', address: fallback };
  }

  const trimmed = String(location).trim();
  if (!trimmed) {
    return { name: '', address: 'TBD' };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return extractParts(parsed) || { name: '', address: fallback };
  } catch (_) {
    return { name: '', address: fallback };
  }
};

const formatExperienceSummary = (crew) => {
  const years = Number(crew?.years_of_experience);
  if (!Number.isFinite(years) || years <= 0) return '';
  return years === 1 ? '1 year experience' : `${years} years experience`;
};

const sendEmail = async ({ to, subject, templateId, dynamicTemplateData }) => {
  if (!process.env.SENDGRID_API_KEY) return { success: false, error: 'SENDGRID_API_KEY is not configured' };
  if (!templateId) return { success: false, error: 'Template ID is not configured' };
  if (!to) return { success: false, error: 'Recipient email is required' };

  const fromEmail = getSendgridFromAddress();
  if (!fromEmail) return { success: false, error: 'Sender email not configured' };

  const [response] = await sgMail.send({
    to,
    from: {
      email: fromEmail,
      name: getSendgridFromName()
    },
    subject,
    templateId,
    dynamicTemplateData
  });

  console.log(response)

  return {
    success: true,
    statusCode: response?.statusCode,
    messageId: response?.headers?.['x-message-id'] || response?.headers?.['X-Message-Id'] || null
  };
};

/**
 * Send task assignment notification email
 * @param {Object} taskData - Task details
 * @param {Object} assigneeData - Crew member details
 */
const sendTaskAssignmentEmail = async (taskData, assigneeData) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const taskId = taskData.assign_task_id || taskData.task_id;
    const taskLink = `${frontendUrl}/tasks/${taskId}`;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: assigneeData.email,
      subject: `New Task Assigned: ${taskData.title}`,
      html: generateTaskAssignmentTemplate(taskData, assigneeData, taskLink)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Task assignment email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending task assignment email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Generate HTML email template for task assignment
 */
const generateTaskAssignmentTemplate = (taskData, assigneeData, taskLink) => {
  const dueDate = taskData.due_date
    ? new Date(taskData.due_date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    : 'Not specified';

  const priority = taskData.priority_id === 1 ? 'Low' : taskData.priority_id === 2 ? 'Medium' : 'High';
  const priorityColor = taskData.priority_id === 1 ? '#10b981' : taskData.priority_id === 2 ? '#f59e0b' : '#ef4444';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Task Assignment</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <!-- Main Container -->
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">New Task Assigned</h1>
                  <p style="margin: 10px 0 0; color: #e0e7ff; font-size: 14px;">You have been assigned a new task</p>
                </td>
              </tr>

              <!-- Greeting -->
              <tr>
                <td style="padding: 30px 30px 20px;">
                  <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    Hi <strong>${assigneeData.first_name} ${assigneeData.last_name}</strong>,
                  </p>
                  <p style="margin: 15px 0 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    A new task has been assigned to you on the BeigeAI platform.
                  </p>
                </td>
              </tr>

              <!-- Task Details Card -->
              <tr>
                <td style="padding: 0 30px 30px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <tr>
                      <td style="padding: 20px;">

                        <!-- Task Title -->
                        <h2 style="margin: 0 0 15px; font-size: 20px; color: #111827; font-weight: 600;">
                          ${taskData.title}
                        </h2>

                        <!-- Priority Badge -->
                        <div style="margin-bottom: 15px;">
                          <span style="display: inline-block; padding: 6px 12px; background-color: ${priorityColor}; color: #ffffff; font-size: 12px; font-weight: 600; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${priority} Priority
                          </span>
                        </div>

                        <!-- Description -->
                        ${taskData.description ? `
                        <div style="margin-bottom: 15px;">
                          <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                            ${taskData.description}
                          </p>
                        </div>
                        ` : ''}

                        <!-- Task Metadata -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 15px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">
                              <strong style="color: #374151;">Due Date:</strong>
                            </td>
                            <td style="padding: 8px 0; font-size: 14px; color: #374151; text-align: right;">
                              ${dueDate}
                            </td>
                          </tr>
                          ${taskData.estimated_duration ? `
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">
                              <strong style="color: #374151;">Estimated Duration:</strong>
                            </td>
                            <td style="padding: 8px 0; font-size: 14px; color: #374151; text-align: right;">
                              ${taskData.estimated_duration} hours
                            </td>
                          </tr>
                          ` : ''}
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">
                              <strong style="color: #374151;">Status:</strong>
                            </td>
                            <td style="padding: 8px 0; font-size: 14px; color: #374151; text-align: right;">
                              ${taskData.status || 'Assigned'}
                            </td>
                          </tr>
                        </table>

                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td style="padding: 0 30px 30px; text-align: center;">
                  <a href="${taskLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                    View Task Details
                  </a>
                </td>
              </tr>

              <!-- Additional Notes -->
              ${taskData.additional_notes ? `
              <tr>
                <td style="padding: 0 30px 30px;">
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
                    <p style="margin: 0; font-size: 13px; color: #78350f; font-weight: 600;">Additional Notes:</p>
                    <p style="margin: 8px 0 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                      ${taskData.additional_notes}
                    </p>
                  </div>
                </td>
              </tr>
              ` : ''}

              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                    This is an automated notification from the BeigeAI Platform.
                  </p>
                  <p style="margin: 10px 0 0; font-size: 13px; color: #9ca3af;">
                    © ${new Date().getFullYear()} BeigeAI. All rights reserved.
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
};

/**
 * Send email verification OTP
 * @param {Object} userData - User details
 * @param {string} otp - 6-digit OTP
 */
const sendVerificationOTP = async (userData, otp) => {
  try {
    if (!userData?.email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!VERIFICATION_OTP_TEMPLATE_ID) {
      return { success: false, error: 'VERIFICATION_OTP_TEMPLATE_ID is not configured' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const [response] = await sgMail.send({
      to: userData.email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Verify Your Email - BeigeAI',
      templateId: VERIFICATION_OTP_TEMPLATE_ID,
      dynamicTemplateData: {
        userData: {
          name: userData.name || 'there'
        },
        otp,
        expiry_minutes: 10,
        year: new Date().getFullYear()
      }
    });

    console.log(response)
    return {
      success: true,
      statusCode: response?.statusCode,
      messageId:
        response?.headers?.['x-message-id'] ||
        response?.headers?.['X-Message-Id'] ||
        null
    };
  } catch (error) {
    console.error('Error sending verification OTP email via SendGrid:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send password reset email
 * @param {Object} userData - User details
 * @param {string} resetToken - Reset token
 */
const sendPasswordResetEmail = async (userData, resetToken) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!PASSWORD_RESET_TEMPLATE_ID) {
      return { success: false, error: 'PASSWORD_RESET_TEMPLATE_ID is not configured' };
    }

    if (!userData?.email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const frontendUrl = process.env.FRONTEND_URL;
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    const [response] = await sgMail.send({
      to: userData.email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Reset Your Password - BeigeAI',
      templateId: PASSWORD_RESET_TEMPLATE_ID,
      dynamicTemplateData: {
        user_name: userData.name || 'there',
        reset_link: resetLink,
        reset_token: resetToken,
        expiry_minutes: 15,
        year: new Date().getFullYear()
      }
    });

    return {
      success: true,
      statusCode: response?.statusCode,
      messageId: response?.headers?.['x-message-id'] || response?.headers?.['X-Message-Id'] || null
    };
  } catch (error) {
    console.error('Error sending password reset email via SendGrid:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send client signup welcome email via SendGrid dynamic template
 * Trigger: successful client registration
 * @param {Object} userData - User details
 */
const sendClientSignupWelcomeEmail = async (userData) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key missing. Skipping client signup welcome email.');
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!userData?.email) {
      return { success: false, error: 'Client email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const msg = {
      to: userData.email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      templateId: CLIENT_SIGNUP_WELCOME_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: getFirstName(userData.name, userData.first_name) || 'there',
        frontendUrl: `${process.env.FRONTEND_URL}/book-a-shoot`
      }
    };

    await sgMail.send(msg);
    console.log(`Client signup welcome email sent to ${userData.email} using SendGrid template.`);
    return { success: true };
  } catch (error) {
    console.error(
      'Error sending client signup welcome email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send creative partner signup welcome email via SendGrid dynamic template
 * Trigger: successful cp registration
 * @param {Object} userData - User details
 */
const sendCPSignupWelcomeEmail = async (userData) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key missing. Skipping client signup welcome email.');
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!userData?.email) {
      return { success: false, error: 'CP email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const msg = {
      to: userData.email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      templateId: CP_SIGNUP_WELCOME_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: userData.first_name || 'there',
        frontendUrl: `${process.env.FRONTEND_URL}/creator/dashboard`
      }
    };

    await sgMail.send(msg);
    console.log(`CP signup welcome email sent to ${userData.email} using SendGrid template.`);
    return { success: true };
  } catch (error) {
    console.error(
      'Error sending cp signup welcome email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send booking confirmation email (Email 2) via SendGrid dynamic template
 * Trigger: booking payment completed
 * @param {Object} data - Booking confirmation data
 */
const sendBookingConfirmationEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    const templateId = data?.cp_assigned
      ? (BOOKING_CONFIRMED_WITH_CP_TEMPLATE_ID)
      : (BOOKING_CONFIRMED_WITHOUT_CP_TEMPLATE_ID);

    if (!templateId) {
      return {
        success: false,
        error: 'Set BOOKING_CONFIRMED_WITH_CP_TEMPLATE_ID / BOOKING_CONFIRMED_WITHOUT_CP_TEMPLATE_ID'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    console.log('Booking email payload:', {
      booking_id: data.booking_id,
      to: data.to_email,
      cp_assigned: data.cp_assigned
    });

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Your Beige booking is confirmed',
      templateId,
      dynamicTemplateData: {
        name: data.first_name || 'there',
        booking_id: data.booking_id || '',
        service_type: data.service_type || data.content_type || '',
        date: data.shoot_date || '',
        start_time: data.start_time || '',
        end_time: data.end_time || '',
        duration: data.duration || '',
        shoot_location_address: data.shoot_location_address || 'TBD',
        amount_paid: data.amount_paid
            ? `$${Number(data.amount_paid).toFixed(2)}`
            : '$0.00',
        payment_method: data.payment_method || 'Card',
        transaction_id: data.transaction_id || '',
        cp_assigned: !!data.cp_assigned,
        cp_status_label: data.cp_status_label || 'Pending',
        cp_status_color: data.cp_status_color || '#999999',
        cp_firstname: data.cp_firstname || '',
        cp_name: data.cp_name || data.cp_firstname || '',
        cp_role: data.cp_role || data.service_type || '',
        cp_photo_url: data.cp_photo_url || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&h=120',
        onboarding_form_link: data.onboarding_form_link || process.env.CLIENT_ONBOARDING_FORM_URL || 'https://beige.app/',
        insert_link: data.onboarding_form_link || process.env.CLIENT_ONBOARDING_FORM_URL || 'https://beige.app/',
        frontend_url: `${process.env.FRONTEND_URL}/affiliate/dashboard`
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Booking confirmation email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${templateId}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );
    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending booking confirmation email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send shoot reminder email 5 days before event date (Email 4)
 * Trigger: scheduled job
 * @param {Object} data - reminder payload
 */
const sendShootReminder5DaysEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!SHOOT_REMINDER_5D_TEMPLATE_ID) {
      return { success: false, error: 'SHOOT_REMINDER_5D_TEMPLATE_ID is not configured' };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Upcoming: Your Beige shoot is in 5 days',
      templateId: SHOOT_REMINDER_5D_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        date: data.shoot_date || '',
        startTime: data.start_time || '',
        endTime: data.end_time || '',
        shoot_location_address: data.shoot_location_address || 'TBD'
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Shoot reminder (5d) email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${SHOOT_REMINDER_5D_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending shoot reminder (5d) email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send shoot-day reminder email 2 hours before start (Email 6)
 * Trigger: scheduled job
 * @param {Object} data - reminder payload
 */
const sendShootReminder2HoursEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!SHOOT_REMINDER_2H_TEMPLATE_ID) {
      return { success: false, error: 'SHOOT_REMINDER_2H_TEMPLATE_ID is not configured' };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Happening Now: Your Beige shoot starts in 2 hours',
      templateId: SHOOT_REMINDER_2H_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        start_time: data.start_time || '',
        end_time: data.end_time || '',
        shoot_time: data.shoot_time || [data.start_time, data.end_time].filter(Boolean).join(' - '),
        shoot_location_address: data.shoot_location_address || 'TBD',
        cp_name: data.cp_name || 'your Creative Partner',
        userData: { name: data.first_name || 'there' },
        location: data.location || data.shoot_location_address || 'TBD',
        cp_image_url:
          data.cp_image_url ||
          'https://d2jhn32fsulyac.cloudfront.net/assets/Top_CP_images/Cornelius+M..png'
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Shoot reminder (2h) email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${SHOOT_REMINDER_2H_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending shoot reminder (2h) email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send shoot completion email on next day (Email 8a)
 * Trigger: scheduled job
 * @param {Object} data - completion payload
 */
const sendShootCompletionEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!SHOOT_COMPLETION_TEMPLATE_ID) {
      return { success: false, error: 'SHOOT_COMPLETION_TEMPLATE_ID is not configured' };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'That\u2019s a wrap! Your shoot is complete',
      templateId: SHOOT_COMPLETION_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        cp_name: data.cp_name || 'your Creative Partner',
        has_editing: !!data.has_editing,
        raw_only: !!data.raw_only
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Shoot completion email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${SHOOT_COMPLETION_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending shoot completion email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send 7-day final nudge email (Email 9.3)
 * Trigger: scheduled job
 * @param {Object} data - nudge payload
 */
const sendFinalNudge7DaysEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!SHOOT_FINAL_NUDGE_7D_TEMPLATE_ID) {
      return { success: false, error: 'SHOOT_FINAL_NUDGE_7D_TEMPLATE_ID is not configured' };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'One last thing about your recent shoot',
      templateId: SHOOT_FINAL_NUDGE_7D_TEMPLATE_ID,
      dynamicTemplateData: {
        user_name: data.first_name || 'there',
        cp_name: data.cp_name || 'your Creative Partner',
        review_link: `${process.env.FRONTEND_URL}/affiliate/dashboard`
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Final nudge (7d) email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${SHOOT_FINAL_NUDGE_7D_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending final nudge (7d) email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send post-production status update email (Email 10)
 * Trigger: manual action from dashboard
 * @param {Object} data - status update payload
 */
const sendPostProductionStatusUpdateEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!POST_PRODUCTION_STATUS_UPDATE_TEMPLATE_ID) {
      return {
        success: false,
        error: 'POST_PRODUCTION_STATUS_UPDATE_TEMPLATE_ID is not configured'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!data?.delivery_date) {
      return { success: false, error: 'delivery_date is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Update: Your Content Is Being Edited',
      templateId: POST_PRODUCTION_STATUS_UPDATE_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        delivery_date: data.delivery_date,
        status_label: data.status_label || 'Processing & Editing'
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Post-production status update email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${POST_PRODUCTION_STATUS_UPDATE_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending post-production status update email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send raw footage ready email (Email 10b)
 * Trigger: manual action from dashboard
 * @param {Object} data - raw footage payload
 */
const sendRawFootageReadyEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!RAW_FOOTAGE_READY_TEMPLATE_ID) {
      return {
        success: false,
        error: 'RAW_FOOTAGE_READY_TEMPLATE_ID is not configured'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!data?.access_files_link) {
      return { success: false, error: 'access_files_link is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Your Raw Footage Is Ready',
      templateId: RAW_FOOTAGE_READY_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        frontend_url: data.access_files_link
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Raw footage ready email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${RAW_FOOTAGE_READY_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending raw footage ready email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send final delivery complete email without revision (Email 11)
 * Trigger: manual action from dashboard
 * @param {Object} data - final delivery payload
 */
const sendFinalDeliveryCompleteEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!FINAL_DELIVERY_COMPLETE_TEMPLATE_ID) {
      return {
        success: false,
        error: 'FINAL_DELIVERY_COMPLETE_TEMPLATE_ID is not configured'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!data?.view_assets_link) {
      return { success: false, error: 'view_assets_link is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Final Delivery Complete - Access Your Assets',
      templateId: FINAL_DELIVERY_COMPLETE_TEMPLATE_ID,
      dynamicTemplateData: {
        name: data.first_name || 'there',
        booking_id: data.booking_id || '',
        frontend_url: data.view_assets_link
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Final delivery complete email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${FINAL_DELIVERY_COMPLETE_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending final delivery complete email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send revision request received email (Email 11b)
 * Trigger: manual action from dashboard
 * @param {Object} data - revision request payload
 */
const sendRevisionRequestReceivedEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!REVISION_REQUEST_RECEIVED_TEMPLATE_ID) {
      return {
        success: false,
        error: 'REVISION_REQUEST_RECEIVED_TEMPLATE_ID is not configured'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!data?.revision_delivery_date) {
      return { success: false, error: 'revision_delivery_date is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Revision Request Received - We\u2019re On It',
      templateId: REVISION_REQUEST_RECEIVED_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        booking_id: data.booking_id || '',
        revision_delivery_date: data.revision_delivery_date,
        estimated_turnaround: data.revision_delivery_date,
        userData: { name: data.first_name || 'there' }
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Revision request received email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${REVISION_REQUEST_RECEIVED_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending revision request received email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send revised content delivered email (Email 11c)
 * Trigger: manual action from dashboard
 * @param {Object} data - revised content payload
 */
const sendRevisedContentDeliveredEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!REVISED_CONTENT_DELIVERED_TEMPLATE_ID) {
      return {
        success: false,
        error: 'REVISED_CONTENT_DELIVERED_TEMPLATE_ID is not configured'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!data?.view_updated_assets_link) {
      return { success: false, error: 'view_updated_assets_link is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Your Revised Content Is Ready',
      templateId: REVISED_CONTENT_DELIVERED_TEMPLATE_ID,
      dynamicTemplateData: {
        first_name: data.first_name || 'there',
        booking_id: data.booking_id || '',
        frontend_url: data.view_updated_assets_link
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Revised content delivered email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${REVISED_CONTENT_DELIVERED_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending revised content delivered email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send final delivery complete with revision email (Email 11d)
 * Trigger: manual action from dashboard
 * @param {Object} data - final delivery payload
 */
const sendFinalDeliveryWithRevisionEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!FINAL_DELIVERY_WITH_REVISION_TEMPLATE_ID) {
      return {
        success: false,
        error: 'FINAL_DELIVERY_WITH_REVISION_TEMPLATE_ID is not configured'
      };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!data?.view_final_assets_link) {
      return { success: false, error: 'view_final_assets_link is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const payload = {
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'Final Delivery - Your Project Is Complete',
      templateId: FINAL_DELIVERY_WITH_REVISION_TEMPLATE_ID,
      dynamicTemplateData: {
        name: data.first_name || 'there',
        booking_id: data.booking_id || '',
        frontend_url: data.view_final_assets_link
      }
    };

    const [response] = await sgMail.send(payload);
    const messageId =
      response?.headers?.['x-message-id'] ||
      response?.headers?.['X-Message-Id'] ||
      null;

    console.log(
      `Final delivery with revision email accepted by SendGrid for ${data.to_email} (booking: ${data.booking_id || 'n/a'}), template=${FINAL_DELIVERY_WITH_REVISION_TEMPLATE_ID}, status=${response?.statusCode || 'n/a'}, message_id=${messageId || 'n/a'}`
    );

    return { success: true, messageId, statusCode: response?.statusCode };
  } catch (error) {
    console.error(
      'Error sending final delivery with revision email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Send payment link to client
 * @param {Object} userData - { name, email }
 * @param {Object} paymentData - { projectTitle, paymentUrl, expiresAt }
 */
const sendPaymentLinkEmail = async (userData, paymentData) => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: userData.email,
      // Better Subject: Less "spammy"
      subject: `Your Invoice for ${paymentData.projectTitle}`,
      // Embed the logo so it shows automatically
      attachments: [{
        filename: 'logo.png',
        path: 'https://beige-web-prod.s3.us-east-1.amazonaws.com/beige/beige_logo_vb.png',
        cid: 'beigelogo' // Same as in the HTML <img src="cid:beigelogo">
      }],
      html: generatePaymentLinkTemplate(userData, paymentData)
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending payment link email:', error);
    return { success: false, error: error.message };
  }
};

const generatePaymentLinkTemplate = (userData, paymentData) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        /* This helps with dark mode */
        :root { color-scheme: dark light; supported-color-schemes: dark light; }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0A0F0D; color: #ffffff;">
      
      <!-- PREHEADER: This helps avoid spam folders -->
      <div style="display:none; max-height:0px; max-width:0px; opacity:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px;">
        Finalize your booking for ${paymentData.projectTitle}. Secure payment link enclosed.
      </div>

      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0A0F0D; padding: 40px 10px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #000000; border: 1px solid rgba(232, 209, 171, 0.2); border-radius: 20px; overflow: hidden;">
              
              <!-- LOGO using CID (Embedded) -->
              <tr>
                <td align="center" style="padding: 40px 0 20px 0;">
                  <img src="cid:beigelogo" alt="Beige" width="100" style="display: block; border:0;">
                </td>
              </tr>

              <tr>
                <td style="padding: 0 50px 40px 50px; text-align: center;">
                  <h1 style="color: #E1CAA1; font-size: 28px; font-weight: 500; margin-bottom: 25px;">Payment Requested</h1>
                  
                  <p style="color: #E8D1AB; font-size: 16px; margin-bottom: 15px;">Hi ${userData.name},</p>
                  
                  <p style="color: #9ca3af; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
                    Thank you for choosing Beige for your upcoming project. To confirm your reservation for <strong>${paymentData.projectTitle}</strong>, please complete the payment using our secure portal.
                  </p>
                  
                  <!-- Payment Details -->
                  <div style="background-color: rgba(232, 209, 171, 0.05); border: 1px solid rgba(232, 209, 171, 0.1); border-radius: 12px; padding: 20px; margin-bottom: 30px; text-align: left;">
                    <table width="100%">
                      <tr>
                        <td style="color: #9ca3af; font-size: 13px; padding-bottom: 8px;">Project Name</td>
                        <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 600;">${paymentData.projectTitle}</td>
                      </tr>
                      <tr>
                        <td style="color: #9ca3af; font-size: 13px;">Link Expiration</td>
                        <td align="right" style="color: #ef4444; font-size: 13px; font-weight: 600;">${paymentData.expiresAt}</td>
                      </tr>
                    </table>
                  </div>

                  <!-- BUTTON -->
                  <table width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center">
                        <a href="${paymentData.paymentUrl}" style="background: linear-gradient(180deg, #3D342A 0%, #C79233 100%); color: #ffffff; padding: 18px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; display: inline-block; letter-spacing: 1px;">
                          COMPLETE PAYMENT &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- FOOTER: Physical address helps avoid spam -->
              <tr>
                <td style="background-color: #050505; padding: 30px; text-align: center; border-top: 1px solid rgba(232, 209, 171, 0.1);">
                  <p style="color: #6b7280; font-size: 11px; margin: 0 0 10px 0;">
                    &copy; ${new Date().getFullYear()} Beige AI Platform. All rights reserved.
                  </p>
                  <p style="color: #4b5563; font-size: 11px; margin: 0;">
                    123 Creative Studio Way, New York, NY 10001 <br>
                    <a href="#" style="color: #C79233; text-decoration: none;">Unsubscribe</a> | <a href="#" style="color: #C79233; text-decoration: none;">Support</a>
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
};

/**
 * Send Stripe Invoice/Receipt to client
 * @param {Object} userData - { name, email }
 * @param {Object} invoiceData - { projectTitle, invoiceUrl, invoicePdf, totalAmount, invoiceNumber, isPaid }
 */
const sendInvoiceEmail = async (userData, invoiceData) => {
  try {
    const statusText = invoiceData.isPaid ? 'Receipt' : 'Invoice';
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: userData.email,
      subject: `${statusText} #${invoiceData.invoiceNumber} for ${invoiceData.projectTitle}`,
      attachments: [{
        filename: 'logo.png',
        path: process.env.BEIGE_ASSET_BASE_URL + 'beige_logo_vb.png',
        cid: 'beigelogo'
      }],
      html: generateInvoiceTemplate(userData, invoiceData)
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending invoice email:', error);
    return { success: false, error: error.message };
  }
};

const generateInvoiceTemplate = (userData, invoiceData) => {
  const statusColor = invoiceData.isPaid ? '#22c55e' : '#C79233'; // Green for paid, Gold for unpaid
  const title = invoiceData.isPaid ? 'Payment Received' : 'New Invoice';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"></head>
    <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0A0F0D; color: #ffffff;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0A0F0D; padding: 40px 10px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #000000; border: 1px solid rgba(232, 209, 171, 0.2); border-radius: 20px; overflow: hidden;">
              <tr>
                <td align="center" style="padding: 40px 0 20px 0;">
                  <img src="cid:beigelogo" alt="Beige" width="100" style="display: block; border:0;">
                </td>
              </tr>
              <tr>
                <td style="padding: 0 50px 40px 50px; text-align: center;">
                  <h1 style="color: #E1CAA1; font-size: 28px; font-weight: 500; margin-bottom: 10px;">${title}</h1>
                  <p style="color: ${statusColor}; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 25px;">${invoiceData.invoiceNumber}</p>
                  
                  <p style="color: #E8D1AB; font-size: 16px; margin-bottom: 15px;">Hi ${userData.name},</p>
                  
                  <p style="color: #9ca3af; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
                    ${invoiceData.isPaid 
                      ? `Thank you for your payment. Please find your official receipt for <strong>${invoiceData.projectTitle}</strong> below.`
                      : `An invoice has been generated for your project <strong>${invoiceData.projectTitle}</strong>. Please review the details and complete the payment.`
                    }
                  </p>
                  
                  <div style="background-color: rgba(232, 209, 171, 0.05); border: 1px solid rgba(232, 209, 171, 0.1); border-radius: 12px; padding: 20px; margin-bottom: 30px; text-align: left;">
                    <table width="100%">
                      <tr>
                        <td style="color: #9ca3af; font-size: 13px; padding-bottom: 8px;">Amount</td>
                        <td align="right" style="color: #ffffff; font-size: 18px; font-weight: 600;">$${parseFloat(invoiceData.totalAmount).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="color: #9ca3af; font-size: 13px;">Status</td>
                        <td align="right" style="color: ${statusColor}; font-size: 13px; font-weight: 600;">${invoiceData.isPaid ? 'PAID' : 'DUE'}</td>
                      </tr>
                    </table>
                  </div>

                  <table width="100%" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center">
                        <a href="${invoiceData.invoiceUrl}" style="background: linear-gradient(180deg, #3D342A 0%, #C79233 100%); color: #ffffff; padding: 18px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; display: inline-block; margin-bottom: 15px;">
                          ${invoiceData.isPaid ? 'VIEW RECEIPT' : 'PAY INVOICE NOW'}
                        </a>
                        <br>
                        <a href="${invoiceData.invoicePdf}" style="color: #9ca3af; font-size: 13px; text-decoration: underline;">Download PDF Version</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background-color: #050505; padding: 30px; text-align: center; border-top: 1px solid rgba(232, 209, 171, 0.1);">
                  <p style="color: #6b7280; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} Beige AI Platform. All rights reserved.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

/**
 * Send notification to sales team about a new lead
 * @param {Object} leadData - { guestEmail, shootType, contentType, eventDate, startTime, endTime, editsNeeded }
 */
const sendSalesLeadNotification = async (leadData) => {
try {
    const to = process.env.SALES_NOTIFICATION_EMAIL;
    const templateId = SHOOT_LEAD_NOTIFICATION_TEMPLATE_ID || SALES_LEAD_NOTIFICATION_TEMPLATE_ID;

    return await sendEmail({
      to,
      subject: 'New Shoot Lead',
      templateId,
      dynamicTemplateData: {
        guestEmail: leadData?.guestEmail || '',
        contentType: formatContentTypes(leadData?.contentType),
        eventDate: formatDate(leadData?.eventDate) || leadData?.eventDate || 'TBD',
        startTime: formatTime(leadData?.startTime) || leadData?.startTime || '--',
        endTime: formatTime(leadData?.endTime) || leadData?.endTime || '--',
        editsNeeded: formatEditingStatus(leadData?.editsNeeded),
        loginUrl: process.env.FRONTEND_URL || 'https://beige.app/',
        year: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending sales lead notification:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to sales team when a payment is confirmed
 */
const sendPaymentSuccessSalesNotification = async (paymentData) => {
  try {
    const to = process.env.SALES_NOTIFICATION_EMAIL;
    const templateId = PAYMENT_CONFIRMED_TEMPLATE_ID;
    const { firstName, lastName } = splitName(
      paymentData?.clientName || paymentData?.name,
      paymentData?.guestEmail || paymentData?.email
    );

    return await sendEmail({
      to,
      subject: 'Payment Received',
      templateId,
      dynamicTemplateData: {
        first_name: paymentData?.first_name || firstName,
        last_name: paymentData?.last_name || lastName,
        email: paymentData?.email || paymentData?.guestEmail || '',
        phone_number: paymentData?.phone_number || 'N/A',
        amount: formatAmount(paymentData?.amount),
        shootType: formatShootTypes(paymentData?.shootType) || 'N/A',
        shoot_date: formatDate(paymentData?.shoot_date || paymentData?.eventDate) || 'TBD',
        shoot_time:
          paymentData?.shoot_time ||
          [formatTime(paymentData?.startTime), formatTime(paymentData?.endTime)].filter(Boolean).join(' to ') ||
          '--',
        editing: formatEditingStatus(paymentData?.editing ?? paymentData?.editsNeeded),
        paymentIntentId: paymentData?.paymentIntentId || '',
        year: new Date().getFullYear(),
        frontend_url: `${process.env.FRONTEND_URL}/admin/dashboard`,
      }
    });
  } catch (error) {
    console.error('Error sending payment success notification:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to production team about a new lead
 * @param {Object} leadData - { guestEmail, shootType, contentType, eventDate, startTime, endTime, editsNeeded }
 */
const sendProductionLeadNotification = async (leadData) => {
  try {
    const to = process.env.PRODUCTION_NOTIFICATION_EMAIL || process.env.SALES_NOTIFICATION_EMAIL;
    const templateId = PRODUCTION_LEAD_NOTIFICATION_TEMPLATE_ID;

    if (!to) return { success: false, error: 'PRODUCTION_NOTIFICATION_EMAIL is not configured' };

    return await sendEmail({
      to,
      subject: 'New Production Lead',
      templateId,
      dynamicTemplateData: {
        client_name: leadData?.client_name || '',
        guestEmail: leadData?.guestEmail || '',
        shoot_type: formatShootTypes(leadData?.shootType),
        contentType: formatContentTypes(leadData?.contentType),
        shoot_date: formatDate(leadData?.eventDate) || leadData?.eventDate || 'TBD',
        shoot_time:
          [formatTime(leadData?.startTime), formatTime(leadData?.endTime)]
            .filter(Boolean)
            .join(' to ') || '--',
        editing: formatEditingStatus(leadData?.editsNeeded),
        year: new Date().getFullYear(),
        frontend_url: `${process.env.FRONTEND_URL}/admin/dashboard`,
      }
    });
  } catch (error) {
    console.error('Error sending production lead notification:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to sales team when a new Client (user_type 3) registers
 */
const sendNewClientSignupNotification = async (userData) => {
  try {
    const to = process.env.SALES_NOTIFICATION_EMAIL;
    const templateId = CLIENT_SIGNUP_NOTIFICATION_TEMPLATE_ID;

    return await sendEmail({
      to,
      subject: 'New Client Signup',
      templateId,
      dynamicTemplateData: {
        name: userData?.name || '',
        email: userData?.email || '',
        phone_number: userData?.phone_number || 'N/A',
        instagram: userData?.instagram_handle || userData?.instagram || 'N/A',
        loginUrl: `${process.env.FRONTEND_URL}/admin/dashboard`,
        year: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending client signup notification:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to sales team when a new Crew Member (Creative) signs up
 */
const sendNewCrewSignupNotification = async (crewData) => {
  try {
    const to = process.env.SALES_NOTIFICATION_EMAIL;
    const templateId = CREW_SIGNUP_NOTIFICATION_TEMPLATE_ID;

    if (!to) return { success: false, error: 'SALES_NOTIFICATION_EMAIL is not configured' };

    return await sendEmail({
      to,
      subject: 'New Creative Signup',
      templateId,
      dynamicTemplateData: {
        first_name: crewData?.first_name || '',
        last_name: crewData?.last_name || '',
        full_name: `${crewData?.first_name || ''} ${crewData?.last_name || ''}`.trim(),
        email: crewData?.email || '',
        phone_number: crewData?.phone_number || 'No Phone',
        location:
          typeof crewData?.location === 'string'
            ? crewData.location
            : (crewData?.location ? JSON.stringify(crewData.location) : 'Not provided'),
        working_distance: crewData?.working_distance
          ? String(crewData.working_distance).replace(/\s*miles?$/i, '').trim()
          : 'Not provided',
        frontend_url: `${process.env.FRONTEND_URL}/admin/dashboard`,
        year: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending crew signup notification:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

function getStatusStyles(status) {
  const normalized = String(status || '').toLowerCase();

  if (normalized === 'accepted') {
    return {
      bg: '#21AC05',
      label: 'Accepted',
    };
  }

  if (normalized === 'rejected') {
    return {
      bg: '#AC1805',
      label: 'Rejected',
    };
  }

  return {
    bg: '#8A8A8A',
    label: status || 'Pending',
  };
}

function buildCreativePartnerCards(cpList = []) {
  if (!cpList.length) {
    return `
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px; font-size: 16px; color: #666666;">
            No creative partners found.
          </td>
        </tr>
      </table>
    `;
  }

  let html = '';

  for (let i = 0; i < cpList.length; i += 2) {
    const left = cpList[i];
    const right = cpList[i + 1];

    html += `
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
        <tr>
          <td width="50%" valign="top">
            ${buildSingleCard(left)}
          </td>
          <td width="20" style="font-size:0; line-height:0;">&nbsp;</td>
          <td width="50%" valign="top">
            ${right ? buildSingleCard(right) : '&nbsp;'}
          </td>
        </tr>
      </table>
    `;
  }

  return html;
}

function buildSingleCard(cp) {
  const { bg, label } = getStatusStyles(cp.status);
  const image = cp.image || 'https://via.placeholder.com/300x220?text=Creative+Partner';
  const name = cp.name || 'Creative Partner';

  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td
          valign="bottom"
          background="${image}"
          style="
            background-image: url('${image}');
            background-size: cover;
            background-position: center;
            border-radius: 24px;
            padding: 0;
            overflow: hidden;
          "
        >
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td height="220" style="font-size: 0; line-height: 0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding: 0 15px 15px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td
                      align="left"
                      style="font-size: 16px; font-weight: 600; color: #E9E9E9; font-family: sans-serif;"
                    >
                      ${name}
                    </td>
                    <td align="right">
                      <table border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td
                            bgcolor="${bg}"
                            style="
                              border-radius: 41px;
                              padding: 6px 16px;
                              font-size: 12px;
                              font-weight: 600;
                              color: #ffffff;
                              font-family: sans-serif;
                            "
                          >
                            ${label}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

const sendCPAcceptRejectStatusEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    if (!data?.to_email) return { success: false, error: 'Recipient email is required' };

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) return { success: false, error: 'Sender email not configured' };
    const normalizedAction = String(data.cp_action || data.cp_status || '').toLowerCase();
    const isAccepted = normalizedAction === 'accepted' || normalizedAction === 'accept';

    const [response] = await sgMail.send({
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'CP Acceptance status update',
      templateId: CP_ACCEPT_REJECT_TEMPLATE_ID,
      dynamicTemplateData: {
        userData: { name: data.user_name || 'there' },
        cp_name: data.cp_name || '',
        cp_action: data.cp_action || '',
        cp_status: data.cp_status || '',
        cp_list_html: buildCreativePartnerCards(data.cp_list || []),
        cp_status_text: isAccepted
          ? '<span style="color:#128308; font-weight:500;">Accepted</span>'
          : '<span style="color:#AC1805; font-weight:500;">Rejected</span>',
        booking_id: data.booking_id || '',
        client_name: data.client_name || '',
        Service_type: data.service_type || '',
        date: data.date || '',
        startTime: data.start_time || '',
        endTime: data.end_time || '',
        duration: data.duration || '',
        shoot_location_address: data.shoot_location_address || 'TBD',
        dashboardLink: data.dashboardLink
      }
    });

    return {
      success: true,
      statusCode: response?.statusCode,
      messageId: response?.headers?.['x-message-id'] || null
    };
  } catch (error) {
    return { success: false, error: error?.response?.body || error.message };
  }
};

const sendCPStatusUpdateByRequest = async ({ project_id, crew_member_id, cp_action, cp_status }) => {
  try {
    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id },
      include: [
        {
          model: db.users,
          as: 'user',
          required: false,
          attributes: ['name', 'email']
        },
        {
          model: assigned_crew,
          as: 'assigned_crews',
          required: false,
          include: [
            {
              model: crew_members,
              as: 'crew_member',
              required: false,
              attributes: ['crew_member_id', 'first_name', 'last_name'],
              include: [
                {
                  model: db.crew_member_files,
                  as: 'crew_member_files',
                  where: { file_type: 'profile_photo' },
                  required: false,
                  attributes: ['file_type', 'file_path', 'created_at', 'is_active']
                }
              ]
            }
          ]
        }
      ]
    });

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    const currentCrew = await crew_members.findOne({
      where: { crew_member_id },
      attributes: ['first_name', 'last_name']
    });

    const toEmail = process.env.CP_NOTIFICATION_EMAIL;
    if (!toEmail) {
      return { success: false, error: 'CP_NOTIFICATION_EMAIL is not configured' };
    }

    const cpName =
      [currentCrew?.first_name, currentCrew?.last_name].filter(Boolean).join(' ').trim() ||
      'Creative Partner';

    const cpList = (booking.assigned_crews || [])
      .map((ac) => {
        const name = [ac?.crew_member?.first_name, ac?.crew_member?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();

        if (!name) return null;

        const status =
          Number(ac?.crew_accept) === 1
            ? 'Accepted'
            : Number(ac?.crew_accept) === 2
              ? 'Rejected'
              : 'Pending';

        const files = Array.isArray(ac?.crew_member?.crew_member_files)
          ? ac.crew_member.crew_member_files
          : [];

        const activeFiles = files.filter(
          (f) => f?.is_active === 1 || f?.is_active === true || typeof f?.is_active === 'undefined'
        );

        const profileFile =
          activeFiles.find((f) => String(f?.file_type || '').toLowerCase() === 'profile_photo') ||
          activeFiles.find((f) => String(f?.file_type || '').toLowerCase() === 'profile_image') ||
          activeFiles.find((f) => String(f?.file_type || '').toLowerCase().includes('image'));

        return {
          name,
          status,
          image: toAbsoluteBeigeAssetUrl(profileFile?.file_path) || ''
        };
      })
      .filter(Boolean);

    return sendCPAcceptRejectStatusEmail({
      to_email: toEmail,
      user_name: 'Team',
      cp_name: cpName,
      cp_action: cp_action || '',
      cp_status: cp_status || '',
      booking_id: booking.stream_project_booking_id,
      client_name: booking?.user?.name || booking?.guest_email || 'Client',
      service_type: formatContentTypes(booking?.content_type),
      date: formatDate(booking?.event_date),
      start_time: formatTime(booking?.start_time),
      end_time: formatTime(booking?.end_time),
      duration: booking?.duration_hours ? `${booking.duration_hours} hours` : '',
      shoot_location_address: formatLocation(booking?.event_location),
      dashboardLink: `${process.env.FRONTEND_URL}/admin/dashboard`,
      cp_list: cpList
    });
  } catch (error) {
    return { success: false, error: error?.response?.body || error.message };
  }
};

const sendCPConfirmedEmailByRequest = async ({ project_id, crew_member_id }) => {
  try {
    const booking = await stream_project_booking.findOne({
      where: { stream_project_booking_id: project_id },
      include: [
        {
          model: db.users,
          as: 'user',
          required: false,
          attributes: ['name', 'email']
        }
      ]
    });

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    const crew = await crew_members.findOne({
      where: { crew_member_id },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'years_of_experience'],
      include: [
        {
          model: db.crew_member_files,
          as: 'crew_member_files',
          required: false,
          attributes: ['file_type', 'file_path', 'created_at', 'is_active']
        }
      ]
    });

    if (!crew) {
      return { success: false, error: 'Creative Partner not found' };
    }

    const toEmail = booking?.user?.email || booking?.guest_email || '';
    if (!toEmail) {
      return { success: false, error: 'Recipient email is required' };
    }

    let clientName = booking?.user?.name || '';

    if (!clientName) {
      const lead = await db.sales_leads.findOne({
        where: { booking_id: project_id },
        attributes: ['client_name', 'guest_email']
      });

      clientName = lead?.client_name || '';

      if (!clientName) {
        const emailForName = booking?.guest_email || lead?.guest_email || '';
        const localPart = emailForName.includes('@') ? emailForName.split('@')[0] : '';
        clientName = localPart.replace(/[._-]+/g, ' ').trim();
      }
    }

    if (!clientName && booking?.description) {
      const match = String(booking.description).match(/Contact Name:\s*([^\n\r]+)/i);
      if (match?.[1]) {
        clientName = match[1].trim();
      }
    }

    const cpName = [crew.first_name, crew.last_name].filter(Boolean).join(' ').trim() || 'your Creative Partner';
    const location = parseLocationParts(booking?.event_location);
    const schedule = [formatTime(booking?.start_time), formatTime(booking?.end_time)]
      .filter(Boolean)
      .join(' - ');
    const locationText = [location.name, location.address].filter(Boolean).join(', ') || 'TBD';
    const activeFiles = Array.isArray(crew?.crew_member_files)
      ? crew.crew_member_files.filter(
          (file) => file?.is_active === 1 || file?.is_active === true || typeof file?.is_active === 'undefined'
        )
      : [];
    const profileFile =
      activeFiles.find((file) => String(file?.file_type || '').toLowerCase() === 'profile_photo') ||
      activeFiles.find((file) => String(file?.file_type || '').toLowerCase() === 'profile_image') ||
      activeFiles.find((file) => String(file?.file_type || '').toLowerCase().includes('image')) ||
      null;
    const cpImageUrl =
      toAbsoluteBeigeAssetUrl(profileFile?.file_path) ||
      'https://d2jhn32fsulyac.cloudfront.net/assets/Top_CP_images/Cornelius+M..png';
    const experienceSummary = formatExperienceSummary(crew);

    return await sendEmail({
      to: toEmail,
      subject: 'Your Beige Creative Partner is confirmed',
      templateId: CP_CONFIRMED_TEMPLATE_ID,
      dynamicTemplateData: {
        userData: { name: getFirstName(clientName) },
        first_name: getFirstName(clientName),
        cp_name: cpName,
        cp_experience_summary: experienceSummary,
        contentType: formatContentTypes(booking?.content_type),
        shoot_date: formatDate(booking?.event_date),
        start_time: formatTime(booking?.start_time),
        end_time: formatTime(booking?.end_time),
        shoot_time: schedule,
        shoot_location_name: location.name || '',
        shoot_location_address: location.address || 'TBD',
        location: locationText,
        cp_image_url: cpImageUrl
      }
    });
  } catch (error) {
    console.error(
      'Error sending CP confirmed email via SendGrid:',
      error?.response?.body || error.message
    );
    return { success: false, error: error.message };
  }
};

const sendCPNewBookingRequestEmail = async (data) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return { success: false, error: 'SENDGRID_API_KEY is not configured' };
    }

    if (!CP_NEW_BOOKING_REQUEST_TEMPLATE_ID) {
      return { success: false, error: 'CP_NEW_BOOKING_REQUEST_TEMPLATE_ID is not configured' };
    }

    if (!data?.to_email) {
      return { success: false, error: 'Recipient email is required' };
    }

    const fromEmail = getSendgridFromAddress();
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const userFirstName = getFirstName(data.user_name, data.first_name);
    const clientName = data.client_name || 'TBD';
    const serviceType = data.service_type || data.services
      ? formatContentTypes(data.service_type || data.services)
      : 'TBD';
    const shootDate = data.date ? formatDate(data.date) : 'TBD';
    const startTime = data.start_time ? formatTime(data.start_time) : 'TBD';
    const endTime = data.end_time ? formatTime(data.end_time) : 'TBD';
    const shootAmount = data.shoot_amount !== undefined && data.shoot_amount !== null
      ? `$${formatAmount(data.shoot_amount)}`
      : 'TBD';

    const [response] = await sgMail.send({
      to: data.to_email,
      from: {
        email: fromEmail,
        name: getSendgridFromName()
      },
      subject: 'New Booking Request',
      templateId: CP_NEW_BOOKING_REQUEST_TEMPLATE_ID,
      dynamicTemplateData: {
        user_name: userFirstName,
        client_name: clientName,
        service_type: serviceType,
        date: shootDate,
        start_time: startTime,
        end_time: endTime,
        // shoot_amount: shootAmount,
        dashboard_link: `${process.env.FRONTEND_URL}/creator/dashboard`,
      }
    });

    return {
      success: true,
      statusCode: response?.statusCode,
      messageId:
        response?.headers?.['x-message-id'] ||
        response?.headers?.['X-Message-Id'] ||
        null
    };
  } catch (error) {
    return { success: false, error: error?.response?.body || error.message };
  }
};

const sendProductionProposalEmail = async (data) => {
  try {
    const to = data?.to_email || data?.email;
    if (!to) {
      return { success: false, error: 'Recipient email is required' };
    }

    const templateId = PRODUCTION_PROPOSAL_TEMPLATE_ID;
    if (!templateId) {
      return { success: false, error: 'PRODUCTION_PROPOSAL_TEMPLATE_ID is not configured' };
    }

    return await sendEmail({
      to,
      subject: 'Your Production Proposal from Beige',
      templateId,
      dynamicTemplateData: {
        client_name: data?.client_name || 'there',
        shoot_summary: data?.shoot_summary || '',
        project_name: data?.project_name || '',
        contentType: formatContentTypes(data?.contentType) || '',
        eventDate: formatDate(data?.eventDate) || data?.eventDate || '',
        startTime: formatTime(data?.startTime) || data?.startTime || '',
        endTime: formatTime(data?.endTime) || data?.endTime || '',
        editsNeeded: data?.editsNeeded || 'Not Included',
        location: formatLocation(data?.location) || 'TBD',
        proposed_amount: Number(data?.proposed_amount || 0).toFixed(2),
        payment_link: data?.payment_link || ''
      }
    });
  } catch (error) {
    console.error('Error sending production proposal email:', error?.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

const sendCustomQuoteProposalEmail = async (data) => {
  try {
    const to = data?.to_email || data?.email;
    if (!to) {
      return { success: false, error: 'Recipient email is required' };
    }

    if (!CUSTOM_QUOTE_PROPOSAL_ID) {
      return { success: false, error: 'CUSTOM_QUOTE_PROPOSAL_ID is not configured' };
    }

    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!fromEmail) {
      return { success: false, error: 'Sender email not configured' };
    }

    const proposalAmount = data?.proposal_amount !== undefined && data?.proposal_amount !== null
      ? (String(data.proposal_amount).startsWith('$')
        ? String(data.proposal_amount).replace(/^\$/, '')
        : formatAmount(data.proposal_amount))
      : 'TBD';
    const attachmentContent = typeof data?.attachment_content === 'string'
      ? data.attachment_content.replace(/^data:.*;base64,/, '').trim()
      : null;

    const message = {
      to,
      from: {
        email: fromEmail,
        name: process.env.SENDGRID_FROM_NAME
      },
      subject: 'Your Shoot, Crafted — Proposal Inside',
      templateId: CUSTOM_QUOTE_PROPOSAL_ID,
      dynamicTemplateData: {
        first_name: getFirstName(data?.first_name || data?.client_name || '') || 'there',
        shoot_type: data?.shoot_type || 'TBD',
        project_description: data?.project_description || 'TBD',
        location: data?.location || 'TBD',
        quote_validity: data?.quote_validity || 'TBD',
        add_ons: data?.add_ons || 'TBD',
        includes: data?.includes || 'TBD',
        proposal_amount: proposalAmount
      }
    };

    if (attachmentContent) {
      message.attachments = [{
        content: attachmentContent,
        filename: data.attachment_filename || 'custom-quote.pdf',
        type: data.attachment_type || 'application/pdf',
        disposition: 'attachment'
      }];
    }

    const [response] = await sgMail.send(message);

    return {
      success: true,
      statusCode: response?.statusCode,
      messageId:
        response?.headers?.['x-message-id'] ||
        response?.headers?.['X-Message-Id'] ||
        null
    };
  } catch (error) {
    console.error('Error sending custom quote proposal email:', error?.response?.body || error.message);
    return { success: false, error: error?.response?.body || error.message };
  }
};

module.exports = {
  formatContentTypes,
  formatShootTypes,
  sendTaskAssignmentEmail,
  sendVerificationOTP,
  sendPasswordResetEmail,
  sendPaymentLinkEmail,
  sendInvoiceEmail,
  sendSalesLeadNotification,
  sendProductionLeadNotification,
  sendPaymentSuccessSalesNotification,
  sendClientSignupWelcomeEmail,
  sendBookingConfirmationEmail,
  sendShootReminder5DaysEmail,
  sendShootReminder2HoursEmail,
  sendShootCompletionEmail,
  sendFinalNudge7DaysEmail,
  sendPostProductionStatusUpdateEmail,
  sendRawFootageReadyEmail,
  sendFinalDeliveryCompleteEmail,
  sendRevisionRequestReceivedEmail,
  sendRevisedContentDeliveredEmail,
  sendFinalDeliveryWithRevisionEmail,
  sendCPStatusUpdateByRequest,
  sendCPConfirmedEmailByRequest,
  sendCPNewBookingRequestEmail,
  sendNewClientSignupNotification,
  sendNewCrewSignupNotification,
  sendCPSignupWelcomeEmail,
  sendProductionProposalEmail,
  sendCustomQuoteProposalEmail
};
