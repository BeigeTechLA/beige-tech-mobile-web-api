/**
 * Seed skills master data
 */

const sequelize = require('../index');
const { skills_master } = require('../../models');

async function seedSkills() {
  try {
    await sequelize.authenticate();
    console.log('Seeding skills...');

    const skills = [
      { skill_name: 'Camera Operation', description: 'Professional camera operation and settings', is_active: 1 },
      { skill_name: 'Live Streaming', description: 'Live event streaming and broadcast', is_active: 1 },
      { skill_name: 'Video Editing', description: 'Post-production video editing', is_active: 1 },
      { skill_name: 'Audio Engineering', description: 'Sound recording and mixing', is_active: 1 },
      { skill_name: 'Lighting Design', description: 'Professional lighting setup and design', is_active: 1 },
      { skill_name: 'Color Grading', description: 'Color correction and grading', is_active: 1 },
      { skill_name: 'Motion Graphics', description: 'Animated graphics and visual effects', is_active: 1 },
      { skill_name: 'Directing', description: 'Creative direction and vision', is_active: 1 },
      { skill_name: 'Producing', description: 'Production management and coordination', is_active: 1 },
      { skill_name: 'Drone Operation', description: 'Aerial cinematography and drone piloting', is_active: 1 },
      { skill_name: 'Gimbal Operation', description: 'Stabilized camera movement', is_active: 1 },
      { skill_name: 'Technical Director', description: 'Technical production oversight', is_active: 1 },
      { skill_name: 'Video Switching', description: 'Live video switching and mixing', is_active: 1 },
      { skill_name: 'Graphic Design', description: 'Visual design and branding', is_active: 1 },
      { skill_name: 'Script Writing', description: 'Scriptwriting and content creation', is_active: 1 },
      { skill_name: 'Photography', description: 'Still photography and composition', is_active: 1 },
      { skill_name: 'Social Media', description: 'Social media content and management', is_active: 1 },
      { skill_name: 'Stage Management', description: 'Event and stage coordination', is_active: 1 },
      { skill_name: 'Broadcast Engineering', description: 'Broadcasting systems and technology', is_active: 1 },
      { skill_name: 'Live Event Production', description: 'Multi-camera live event coverage', is_active: 1 },
      { skill_name: 'Cinematography', description: 'Visual storytelling and composition', is_active: 1 },
      { skill_name: 'Sound Design', description: 'Audio effects and soundscapes', is_active: 1 },
      { skill_name: 'Encoding', description: 'Video encoding and compression', is_active: 1 },
      { skill_name: 'Networking', description: 'Network setup and troubleshooting', is_active: 1 },
      { skill_name: 'Data Management', description: 'Media asset management and backup', is_active: 1 },
      { skill_name: 'Virtual Production', description: 'Virtual sets and production techniques', is_active: 1 },
      { skill_name: '3D Animation', description: '3D modeling and animation', is_active: 1 },
      { skill_name: 'VFX', description: 'Visual effects and compositing', is_active: 1 },
      { skill_name: 'Live Graphics', description: 'Real-time graphics and overlays', is_active: 1 },
      { skill_name: 'Teleprompter', description: 'Teleprompter operation and management', is_active: 1 }
    ];

    let created = 0;
    let existing = 0;

    for (const skill of skills) {
      const [record, isCreated] = await skills_master.findOrCreate({
        where: { skill_name: skill.skill_name },
        defaults: skill
      });

      if (isCreated) {
        created++;
        console.log(`  ✓ Created: ${skill.skill_name} (ID: ${record.skill_id})`);
      } else {
        existing++;
        console.log(`  - Exists: ${skill.skill_name} (ID: ${record.skill_id})`);
      }
    }

    console.log(`\n✓ Skills: ${created} created, ${existing} existing\n`);

  } catch (error) {
    console.error('✗ Error seeding skills:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedSkills()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedSkills;
