/**
 * Seed users: admin, sales reps, clients, and creators
 */

const bcrypt = require('bcrypt');
const sequelize = require('../index');
const { users, user_type } = require('../../models');
const faker = require('./utils/faker');

async function seedUsers() {
  try {
    await sequelize.authenticate();
    console.log('Seeding users...');

    // Get user type IDs
    const userTypes = await user_type.findAll();
    const typeMap = {};
    userTypes.forEach(ut => {
      typeMap[ut.user_role] = ut.user_type_id;
    });

    const defaultPassword = await bcrypt.hash('password123', 10);
    const allUsers = [];

    // 1 Admin user
    allUsers.push({
      name: 'Admin User',
      email: 'admin@revure.com',
      phone_number: '555-000-0001',
      instagram_handle: '@revure_admin',
      password_hash: defaultPassword,
      email_verified: 1,
      is_active: 1,
      user_type: typeMap['admin'],
      created_at: faker.generatePastDate(365)
    });

    // 3 Sales reps
    for (let i = 0; i < 3; i++) {
      const firstName = faker.generateFirstName();
      const lastName = faker.generateLastName();
      const fullName = `${firstName} ${lastName}`;

      allUsers.push({
        name: fullName,
        email: faker.generateEmail(firstName, lastName, 'revure.com'),
        phone_number: faker.generatePhoneNumber(),
        instagram_handle: faker.generateInstagramHandle(firstName, lastName),
        password_hash: defaultPassword,
        email_verified: 1,
        is_active: 1,
        user_type: typeMap['sales_rep'],
        created_at: faker.generatePastDate(180)
      });
    }

    // 15 Client users
    for (let i = 0; i < 15; i++) {
      const firstName = faker.generateFirstName();
      const lastName = faker.generateLastName();
      const fullName = `${firstName} ${lastName}`;

      allUsers.push({
        name: fullName,
        email: faker.generateEmail(firstName, lastName),
        phone_number: faker.generatePhoneNumber(),
        instagram_handle: faker.generateInstagramHandle(firstName, lastName),
        password_hash: defaultPassword,
        email_verified: faker.randomInt(0, 1),
        is_active: 1,
        user_type: typeMap['client'],
        created_at: faker.generatePastDate(365)
      });
    }

    // 25 Creator users
    for (let i = 0; i < 25; i++) {
      const firstName = faker.generateFirstName();
      const lastName = faker.generateLastName();
      const fullName = `${firstName} ${lastName}`;

      allUsers.push({
        name: fullName,
        email: faker.generateEmail(firstName, lastName),
        phone_number: faker.generatePhoneNumber(),
        instagram_handle: faker.generateInstagramHandle(firstName, lastName),
        password_hash: defaultPassword,
        email_verified: faker.randomInt(0, 1),
        is_active: 1,
        user_type: typeMap['creator'],
        created_at: faker.generatePastDate(365)
      });
    }

    let created = 0;
    let existing = 0;
    let skipped = 0;

    for (const userData of allUsers) {
      try {
        const [record, isCreated] = await users.findOrCreate({
          where: { email: userData.email },
          defaults: userData
        });

        if (isCreated) {
          created++;
          const typeRole = Object.keys(typeMap).find(key => typeMap[key] === userData.user_type);
          console.log(`  ✓ Created: ${userData.name} (${typeRole}) - ${userData.email}`);
        } else {
          existing++;
        }
      } catch (error) {
        // Handle unique constraint violations (phone, instagram)
        if (error.name === 'SequelizeUniqueConstraintError') {
          skipped++;
          console.log(`  - Skipped: ${userData.email} (duplicate constraint)`);
        } else {
          throw error;
        }
      }
    }

    console.log(`\n✓ Users: ${created} created, ${existing} existing, ${skipped} skipped\n`);

  } catch (error) {
    console.error('✗ Error seeding users:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedUsers()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedUsers;
