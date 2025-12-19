/**
 * Script to update creator profiles with realistic data
 * - Replaces 0 ratings with realistic values (3.5-5.0)
 * - Adds portfolio images for each creator
 * - Makes data look natural, not dummy
 *
 * Run: node scripts/update-creator-profiles.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

// Portfolio image base URLs (using high-quality stock images)
const PORTFOLIO_IMAGES = {
  videographer: [
    'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800', // Cinema camera
    'https://images.unsplash.com/photo-1579541814924-49fef17c5be5?w=800', // Video production
    'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800', // Filming
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800', // Camera equipment
    'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=800', // Studio setup
    'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800', // Video editing
    'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=800', // Film set
    'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800', // Cinematography
    'https://images.unsplash.com/photo-1613068687893-5e85b4638b84?w=800', // Video shoot
    'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=800', // Camera rig
  ],
  photographer: [
    'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800', // Photography gear
    'https://images.unsplash.com/photo-1554048612-b6a482bc67e5?w=800', // Portrait
    'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800', // Wedding photography
    'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800', // Event photography
    'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800', // Fashion shoot
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800', // Studio portrait
    'https://images.unsplash.com/photo-1604017011826-d3b4c23f8914?w=800', // Product photography
    'https://images.unsplash.com/photo-1606122017369-d782bbb78f32?w=800', // Commercial shoot
    'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=800', // Landscape
    'https://images.unsplash.com/photo-1581836499506-4a660b39478a?w=800', // Camera close-up
  ],
  editor: [
    'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800', // Video editing
    'https://images.unsplash.com/photo-1527192491265-7e15c55b1ed2?w=800', // Color grading
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800', // Post-production
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800', // Editing suite
    'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=800', // Monitor setup
    'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800', // Workspace
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800', // Timeline
    'https://images.unsplash.com/photo-1616469829935-a20c31d98fcc?w=800', // Color wheels
  ],
  producer: [
    'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=800', // Film set
    'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800', // Production
    'https://images.unsplash.com/photo-1579541814924-49fef17c5be5?w=800', // BTS
    'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=800', // Studio
    'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800', // Production team
    'https://images.unsplash.com/photo-1613068687893-5e85b4638b84?w=800', // Directing
  ],
  director: [
    'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=800', // Director chair
    'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800', // Set direction
    'https://images.unsplash.com/photo-1579541814924-49fef17c5be5?w=800', // Behind camera
    'https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=800', // Film set
    'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800', // Cinematography
    'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800', // Directing
    'https://images.unsplash.com/photo-1613068687893-5e85b4638b84?w=800', // Production
    'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=800', // Camera work
  ]
};

// Role ID to name mapping
const ROLE_NAMES = {
  1: 'videographer',
  2: 'photographer',
  3: 'editor',
  4: 'producer',
  5: 'director'
};

// Generate realistic rating based on factors
function generateRating(hourlyRate, yearsExperience) {
  // Base rating influenced by experience and rate
  let baseRating = 3.5;

  // Experience bonus (0-8 years → 0-0.8 boost)
  if (yearsExperience) {
    baseRating += Math.min(yearsExperience * 0.1, 0.8);
  }

  // Hourly rate bonus (higher rates often = better creators)
  if (hourlyRate) {
    if (hourlyRate >= 150) baseRating += 0.5;
    else if (hourlyRate >= 100) baseRating += 0.3;
    else if (hourlyRate >= 75) baseRating += 0.2;
  }

  // Add randomness (-0.3 to +0.5)
  baseRating += (Math.random() * 0.8) - 0.3;

  // Clamp between 3.5 and 5.0
  baseRating = Math.max(3.5, Math.min(5.0, baseRating));

  // Round to 1 decimal place
  return Math.round(baseRating * 10) / 10;
}

// Generate review count based on rating
function generateReviewCount(rating) {
  if (rating >= 4.7) {
    // Top performers: 15-50 reviews
    return Math.floor(Math.random() * 36) + 15;
  } else if (rating >= 4.3) {
    // High performers: 10-30 reviews
    return Math.floor(Math.random() * 21) + 10;
  } else if (rating >= 3.8) {
    // Good performers: 5-20 reviews
    return Math.floor(Math.random() * 16) + 5;
  } else {
    // Average performers: 3-12 reviews
    return Math.floor(Math.random() * 10) + 3;
  }
}

// Generate portfolio count based on rating
function generatePortfolioCount(rating) {
  if (rating >= 4.7) {
    return Math.floor(Math.random() * 5) + 8; // 8-12
  } else if (rating >= 4.3) {
    return Math.floor(Math.random() * 4) + 5; // 5-8
  } else if (rating >= 3.8) {
    return Math.floor(Math.random() * 4) + 3; // 3-6
  } else {
    return Math.floor(Math.random() * 3) + 2; // 2-4
  }
}

// Get random portfolio images for role
function getPortfolioImages(roleId, count) {
  const roleName = ROLE_NAMES[roleId] || 'photographer';
  const images = PORTFOLIO_IMAGES[roleName] || PORTFOLIO_IMAGES.photographer;

  // Shuffle and take count
  const shuffled = [...images].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function updateCreatorProfiles() {
  let connection;

  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DATABASE_HOST,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASS,
      database: process.env.DATABASE_NAME,
      port: process.env.DATABASE_PORT || 3306
    });

    console.log('✅ Connected to database\n');

    // Fetch all creators
    console.log('📊 Fetching all creators...');
    const [creators] = await connection.execute(`
      SELECT
        crew_member_id,
        first_name,
        last_name,
        primary_role,
        hourly_rate,
        years_of_experience,
        rating
      FROM crew_members
      WHERE is_active = 1
    `);

    console.log(`Found ${creators.length} creators\n`);

    // Statistics
    let ratingsUpdated = 0;
    let portfoliosAdded = 0;

    for (const creator of creators) {
      const {
        crew_member_id,
        first_name,
        last_name,
        primary_role,
        hourly_rate,
        years_of_experience,
        rating
      } = creator;

      console.log(`\n👤 Processing: ${first_name} ${last_name} (ID: ${crew_member_id})`);

      // Update rating if it's 0 or null
      if (!rating || rating === 0) {
        const newRating = generateRating(hourly_rate, years_of_experience);

        await connection.execute(`
          UPDATE crew_members
          SET rating = ?
          WHERE crew_member_id = ?
        `, [newRating, crew_member_id]);

        console.log(`   ⭐ Updated rating: ${newRating}`);
        ratingsUpdated++;

        // Use new rating for portfolio count
        creator.rating = newRating;
      } else {
        console.log(`   ✓ Rating already set: ${rating}`);
      }

      // Check existing portfolio count
      const [existingPortfolio] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM crew_member_files
        WHERE crew_member_id = ?
        AND file_type IN ('portfolio', 'work_sample', 'recent_work')
      `, [crew_member_id]);

      const existingCount = existingPortfolio[0].count;

      if (existingCount === 0) {
        // Add portfolio images
        const portfolioCount = generatePortfolioCount(creator.rating || 4.0);
        const images = getPortfolioImages(primary_role, portfolioCount);

        for (let i = 0; i < images.length; i++) {
          await connection.execute(`
            INSERT INTO crew_member_files
            (crew_member_id, file_type, file_path, created_at)
            VALUES (?, ?, ?, NOW())
          `, [
            crew_member_id,
            i === 0 ? 'portfolio' : 'work_sample',
            images[i]
          ]);
        }

        console.log(`   📸 Added ${images.length} portfolio images`);
        portfoliosAdded += images.length;
      } else {
        console.log(`   ✓ Portfolio already has ${existingCount} items`);
      }
    }

    // Final statistics
    console.log('\n' + '='.repeat(50));
    console.log('✨ Update Complete!');
    console.log('='.repeat(50));
    console.log(`✅ Ratings updated: ${ratingsUpdated} creators`);
    console.log(`📸 Portfolio images added: ${portfoliosAdded} images`);
    console.log(`👥 Total creators processed: ${creators.length}`);
    console.log('='.repeat(50) + '\n');

    // Verify no zeros remain
    const [zeroCheck] = await connection.execute(`
      SELECT COUNT(*) as count
      FROM crew_members
      WHERE is_active = 1 AND (rating = 0 OR rating IS NULL)
    `);

    if (zeroCheck[0].count === 0) {
      console.log('✅ Verification: No creators with 0 or null ratings!');
    } else {
      console.log(`⚠️  Warning: ${zeroCheck[0].count} creators still have 0/null ratings`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the script
updateCreatorProfiles();
