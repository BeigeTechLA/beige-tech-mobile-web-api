/**
 * Seed stream project bookings
 */

const sequelize = require('../index');
const { stream_project_booking, users, user_type } = require('../../models');
const faker = require('./utils/faker');

async function seedBookings() {
  try {
    await sequelize.authenticate();
    console.log('Seeding bookings...');

    // Get client users
    const clientType = await user_type.findOne({ where: { user_role: 'client' } });
    if (!clientType) {
      console.log('⚠ Warning: No client user type found. Run seedUserTypes first.');
      return;
    }

    const clients = await users.findAll({ where: { user_type: clientType.user_type_id } });
    if (clients.length === 0) {
      console.log('⚠ Warning: No client users found. Run seedUsers first.');
      return;
    }

    const eventTypes = [
      'Corporate Event', 'Conference', 'Product Launch', 'Webinar',
      'Concert', 'Sports Event', 'Wedding', 'Trade Show', 'Panel Discussion',
      'Workshop', 'Gaming Tournament', 'Charity Event'
    ];

    const streamingPlatforms = [
      ['YouTube', 'Facebook'],
      ['Twitch'],
      ['YouTube', 'Facebook', 'LinkedIn'],
      ['Vimeo'],
      ['Custom RTMP'],
      ['YouTube', 'Twitch'],
      ['LinkedIn'],
      ['Facebook']
    ];

    const crewRolesList = [
      ['Camera Operator', 'Audio Engineer', 'Technical Director'],
      ['Camera Operator', 'Streaming Specialist'],
      ['Camera Operator', 'Audio Engineer', 'Lighting Technician', 'Technical Director'],
      ['Director', 'Camera Operator', 'Producer'],
      ['Camera Operator', 'Technical Director', 'Streaming Specialist']
    ];

    const skillsList = [
      ['Camera Operation', 'Live Streaming', 'Audio Engineering'],
      ['Video Switching', 'Camera Operation'],
      ['Live Streaming', 'Encoding', 'Networking'],
      ['Camera Operation', 'Lighting Design', 'Audio Engineering']
    ];

    const equipmentNeeded = [
      ['Cameras', 'Audio', 'Streaming'],
      ['Cameras', 'Audio', 'Lighting', 'Streaming'],
      ['Cameras', 'Streaming'],
      ['Cameras', 'Audio', 'Lighting', 'Monitors', 'Streaming']
    ];

    const allBookings = [];

    // Generate 10-15 bookings with varied status
    const targetCount = faker.randomInt(10, 15);

    for (let i = 0; i < targetCount; i++) {
      const client = faker.randomElement(clients);
      const cityData = faker.generateCity();
      const eventLocation = `${cityData.city}, ${cityData.state}`;

      // Mix of past, current, and future bookings
      let eventDate, isDraft, isCompleted, isCancelled;
      const statusRandom = Math.random();

      if (statusRandom < 0.3) {
        // Past completed bookings (30%)
        eventDate = faker.generatePastDate(90);
        isDraft = 0;
        isCompleted = 1;
        isCancelled = 0;
      } else if (statusRandom < 0.4) {
        // Past cancelled (10%)
        eventDate = faker.generatePastDate(60);
        isDraft = 0;
        isCompleted = 0;
        isCancelled = 1;
      } else if (statusRandom < 0.5) {
        // Draft bookings (10%)
        eventDate = faker.generateFutureDate(60);
        isDraft = 1;
        isCompleted = 0;
        isCancelled = 0;
      } else {
        // Active upcoming bookings (50%)
        eventDate = faker.generateFutureDate(90);
        isDraft = 0;
        isCompleted = 0;
        isCancelled = 0;
      }

      const durationHours = faker.randomElement([2, 3, 4, 6, 8]);
      const budget = faker.randomFloat(2000, 15000, 2);
      const crewSize = faker.randomInt(2, 6);

      const booking = {
        project_name: `${faker.randomElement(eventTypes)} - ${cityData.city}`,
        description: `Professional live streaming coverage for ${faker.randomElement(eventTypes).toLowerCase()} in ${eventLocation}.`,
        event_type: faker.randomElement(eventTypes),
        event_date: faker.formatDate(eventDate),
        duration_hours: durationHours,
        start_time: `${faker.randomInt(9, 18)}:00:00`,
        end_time: `${Math.min(faker.randomInt(9, 18) + durationHours, 23)}:00:00`,
        budget: budget,
        expected_viewers: faker.randomInt(100, 10000),
        stream_quality: faker.randomElement(['1080p', '4K', '1080p60']),
        crew_size_needed: crewSize,
        event_location: eventLocation,
        streaming_platforms: JSON.stringify(faker.randomElement(streamingPlatforms)),
        crew_roles: JSON.stringify(faker.randomElement(crewRolesList)),
        skills_needed: JSON.stringify(faker.randomElement(skillsList)),
        equipments_needed: JSON.stringify(faker.randomElement(equipmentNeeded)),
        is_draft: isDraft,
        is_completed: isCompleted,
        is_cancelled: isCancelled,
        is_active: 1,
        created_at: faker.generatePastDate(120)
      };

      allBookings.push(booking);
    }

    let created = 0;
    let existing = 0;

    for (const bookingData of allBookings) {
      try {
        const [record, isCreated] = await stream_project_booking.findOrCreate({
          where: {
            project_name: bookingData.project_name,
            event_date: bookingData.event_date
          },
          defaults: bookingData
        });

        if (isCreated) {
          created++;
          const status = bookingData.is_completed ? 'Completed' :
                        bookingData.is_cancelled ? 'Cancelled' :
                        bookingData.is_draft ? 'Draft' : 'Active';
          console.log(`  ✓ Created: ${bookingData.project_name} - ${bookingData.event_date} (${status})`);
        } else {
          existing++;
        }
      } catch (error) {
        console.error(`  ✗ Error creating booking:`, error.message);
      }
    }

    console.log(`\n✓ Bookings: ${created} created, ${existing} existing\n`);

  } catch (error) {
    console.error('✗ Error seeding bookings:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  seedBookings()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = seedBookings;
