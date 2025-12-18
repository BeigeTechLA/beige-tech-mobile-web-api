const sequelize = require('../index');
const { user_type } = require('../../models');

/**
 * Seed user_type table with required roles
 */
async function seedUserTypes() {
  try {
    await sequelize.authenticate();
    console.log('Seeding user types...');

    // Define user types/roles
    const userTypes = [
      { user_role: 'client', is_active: 1 },
      { user_role: 'sales_rep', is_active: 1 },
      { user_role: 'creator', is_active: 1 },
      { user_role: 'admin', is_active: 1 }
    ];

    let created = 0;
    let existing = 0;

    // Check and insert each user type
    for (const type of userTypes) {
      const [userTypeRecord, isCreated] = await user_type.findOrCreate({
        where: { user_role: type.user_role },
        defaults: type
      });

      if (isCreated) {
        created++;
        console.log(`  ✓ Created: ${type.user_role} (ID: ${userTypeRecord.user_type_id})`);
      } else {
        existing++;
        console.log(`  - Exists: ${type.user_role} (ID: ${userTypeRecord.user_type_id})`);
      }
    }

    console.log(`\n✓ User types: ${created} created, ${existing} existing\n`);

  } catch (error) {
    console.error('✗ Error seeding user types:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedUserTypes()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedUserTypes;
