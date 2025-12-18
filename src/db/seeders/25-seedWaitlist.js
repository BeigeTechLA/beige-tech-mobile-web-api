/**
 * Seed waitlist entries
 */

const sequelize = require('../index');
const { waitlist } = require('../../models');
const faker = require('./utils/faker');

async function seedWaitlist() {
  try {
    await sequelize.authenticate();
    console.log('Seeding waitlist...');

    const allWaitlistEntries = [];

    // Generate 20-30 waitlist entries
    const targetCount = faker.randomInt(20, 30);

    for (let i = 0; i < targetCount; i++) {
      const firstName = faker.generateFirstName();
      const lastName = faker.generateLastName();
      const fullName = `${firstName} ${lastName}`;
      const cityData = faker.generateCity();

      // Status distribution
      let status;
      const statusRandom = Math.random();
      if (statusRandom < 0.5) {
        status = 'pending';
      } else if (statusRandom < 0.7) {
        status = 'contacted';
      } else if (statusRandom < 0.85) {
        status = 'converted';
      } else {
        status = 'inactive';
      }

      const entry = {
        name: fullName,
        email: faker.generateEmail(firstName, lastName),
        phone: Math.random() > 0.3 ? faker.generatePhoneNumber() : null,
        company: Math.random() > 0.4 ? faker.generateCompanyName() : null,
        city: `${cityData.city}, ${cityData.state}`,
        status: status,
        created_at: faker.generatePastDate(180)
      };

      allWaitlistEntries.push(entry);
    }

    let created = 0;
    let existing = 0;
    let skipped = 0;

    for (const entryData of allWaitlistEntries) {
      try {
        const [record, isCreated] = await waitlist.findOrCreate({
          where: { email: entryData.email },
          defaults: entryData
        });

        if (isCreated) {
          created++;
          console.log(`  ✓ Created: ${entryData.name} - ${entryData.city} (${entryData.status})`);
        } else {
          existing++;
        }
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          skipped++;
        } else {
          console.error(`  ✗ Error creating waitlist entry:`, error.message);
        }
      }
    }

    console.log(`\n✓ Waitlist: ${created} created, ${existing} existing, ${skipped} skipped\n`);

  } catch (error) {
    console.error('✗ Error seeding waitlist:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedWaitlist()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedWaitlist;
