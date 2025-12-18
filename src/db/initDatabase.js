/**
 * Database initialization script
 * Creates database if not exists and verifies connection
 */

const { Sequelize } = require('sequelize');
const config = require('../config/config');

async function initDatabase() {
  console.log('=== Database Initialization ===\n');

  // First, connect without database to create it if needed
  const adminConnection = new Sequelize('', config.db.username, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    logging: false
  });

  try {
    // Test connection
    await adminConnection.authenticate();
    console.log('✓ MySQL connection successful');

    // Create database if not exists
    await adminConnection.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\``);
    console.log(`✓ Database '${config.db.database}' ready`);

    await adminConnection.close();

    // Now connect to the specific database
    const sequelize = require('./index');
    await sequelize.authenticate();
    console.log('✓ Connected to database:', config.db.database);

    // Sync models (create tables if they don't exist)
    console.log('\nSyncing database models...');
    await sequelize.sync({ alter: false });
    console.log('✓ Database models synchronized');

    console.log('\n=== Database Ready ===\n');
    process.exit(0);

  } catch (error) {
    console.error('✗ Database initialization failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase;
