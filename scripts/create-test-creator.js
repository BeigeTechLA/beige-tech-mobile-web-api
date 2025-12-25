const { sequelize, crew_members } = require('../src/models');

async function createTestCreator() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    const testCreator = {
      first_name: 'Test',
      last_name: 'Creator',
      email: 'test.creator@beige.test',
      phone_number: '+1-555-TEST-001',
      location: 'All Locations, USA',
      working_distance: 'Nationwide',
      primary_role: 1, // Videographer
      years_of_experience: 1,
      hourly_rate: 1.00, // $1 per hour
      bio: 'Test creator account for development and testing purposes. Available at all locations nationwide with $1/hour rate.',
      availability: '24/7 - Test Account',
      skills: 'Testing, Development, QA, All Services',
      certifications: 'Test Certified',
      equipment_ownership: 'Full test equipment suite',
      is_beige_member: 1,
      is_available: 1,
      rating: 5.0,
      is_draft: 0,
      is_active: 1,
      social_media_links: JSON.stringify({
        portfolio: 'https://beige.app/test',
        instagram: '@beige_test',
        youtube: 'BeigeTesting'
      })
    };

    // Check if test creator already exists
    const existing = await crew_members.findOne({
      where: { email: testCreator.email }
    });

    if (existing) {
      console.log('⚠️  Test creator already exists');
      console.log('📧 Email:', existing.email);
      console.log('💰 Hourly Rate: $' + existing.hourly_rate);
      console.log('📍 Location:', existing.location);
      console.log('🆔 ID:', existing.crew_member_id);

      // Update to ensure $1 rate and all locations
      await crew_members.update({
        hourly_rate: 1.00,
        location: 'All Locations, USA',
        working_distance: 'Nationwide',
        is_available: 1,
        is_active: 1
      }, {
        where: { email: testCreator.email }
      });

      console.log('\n✅ Updated test creator to $1 rate and all locations');
      return existing;
    }

    // Create new test creator
    const created = await crew_members.create(testCreator);

    console.log('\n✅ Test creator created successfully!');
    console.log('═══════════════════════════════════════');
    console.log('🆔 ID:', created.crew_member_id);
    console.log('👤 Name:', created.first_name, created.last_name);
    console.log('📧 Email:', created.email);
    console.log('💰 Hourly Rate: $' + created.hourly_rate);
    console.log('📍 Location:', created.location);
    console.log('🌎 Working Distance:', created.working_distance);
    console.log('⭐ Rating:', created.rating);
    console.log('✓ Available: Yes');
    console.log('═══════════════════════════════════════');

    return created;

  } catch (error) {
    console.error('❌ Error creating test creator:', error.message);
    throw error;
  } finally {
    await sequelize.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run the script
createTestCreator()
  .then(() => {
    console.log('\n🎉 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
