/**
 * Migration Runner
 * Runs the equipment owner and reviews system migration
 *
 * Usage: node scripts/run-migration.js
 */

const sequelize = require('../src/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Starting migration...');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/add_equipment_owner_and_reviews_system.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Remove comments and split by semicolons
    const cleanedSql = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);

      try {
        await sequelize.query(statement);
        console.log('✅ Success');
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('Duplicate column') ||
            error.message.includes('already exists') ||
            error.message.includes('Duplicate key name')) {
          console.log('⚠️  Already exists, skipping...');
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
