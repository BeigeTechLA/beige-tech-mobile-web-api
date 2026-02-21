const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const creatorRoutes = require('./routes/creator.routes');
const paymentsController = require('./controllers/payments.controller');

const app = express();

// CORS configuration - allow frontend origins
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

// If CORS_ORIGINS is '*', allow all origins
const corsConfig = corsOrigins[0] === '*'
  ? {
      origin: true, // Allow all origins
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }
  : {
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };

app.use(cors(corsConfig));

// CORS preflight is handled automatically by app.use(cors(corsConfig)) above

// Stripe webhook must receive raw body for signature verification.
app.post(
  '/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentsController.handleStripeWebhook
);

// Request logging middleware
app.use((req, res, next) => {
  const baseUrl = 'http://localhost:3000/api/'; // Define base URL for API
  const fullUrl = `${baseUrl}${req.originalUrl}`;  // Combine base URL with the current request URL
  console.log(`[${new Date().toISOString()}] ${req.method} ${fullUrl}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('Headers:', req.headers);
  }
  
  next();
});

// Body parsing middleware
app.use(bodyParser.json({ limit: '300mb' }));
app.use(bodyParser.urlencoded({
  limit: '300mb',
  extended: true
}));
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// Body logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Body:', req.body);
    }
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'revure-v2-backend'
  });
});

// Mount API routes with /v1 prefix

app.use('/v1', routes);
// app.use('/api/creator', creatorRoutes);


// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: 'Route not found',
    path: req.url
  });
});

// Global error handling middleware
app.use(errorHandler);

module.exports = app;
