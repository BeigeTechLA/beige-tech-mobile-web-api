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
      <meta name="color-scheme" content="dark light">
      <meta name="supported-color-schemes" content="dark light">
      <title>Email Verification</title>
      <style>
        /* 1. Standard Media Query for iOS/Android/Desktop Browsers */
        @media (prefers-color-scheme: dark) {
          .body { background-color: #0A0F0D !important; }
          .white-text { color: #ffffff !important; }
          .muted-text { color: #6b7280 !important; } /* Slightly off-white for better readability */
        }

        /* 2. Outlook.com and Web App targeting */
        [data-ogsc] .white-text { color: #ffffff !important; }
        [data-ogsc] .muted-text { color: #6b7280 !important; }

        /* 3. Handling iOS Auto-linking */
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: none !important;
          font-size: inherit !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }

        .otp-text {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
      </style>
    </head>
    <body class="body" style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0A0F0D;">
      <table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0A0F0D; background: linear-gradient(0deg, #0A0F0D 77.1%, rgba(76, 57, 23, 0.10) 126.11%); padding: 60px 20px;">
        <tr>
          <td align="center" valign="top">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #000000; border: 1px solid rgba(232, 209, 171, 0.15); border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);">
              <tr>
                <td style="background-color: rgba(232, 209, 171, 0.05); padding: 40px 30px; text-align: center; border-bottom: 1px solid rgba(232, 209, 171, 0.1);">
                  <h1 style="margin: 0; color: #E8D1AB; font-size: 32px; font-weight: 500;">Verify Your Email</h1>
                  <p style="margin: 10px 0 0; color: #E8D1AB; font-size: 14px;">Welcome to BeigeAI!</p>
                </td>
              </tr>

              <tr>
                <td style="padding: 40px 30px;">
                  <p class="white-text" style="margin: 0; font-size: 16px; color: #ffffff; line-height: 1.6;">
                    Hi <strong>${userData.name}</strong>,
                  </p>

                  <p class="muted-text" style="margin: 20px 0; font-size: 16px; color: #9ca3af; line-height: 1.6;">
                    Thank you for signing up with BeigeAI! To complete your registration, please verify your email address using the verification code below:
                  </p>

                  <div style="text-align: center; margin: 30px 0;">
                    <div style="display: inline-block; background: linear-gradient(0deg, #0A0F0D 77.1%, rgba(76, 57, 23, 0.1) 126.11%); border: 1px solid rgba(232, 209, 171, 0.3); padding: 20px 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);">
                      <p style="margin: 0; font-size: 14px; color: #E8D1AB; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Verification Code</p>
                      <p style="margin: 10px 0 0; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                        <span class="otp-text" style="color: #ffffff !important;">${otp}</span>
                      </p>
                    </div>
                  </div>

                  <p class="muted-text" style="margin: 20px 0; font-size: 14px; color: #6b7280; line-height: 1.6; text-align: center;">
                    This code will expire in <strong style="color: #E8D1AB;">10 minutes</strong>
                  </p>

                  <div style="background-color: rgba(232, 209, 171, 0.05); border-left: 4px solid #4c3917; padding: 15px; border-radius: 4px; margin-top: 30px;">
                    <p style="margin: 0; font-size: 13px; color: #E8D1AB; font-weight: 600;">Security Notice</p>
                    <p class="muted-text" style="margin: 8px 0 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                      Never share this code with anyone. BeigeAI will never ask for your verification code via phone or email.
                    </p>
                  </div>

                  <p class="muted-text" style="margin: 30px 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                    If you didn't request this code, please ignore this email or contact our support team.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background-color: rgba(232, 209, 171, 0.02); padding: 25px 30px; border-top: 1px solid rgba(232, 209, 171, 0.1); text-align: center;">
                  <p class="muted-text" style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                    This is an automated email from BeigeAI. Please do not reply to this email.
                  </p>
                  <p class="muted-text" style="margin: 10px 0 0; font-size: 13px; color: #4b5563;">
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
      <title>Welcome to Beige</title>
    </head>

    <body
      style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0A0F0D;">
      <table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0"
        style="background-color: #0A0F0D; background: linear-gradient(0deg, #0A0F0D 77.1%, rgba(76, 57, 23, 0.10) 126.11%); padding: 60px 20px;">
        <tr>
          <td align="center" valign="top">
            <table width="600" cellpadding="0" cellspacing="0" border="0"
              style="background-color: #000000; border: 1px solid rgba(232, 209, 171, 0.15); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <div
                    style="display: inline-block; border: 1px solid rgba(232, 209, 171, 0.4); padding: 12px 30px; border-radius: 100px; background-color: #000000;">
                    <img
                      src="https://beigexmemehouse.s3.eu-north-1.amazonaws.com/beige/beige_logo_vb.png"
                      alt="Beige Logo" width="120" style="display: block; border: 0; outline: none;">
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 10px 40px 30px; text-align: center;">
                  <p style="margin: 0; color: #E8D1AB; font-size: 14px; letter-spacing: 0.5px;">Hi ${userData.name},</p>
                  <h1
                    style="margin: 50px 0 5px; color: #E1CAA1; font-size: 52px; font-weight: 500; letter-spacing: -1px; line-height: 1.1;">
                    Welcome to Beige</h1>
                  <p style="margin: 0; color: #E8D1AB; font-size: 32px; font-weight: 500; letter-spacing: -0.5px;">The
                    modern content engine.</p>
                  <p style="margin: 30px 0 0; font-size: 15px; color: #9ca3af; line-height: 1.8;">
                    Beige is a unified platform for booking professional videography, photography, locations, and
                    post-production, designed to remove friction from the content creation process.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding: 0 40px;">
                  <div style="background-color: rgba(80, 55, 17, 0.20); border-radius: 16px; padding: 30px; ">
                    <p style="margin: 0 0 20px; color: #ffffff; font-size: 18px; font-weight: 700;">What Sets Beige Apart:
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" style="padding-bottom: 15px;"><span style="color: #ffffff;">&#10003;</span></td>
                        <td style="padding-bottom: 15px; color: #FFFFFF99; font-size: 14px; line-height: 1.4;">Curated,
                          vetted
                          creators across the US.</td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding-bottom: 15px;"><span style="color: #ffffff;">&#10003;</span></td>
                        <td style="padding-bottom: 15px; color: #FFFFFF99; font-size: 14px; line-height: 1.4;">Transparent
                          pricing and availability at the point of booking.</td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding-bottom: 15px;"><span style="color: #ffffff;">&#10003;</span></td>
                        <td style="padding-bottom: 15px; color: #FFFFFF99; font-size: 14px; line-height: 1.4;">End-to-end
                          production, from shoot to final delivery.</td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding-bottom: 15px;"><span style="color: #ffffff;">&#10003;</span></td>
                        <td style="padding-bottom: 15px; color: #FFFFFF99; font-size: 14px; line-height: 1.4;">A streamlined
                          experience built for speed, quality, and consistency.</td>
                      </tr>
                      <tr>
                        <td valign="top"><span style="color: #ffffff;">&#10003;</span></td>
                        <td style="color: #FFFFFF99; font-size: 14px; line-height: 1.4;">Smart automation integrated into
                          the
                          platform to enhance matching, workflows, and delivery.</td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding: 50px 40px; text-align: center;">
                  <hr style="border: none; border-top: 1px solid #E1CAA1; width: 128px; margin: 0 auto 30px;">
                  <h2
                    style="margin: 0 0 24px; color: #E1CAA1; font-size: 52px; font-weight: 500; letter-spacing: -1.677px;">
                    Your creative workspace is ready.</h2>
                  <p style="margin: 0 0 24px; font-size: 15px; color: #F0F0F0; line-height: 1.8; font-weight: 300;">
                    Whether you are producing content for a brand, event, or personal project, Beige simplifies execution so
                    you can focus on the outcome.
                  </p>

                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: auto;">
                    <tr>
                      <td
                        style="border-radius: 100px; background: linear-gradient(180deg, #3D342A -17.11%, #C79233 141.45%);">
                        <a href="${frontendUrl}"
                          style="padding: 18px 36px; font-size: 18px; font-weight: 600; line-height: 28px; letter-spacing: 2.261px; color: #ffffff; text-decoration: underline; display: inline-block; text-transform: uppercase; ">
                          BOOK YOUR SHOOT IN MINUTES &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:24px 0 0; font-size: 15px; color: #F0F0F0; line-height: 1.8; font-weight: 300;">
                    If you need assistance selecting the right setup, simply reply to this email and our team will support
                    you.
                  </p>
                  <hr style="border: none; border-top: 1px solid #E1CAA1; width: 128px; margin: 24px auto 0;">
                </td>
              </tr>

              <tr>
                <td style="padding: 0 30px 30px; text-align: center; border-top: 2px solid #F5EBDA;">
                  <p style="margin: 30px 0 0; font-size: 11px; color: #8C8C8C; text-transform: capitalize;">
                    Help Center &nbsp;•&nbsp; Privacy Policy &nbsp;•&nbsp; Terms of Service
                  </p>
                  <p style="margin: 15px 0 0; font-size: 11px; color: #8C8C8C;text-transform: uppercase; ">
                    Beige AI
                    <!-- &nbsp;|&nbsp; 123 Creative Street, Design City, DC 10101 -->
                  </p>
                </td>
              </tr>

              <tr>
                <td style="padding: 20px; text-align: center;">
                  <img
                    src="https://beigexmemehouse.s3.eu-north-1.amazonaws.com/beige/beige_logo_vb.png"
                    alt="Beige Logo" width="180" style="display: inline-block; border: 0; outline: none; opacity: 1;">
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
