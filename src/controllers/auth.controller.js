const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { users, user_type, crew_members, crew_member_files } = require('../models');
const constants = require('../utils/constants');
const common_model = require('../utils/common_model');
const User = common_model.getTableNameDirect(constants.TABLES.USERS);
const UserType = common_model.getTableNameDirect(constants.TABLES.USER_TYPE);
const CrewMember = common_model.getTableNameDirect(constants.TABLES.CREW_MEMBERS);
const Affiliate = common_model.getTableNameDirect(constants.TABLES.AFFILIATES);
const Clients = common_model.getTableNameDirect(constants.TABLES.CLIENTS);
const affiliateController = require('./affiliate.controller');
const config = require('../config/config');
const { S3UploadFiles } = require('../utils/common.js');
const multer = require('multer');
const path = require('path');

// Import new utilities
const otpService = require('../utils/otpService');
const emailService = require('../utils/emailService');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/uploads/media'));
  },
  filename: (req, file, cb) => {
    const filename = Date.now() + path.extname(file.originalname);
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
    cb(null, true);
  },
});

// Role-based permission mapping
const PERMISSIONS_MAP = {
  client: [
    'view_creators',
    'create_booking',
    'view_bookings',
    'update_booking',
    'cancel_booking',
    'view_profile',
    'update_profile'
  ],
  sales_rep: [
    'view_creators',
    'create_booking',
    'view_bookings',
    'update_booking',
    'view_clients',
    'manage_bookings',
    'view_reports',
    'view_profile',
    'update_profile'
  ],
  creator: [
    'view_bookings',
    'accept_booking',
    'reject_booking',
    'view_profile',
    'update_profile',
    'view_equipment',
    'manage_portfolio'
  ],
  admin: [
    'view_all',
    'create_all',
    'update_all',
    'delete_all',
    'manage_users',
    'manage_bookings',
    'manage_creators',
    'manage_equipment',
    'view_reports',
    'manage_permissions'
  ]
};

/**
 * Generate JWT tokens
 */
