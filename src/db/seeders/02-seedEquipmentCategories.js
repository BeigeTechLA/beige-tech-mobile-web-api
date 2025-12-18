/**
 * Seed equipment categories
 */

const sequelize = require('../index');
const { equipment_category } = require('../../models');

async function seedEquipmentCategories() {
  try {
    await sequelize.authenticate();
    console.log('Seeding equipment categories...');

    const categories = [
      { category_name: 'Cameras', description: 'Professional cameras and cinema cameras', is_active: 1 },
      { category_name: 'Lenses', description: 'Camera lenses and optical equipment', is_active: 1 },
      { category_name: 'Audio', description: 'Microphones, mixers, and audio recording equipment', is_active: 1 },
      { category_name: 'Lighting', description: 'LED panels, softboxes, and lighting equipment', is_active: 1 },
      { category_name: 'Stabilization', description: 'Gimbals, tripods, and stabilization gear', is_active: 1 },
      { category_name: 'Streaming', description: 'Encoders, switchers, and streaming hardware', is_active: 1 },
      { category_name: 'Monitors', description: 'Field monitors and display equipment', is_active: 1 },
      { category_name: 'Power', description: 'Batteries, chargers, and power solutions', is_active: 1 },
      { category_name: 'Storage', description: 'Memory cards, hard drives, and storage devices', is_active: 1 },
      { category_name: 'Accessories', description: 'Cables, adapters, and miscellaneous gear', is_active: 1 },
      { category_name: 'Drones', description: 'Aerial camera systems and drones', is_active: 1 },
      { category_name: 'Networking', description: 'Routers, switches, and networking equipment', is_active: 1 }
    ];

    let created = 0;
    let existing = 0;

    for (const category of categories) {
      const [record, isCreated] = await equipment_category.findOrCreate({
        where: { category_name: category.category_name },
        defaults: category
      });

      if (isCreated) {
        created++;
        console.log(`  ✓ Created: ${category.category_name} (ID: ${record.category_id})`);
      } else {
        existing++;
        console.log(`  - Exists: ${category.category_name} (ID: ${record.category_id})`);
      }
    }

    console.log(`\n✓ Equipment categories: ${created} created, ${existing} existing\n`);

  } catch (error) {
    console.error('✗ Error seeding equipment categories:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedEquipmentCategories()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedEquipmentCategories;
