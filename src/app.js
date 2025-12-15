const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS configuration - allow frontend origins
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: corsOrigins,
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (process.env.NODE_ENV === 'development') {
    console.log('Headers:', req.headers);
  }
  next();
});

// Body parsing middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