const generateTokens = (userId, userRole) => {
  const token = jwt.sign(
    { userId, userRole },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { userId, userRole, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  return { token, refreshToken };
};

/**
 * Get permissions for a role
 */
const getPermissionsForRole = (role) => {
  return PERMISSIONS_MAP[role] || [];
};

// ==================== REGISTRATION ====================

/**
 * Register new user
 * POST /auth/register
 */
// exports.register = async (req, res) => {
//   try {
//     const { name, email, phone_number, instagram_handle, password, userType = 3 } = req.body;

//     // Validate required fields
//     if (!name || !password) {
//       return res.status(400).json({
//         success: false,
//         message: 'Name and password are required'
//       });
//     }

//     // At least one identifier required
//     if (!email && !phone_number && !instagram_handle) {
//       return res.status(400).json({
//         success: false,
//         message: 'Provide at least one: email, phone number, or Instagram handle'
//       });
//     }

//     // Validate userType
//     if (![1, 2].includes(userType)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid user type'
//       });
//     }

//     // Check if user already exists
//     const conditions = [];
//     if (email) conditions.push({ email });
//     if (phone_number) conditions.push({ phone_number });
//     if (instagram_handle) conditions.push({ instagram_handle });

//     const userExists = await User.findOne({
//       where: { [Op.or]: conditions }
//     });

//     if (userExists) {
//       return res.status(409).json({
//         success: false,
//         message: 'User already exists with provided credentials'
//       });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Generate OTP for email verification
//     const otp = otpService.generateOTP();
//     const otpExpiry = otpService.generateOTPExpiry(10); // 10 minutes

//     // Create user
//     const newUser = await User.create({
//       name,
//       email,
//       phone_number,
//       instagram_handle,
//       password_hash: hashedPassword,
//       user_type: userType,
//       is_active: 1,
//       email_verified: 0,
//       verification_code: otp,
//       otp_expiry: otpExpiry
//     });

//     // Send verification email if email provided
//     if (email) {
//       const emailResult = await emailService.sendVerificationOTP(
//         { name, email },
//         otp
//       );

//       if (!emailResult.success) {
//         console.error('Failed to send verification email:', emailResult.error);
//       }
//     }

//     // Auto-create affiliate account for the new user
//     let affiliateData = null;
//     try {
//       const affiliate = await affiliateController.createAffiliate(newUser.id);
//       if (affiliate) {
//         affiliateData = {
//           affiliate_id: affiliate.affiliate_id,
//           referral_code: affiliate.referral_code
//         };
//       }
//     } catch (affiliateError) {
//       console.error('Failed to create affiliate account:', affiliateError);
//       // Don't fail registration if affiliate creation fails
//     }

//     return res.status(201).json({
//       success: true,
//       message: email
//         ? 'User registered successfully. Please check your email for verification code.'
//         : 'User registered successfully. Please verify your account.',
//       userId: newUser.id,
//       email: newUser.email,
//       affiliate: affiliateData
//     });

//   } catch (error) {
//     console.error('Register Error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Server error during registration',
//       error: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

exports.register = async (req, res) => {
  try {
    const { name, email, phone_number, instagram_handle, password, userType = 3 } = req.body;

    // Validate required fields
    if (!name || !password || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // At least one identifier required
    if (!email && !phone_number && !instagram_handle) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one: email, phone number, or Instagram handle'
      });
    }

    // Validate userType
    if (![1, 2, 3].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type'
      });
    }

    // Check if user already exists
    const conditions = [];
    if (email) conditions.push({ email });
    if (phone_number) conditions.push({ phone_number });
    if (instagram_handle) conditions.push({ instagram_handle });

    const userExists = await User.findOne({
      where: { [Op.or]: conditions }
    });

    if (userExists) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with provided credentials'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP for email verification
    const otp = otpService.generateOTP();
    const otpExpiry = otpService.generateOTPExpiry(10); // 10 minutes

    // Create user
    const newUser = await User.create({
      name,
      email,
      phone_number,
      instagram_handle,
      password_hash: hashedPassword,
      user_type: userType,
      is_active: 1,
      email_verified: 0,
      verification_code: otp,
      otp_expiry: otpExpiry
    });

    const newClient = await Clients.create({
      user_id: newUser.id,
      name,
      email,
      phone_number,
      is_active: 1
    });

    // Send verification email if email provided
    if (email) {
      const emailResult = await emailService.sendVerificationOTP(
        { name, email },
        otp
      );

      if (!emailResult.success) {
        console.error('Failed to send verification email:', emailResult.error);
      }
    }

    // Auto-create affiliate account for the new user
    let affiliateData = null;
    try {
      const affiliate = await affiliateController.createAffiliate(newUser.id);
      if (affiliate) {
        affiliateData = {
          affiliate_id: affiliate.affiliate_id,
          referral_code: affiliate.referral_code
        };
      }
    } catch (affiliateError) {
      console.error('Failed to create affiliate account:', affiliateError);
    }

    return res.status(201).json({
      success: true,
      message: email
        ? 'User registered successfully. Please check your email for verification code.'
        : 'User registered successfully. Please verify your account.',
      userId: newUser.id,
      email: newUser.email,
      affiliate: affiliateData,
      clientId: newClient.client_id
    });

  } catch (error) {
    console.error('Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== EMAIL VERIFICATION ====================

/**
 * Send OTP to email
 * POST /auth/send-otp
 */
exports.sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already verified
    if (user.email_verified === 1) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Check rate limiting
    const rateLimit = otpService.checkOTPRateLimit(user.otp_expiry, 1);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: rateLimit.message,
        remainingTime: rateLimit.remainingTime
      });
    }

    // Generate new OTP
    const otp = otpService.generateOTP();
    const otpExpiry = otpService.generateOTPExpiry(10); // 10 minutes

    // Update user with new OTP
    await User.update(
      {
        verification_code: otp,
        otp_expiry: otpExpiry
      },
      { where: { email } }
    );

    // Send OTP email
    const emailResult = await emailService.sendVerificationOTP(
      { name: user.name, email },
      otp
    );

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code sent to your email'
    });

  } catch (error) {
    console.error('Send OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error sending OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Resend OTP
 * POST /auth/resend-otp
 */
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already verified
    if (user.email_verified === 1) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Check rate limiting (60 seconds)
    const rateLimit = otpService.checkOTPRateLimit(user.otp_expiry, 1);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: rateLimit.message,
        remainingTime: rateLimit.remainingTime
      });
    }

    // Generate new OTP
    const otp = otpService.generateOTP();
    const otpExpiry = otpService.generateOTPExpiry(10);

    // Update user
    await User.update(
      {
        verification_code: otp,
        otp_expiry: otpExpiry
      },
      { where: { email } }
    );

    // Send OTP email
    const emailResult = await emailService.sendVerificationOTP(
      { name: user.name, email },
      otp
    );

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'New verification code sent to your email'
    });

  } catch (error) {
    console.error('Resend OTP Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error resending OTP',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify email with OTP
 * POST /auth/verify-email
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Find user
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already verified
    if (user.email_verified === 1) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Validate OTP
    const validation = otpService.validateOTP(
      verificationCode,
      user.verification_code,
      user.otp_expiry
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        error: validation.error
      });
    }

    // Mark email as verified and clear verification code
    await User.update(
      {
        email_verified: 1,
        verification_code: null
        // otp_expiry left as-is (already expired, no need to null)
      },
      { where: { email } }
    );

    // Send welcome email
    await emailService.sendWelcomeEmail({ name: user.name, email });

    // Generate tokens for auto-login
    const userTypeRecord = await user_type.findOne({
      where: { user_type_id: user.user_type }
    });

    const role = userTypeRecord?.user_role || 'client';
    const { token, refreshToken } = generateTokens(user.id, role);
    const permissions = getPermissionsForRole(role);

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role
      },
      token,
      refreshToken,
      permissions
    });

  } catch (error) {
    console.error('Verify Email Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error verifying email',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== LOGIN ====================

/**
 * Login user with email/password or phone/OTP
 * POST /auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password, mobile, otp } = req.body;

    // EMAIL/PASSWORD LOGIN
    if (email) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required",
        });
      }

      // Find user with user_type association
      const user = await User.findOne({
        where: { email },
        include: [
          {
            model: UserType,
            as: "userType",
            attributes: ["user_type_id", "user_role"],
          },
        ],
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: "Account is inactive. Please contact support",
        });
      }

      // Verify password
      if (!user.password_hash) {
        return res.status(500).json({
          success: false,
          message: "Account configuration error",
        });
      }

      const isPasswordValid = await bcrypt.compare(
        password,
        user.password_hash
      );
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Get user role
      const role = user.userType?.user_role || "client";
      const user_type_id = user.userType?.user_type_id || null;

      // Get crew_member_id if creator
      let crew_member_id = null;
      let is_crew_verified = null;

      if (user.userType && user.userType.user_type_id === 2) {
        const crew = await CrewMember.findOne({
          where: { email: user.email },
          attributes: ["crew_member_id", 'is_crew_verified'],
        });
        crew_member_id = crew ? crew.crew_member_id : null;
        is_crew_verified = crew ? crew.is_crew_verified : null;
      }

      let affiliate_id = null;
      const affiliate = await Affiliate.findOne({
        where: { user_id: user.id },
        attributes: ["affiliate_id"],
      });
      affiliate_id = affiliate ? affiliate.affiliate_id : null;

      // Generate tokens
      const { token, refreshToken } = generateTokens(user.id, role);
      const permissions = getPermissionsForRole(role);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
          instagram_handle: user.instagram_handle,
          role,
          user_type_id,
          email_verified: user.email_verified,
          crew_member_id,
           affiliate_id,
          is_crew_verified
        },
        token,
        refreshToken,
        permissions,
      });
    }

    // PHONE/OTP LOGIN
    if (mobile) {
      // If no OTP provided, send OTP
      if (!otp) {
        const user = await User.findOne({
          where: { phone_number: mobile }
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'User not found. Please register first.'
          });
        }

        // Generate and save OTP
        const generatedOTP = otpService.generateOTP();
        const otpExpiry = otpService.generateOTPExpiry(10);

        await User.update(
          {
            otp_code: generatedOTP,
            otp_expiry: otpExpiry
          },
          { where: { id: user.id } }
        );

        // TODO: Integrate SMS service to send OTP
        // For now, return OTP in development mode
        const response = {
          success: true,
          message: 'OTP sent successfully'
        };

        if (process.env.NODE_ENV === 'development') {
          response.otp = generatedOTP; // Only in development
        }

        return res.json(response);
      }

      // Verify OTP and login
      const user = await User.findOne({
        where: { phone_number: mobile },
        include: [{
          model: UserType,
          as: 'userType',
          attributes: ['user_type_id', 'user_role']
        }]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Validate OTP
      const validation = otpService.validateOTP(
        otp,
        user.otp_code,
        user.otp_expiry
      );

      if (!validation.valid) {
        return res.status(401).json({
          success: false,
          message: validation.message
        });
      }

      // Clear OTP code (otp_expiry left as-is since it doesn't allow null)
      await User.update(
        { otp_code: null },
        { where: { id: user.id } }
      );

      const role = user.userType?.user_role || 'client';
      const user_type_id = user.userType?.user_type_id || null;

      // Get crew_member_id if creator
      let crew_member_id = null;
      if (user.userType && user.userType.user_type_id === 2) {
        const crew = await CrewMember.findOne({
          where: { email: user.email },
          attributes: ['crew_member_id', 'is_crew_verified']
        });

        crew_member_id = crew ? crew.crew_member_id : null;
        is_crew_verified = crew ? crew.is_crew_verified : null;
      }

      let affiliate_id = null;
const affiliate = await Affiliate.findOne({
  where: { user_id: user.id },
  attributes: ['affiliate_id']
});
affiliate_id = affiliate ? affiliate.affiliate_id : null;

      const { token, refreshToken } = generateTokens(user.id, role);
      const permissions = getPermissionsForRole(role);

      return res.json({
        success: true,
        message: "OTP login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
          instagram_handle: user.instagram_handle,
          role,
          user_type_id,
          email_verified: user.email_verified,
          crew_member_id,
          affiliate_id,
          is_crew_verified
        },

        token,
        refreshToken,
        permissions,
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Provide email/password or mobile number for OTP login'
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== PASSWORD MANAGEMENT ====================

/**
 * Change password for authenticated user
 * POST /auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword, userId } = req.body;

    if (!userId || !oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm password do not match'
      });
    }

    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Old password is incorrect'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.update(
      { password_hash: hashedPassword },
      { where: { id: user.id } }
    );

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Request password reset
 * POST /auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      // Don't reveal if user exists - security best practice
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = otpService.generateResetToken();
    const tokenExpiry = otpService.generateTokenExpiry(1); // 1 hour

    await User.update(
      {
        reset_token: resetToken,
        reset_token_expiry: tokenExpiry
      },
      { where: { email } }
    );

    // Send password reset email
    const emailResult = await emailService.sendPasswordResetEmail(
      { name: user.name, email },
      resetToken
    );

    if (!emailResult.success) {
      console.error('Failed to send reset email:', emailResult.error);
    }

    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('Forgot Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Reset password with token
 * POST /auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    const user = await User.findOne({ where: { reset_token: resetToken } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if token is expired
    if (user.reset_token_expiry < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.update(
      {
        password_hash: hashedPassword,
        reset_token: null,
        reset_token_expiry: null
      },
      { where: { id: user.id } }
    );

    return res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset Password Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== USER INFO ====================

/**
 * Get current user info from JWT
 * GET /auth/me
 */
exports.getCurrentUser = async (req, res) => {
  try {
    // User ID should be set by auth middleware
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Find user with user_type
    const user = await User.findOne({
      where: { id: userId },
      include: [{
        model: UserType,
        as: 'userType',
        attributes: ['user_type_id', 'user_role']
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    const role = user.userType?.user_role || 'client';
    const permissions = getPermissionsForRole(role);

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        instagram_handle: user.instagram_handle,
        role: role,
        email_verified: user.email_verified,
        created_at: user.created_at
      },
      permissions
    });

  } catch (error) {
    console.error('Get Current User Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching user info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get permissions for a specific role
 * GET /auth/permissions/:role
 */
exports.getPermissions = async (req, res) => {
  try {
    const { role } = req.params;

    const validRoles = ['client', 'sales_rep', 'creator', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be: client, sales_rep, creator, or admin'
      });
    }

    const permissions = getPermissionsForRole(role);

    return res.status(200).json({
      success: true,
      role,
      permissions
    });

  } catch (error) {
    console.error('Get Permissions Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Quick registration during booking flow
 * POST /auth/quick-register
 */
exports.quickRegister = async (req, res) => {
  try {
    const { name, email, phone_number } = req.body;

    if (!name || (!email && !phone_number)) {
      return res.status(400).json({
        success: false,
        message: 'Name and either email or phone number are required'
      });
    }

    // Check if user already exists
    const conditions = [];
    if (email) conditions.push({ email });
    if (phone_number) conditions.push({ phone_number });

    const existingUser = await User.findOne({
      where: { [Op.or]: conditions },
      include: [{
        model: UserType,
        as: 'userType',
        attributes: ['user_type_id', 'user_role']
      }]
    });

    // If user exists, return user info
    if (existingUser) {
      const role = existingUser.userType?.user_role || 'client';
      const { token, refreshToken } = generateTokens(existingUser.id, role);
      const permissions = getPermissionsForRole(role);

      return res.status(200).json({
        success: true,
        message: 'User already exists',
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          phone_number: existingUser.phone_number,
          role: role
        },
        token,
        refreshToken,
        permissions
      });
    }

    // Get client role user_type_id
    const clientType = await user_type.findOne({
      where: { user_role: 'client' }
    });

    if (!clientType) {
      return res.status(500).json({
        success: false,
        message: 'User role configuration error'
      });
    }

    // Create temporary password (user can set later)
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create new client user
    const newUser = await User.create({
      name,
      email,
      phone_number,
      password_hash: hashedPassword,
      user_type: clientType.user_type_id,
      is_active: 1,
      email_verified: 0
    });

    // Auto-create affiliate account
    let affiliateData = null;
    try {
      const affiliate = await affiliateController.createAffiliate(newUser.id);
      if (affiliate) {
        affiliateData = {
          affiliate_id: affiliate.affiliate_id,
          referral_code: affiliate.referral_code
        };
      }
    } catch (affiliateError) {
      console.error('Failed to create affiliate account:', affiliateError);
    }

    // Generate tokens
    const { token, refreshToken } = generateTokens(newUser.id, 'client');
    const permissions = getPermissionsForRole('client');

    return res.status(201).json({
      success: true,
      message: 'Quick registration successful',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone_number: newUser.phone_number,
        role: 'client'
      },
      affiliate: affiliateData,
      token,
      refreshToken,
      permissions,
      tempPassword: tempPassword // Send temp password for user to set new one
    });

  } catch (error) {
    console.error('Quick Register Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during quick registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== CREW MEMBER REGISTRATION ====================

/**
 * Register crew member - Step 1: Basic Info
 * POST /auth/register-crew-step1
 */
// exports.registerCrewMemberStep1 = [
//   upload.fields([{ name: 'profile_photo', maxCount: 1 }]),

//   async (req, res) => {
//     try {
//       const {
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         password,
//         working_distance
//       } = req.body;

//       if (!first_name || !last_name || !email || !password) {
//         return res.status(400).json({
//           success: false,
//           code: 'VALIDATION_ERROR',
//           message: 'First name, last name, email, and password are required'
//         });
//       }

//       const hashedPassword = await bcrypt.hash(password, 10);

//       const otp = otpService.generateOTP();
//       const otpExpiry = otpService.generateOTPExpiry(10);

//       const newUser = await User.create({
//         name: `${first_name} ${last_name}`,
//         email,
//         phone_number,
//         password_hash: hashedPassword,
//         user_type: 2,
//         is_active: 1,
//         email_verified: 0,
//         verification_code: otp,
//         otp_expiry: otpExpiry
//       });

//       const newCrewMember = await crew_members.create({
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         working_distance,
//         is_active: 1
//       });

//       if (req.files?.profile_photo) {
//         const filePaths = await S3UploadFiles(req.files);

//         for (const fileData of filePaths || []) {
//           if (fileData.file_type === 'profile_photo') {
//             await crew_member_files.create({
//               crew_member_id: newCrewMember.crew_member_id,
//               file_type: fileData.file_type,
//               file_path: fileData.file_path,
//               file_category: 'profile_photo'
//             });
//           }
//         }
//       }

//       await emailService.sendVerificationOTP(
//         { name: `${first_name} ${last_name}`, email },
//         otp
//       );

//       return res.status(201).json({
//         success: true,
//         message: 'Crew member registered successfully. Please verify your email.',
//         crew_member_id: newCrewMember.crew_member_id,
//         user_id: newUser.id
//       });

//     } catch (error) {
//       console.error('Register Crew Member Error:', error);

//       if (error.name === 'SequelizeUniqueConstraintError') {
//         const field = error.errors?.[0]?.path;

//         return res.status(409).json({
//           success: false,
//           code: `DUPLICATE_${field?.toUpperCase()}`,
//           message: `${field?.replace('_', ' ')} already exists`
//         });
//       }

//       if (error.name === 'SequelizeValidationError') {
//         return res.status(400).json({
//           success: false,
//           code: 'DB_VALIDATION_ERROR',
//           message: error.errors[0]?.message
//         });
//       }

//       return res.status(500).json({
//         success: false,
//         code: 'SERVER_ERROR',
//         message: 'Something went wrong. Please try again later.'
//       });
//     }
//   }
// ];

// exports.registerCrewMemberStep1 = [
//   upload.fields([{ name: 'profile_photo', maxCount: 1 }]),

//   async (req, res) => {
//     try {
//       const {
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         password,
//         working_distance
//       } = req.body;

//       if (!first_name || !last_name || !email || !password) {
//         return res.status(400).json({
//           success: false,
//           code: 'VALIDATION_ERROR',
//           message: 'First name, last name, email, and password are required'
//         });
//       }

//       const existingUser = await User.findOne({
//         where: { email }
//       });

//       if (existingUser) {
//         return res.status(409).json({
//           success: false,
//           code: 'DUPLICATE_EMAIL',
//           message: 'Email already exists'
//         });
//       }

//       const hashedPassword = await bcrypt.hash(password, 10);
//       const otp = otpService.generateOTP();
//       const otpExpiry = otpService.generateOTPExpiry(10); // 10 minutes

//       const newUser = await User.create({
//         name: `${first_name} ${last_name}`,
//         email,
//         phone_number,
//         password_hash: hashedPassword,
//         user_type: 2,
//         is_active: 1,
//         email_verified: 0,
//         verification_code: otp,
//         otp_expiry: otpExpiry
//       });

//       const newCrewMember = await crew_members.create({
//         first_name,
//         last_name,
//         email,
//         phone_number,
//         location,
//         working_distance,
//         is_active: 1
//       });

//       if (req.files?.profile_photo) {
//         const uploadedFiles = await S3UploadFiles(req.files);

//         for (const file of uploadedFiles || []) {
//           if (file.file_type === 'profile_photo') {
//             await crew_member_files.create({
//               crew_member_id: newCrewMember.crew_member_id,
//               file_type: file.file_type,
//               file_path: file.file_path,
//               file_category: 'profile_photo'
//             });
//           }
//         }
//       }

//       await emailService.sendVerificationOTP(
//         { name: `${first_name} ${last_name}`, email },
//         otp
//       );

//       let affiliateData = null;

//       try {
//         const affiliate = await affiliateController.createAffiliate(newUser.id);
//         if (affiliate) {
//           affiliateData = {
//             affiliate_id: affiliate.affiliate_id,
//             referral_code: affiliate.referral_code
//           };
//         }
//       } catch (affiliateError) {
//         console.error('Affiliate creation failed:', affiliateError);
//       }

//       return res.status(201).json({
//         success: true,
//         message: 'Crew member registered successfully. Please verify your email.',
//         user_id: newUser.id,
//         crew_member_id: newCrewMember.crew_member_id,
//         affiliate: affiliateData
//       });

//     } catch (error) {
//       console.error('Register Crew Member Error:', error);

//       if (error.name === 'SequelizeUniqueConstraintError') {
//         const field = error.errors?.[0]?.path;
//         return res.status(409).json({
//           success: false,
//           code: `DUPLICATE_${field?.toUpperCase()}`,
//           message: `${field?.replace('_', ' ')} already exists`
//         });
//       }

//       if (error.name === 'SequelizeValidationError') {
//         return res.status(400).json({
//           success: false,
//           code: 'DB_VALIDATION_ERROR',
//           message: error.errors[0]?.message
//         });
//       }

//       return res.status(500).json({
//         success: false,
//         code: 'SERVER_ERROR',
//         message: 'Something went wrong. Please try again later.'
//       });
//     }
//   }
// ];

exports.registerCrewMemberStep1 = [
  upload.fields([{ name: 'profile_photo', maxCount: 1 }]),

  async (req, res) => {
    try {
      const {
        first_name,
        last_name,
        email,
        phone_number,
        location,
        password,
        working_distance,
        crew_member_id,
        user_id // Add user_id to the request body
      } = req.body;

      if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'First name, last name, email, and password are required'
        });
      }

      // If both crew_member_id and user_id are sent, update both
      if (crew_member_id && user_id) {
        const existingCrewMember = await crew_members.findOne({
          where: { crew_member_id }
        });

        if (!existingCrewMember) {
          return res.status(404).json({
            success: false,
            code: 'CREW_MEMBER_NOT_FOUND',
            message: 'Crew member not found'
          });
        }

        // Update crew member data
        await crew_members.update({
          first_name,
          last_name,
          email,
          phone_number,
          location,
          working_distance
        }, {
          where: { crew_member_id }
        });

        // Update user data using user_id
        await User.update({
          name: `${first_name} ${last_name}`,
          email,
          phone_number,
        }, {
          where: { id: user_id }
        });

        // Handle profile photo replacement (only if new photo is uploaded)
        if (req.files?.profile_photo) {
          // Find the existing profile photo for this crew_member_id
          const existingProfileFile = await crew_member_files.findOne({
            where: { crew_member_id, file_type: 'profile_photo' }
          });

          if (existingProfileFile) {
            // Optionally delete from S3 if necessary (function for S3 deletion)
            // await deleteFileFromS3(existingProfileFile.file_path);

            // Delete the old profile photo record from the database
            await crew_member_files.destroy({
              where: { crew_member_id, file_type: 'profile_photo' }
            });
          }

          // Upload the new profile photo
          const uploadedFiles = await S3UploadFiles(req.files);

          for (const file of uploadedFiles || []) {
            if (file.file_type === 'profile_photo') {
              await crew_member_files.create({
                crew_member_id,
                file_type: file.file_type,
                file_path: file.file_path,
                file_category: 'profile_photo'
              });
            }
          }
        }

        return res.status(200).json({
          success: true,
          message: 'Crew member details updated successfully',
          crew_member_id, // Include crew_member_id in the response
          user_id,         // Include user_id in the response
        });
      }

      // If no crew_member_id and user_id, proceed with new registration
      const existingUser = await User.findOne({
        where: { email }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_EMAIL',
          message: 'Email already exists'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      // const otp = otpService.generateOTP();
      // const otpExpiry = otpService.generateOTPExpiry(10);

      // Create new user
      const newUser = await User.create({
        name: `${first_name} ${last_name}`,
        email,
        phone_number,
        password_hash: hashedPassword,
        user_type: 2,
        is_active: 1,
        email_verified: 0,
        // verification_code: otp,
        // otp_expiry: otpExpiry
      });

      // Create new crew member
      const newCrewMember = await crew_members.create({
        user_id: newUser.id,
        first_name,
        last_name,
        email,
        phone_number,
        location,
        working_distance,
        is_active: 1
      });

      // Handle profile photo upload for new crew member
      if (req.files?.profile_photo) {
        const uploadedFiles = await S3UploadFiles(req.files);

        for (const file of uploadedFiles || []) {
          if (file.file_type === 'profile_photo') {
            await crew_member_files.create({
              crew_member_id: newCrewMember.crew_member_id,
              file_type: file.file_type,
              file_path: file.file_path,
              file_category: 'profile_photo'
            });
          }
        }
      }

      // Optionally create an affiliate
      let affiliateData = null;
      try {
        const affiliate = await affiliateController.createAffiliate(newUser.id);
        if (affiliate) {
          affiliateData = {
            affiliate_id: affiliate.affiliate_id,
            referral_code: affiliate.referral_code
          };
        }
      } catch (affiliateError) {
        console.error('Affiliate creation failed:', affiliateError);
      }

      // Send verification OTP email
      // await emailService.sendVerificationOTP(
      //   { name: `${first_name} ${last_name}`, email },
      //   otp
      // );

      return res.status(201).json({
        success: true,
        message: 'Crew member registered successfully. Please verify your email.',
        user_id: newUser.id,
        crew_member_id: newCrewMember.crew_member_id,
        affiliate: affiliateData // If no affiliate data, it will be null, but still included
      });

    } catch (error) {
      console.error('Register Crew Member Error:', error);

      if (error.name === 'SequelizeUniqueConstraintError') {
        const field = error.errors?.[0]?.path;
        return res.status(409).json({
          success: false,
          code: `DUPLICATE_${field?.toUpperCase()}`,
          message: `${field?.replace('_', ' ')} already exists`
        });
      }

      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({
          success: false,
          code: 'DB_VALIDATION_ERROR',
          message: error.errors[0]?.message
        });
      }

      return res.status(500).json({
        success: false,
        code: 'SERVER_ERROR',
        message: 'Something went wrong. Please try again later.'
      });
    }
  }
];



/**
 * Register crew member - Step 2: Professional Details
 * POST /auth/register-crew-step2
 */
exports.registerCrewMemberStep2 = async (req, res) => {
  try {
    const {
      crew_member_id,
      primary_role,
      years_of_experience,
      hourly_rate,
      bio,
      skills,
      equipment_ownership
    } = req.body;

    if (!crew_member_id) {
      return res.status(400).json({
        success: false,
        message: 'crew_member_id is required'
      });
    }

    const existingCrewMember = await crew_members.findOne({
      where: { crew_member_id }
    });

    if (!existingCrewMember) {
      return res.status(400).json({
        success: false,
        message: 'Crew member not found'
      });
    }

    if (Array.isArray(primary_role)) {
      existingCrewMember.primary_role = JSON.stringify(primary_role);
    } else if (primary_role !== undefined && primary_role !== null) {
      existingCrewMember.primary_role = JSON.stringify([primary_role]);
    } else {
      existingCrewMember.primary_role = null;
    }

    existingCrewMember.years_of_experience = years_of_experience;
    existingCrewMember.hourly_rate = hourly_rate;
    existingCrewMember.bio = bio;
    existingCrewMember.skills = skills ? JSON.stringify(skills) : null;
    existingCrewMember.equipment_ownership = equipment_ownership
      ? JSON.stringify(equipment_ownership)
      : null;

    await existingCrewMember.save();

    return res.status(200).json({
      success: true,
      message: 'Professional details updated successfully (Step 2)',
      crew_member: existingCrewMember
    });

  } catch (error) {
    console.error('Register Crew Member Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Register crew member - Step 3: Additional Details
 * POST /auth/register-crew-step3
 */
exports.registerCrewMemberStep3 = [
  upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'portfolio', maxCount: 10 },
    { name: 'certifications', maxCount: 10 },
    { name: 'recent_work', maxCount: undefined }
  ]),

  async (req, res) => {
    try {
      const { crew_member_id, availability, certifications, social_media_links } = req.body;

      if (!crew_member_id) {
        return res.status(400).json({
          success: false,
          message: 'crew_member_id is required'
        });
      }

      const crewMember = await crew_members.findOne({ where: { crew_member_id } });
      if (!crewMember) {
        return res.status(400).json({
          success: false,
          message: 'Crew member not found'
        });
      }

      crewMember.availability = JSON.stringify(availability);
      crewMember.certifications = JSON.stringify(certifications);

      if (social_media_links) {
        crewMember.social_media_links = JSON.stringify(social_media_links);
      }

      await crewMember.save();

      const filePaths = await S3UploadFiles(req.files);
      const files = [];

      for (let fileData of filePaths) {
        let fileCategory = 'general';
        if (fileData.fieldname === 'resume') {
          fileCategory = 'resume';
        } else if (fileData.fieldname === 'portfolio') {
          fileCategory = 'portfolio';
        } else if (fileData.fieldname === 'certifications') {
          fileCategory = 'certifications';
        } else if (fileData.fieldname === 'recent_work') {
          fileCategory = 'recent_work';
        }

        files.push({
          crew_member_id: crewMember.crew_member_id,
          file_type: fileData.file_type,
          file_path: fileData.file_path,
          file_category: fileCategory,
        });
      }

      if (files.length > 0) {
        await crew_member_files.bulkCreate(files);
      }

      return res.status(200).json({
        success: true,
        message: 'Project details updated successfully (Step 3)',
        crew_member: crewMember
      });

    } catch (error) {
      console.error('Register Crew Member Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
];

/**
 * Get crew member details
 * GET /auth/crew-member/:crew_member_id
 */
exports.getCrewMemberDetails = async (req, res) => {
  try {
    const { crew_member_id } = req.params;

    if (!crew_member_id) {
      return res.status(400).json({
        success: false,
        message: 'crew_member_id is required'
      });
    }

    const crewMember = await crew_members.findOne({
      where: { crew_member_id },
      raw: true
    });

    if (!crewMember) {
      return res.status(404).json({
        success: false,
        message: 'Crew member not found'
      });
    }

    const files = await crew_member_files.findAll({
      where: { crew_member_id },
      raw: true
    });

    const categorizedFiles = {
      profile_photo: null,
      resume: null,
      portfolio: null,
      certifications: [],
      recent_work: []
    };

    files.forEach(file => {
      switch (file.file_category) {
        case 'profile_photo':
          categorizedFiles.profile_photo = file;
          break;
        case 'resume':
          categorizedFiles.resume = file;
          break;
        case 'portfolio':
          categorizedFiles.portfolio = file;
          break;
        case 'certifications':
          categorizedFiles.certifications.push(file);
          break;
        case 'recent_work':
          categorizedFiles.recent_work.push(file);
          break;
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        step1: {
          first_name: crewMember.first_name,
          last_name: crewMember.last_name,
          email: crewMember.email,
          phone_number: crewMember.phone_number,
          location: crewMember.location,
          working_distance: crewMember.working_distance,
          profile_photo: categorizedFiles.profile_photo
        },
        step2: {
          primary_role: crewMember.primary_role,
          years_of_experience: crewMember.years_of_experience,
          hourly_rate: crewMember.hourly_rate,
          bio: crewMember.bio,
          skills: crewMember.skills ? JSON.parse(crewMember.skills) : [],
          equipment_ownership: crewMember.equipment_ownership
            ? JSON.parse(crewMember.equipment_ownership)
            : []
        },
        step3: {
          availability: crewMember.availability
            ? JSON.parse(crewMember.availability)
            : [],
          certifications: crewMember.certifications
            ? JSON.parse(crewMember.certifications)
            : [],
          social_media_links: crewMember.social_media_links
            ? JSON.parse(crewMember.social_media_links)
            : {},
          files: {
            resume: categorizedFiles.resume,
            portfolio: categorizedFiles.portfolio,
            certifications: categorizedFiles.certifications,
            recent_work: categorizedFiles.recent_work
          }
        }
      }
    });

  } catch (error) {
    console.error('Get Crew Member Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
