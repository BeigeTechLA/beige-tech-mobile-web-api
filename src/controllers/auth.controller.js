const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { users, user_type } = require('../models');

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
