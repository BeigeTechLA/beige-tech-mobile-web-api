const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user information to request
 */
const authMiddleware = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: true,
        message: 'No authorization token provided'
      });
    }

    // Check for Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: true,
        message: 'Invalid token format. Use: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret);

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

module.exports = {
  authMiddleware,
  optionalAuth
};
