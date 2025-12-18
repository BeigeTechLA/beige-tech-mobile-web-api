/**
 * Master seeder orchestration
 * Coordinates all seeding operations with transaction support
 */

const sequelize = require('../index');

// Import all seeders
const seedUserTypes = require('./01-seedUserTypes');
const seedEquipmentCategories = require('./02-seedEquipmentCategories');
const seedSkills = require('./03-seedSkills');
const seedCrewRoles = require('./04-seedCrewRoles');
const seedUsers = require('./10-seedUsers');
const seedCrewMembers = require('./11-seedCrewMembers');
const seedEquipment = require('./12-seedEquipment');
const seedBookings = require('./20-seedBookings');
const seedWaitlist = require('./25-seedWaitlist');

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  reset: args.includes('--reset'),
  referenceOnly: args.includes('--reference-only'),
  full: args.includes('--full')
};

/**
 * Reset database (drop and recreate all tables)
 */
async function resetDatabase() {
  console.log('\n⚠️  WARNING: Resetting database...');
  console.log('This will DROP all tables and data!\n');

  try {
    await sequelize.sync({ force: true });
    console.log('✓ Database reset complete\n');
  } catch (error) {
    console.error('✗ Database reset failed:', error.message);
    throw error;
  }
}

/**
 * Seed reference data (lookup tables)
 */
async function seedReferenceData() {
  console.log('\n=== Seeding Reference Data ===\n');

  try {
    await seedUserTypes();
    await seedEquipmentCategories();
    await seedSkills();
    await seedCrewRoles();

    console.log('✓ Reference data seeding complete\n');
  } catch (error) {
    console.error('✗ Reference data seeding failed:', error.message);
    throw error;
  }
}

/**
 * Seed core entities (users, crew, equipment)
 */
async function seedCoreEntities() {
  console.log('\n=== Seeding Core Entities ===\n');

  try {
    await seedUsers();
    await seedCrewMembers();
    await seedEquipment();

    console.log('✓ Core entities seeding complete\n');
  } catch (error) {
    console.error('✗ Core entities seeding failed:', error.message);
    throw error;
  }
}

/**
 * Seed transactional data (bookings, waitlist)
 */
async function seedTransactionalData() {
  console.log('\n=== Seeding Transactional Data ===\n');

  try {
    await seedBookings();
    await seedWaitlist();

    console.log('✓ Transactional data seeding complete\n');
  } catch (error) {
    console.error('✗ Transactional data seeding failed:', error.message);
    throw error;
  }
}

/**
 * Get seeding summary
 */
async function getSeedingSummary() {
  try {
    const models = require('../../models');

    const counts = {
      user_types: await models.user_type.count(),
      equipment_categories: await models.equipment_category.count(),
      skills: await models.skills_master.count(),
      crew_roles: await models.crew_roles.count(),
      users: await models.users.count(),
      crew_members: await models.crew_members.count(),
      equipment: await models.equipment.count(),
      bookings: await models.stream_project_booking.count(),
      waitlist: await models.waitlist.count()
    };

    return counts;
  } catch (error) {
    console.error('Warning: Could not generate summary:', error.message);
    return null;
  }
}

/**
 * Main seeding orchestration
 */
async function runSeeder() {
  const startTime = Date.now();

  try {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║   Revure V2 Database Seeding System       ║');
    console.log('╚════════════════════════════════════════════╝\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✓ Database connection established');
    console.log(`  Database: ${sequelize.config.database}`);
    console.log(`  Host: ${sequelize.config.host}\n`);

    // Reset if requested
    if (flags.reset) {
      await resetDatabase();
    }

    // Determine seeding scope
    if (flags.referenceOnly) {
      await seedReferenceData();
    } else if (flags.full) {
      await seedReferenceData();
      await seedCoreEntities();
      await seedTransactionalData();
    } else {
      console.log('No seeding mode specified. Use one of:');
      console.log('  --reference-only  : Seed only reference/lookup tables');
      console.log('  --full            : Seed all data (reference + core + transactional)');
      console.log('  --reset --full    : Reset database and seed all data\n');
      process.exit(0);
    }

    // Display summary
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║         Seeding Summary                   ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const summary = await getSeedingSummary();
    if (summary) {
      console.log('Database Contents:');
      console.log(`  User Types:           ${summary.user_types}`);
      console.log(`  Equipment Categories: ${summary.equipment_categories}`);
      console.log(`  Skills:               ${summary.skills}`);
      console.log(`  Crew Roles:           ${summary.crew_roles}`);
      console.log(`  Users:                ${summary.users}`);
      console.log(`  Crew Members:         ${summary.crew_members}`);
      console.log(`  Equipment:            ${summary.equipment}`);
      console.log(`  Bookings:             ${summary.bookings}`);
      console.log(`  Waitlist:             ${summary.waitlist}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✓ Seeding completed successfully in ${duration}s\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n✗ Seeding failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runSeeder();
}

module.exports = {
  resetDatabase,
  seedReferenceData,
  seedCoreEntities,
  seedTransactionalData,
  runSeeder
};
