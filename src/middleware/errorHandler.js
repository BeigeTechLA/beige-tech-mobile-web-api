/**
 * Global Error Handling Middleware
 * Catches all errors and returns consistent error responses
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  console.error('[ERROR]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: true,
      message: 'Validation error',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: true,
      message: 'Resource already exists',
      details: err.errors.map(e => ({
        field: e.path,
        message: e.message
      }))
    });
  }

  // Sequelize foreign key constraint errors
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: true,
      message: 'Invalid reference to related resource'
    });
  }

  // Sequelize database connection errors
  if (err.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      error: true,
      message: 'Database connection error'
    });
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      error: true,
      message: 'File upload error',
      details: err.message
    });
  }

  // JWT errors (shouldn't reach here, but just in case)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: true,
      message: 'Authentication error',
      details: err.message
    });
  }

  // Custom application errors with status code
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: true,
      message: err.message,
      details: err.details
    });
  }

  // Default internal server error
  res.status(500).json({
    error: true,
    message: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

/**
 * Helper to create custom errors with status codes
 */
class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
