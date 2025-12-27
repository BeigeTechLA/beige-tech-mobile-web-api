#!/usr/bin/env node
/**
 * Script to assign creators to existing bookings
 * Usage: node scripts/assign-creators-to-booking.js <booking_id> <creator_id1,creator_id2,...>
 *
 * Example: node scripts/assign-creators-to-booking.js 140 1,2,3
 */

require('dotenv').config();
const db = require('../src/models');

async function assignCreatorsToBooking(bookingId, creatorIds) {
  try {
    console.log(`\n🔍 Assigning creators to booking ID ${bookingId}...`);
    console.log(`Creator IDs: ${creatorIds.join(', ')}`);

    // Verify booking exists
    const booking = await db.stream_project_booking.findOne({
      where: {
        stream_project_booking_id: bookingId,
        is_active: 1
      }
    });

    if (!booking) {
      console.error(`❌ Booking ID ${bookingId} not found or inactive`);
      process.exit(1);
    }

    console.log(`✅ Found booking: ${booking.project_name}`);
    console.log(`   Guest Email: ${booking.guest_email || 'N/A'}`);
    console.log(`   Event Date: ${booking.event_date || 'N/A'}`);
    console.log(`   Location: ${booking.event_location || 'N/A'}`);

    // Verify all creators exist
    const creators = await db.crew_members.findAll({
      where: {
        crew_member_id: creatorIds
      }
    });

    if (creators.length !== creatorIds.length) {
      console.error(`❌ Some creator IDs not found. Found ${creators.length} of ${creatorIds.length}`);
      const foundIds = creators.map(c => c.crew_member_id);
      const missingIds = creatorIds.filter(id => !foundIds.includes(id));
      console.error(`   Missing IDs: ${missingIds.join(', ')}`);
      process.exit(1);
    }

    console.log(`\n✅ All creators found:`);
    creators.forEach(creator => {
      console.log(`   - ${creator.first_name} ${creator.last_name} (ID: ${creator.crew_member_id})`);
      console.log(`     Email: ${creator.email}`);
      console.log(`     Rate: $${creator.hourly_rate || 0}/hr`);
    });

    // Check for existing assignments
    const existingAssignments = await db.assigned_crew.findAll({
      where: {
        project_id: bookingId,
        is_active: 1
      },
      include: [
        {
          model: db.crew_members,
          as: 'crew_member',
          attributes: ['crew_member_id', 'first_name', 'last_name']
        }
      ]
    });

    if (existingAssignments.length > 0) {
      console.log(`\n⚠️  Found ${existingAssignments.length} existing assignments:`);
      existingAssignments.forEach(assignment => {
        console.log(`   - ${assignment.crew_member.first_name} ${assignment.crew_member.last_name} (Status: ${assignment.status})`);
      });

      console.log(`\n🗑️  Removing existing assignments...`);
      await db.assigned_crew.destroy({
        where: {
          project_id: bookingId
        }
      });
      console.log(`✅ Removed ${existingAssignments.length} assignments`);
    }

    // Create new assignments
    console.log(`\n➕ Creating new assignments...`);
    const assignments = creatorIds.map(creatorId => ({
      project_id: bookingId,
      crew_member_id: creatorId,
      status: 'selected',
      is_active: 1,
      crew_accept: 0
    }));

    const created = await db.assigned_crew.bulkCreate(assignments);
    console.log(`✅ Created ${created.length} new assignments`);

    // Verify assignments
    const verifyAssignments = await db.assigned_crew.findAll({
      where: {
        project_id: bookingId,
        is_active: 1
      },
      include: [
        {
          model: db.crew_members,
          as: 'crew_member',
          attributes: ['crew_member_id', 'first_name', 'last_name', 'hourly_rate']
        }
      ]
    });

    console.log(`\n✅ Verification - Booking ${bookingId} now has ${verifyAssignments.length} assigned creators:`);
    verifyAssignments.forEach(assignment => {
      console.log(`   - ${assignment.crew_member.first_name} ${assignment.crew_member.last_name}`);
      console.log(`     Assignment ID: ${assignment.id}`);
      console.log(`     Status: ${assignment.status}`);
      console.log(`     Hourly Rate: $${assignment.crew_member.hourly_rate || 0}`);
    });

    console.log(`\n🎉 Successfully assigned creators to booking ${bookingId}\n`);
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error assigning creators:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(`
Usage: node scripts/assign-creators-to-booking.js <booking_id> <creator_id1,creator_id2,...>

Example:
  node scripts/assign-creators-to-booking.js 140 1,2,3

Arguments:
  booking_id    - The stream_project_booking_id
  creator_ids   - Comma-separated list of crew_member_ids
  `);
  process.exit(1);
}

const bookingId = parseInt(args[0]);
const creatorIds = args[1].split(',').map(id => parseInt(id.trim()));

if (isNaN(bookingId) || creatorIds.some(id => isNaN(id))) {
  console.error('❌ Invalid booking ID or creator IDs. Must be numeric.');
  process.exit(1);
}

// Run the assignment
assignCreatorsToBooking(bookingId, creatorIds);
