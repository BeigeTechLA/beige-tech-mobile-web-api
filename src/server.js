console.log('🔥 server.js loaded');

const app = require('./app');
const sequelize = require('./db');
const config = require('./config/config');

async function start() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Sync models in development (alter: true updates schema without dropping tables)
    if (config.nodeEnv === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Database models synchronized');
    }

    // Start Express server
    const PORT = config.port;
    app.listen(PORT, () => {
      console.log(`Revure V2 Backend Server running on port ${PORT}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Base API path: /api`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
