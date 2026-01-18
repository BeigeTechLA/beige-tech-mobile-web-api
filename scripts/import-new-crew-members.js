/**
 * Import New Crew Members - Clean and Load Script
 *
 * This script:
 * 1. Backs up existing crew members to a JSON file
 * 2. Deletes all existing crew members
 * 3. Imports 46 new crew members from crew_members_data.json
 * 4. Verifies the import
 *
 * Usage: node scripts/import-new-crew-members.js
 */

const { sequelize, crew_members } = require('../src/models');
const fs = require('fs');
const path = require('path');

// Load the new crew members data
const newCrewData = require('./crew_members_data.json');

async function backupExistingCrewMembers() {
  console.log('\n📦 Backing up existing crew members...');

  try {
    const existingCrew = await crew_members.findAll({
      raw: true
    });

    const backupFile = path.join(__dirname, `crew_members_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(existingCrew, null, 2));

    console.log(`✅ Backed up ${existingCrew.length} crew members to:`);
    console.log(`   ${backupFile}\n`);

    return existingCrew.length;
  } catch (error) {
    console.error('❌ Error backing up crew members:', error.message);
    throw error;
  }
}

async function deleteAllCrewMembers() {
  console.log('🗑️  Deleting all existing crew members...');

  try {
    // Temporarily disable foreign key checks for clean deletion
    await sequelize.query('SET FOREIGN_KEY_CHECKS=0');
    console.log('   ⚙️  Disabled foreign key checks');

    // Delete from all related tables
    const relatedTables = ['assigned_crew', 'crew_member_files', 'portfolio_items', 'reviews'];

    for (const table of relatedTables) {
      try {
        await sequelize.query(`DELETE FROM ${table} WHERE crew_member_id IS NOT NULL`, {
          type: sequelize.QueryTypes.DELETE
        });
        console.log(`   ✅ Cleared ${table} references`);
      } catch (err) {
        console.log(`   ℹ️  No ${table} references to clear (or table does not exist)`);
      }
    }

    // Now delete all crew members
    const result = await crew_members.destroy({
      where: {},
      truncate: false
    });

    // Re-enable foreign key checks
    await sequelize.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('   ⚙️  Re-enabled foreign key checks');

    console.log(`✅ Deleted all crew members\n`);
    return result;
  } catch (error) {
    // Make sure to re-enable foreign key checks even if there's an error
    try {
      await sequelize.query('SET FOREIGN_KEY_CHECKS=1');
    } catch (e) {
      // Ignore
    }
    console.error('❌ Error deleting crew members:', error.message);
    throw error;
  }
}

async function importNewCrewMembers() {
  console.log('📥 Importing 46 new crew members...\n');

  const imported = [];
  const errors = [];

  for (let i = 0; i < newCrewData.length; i++) {
    const member = newCrewData[i];

    try {
      // Map the JSON data to the database schema
      const crewData = {
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        phone_number: member.phone || null,

        // Location fields
        location: member.city && member.state ? `${member.city}, ${member.state}` : null,
        city: member.city,
        state: member.state,

        // Skills and equipment (stored as text/JSON)
        skills: Array.isArray(member.skills) ? member.skills.join(', ') : member.skills || '',
        equipment_ownership: Array.isArray(member.equipment) ? member.equipment.join(', ') : member.equipment || '',

        // Rate and profile
        hourly_rate: member.hourly_rate || 100,
        portfolio_url: member.portfolio_url || null,
        profile_image: member.profile_photo || null,

        // Bio - use provided specialties or generate from skills
        bio: member.specialties || `${member.skills.join(', ')} specialist with professional experience`,

        // Default values for required fields
        primary_role: member.skills.includes('videography') ? 1 : 2, // 1=videographer, 2=photographer
        years_of_experience: 5, // Default
        working_distance: '50 miles', // Default
        availability: 'Flexible',
        is_beige_member: 1,
        is_available: 1,
        is_active: 1,
        is_draft: 0,
        rating: 4.5
      };

      const created = await crew_members.create(crewData);
      imported.push(created);

      console.log(`✅ [${i + 1}/${newCrewData.length}] ${member.first_name} ${member.last_name} - ${member.email}`);

    } catch (error) {
      errors.push({
        member: `${member.first_name} ${member.last_name}`,
        error: error.message
      });

      console.error(`❌ [${i + 1}/${newCrewData.length}] Failed: ${member.first_name} ${member.last_name}`);
      console.error(`   Error: ${error.message}`);
    }
  }

  return { imported, errors };
}

async function verifyImport() {
  console.log('\n\n🔍 Verifying import...\n');

  try {
    const totalCount = await crew_members.count();

    // Get skill distribution
    const allCrew = await crew_members.findAll({
      attributes: ['skills'],
      raw: true
    });

    const skillCounts = {};
    allCrew.forEach(crew => {
      if (crew.skills) {
        const skills = crew.skills.toLowerCase();
        if (skills.includes('videography')) skillCounts.videography = (skillCounts.videography || 0) + 1;
        if (skills.includes('photography')) skillCounts.photography = (skillCounts.photography || 0) + 1;
        if (skills.includes('drone')) skillCounts.drone = (skillCounts.drone || 0) + 1;
      }
    });

    // Get location distribution
    const locationCounts = await sequelize.query(
      `SELECT location, COUNT(*) as count FROM crew_members WHERE location IS NOT NULL GROUP BY location ORDER BY count DESC LIMIT 10`,
      { type: sequelize.QueryTypes.SELECT }
    );

    // Get rate stats
    const rateStats = await crew_members.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('hourly_rate')), 'avg_rate'],
        [sequelize.fn('MIN', sequelize.col('hourly_rate')), 'min_rate'],
        [sequelize.fn('MAX', sequelize.col('hourly_rate')), 'max_rate']
      ],
      raw: true
    });

    console.log('📊 Import Statistics:');
    console.log(`   Total crew members: ${totalCount}`);
    console.log(`\n   Skills:`);
    console.log(`     Videography: ${skillCounts.videography || 0}`);
    console.log(`     Photography: ${skillCounts.photography || 0}`);
    console.log(`     Drone: ${skillCounts.drone || 0}`);
    console.log(`\n   Top Locations:`);
    locationCounts.forEach(loc => {
      console.log(`     ${loc.location}: ${loc.count}`);
    });
    console.log(`\n   Hourly Rates:`);
    console.log(`     Average: $${parseFloat(rateStats.avg_rate).toFixed(2)}/hr`);
    console.log(`     Range: $${rateStats.min_rate}/hr - $${rateStats.max_rate}/hr`);

    return totalCount;
  } catch (error) {
    console.error('❌ Error verifying import:', error.message);
    throw error;
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  Crew Members Import Script');
  console.log('='.repeat(70));

  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Step 1: Backup existing data
    const existingCount = await backupExistingCrewMembers();

    // Step 2: Delete all existing crew members
    await deleteAllCrewMembers();

    // Step 3: Import new crew members
    const { imported, errors } = await importNewCrewMembers();

    console.log('\n' + '='.repeat(70));
    console.log(`✅ Import Complete!`);
    console.log(`   Imported: ${imported.length} crew members`);
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
      console.log('\n   Failed imports:');
      errors.forEach(err => {
        console.log(`     - ${err.member}: ${err.error}`);
      });
    }
    console.log('='.repeat(70));

    // Step 4: Verify import
    const finalCount = await verifyImport();

    console.log('\n' + '='.repeat(70));
    console.log('✅ All Done!');
    console.log(`   Previous count: ${existingCount}`);
    console.log(`   New count: ${finalCount}`);
    console.log(`   Change: ${finalCount >= existingCount ? '+' : ''}${finalCount - existingCount}`);
    console.log('='.repeat(70) + '\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };
