const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { users, user_type } = require('../models');
const constants = require('../utils/constants');
const common_model = require('../utils/common_model');
const User = common_model.getTableNameDirect(constants.TABLES.USERS);
const UserType = common_model.getTableNameDirect(constants.TABLES.USER_TYPE);
const CrewMember = common_model.getTableNameDirect(constants.TABLES.CREW_MEMBERS);
const { crew_members, crew_member_files } = require('../models');
const config = require('../config/config');
const crypto = require('crypto');
const { S3UploadFiles } = require('../utils/common.js');
const multer = require('multer');
const path = require('path');
const STATIC_VERIFICATION_CODE = '123456';


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

function uploadFiles(files) {
  const filePaths = [];
  if (files) {
    for (let fileKey in files) {
      const file = files[fileKey];
      filePaths.push({
        file_type: fileKey,
        file_path: `/uploads/${file[0].filename}`,
      });
    }
  }
  return filePaths;
}

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

// Generate JWT tokens
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

// Get permissions for a role
const getPermissionsForRole = (role) => {
  return PERMISSIONS_MAP[role] || [];
};

/**
 * Register new user
 * POST /auth/register
 */
exports.register = async (req, res) => {
  try {
    const { name, email, phone_number, instagram_handle, password, role = 'client' } = req.body;

    // Validate required fields
    if (!name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name and password are required'
      });
    }

    // At least one identifier required
    if (!email && !phone_number && !instagram_handle) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one: email, phone number, or Instagram handle'
      });
    }

    // Validate role
    const validRoles = ['client', 'sales_rep', 'creator', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be: client, sales_rep, creator, or admin'
      });
    }

    // Check if user already exists
    const conditions = [];
    if (email) conditions.push({ email });
    if (phone_number) conditions.push({ phone_number });
    if (instagram_handle) conditions.push({ instagram_handle });

    const userExists = await users.findOne({
      where: { [Op.or]: conditions }
    });

    if (userExists) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with provided credentials'
      });
    }

    // Get user_type_id for role
    const userTypeRecord = await user_type.findOne({
      where: { user_role: role }
    });

    if (!userTypeRecord) {
      return res.status(500).json({
        success: false,
        message: 'User role configuration error'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await users.create({
      name,
      email,
      phone_number,
      instagram_handle,
      password_hash: hashedPassword,
      user_type: userTypeRecord.user_type_id,
      is_active: 1,
      email_verified: 0
    });

    // Generate tokens
    const { token, refreshToken } = generateTokens(newUser.id, role);
    const permissions = getPermissionsForRole(role);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone_number: newUser.phone_number,
        instagram_handle: newUser.instagram_handle,
        role: role
      },
      token,
      refreshToken,
      permissions
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

/**
 * Login user with email and password
 * POST /auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user with user_type association
    const user = await users.findOne({
      where: { email },
      include: [{
        model: user_type,
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

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support'
      });
    }

    // Verify password
    if (!user.password_hash) {
      return res.status(500).json({
        success: false,
        message: 'Account configuration error'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Get user role
    const role = user.userType?.user_role || 'client';

    // Generate tokens
    const { token, refreshToken } = generateTokens(user.id, role);
    const permissions = getPermissionsForRole(role);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        instagram_handle: user.instagram_handle,
        role: role,
        email_verified: user.email_verified
      },
      token,
      refreshToken,
      permissions
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

/**
 * Quick registration during booking flow
 * POST /auth/quick-register
 */
exports.quickRegister = async (req, res) => {
  try {
    const { name, email, phone_number } = req.body;

    // Validate required fields
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

    const existingUser = await users.findOne({
      where: { [Op.or]: conditions },
      include: [{
        model: user_type,
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
    const newUser = await users.create({
      name,
      email,
      phone_number,
      password_hash: hashedPassword,
      user_type: clientType.user_type_id,
      is_active: 1,
      email_verified: 0
    });

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

/**
 * Get permissions for a specific role
 * GET /auth/permissions/:role
 */
exports.getPermissions = async (req, res) => {
  try {
    const { role } = req.params;

    // Validate role
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
 * Get current user info from JWT
 * GET /auth/me
 */
exports.getCurrentUser = async (req, res) => {
  try {
    // User ID should be set by auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    // Find user with user_type
    const user = await users.findOne({
      where: { id: userId },
      include: [{
        model: user_type,
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



exports.register = async (req, res) => {
    const { name, email, phone_number, instagram_handle, password, userType } = req.body;

    try {
        if (![1, 2].includes(userType)) {
            return res.status(400).json({ message: "Invalid user type" });
        }

        const conditions = [];
        if (email) conditions.push({ email });
        if (phone_number) conditions.push({ phone_number });
        if (instagram_handle) conditions.push({ instagram_handle });

        if (conditions.length === 0) {
            return res.status(400).json({ message: "Provide email, phone number, or Instagram handle." });
        }

        const userExists = await User.findOne({
            where: { [Op.or]: conditions }
        });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            email,
            phone_number,
            instagram_handle,
            password_hash: hashedPassword,
            is_active: 1,
            email_verified: 0,
            verification_code: STATIC_VERIFICATION_CODE,
            user_type: userType,
        });

        return res.status(201).json({
            message: 'User registered successfully. Please use verification code 123456 to verify your email.',
            userId: newUser.id,
            verificationCode: STATIC_VERIFICATION_CODE
        });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};


exports.verifyEmail = async (req, res) => {
    const { email, verificationCode } = req.body;

    try {
        if (!email || !verificationCode) {
            return res.status(400).json({ message: "Email and verification code required" });
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (user.verification_code !== verificationCode) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        await User.update({ email_verified: 1 }, { where: { email } });

        return res.status(200).json({ message: 'Email verified successfully' });

    } catch (error) {
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.login = async (req, res) => {
  try {
    const { email, password, mobile, otp } = req.body;

    if (email) {
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      const user = await User.findOne({
        where: { email },
        include: [
          {
            model: UserType,
            as: "userType",
            attributes: ["user_type_id", "user_role"]
          }
        ]
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.password_hash) {
        return res.status(500).json({ message: "User has no password stored!" });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid password" });
      }

      let crew_member_id = null;
      if (user.userType.user_type_id === 2) {
        const crew = await CrewMember.findOne({
          where: { email: user.email },
          attributes: ["crew_member_id"]
        });

        crew_member_id = crew ? crew.crew_member_id : null;
      }

      const token = jwt.sign(
        {
          userId: user.id,
          userTypeId: user.userType.user_type_id,
          userRole: user.userType.user_role
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        message: `${user.userType.user_role} login successful`,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          userTypeId: user.userType.user_type_id,
          userRole: user.userType.user_role,
          crew_member_id
        }
      });
    }
    if (mobile) {
      const STATIC_OTP = "1234";

      if (!otp) {
        const user = await User.findOne({
          where: { phone_number: mobile },
          include: [
            {
              model: UserType,
              as: "userType",
              attributes: ["user_type_id", "user_role"]
            }
          ]
        });

        if (!user) {
          return res.status(404).json({
            message: "User not found. Please register first."
          });
        }

        await User.update(
          { otp_code: STATIC_OTP },
          { where: { id: user.id } }
        );

        return res.json({
          message: "OTP sent successfully"
        });
      }

      const user = await User.findOne({
        where: { phone_number: mobile },
        include: [
          {
            model: UserType,
            as: "userType",
            attributes: ["user_type_id", "user_role"]
          }
        ]
      });

      if (!user) {
        return res.status(404).json({
          message: "User not found. Please register first."
        });
      }

      if (otp !== STATIC_OTP) {
        return res.status(401).json({ message: "Invalid OTP" });
      }

      let crew_member_id = null;
      if (user.userType.user_type_id === 2) {
        const crew = await CrewMember.findOne({
          where: { email: user.email },
          attributes: ["crew_member_id"]
        });

        crew_member_id = crew ? crew.crew_member_id : null;
      }

      const token = jwt.sign(
        {
          userId: user.id,
          userTypeId: user.userType.user_type_id,
          userRole: user.userType.user_role
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        message: `${user.userType.user_role} OTP login successful`,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          userTypeId: user.userType.user_type_id,
          userRole: user.userType.user_role,
          crew_member_id
        }
      });
    }

    return res.status(400).json({
      message: "Provide email or mobile number"
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword, confirmPassword, userId } = req.body;

  try {
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.update({ password_hash: hashedPassword }, { where: { id: user.id } });

    return res.json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error('Error in changePassword:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(16).toString('hex');

    const tokenExpiry = Date.now() + 10 * 60 * 1000;
    await User.update({ reset_token: resetToken, reset_token_expiry: tokenExpiry }, { where: { email } });

    return res.json({
      message: 'Password reset token generated. Please use the token to reset your password.',
      resetToken,
    });

  } catch (error) {
    console.error('Error in forgotPassword:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  const { resetToken, newPassword, confirmPassword } = req.body;

  try {
    const user = await User.findOne({ where: { reset_token: resetToken } });

    if (!user) {
      return res.status(404).json({ message: "Invalid or expired reset token" });
    }

    if (user.reset_token_expiry < Date.now()) {
      return res.status(400).json({ message: "Reset token has expired" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.update(
      { password_hash: hashedPassword, reset_token: null, reset_token_expiry: null },
      { where: { id: user.id } }
    );

    return res.json({
      message: "Password has been reset successfully",
    });

  } catch (error) {
    console.error('Error in resetPassword:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
};

exports.registerCrewMemberStep1 = [
  upload.fields([
    { name: 'profile_photo', maxCount: 1 }
  ]),

  async (req, res) => {
    try {
      const { first_name, last_name, email, phone_number, location, password, profile_photo, working_distance } = req.body;

      if (!first_name || !last_name || !email || !password) {
        return res.status(400).json({
          error: true,
          message: 'First name, last name, email, and password are .'
        });required
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        name: `${first_name} ${last_name}`,
        email,
        phone_number,
        password_hash: hashedPassword,
        user_type: 2, 
        is_active: 1,
        email_verified: 0,
        verification_code: STATIC_VERIFICATION_CODE
      });

      const newCrewMember = await crew_members.create({
        // user_id: newUser.id, 
        first_name,
        last_name,
        email,
        phone_number,
        location,
        working_distance,
        is_active: 1,
      });

      if (req.files && req.files.profile_photo) {
        const filePaths = await S3UploadFiles(req.files);
        console.log("Uploaded file paths:", filePaths);

        if (filePaths && filePaths.length > 0) {
          for (let fileData of filePaths) {
            if (fileData.file_type === 'profile_photo') {
              console.log("Saving file to database:", fileData);
              const savedFile = await crew_member_files.create({
                crew_member_id: newCrewMember.crew_member_id,
                file_type: fileData.file_type,
                file_path: fileData.file_path,
                file_category: 'profile_photo',
              });

              console.log("File saved to crew_member_files:", savedFile);
            }
          }
        }
      }

      return res.status(201).json({
        message: 'Crew member registered successfully (Step 1)',
        crew_member_id: newCrewMember.crew_member_id,
        verificationCode: STATIC_VERIFICATION_CODE
      });

    } catch (error) {
      console.error('Register Crew Member Error:', error);
      return res.status(500).json({
        error: true,
        message: 'Server error',
        data: null,
      });
    }
  },
];

exports.registerCrewMemberStep2 = async (req, res) => {
  try {
    const { crew_member_id, primary_role, years_of_experience, hourly_rate, bio, skills, equipment_ownership } = req.body;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: 'crew_member_id is required.'
      });
    }

    const existingCrewMember = await crew_members.findOne({ where: { crew_member_id } });

    if (!existingCrewMember) {
      return res.status(400).json({ error: true, message: 'Crew member not found.' });
    }

    existingCrewMember.primary_role = primary_role;
    existingCrewMember.years_of_experience = years_of_experience;
    existingCrewMember.hourly_rate = hourly_rate;
    existingCrewMember.bio = bio;
    existingCrewMember.skills = JSON.stringify(skills);
    existingCrewMember.equipment_ownership = JSON.stringify(equipment_ownership);

    await existingCrewMember.save();

    return res.status(200).json({
      message: 'Professional details updated successfully (Step 2)',
      crew_member: existingCrewMember
    });

  } catch (error) {
    console.error('Register Crew Member Error:', error);
    return res.status(500).json({
      error: true,
      message: 'Server error',
      data: null,
    });
  }
};

exports.registerCrewMemberStep3 = [
  upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'portfolio', maxCount: 1 },
    { name: 'certifications', maxCount: 10 },
    { name: 'recent_work', maxCount: undefined }
  ]),

  async (req, res) => {
    try {
      const { crew_member_id, availability, certifications, resume, portfolio, social_media_links } = req.body;

      if (!crew_member_id) {
        return res.status(400).json({
          error: true,
          message: 'crew_member_id is required.'
        });
      }

      const crewMember = await crew_members.findOne({ where: { crew_member_id } });
      if (!crewMember) {
        return res.status(400).json({ error: true, message: 'Crew member not found.' });
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
        message: 'Project details updated successfully (Step 3)',
        crew_member: crewMember
      });

    } catch (error) {
      console.error('Register Crew Member Error:', error);
      return res.status(500).json({
        error: true,
        message: 'Server error',
        data: null,
      });
    }
  }
];

exports.getCrewMemberDetails = async (req, res) => {
  try {
    const { crew_member_id } = req.params;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: 'crew_member_id is required'
      });
    }

    const crewMember = await crew_members.findOne({
      where: { crew_member_id },
      raw: true
    });

    if (!crewMember) {
      return res.status(404).json({
        error: true,
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
      error: false,
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
      error: true,
      message: 'Server error',
      data: null
    });
  }
};
