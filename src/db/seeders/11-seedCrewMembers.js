/**
 * Seed crew members with skills, portfolios, and locations
 */

const sequelize = require('../index');
const { crew_members, skills_master, crew_roles } = require('../../models');
const faker = require('./utils/faker');

async function seedCrewMembers() {
  try {
    await sequelize.authenticate();
    console.log('Seeding crew members...');

    // Get available skills and roles
    const skills = await skills_master.findAll({ where: { is_active: 1 } });
    const roles = await crew_roles.findAll({ where: { is_active: 1 } });

    if (skills.length === 0 || roles.length === 0) {
      console.log('⚠ Warning: No skills or roles found. Run seedSkills and seedCrewRoles first.');
      return;
    }

    const allCrewMembers = [];

    // Generate 25-30 crew members with geographic distribution
    const targetCount = faker.randomInt(25, 30);

    for (let i = 0; i < targetCount; i++) {
      const firstName = faker.generateFirstName();
      const lastName = faker.generateLastName();

      // Select city based on distribution
      let cityData;
      const random = Math.random();
      if (random < 0.25) {
        // NYC area (25%)
        cityData = faker.randomElement(faker.US_CITIES.slice(0, 5));
      } else if (random < 0.45) {
        // LA area (20%)
        cityData = faker.randomElement(faker.US_CITIES.slice(5, 9));
      } else if (random < 0.60) {
        // Chicago area (15%)
        cityData = faker.randomElement(faker.US_CITIES.slice(9, 12));
      } else if (random < 0.70) {
        // Austin area (10%)
        cityData = faker.randomElement(faker.US_CITIES.slice(12, 14));
      } else {
        // Others (30%)
        cityData = faker.randomElement(faker.US_CITIES.slice(14));
      }

      // Select 3-7 random skills
      const memberSkills = faker.randomElements(skills, faker.randomInt(3, 7));
      const skillIds = memberSkills.map(s => s.skill_id);

      // Select primary role
      const primaryRole = faker.randomElement(roles);

      // Generate portfolio URLs
      const portfolioLinks = {
        vimeo: Math.random() > 0.3 ? `https://vimeo.com/${firstName.toLowerCase()}${lastName.toLowerCase()}` : null,
        youtube: Math.random() > 0.5 ? `https://youtube.com/@${firstName.toLowerCase()}` : null,
        instagram: `https://instagram.com/${firstName.toLowerCase()}.films`,
        website: Math.random() > 0.6 ? `https://${firstName.toLowerCase()}${lastName.toLowerCase()}.com` : null
      };

      const crewMember = {
        first_name: firstName,
        last_name: lastName,
        email: faker.generateEmail(firstName, lastName),
        phone_number: faker.generatePhoneNumber(),
        location: faker.generateMapboxLocation(cityData),
        working_distance: faker.randomElement(['25 miles', '50 miles', '100 miles', 'Nationwide']),
        primary_role: primaryRole.role_id,
        years_of_experience: faker.randomInt(1, 15),
        hourly_rate: faker.randomFloat(50, 200, 2),
        bio: faker.generateBio('creator'),
        availability: JSON.stringify({
          monday: Math.random() > 0.3,
          tuesday: Math.random() > 0.3,
          wednesday: Math.random() > 0.3,
          thursday: Math.random() > 0.3,
          friday: Math.random() > 0.3,
          saturday: Math.random() > 0.5,
          sunday: Math.random() > 0.5
        }),
        skills: JSON.stringify(skillIds),
        certifications: Math.random() > 0.7 ? JSON.stringify(['FAA Part 107', 'CPR Certified']) : null,
        equipment_ownership: JSON.stringify([
          faker.randomElement(['Sony A7S III', 'Canon R5', 'Blackmagic 6K', 'RED Komodo']),
          faker.randomElement(['Wireless Lav Mic', 'Boom Mic', 'Shotgun Mic'])
        ]),
        is_beige_member: faker.randomInt(0, 1),
        is_available: faker.randomInt(0, 1) ? 1 : 0,
        rating: faker.randomFloat(3.5, 5.0, 1),
        is_draft: 0,
        is_active: 1,
        social_media_links: JSON.stringify(portfolioLinks),
        created_at: faker.generatePastDate(365),
        updated_at: faker.generatePastDate(30)
      };

      allCrewMembers.push(crewMember);
    }

    let created = 0;
    let existing = 0;
    let skipped = 0;

    for (const crewData of allCrewMembers) {
      try {
        const [record, isCreated] = await crew_members.findOrCreate({
          where: { email: crewData.email },
          defaults: crewData
        });

        if (isCreated) {
          created++;
          console.log(`  ✓ Created: ${crewData.first_name} ${crewData.last_name} - $${crewData.hourly_rate}/hr (Rating: ${crewData.rating})`);
        } else {
          existing++;
        }
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          skipped++;
          console.log(`  - Skipped: ${crewData.email} (duplicate)`);
        } else {
          throw error;
        }
      }
    }

    console.log(`\n✓ Crew members: ${created} created, ${existing} existing, ${skipped} skipped\n`);

  } catch (error) {
    console.error('✗ Error seeding crew members:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedCrewMembers()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedCrewMembers;
