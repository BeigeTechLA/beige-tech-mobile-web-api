const sequelize = require('./index');
const { user_type } = require('../models');

/**
 * Seed user_type table with required roles
 */
async function seedUserTypes() {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');

    // Define user types/roles
    const userTypes = [
      { user_role: 'client', is_active: 1 },
      { user_role: 'sales_rep', is_active: 1 },
      { user_role: 'creator', is_active: 1 },
      { user_role: 'admin', is_active: 1 }
    ];

    // Check and insert each user type
    for (const type of userTypes) {
      const [userTypeRecord, created] = await user_type.findOrCreate({
        where: { user_role: type.user_role },
        defaults: type
      });

      if (created) {
        console.log(`Created user type: ${type.user_role} (ID: ${userTypeRecord.user_type_id})`);
      } else {
        console.log(`User type already exists: ${type.user_role} (ID: ${userTypeRecord.user_type_id})`);
      }
    }

    console.log('\nUser types seeded successfully!');
    process.exit(0);

  } catch (error) {
    console.error('Error seeding user types:', error);
    process.exit(1);
  }
}

seedUserTypes();
