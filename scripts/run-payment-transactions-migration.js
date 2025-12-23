/**
 * Payment Transactions System Migration Runner
 *
 * Usage: node scripts/run-payment-transactions-migration.js
 */

const sequelize = require('../src/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🚀 Starting Payment Transactions System Migration...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/create_payment_transactions_system.sql');
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

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 60).replace(/\n/g, ' ') + '...';
      console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);

      try {
        await sequelize.query(statement);
        console.log('   ✅ Success');
        successCount++;
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('Duplicate column') ||
            error.message.includes('already exists') ||
            error.message.includes('Duplicate key name') ||
            error.message.includes('Table') && error.message.includes('already exists') ||
            error.message.includes('Duplicate entry')) {
          console.log('   ⚠️  Already exists, skipping...');
          skipCount++;
        } else {
          throw error;
        }
      }
    }

    console.log('\n========================================');
    console.log('✅ Migration completed successfully!');
    console.log(`   - ${successCount} statements executed`);
    console.log(`   - ${skipCount} statements skipped (already exist)`);
    console.log('========================================\n');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();

