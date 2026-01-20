const jwt = require('jsonwebtoken');

/**
 * Verify JWT token and attach user info to request
 */
exports.authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to request
    req.userId = decoded.userId;
    req.userRole = decoded.userRole;

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    console.error('Authentication Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check if user has required role
 * @param {string[]} roles - Array of allowed roles
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    if (!roles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Optional authentication - attaches user info if token exists but doesn't require it
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.userId;
    req.userRole = decoded.userRole;

    next();

  } catch (error) {
    // If token is invalid, just continue without authentication
    next();
  }
};

/**
 * Require sales rep role
 * User must be authenticated and have sales_rep role
 */
exports.requireSalesRep = async (req, res, next) => {
  try {
    const { users, user_type } = require('../models');
    
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get user with user type
    const user = await users.findByPk(req.userId, {
      include: [
        {
          model: user_type,
          as: 'userType',
          attributes: ['user_role']
        }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRole = user.userType?.user_role;

    if (userRole !== 'sales_rep') {
      return res.status(403).json({
        success: false,
        message: 'Sales rep access required'
      });
    }

    next();

  } catch (error) {
    console.error('Sales rep authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Require sales rep or admin role
 * User must be authenticated and have sales_rep or admin role
 */
exports.requireSalesRepOrAdmin = async (req, res, next) => {
  try {
    const { users, user_type } = require('../models');
    
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get user with user type
    const user = await users.findByPk(req.userId, {
      include: [
        {
          model: user_type,
          as: 'userType',
          attributes: ['user_role']
        }
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRole = user.userType?.user_role;

    if (userRole !== 'sales_rep' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Sales rep or admin access required'
      });
    }

    req.userRole = userRole; // Attach role to request
    next();

  } catch (error) {
    console.error('Sales rep/admin authorization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
