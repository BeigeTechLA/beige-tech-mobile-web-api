const nodemailer = require('nodemailer');
require('dotenv').config();

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
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: userData.email,
      subject: 'Verify Your Email - BeigeAI',
      html: generateVerificationOTPTemplate(userData, otp)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification OTP email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Generate HTML email template for verification OTP
 */
const generateVerificationOTPTemplate = (userData, otp) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
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
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Verify Your Email</h1>
                  <p style="margin: 10px 0 0; color: #e0e7ff; font-size: 14px;">Welcome to BeigeAI!</p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    Hi <strong>${userData.name}</strong>,
                  </p>
                  <p style="margin: 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    Thank you for signing up with BeigeAI! To complete your registration, please verify your email address using the verification code below:
                  </p>

                  <!-- OTP Box -->
                  <div style="text-align: center; margin: 30px 0;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                      <p style="margin: 0; font-size: 14px; color: #e0e7ff; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Verification Code</p>
                      <p style="margin: 10px 0 0; font-size: 36px; color: #ffffff; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                        ${otp}
                      </p>
                    </div>
                  </div>

                  <p style="margin: 20px 0; font-size: 14px; color: #6b7280; line-height: 1.6; text-align: center;">
                    This code will expire in <strong>10 minutes</strong>
                  </p>

                  <!-- Security Notice -->
                  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin-top: 30px;">
                    <p style="margin: 0; font-size: 13px; color: #78350f; font-weight: 600;">Security Notice</p>
                    <p style="margin: 8px 0 0; font-size: 13px; color: #92400e; line-height: 1.5;">
                      Never share this code with anyone. BeigeAI will never ask for your verification code via phone or email.
                    </p>
                  </div>

                  <p style="margin: 30px 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                    If you didn't request this code, please ignore this email or contact our support team.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                    This is an automated email from BeigeAI. Please do not reply to this email.
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
 * Send password reset email
 * @param {Object} userData - User details
 * @param {string} resetToken - Reset token
 */
const sendPasswordResetEmail = async (userData, resetToken) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: userData.email,
      subject: 'Reset Your Password - BeigeAI',
      html: generatePasswordResetTemplate(userData, resetLink, resetToken)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Generate HTML email template for password reset
 */
const generatePasswordResetTemplate = (userData, resetLink, resetToken) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    Hi <strong>${userData.name}</strong>,
                  </p>
                  <p style="margin: 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    We received a request to reset your password. Click the button below to create a new password:
                  </p>

                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);">
                      Reset Password
                    </a>
                  </div>

                  <p style="margin: 20px 0; font-size: 14px; color: #6b7280; line-height: 1.6; text-align: center;">
                    This link will expire in <strong>1 hour</strong>
                  </p>

                  <!-- Alternative Link -->
                  <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin-top: 20px;">
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">
                      If the button doesn't work, copy and paste this link into your browser:
                    </p>
                    <p style="margin: 8px 0 0; font-size: 12px; color: #667eea; word-break: break-all;">
                      ${resetLink}
                    </p>
                  </div>

                  <!-- Security Notice -->
                  <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin-top: 30px;">
                    <p style="margin: 0; font-size: 13px; color: #7f1d1d; font-weight: 600;">Security Notice</p>
                    <p style="margin: 8px 0 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
                      If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.
                    </p>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                    This is an automated email from BeigeAI. Please do not reply to this email.
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
 * Send welcome email to new users
 * @param {Object} userData - User details
 */
const sendWelcomeEmail = async (userData) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`,
      to: userData.email,
      subject: 'Welcome to BeigeAI!',
      html: generateWelcomeTemplate(userData, frontendUrl)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Generate HTML email template for welcome
 */
const generateWelcomeTemplate = (userData, frontendUrl) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to BeigeAI</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Welcome to BeigeAI!</h1>
                  <p style="margin: 10px 0 0; color: #d1fae5; font-size: 16px;">Your account is ready to go</p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px 30px;">
                  <p style="margin: 0; font-size: 18px; color: #374151; line-height: 1.6;">
                    Hi <strong>${userData.name}</strong>,
                  </p>
                  <p style="margin: 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                    Welcome to BeigeAI! We're excited to have you on board. Your email has been verified and your account is now active.
                  </p>

                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${frontendUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                      Get Started
                    </a>
                  </div>

                  <p style="margin: 30px 0 15px; font-size: 16px; color: #374151; font-weight: 600;">
                    What's Next?
                  </p>
                  <ul style="margin: 0; padding-left: 20px; color: #6b7280; line-height: 1.8;">
                    <li>Complete your profile</li>
                    <li>Explore our creator community</li>
                    <li>Book your first project</li>
                    <li>Join our affiliate program</li>
                  </ul>

                  <p style="margin: 30px 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                    If you have any questions, feel free to reach out to our support team. We're here to help!
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 25px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                    This is an automated email from BeigeAI. Please do not reply to this email.
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

module.exports = {
  sendTaskAssignmentEmail,
  sendVerificationOTP,
  sendPasswordResetEmail,
  sendWelcomeEmail
};
