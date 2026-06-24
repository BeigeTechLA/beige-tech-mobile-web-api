const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../models');

const validatePermissionVersion = async (decoded) => {
  const user = await db.users.findOne({
    where: {
      id: decoded.userId
    },
    attributes: [
      'id',
      'permissions_version'
    ]
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  if (
    user.permissions_version !==
    decoded.permissionsVersion
  ) {
    throw new Error('PERMISSION_CHANGED');
  }

  return user;
};

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user information to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header or revure_token cookie
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token && req.headers.cookie) {
      const cookieHeader = req.headers.cookie;
      const cookiePairs = cookieHeader.split(';').map((cookie) => cookie.trim());
      const tokenCookie = cookiePairs.find((cookie) => cookie.startsWith('revure_token='));
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        error: true,
        message: 'No authorization token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret);

    await validatePermissionVersion(decoded);

    // Attach user information to request
    req.user = {
      userId: decoded.userId,
      userTypeId: decoded.userTypeId,
      userRole: decoded.userRole
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: true,
        message: 'Token has expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: true,
        message: 'Invalid token'
      });
    }

    if (
      error.message === 'PERMISSION_CHANGED' ||
      error.message === 'USER_NOT_FOUND'
    ) {
      return res.status(401).json({
        success: false,
        force_logout: true,
        message: 'Please login again.'
      });
    }

    return res.status(500).json({
      error: true,
      message: 'Authentication error',
      details: error.message
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't fail if missing
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return next();
    }

    const token = parts[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    req.user = {
      userId: decoded.userId,
      userTypeId: decoded.userTypeId,
      userRole: decoded.userRole
    };

    next();
  } catch (error) {
    // Token invalid, but continue without user
    next();
  }
};

const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token && req.headers.cookie) {
      const cookiePairs = req.headers.cookie.split(';').map((cookie) => cookie.trim());
      const tokenCookie = cookiePairs.find((cookie) => cookie.startsWith('revure_token='));
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        error: true,
        message: 'Authorization token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      userTypeId: decoded.userTypeId,
      userRole: decoded.userRole
    };

    console.log(req.user);

    const allowedRoles = ['Admin', 'production_manager'];

    if (!allowedRoles.includes(decoded.userRole)) {
      return res.status(403).json({
        error: true,
        message: 'Admin access required'
      });
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      error: true,
      message: 'Invalid or expired token'
    });
  }
};

module.exports = {
  authMiddleware,
  authenticate: authMiddleware,  // Alias for compatibility
  optionalAuth,
  authenticateAdmin,
  validatePermissionVersion
};
