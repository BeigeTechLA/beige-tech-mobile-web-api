console.log('🔥 server.js loaded');

const app = require('./app');
const sequelize = require('./db');
const config = require('./config/config');
const models = require('./models'); // Load all models
const { startScheduledEmailJobs } = require('./services/scheduledEmails.service');

async function start() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Sync models in development (alter: true updates schema without dropping tables)
    // Disabled for now - tables already created
    // if (config.nodeEnv === 'development') {
    //   await sequelize.sync({ alter: true });
    //   console.log('Database models synchronized');
    // }

    // Start Express server
    const PORT = config.port;
    app.listen(PORT, () => {
      console.log(`Revure V2 Backend Server running on port ${PORT}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Base API path: /api`);
      startScheduledEmailJobs();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
