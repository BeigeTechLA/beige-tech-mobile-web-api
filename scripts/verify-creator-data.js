/**
 * Verification script to check creator data looks realistic
 * Run: node scripts/verify-creator-data.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function verifyCreatorData() {
  let connection;

  try {
    console.log('🔌 Connecting to database...\n');
    connection = await mysql.createConnection({
      host: process.env.DATABASE_HOST,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASS,
      database: process.env.DATABASE_NAME,
      port: process.env.DATABASE_PORT || 3306
    });

    // Check rating distribution
    console.log('📊 Rating Distribution:');
    console.log('═'.repeat(50));
    const [ratings] = await connection.execute(`
      SELECT
        CASE
          WHEN rating >= 4.7 THEN '4.7-5.0 (Top Performers)'
          WHEN rating >= 4.3 THEN '4.3-4.6 (High Performers)'
          WHEN rating >= 3.8 THEN '3.8-4.2 (Good Performers)'
          ELSE '3.5-3.7 (Average Performers)'
        END as tier,
        COUNT(*) as count,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating,
        AVG(rating) as avg_rating
      FROM crew_members
      WHERE is_active = 1
      GROUP BY tier
      ORDER BY min_rating DESC
    `);

    ratings.forEach(r => {
      console.log(`${r.tier.padEnd(35)} ${String(r.count).padStart(3)} creators | Avg: ${parseFloat(r.avg_rating).toFixed(2)}`);
    });

    // Check for zeros
    console.log('\n\n🔍 Checking for Zero Ratings:');
    console.log('═'.repeat(50));
    const [zeros] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM crew_members
      WHERE is_active = 1 AND (rating = 0 OR rating IS NULL)
    `);

    if (zeros[0].count === 0) {
      console.log('✅ No creators with 0 or null ratings!');
    } else {
      console.log(`❌ Found ${zeros[0].count} creators with 0/null ratings`);
    }

    // Check portfolio distribution
    console.log('\n\n📸 Portfolio Distribution:');
    console.log('═'.repeat(50));
    const [portfolios] = await connection.execute(`
      SELECT
        cm.crew_member_id,
        CONCAT(cm.first_name, ' ', cm.last_name) as name,
        cm.rating,
        cm.primary_role,
        COUNT(cmf.crew_files_id) as portfolio_count
      FROM crew_members cm
      LEFT JOIN crew_member_files cmf
        ON cm.crew_member_id = cmf.crew_member_id
        AND cmf.file_type IN ('portfolio', 'work_sample', 'recent_work')
      WHERE cm.is_active = 1
      GROUP BY cm.crew_member_id
      ORDER BY cm.rating DESC
    `);

    portfolios.forEach(p => {
      const roleNames = { 1: 'Videographer', 2: 'Photographer', 3: 'Editor', 4: 'Producer', 5: 'Director' };
      console.log(`${p.name.padEnd(25)} Rating: ${String(p.rating).padStart(3)} | ${String(p.portfolio_count).padStart(2)} portfolio items | ${roleNames[p.primary_role] || 'Unknown'}`);
    });

    // Sample portfolio URLs
    console.log('\n\n🖼️  Sample Portfolio URLs (First 3 Creators):');
    console.log('═'.repeat(50));
    const [sampleUrls] = await connection.execute(`
      SELECT
        CONCAT(cm.first_name, ' ', cm.last_name) as name,
        cmf.file_type,
        cmf.file_path
      FROM crew_members cm
      JOIN crew_member_files cmf ON cm.crew_member_id = cmf.crew_member_id
      WHERE cm.is_active = 1
      AND cmf.file_type IN ('portfolio', 'work_sample', 'recent_work')
      AND cm.crew_member_id <= 3
      ORDER BY cm.crew_member_id, cmf.crew_files_id
      LIMIT 9
    `);

    let currentName = '';
    sampleUrls.forEach(u => {
      if (u.name !== currentName) {
        console.log(`\n${u.name}:`);
        currentName = u.name;
      }
      console.log(`  • ${u.file_type}: ${u.file_path}`);
    });

    // Overall statistics
    console.log('\n\n📈 Overall Statistics:');
    console.log('═'.repeat(50));
    const [stats] = await connection.execute(`
      SELECT
        COUNT(*) as total_creators,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating,
        AVG(rating) as avg_rating
      FROM crew_members
      WHERE is_active = 1
    `);

    const s = stats[0];
    console.log(`Total Active Creators: ${s.total_creators}`);
    console.log(`Rating Range: ${parseFloat(s.min_rating).toFixed(1)} - ${parseFloat(s.max_rating).toFixed(1)}`);
    console.log(`Average Rating: ${parseFloat(s.avg_rating).toFixed(2)}`);

    const [totalPortfolio] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM crew_member_files
      WHERE file_type IN ('portfolio', 'work_sample', 'recent_work')
    `);

    console.log(`Total Portfolio Items: ${totalPortfolio[0].count}`);
    console.log(`Avg Portfolio per Creator: ${Math.round(totalPortfolio[0].count / s.total_creators)}`);

    // Check data variety
    console.log('\n\n🎨 Data Variety Check:');
    console.log('═'.repeat(50));
    const [variety] = await connection.execute(`
      SELECT
        COUNT(DISTINCT rating) as unique_ratings
      FROM crew_members
      WHERE is_active = 1
    `);

    console.log(`Unique Ratings: ${variety[0].unique_ratings} out of ${s.total_creators} creators`);

    if (variety[0].unique_ratings < s.total_creators * 0.7) {
      console.log('⚠️  Warning: Low rating variety - data might look too uniform');
    } else {
      console.log('✅ Good rating variety - data looks natural');
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✨ Verification Complete!');
    console.log('═'.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

verifyCreatorData();
