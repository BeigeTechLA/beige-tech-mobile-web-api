/**
 * Seed crew roles master data
 */

const sequelize = require('../index');
const { crew_roles } = require('../../models');

async function seedCrewRoles() {
  try {
    await sequelize.authenticate();
    console.log('Seeding crew roles...');

    const roles = [
      { role_name: 'Camera Operator', description: 'Operates cameras during production', is_active: 1 },
      { role_name: 'Director', description: 'Oversees creative vision and direction', is_active: 1 },
      { role_name: 'Technical Director', description: 'Manages technical aspects of production', is_active: 1 },
      { role_name: 'Audio Engineer', description: 'Handles sound recording and mixing', is_active: 1 },
      { role_name: 'Lighting Technician', description: 'Sets up and operates lighting equipment', is_active: 1 },
      { role_name: 'Video Editor', description: 'Edits and post-processes video content', is_active: 1 },
      { role_name: 'Producer', description: 'Manages production logistics and coordination', is_active: 1 },
      { role_name: 'Streaming Specialist', description: 'Manages live streaming technology and platforms', is_active: 1 },
      { role_name: 'Drone Pilot', description: 'Operates drones for aerial footage', is_active: 1 },
      { role_name: 'Gaffer', description: 'Chief lighting technician', is_active: 1 }
    ];

    let created = 0;
    let existing = 0;

    for (const role of roles) {
      const [record, isCreated] = await crew_roles.findOrCreate({
        where: { role_name: role.role_name },
        defaults: role
      });

      if (isCreated) {
        created++;
        console.log(`  ✓ Created: ${role.role_name} (ID: ${record.role_id})`);
      } else {
        existing++;
        console.log(`  - Exists: ${role.role_name} (ID: ${record.role_id})`);
      }
    }

    console.log(`\n✓ Crew roles: ${created} created, ${existing} existing\n`);

  } catch (error) {
    console.error('✗ Error seeding crew roles:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedCrewRoles()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedCrewRoles;
