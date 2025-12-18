require('dotenv').config();
const models = require('../models');
const sequelize = models.sequelize;

async function syncModels() {
  try {
    console.log('🔄 Syncing all models to RDS database...\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✓ Database connection successful');
    console.log(`  Host: ${sequelize.config.host}`);
    console.log(`  Database: ${sequelize.config.database}\n`);

    // Sync all models (creates tables if they don't exist)
    console.log('Creating tables...');
    await sequelize.sync({ force: false, alter: true });
    console.log('✓ All tables synchronized successfully\n');

    // List all models that were synced
    const modelNames = Object.keys(models).filter(key =>
      key !== 'sequelize' && key !== 'Sequelize'
    );
    console.log(`📋 ${modelNames.length} models synced:`);
    modelNames.forEach((name, index) => {
      console.log(`   ${index + 1}. ${name}`);
    });

    await sequelize.close();
    console.log('\n✅ Database schema is ready!');
    console.log('You can now run: npm run db:seed:full\n');

  } catch (error) {
    console.error('❌ Error syncing models:', error.message);
    console.error(error);
    process.exit(1);
  }
}

syncModels();
