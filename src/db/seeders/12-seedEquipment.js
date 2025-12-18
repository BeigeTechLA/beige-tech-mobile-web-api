/**
 * Seed equipment with realistic brands and pricing
 */

const sequelize = require('../index');
const { equipment, equipment_category } = require('../../models');
const faker = require('./utils/faker');

async function seedEquipment() {
  try {
    await sequelize.authenticate();
    console.log('Seeding equipment...');

    // Get equipment categories
    const categories = await equipment_category.findAll({ where: { is_active: 1 } });

    if (categories.length === 0) {
      console.log('⚠ Warning: No equipment categories found. Run seedEquipmentCategories first.');
      return;
    }

    // Create category map
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.category_name] = cat.category_id;
    });

    // Equipment data by category
    const equipmentData = {
      Cameras: [
        { manufacturer: 'Sony', models: ['A7S III', 'FX6', 'FX3', 'A7R V'], priceRange: [2500, 8000] },
        { manufacturer: 'Canon', models: ['R5', 'R6 Mark II', 'C70', 'C300 Mark III'], priceRange: [2800, 12000] },
        { manufacturer: 'Blackmagic', models: ['6K Pro', '4K', 'Pocket 6K G2', 'URSA 12K'], priceRange: [1500, 15000] },
        { manufacturer: 'RED', models: ['Komodo', 'V-Raptor', 'Gemini'], priceRange: [6000, 25000] },
        { manufacturer: 'Panasonic', models: ['GH6', 'S5 II', 'S1H'], priceRange: [1800, 4500] }
      ],
      Lenses: [
        { manufacturer: 'Sony', models: ['24-70mm f/2.8 GM', '70-200mm f/2.8 GM', '16-35mm f/2.8 GM'], priceRange: [1200, 2800] },
        { manufacturer: 'Canon', models: ['RF 24-70mm f/2.8', 'RF 70-200mm f/2.8', 'EF 50mm f/1.2'], priceRange: [1000, 3000] },
        { manufacturer: 'Sigma', models: ['18-35mm f/1.8', '24-70mm f/2.8', '70-200mm f/2.8'], priceRange: [800, 1500] }
      ],
      Audio: [
        { manufacturer: 'Sennheiser', models: ['MKH 416', 'G4 Wireless', 'AVX Digital'], priceRange: [300, 1200] },
        { manufacturer: 'Rode', models: ['NTG5', 'Wireless GO II', 'VideoMic Pro+'], priceRange: [200, 600] },
        { manufacturer: 'Shure', models: ['SM7B', 'VP83', 'FP Wireless'], priceRange: [250, 800] },
        { manufacturer: 'Zoom', models: ['F6 Recorder', 'H6 Recorder', 'F8n'], priceRange: [350, 900] }
      ],
      Lighting: [
        { manufacturer: 'Aputure', models: ['600d Pro', '300d II', 'LS C120d II', 'MC RGBWW'], priceRange: [200, 2000] },
        { manufacturer: 'Godox', models: ['SL-60W', 'VL300', 'UL150'], priceRange: [150, 600] },
        { manufacturer: 'Litepanels', models: ['Astra 6X', 'Gemini 2x1'], priceRange: [800, 1800] }
      ],
      Stabilization: [
        { manufacturer: 'DJI', models: ['RS 3 Pro', 'RS 3', 'Ronin 4D'], priceRange: [500, 7000] },
        { manufacturer: 'Zhiyun', models: ['Crane 3S', 'Weebill 3'], priceRange: [400, 800] },
        { manufacturer: 'Manfrotto', models: ['535 Carbon Tripod', '504HD Head'], priceRange: [300, 1200] }
      ],
      Streaming: [
        { manufacturer: 'Blackmagic', models: ['ATEM Mini Pro', 'ATEM Mini Extreme', 'Web Presenter'], priceRange: [300, 900] },
        { manufacturer: 'AJA', models: ['HELO Plus', 'U-TAP HDMI'], priceRange: [500, 2500] },
        { manufacturer: 'Teradek', models: ['VidiU Go', 'Bolt 4K', 'Prism Mobile'], priceRange: [600, 3500] }
      ],
      Monitors: [
        { manufacturer: 'Atomos', models: ['Ninja V', 'Shinobi', 'Shogun 7'], priceRange: [300, 1500] },
        { manufacturer: 'SmallHD', models: ['Focus 7', 'Cine 7', '703 UltraBright'], priceRange: [500, 2000] }
      ],
      Drones: [
        { manufacturer: 'DJI', models: ['Mavic 3 Cine', 'Air 3', 'Mini 4 Pro', 'Inspire 3'], priceRange: [800, 18000] }
      ],
      Storage: [
        { manufacturer: 'SanDisk', models: ['Extreme Pro CFexpress', 'Extreme Pro SD'], priceRange: [100, 400] },
        { manufacturer: 'Samsung', models: ['T7 SSD', 'T9 Portable SSD'], priceRange: [150, 500] },
        { manufacturer: 'G-Technology', models: ['G-DRIVE PRO', 'ArmorATD'], priceRange: [200, 800] }
      ],
      Power: [
        { manufacturer: 'V-Mount', models: ['Anton Bauer Titon', 'Core SWX Hypercore'], priceRange: [200, 400] },
        { manufacturer: 'Gold Mount', models: ['IDX DUO-C190', 'Core SWX Fleet'], priceRange: [250, 450] }
      ]
    };

    const allEquipment = [];
    let totalCount = 0;

    // Generate equipment items
    for (const [categoryName, brands] of Object.entries(equipmentData)) {
      if (!categoryMap[categoryName]) continue;

      const categoryId = categoryMap[categoryName];
      const itemsPerCategory = faker.randomInt(5, 8);

      for (let i = 0; i < itemsPerCategory && totalCount < 70; i++) {
        const brand = faker.randomElement(brands);
        const model = faker.randomElement(brand.models);
        const purchasePrice = faker.randomFloat(brand.priceRange[0], brand.priceRange[1], 2);
        const dailyRate = faker.randomFloat(purchasePrice * 0.05, purchasePrice * 0.15, 2);

        const cityData = faker.generateCity();
        const storageLocation = faker.generateMapboxLocation(cityData);

        const purchaseDate = faker.generatePastDate(1095); // Up to 3 years ago
        const lastMaintenance = faker.generatePastDate(180);
        const nextMaintenance = faker.generateFutureDate(180);

        const item = {
          equipment_name: `${brand.manufacturer} ${model}`,
          category_id: categoryId,
          manufacturer: brand.manufacturer,
          model_number: model,
          serial_number: `SN${faker.randomInt(100000, 999999)}`,
          description: `Professional ${categoryName.toLowerCase().slice(0, -1)} - ${brand.manufacturer} ${model}`,
          storage_location: storageLocation,
          initial_status_id: 1, // Assuming 1 = Available
          purchase_price: purchasePrice,
          daily_rental_rate: dailyRate,
          purchase_date: faker.formatDate(purchaseDate),
          last_maintenance_date: faker.formatDate(lastMaintenance),
          next_maintenance_due: faker.formatDate(nextMaintenance),
          is_draft: 0,
          is_active: 1,
          created_at: purchaseDate
        };

        allEquipment.push(item);
        totalCount++;
      }
    }

    let created = 0;
    let existing = 0;

    for (const equipData of allEquipment) {
      try {
        const [record, isCreated] = await equipment.findOrCreate({
          where: {
            equipment_name: equipData.equipment_name,
            serial_number: equipData.serial_number
          },
          defaults: equipData
        });

        if (isCreated) {
          created++;
          console.log(`  ✓ Created: ${equipData.equipment_name} - $${equipData.daily_rental_rate}/day (Purchase: $${equipData.purchase_price})`);
        } else {
          existing++;
        }
      } catch (error) {
        console.error(`  ✗ Error creating ${equipData.equipment_name}:`, error.message);
      }
    }

    console.log(`\n✓ Equipment: ${created} created, ${existing} existing\n`);

  } catch (error) {
    console.error('✗ Error seeding equipment:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedEquipment()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedEquipment;
