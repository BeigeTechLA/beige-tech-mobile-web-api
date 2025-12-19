/**
 * Quick script to create sample equipment with owners
 */

const { equipment, crew_members } = require('../src/models');

async function createSampleEquipment() {
  try {
    // Get first 3 creators
    const creators = await crew_members.findAll({
      limit: 3,
      attributes: ['crew_member_id', 'first_name', 'last_name']
    });

    if (creators.length === 0) {
      console.log('No creators found');
      process.exit(1);
    }

    console.log(`Found ${creators.length} creators`);

    // Create sample equipment for each creator
    const equipmentItems = [
      { name: 'Sony A7III Camera', desc: 'Full frame mirrorless camera', price: 150, location: 'Los Angeles, CA' },
      { name: 'Canon EOS R5', desc: '45MP full frame camera', price: 200, location: 'New York, NY' },
      { name: 'DJI Mavic 3 Drone', desc: 'Professional drone with 4K camera', price: 100, location: 'San Francisco, CA' },
      { name: 'Rode NTG3 Microphone', desc: 'Professional shotgun microphone', price: 50, location: 'Los Angeles, CA' },
      { name: 'Arri SkyPanel S60', desc: 'LED light panel 60W', price: 75, location: 'New York, NY' }
    ];

    let createdCount = 0;
    for (let i = 0; i < equipmentItems.length; i++) {
      const item = equipmentItems[i];
      const creator = creators[i % creators.length];

      await equipment.create({
        equipment_name: item.name,
        description: item.desc,
        daily_rental_rate: item.price,
        storage_location: item.location,
        category_id: null,
        owner_id: creator.crew_member_id,
        availability_status: 'available',
        is_active: 1
      });

      console.log(`✅ Created "${item.name}" for ${creator.first_name} ${creator.last_name} (ID: ${creator.crew_member_id})`);
      createdCount++;
    }

    console.log(`\n✅ Successfully created ${createdCount} equipment items`);

    // Show summary
    for (const creator of creators) {
      const count = await equipment.count({ where: { owner_id: creator.crew_member_id } });
      console.log(`   ${creator.first_name} ${creator.last_name} (ID: ${creator.crew_member_id}) owns ${count} items`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createSampleEquipment();
