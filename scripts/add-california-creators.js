const { sequelize, crew_members } = require('../src/models');

const californiaCreators = [
  // San Diego Creators
  {
    first_name: 'Jordan',
    last_name: 'Blake',
    email: 'jordan.blake@example.com',
    phone_number: '+1-619-555-1201',
    location: 'San Diego, CA',
    working_distance: '40 miles',
    primary_role: 1, // Videographer
    years_of_experience: 7,
    hourly_rate: 145.00,
    bio: 'Surf and outdoor videographer capturing the essence of San Diego lifestyle. Worked with brands like Billabong and Quicksilver.',
    availability: 'Flexible',
    skills: 'Action Sports, Lifestyle Video, Drone, Color Grading',
    certifications: 'FAA Part 107, Premiere Pro Certified',
    equipment_ownership: 'Sony FX3, DJI Mavic 3 Pro, Full audio kit',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Mia',
    last_name: 'Santos',
    email: 'mia.santos@example.com',
    phone_number: '+1-619-555-1202',
    location: 'San Diego, CA',
    working_distance: '35 miles',
    primary_role: 2, // Photographer
    years_of_experience: 5,
    hourly_rate: 120.00,
    bio: 'Beach and lifestyle photographer with a passion for golden hour portraits and brand photography.',
    availability: 'Weekends preferred',
    skills: 'Beach Photography, Portraits, Brand Content, Lifestyle',
    certifications: 'PPA Certified',
    equipment_ownership: 'Canon R6, Prime lenses, Reflector kit',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.7,
    is_draft: 0,
    is_active: 1
  },

  // Orange County Creators  
  {
    first_name: 'Ethan',
    last_name: 'Morris',
    email: 'ethan.morris@example.com',
    phone_number: '+1-949-555-1301',
    location: 'Irvine, CA',
    working_distance: '30 miles',
    primary_role: 1,
    years_of_experience: 9,
    hourly_rate: 165.00,
    bio: 'Commercial videographer specializing in real estate and luxury brand content. Featured work for top OC agencies.',
    availability: 'Weekdays',
    skills: 'Real Estate Video, Commercial, Drone, Motion Graphics',
    certifications: 'FAA Part 107, RED Certified Operator',
    equipment_ownership: 'RED Komodo, Complete gimbal setup, Drone fleet',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.9,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Sophia',
    last_name: 'Lee',
    email: 'sophia.lee@example.com',
    phone_number: '+1-714-555-1302',
    location: 'Anaheim, CA',
    working_distance: '40 miles',
    primary_role: 2,
    years_of_experience: 6,
    hourly_rate: 130.00,
    bio: 'Event and portrait photographer covering weddings, corporate events, and family sessions throughout Southern California.',
    availability: 'Flexible',
    skills: 'Event Photography, Weddings, Portraits, Corporate',
    certifications: 'WPPI Award Winner',
    equipment_ownership: 'Sony A7IV, Flash system, Backdrop kit',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.6,
    is_draft: 0,
    is_active: 1
  },

  // Hollywood/LA Area Additional
  {
    first_name: 'Nathan',
    last_name: 'Cooper',
    email: 'nathan.cooper@example.com',
    phone_number: '+1-323-555-1401',
    location: 'Hollywood, CA',
    working_distance: '25 miles',
    primary_role: 1,
    years_of_experience: 12,
    hourly_rate: 200.00,
    bio: 'Award-winning music video director with credits on MTV and BET. Worked with Grammy-nominated artists.',
    availability: 'Project-based',
    skills: 'Music Videos, Creative Direction, Narrative, Performance',
    certifications: 'IATSE Local 600 Member',
    equipment_ownership: 'ARRI Alexa Mini, Anamorphic lenses, Full grip equipment',
    is_beige_member: 1,
    is_available: 1,
    rating: 5.0,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Chloe',
    last_name: 'Martinez',
    email: 'chloe.martinez@example.com',
    phone_number: '+1-818-555-1402',
    location: 'Burbank, CA',
    working_distance: '30 miles',
    primary_role: 2,
    years_of_experience: 8,
    hourly_rate: 140.00,
    bio: 'Studio and headshot photographer working with actors and models in the entertainment industry.',
    availability: 'Weekdays and weekends',
    skills: 'Headshots, Fashion, Studio, Editorial',
    certifications: 'LA Photo Festival Winner',
    equipment_ownership: 'Phase One, Profoto lighting, Full studio',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },

  // Sacramento Area
  {
    first_name: 'Ryan',
    last_name: 'Hughes',
    email: 'ryan.hughes@example.com',
    phone_number: '+1-916-555-1501',
    location: 'Sacramento, CA',
    working_distance: '50 miles',
    primary_role: 1,
    years_of_experience: 5,
    hourly_rate: 110.00,
    bio: 'Political and corporate videographer covering events, campaigns, and interviews in the capital region.',
    availability: 'Flexible',
    skills: 'Corporate Video, Political Content, Interviews, Live Streaming',
    certifications: 'Adobe Certified',
    equipment_ownership: 'Sony FX6, Teleprompter, Complete audio kit',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.5,
    is_draft: 0,
    is_active: 1
  },

  // Bay Area Additional
  {
    first_name: 'Emma',
    last_name: 'Wilson',
    email: 'emma.wilson@example.com',
    phone_number: '+1-510-555-1601',
    location: 'Oakland, CA',
    working_distance: '30 miles',
    primary_role: 2,
    years_of_experience: 7,
    hourly_rate: 145.00,
    bio: 'Documentary and street photographer capturing urban life and social movements in the Bay Area.',
    availability: 'Flexible',
    skills: 'Documentary, Street Photography, Editorial, Portraits',
    certifications: 'Pulitzer Center Grantee',
    equipment_ownership: 'Leica Q3, Fuji X-T5, Compact lighting',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.9,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Daniel',
    last_name: 'Kim',
    email: 'daniel.kim@example.com',
    phone_number: '+1-408-555-1602',
    location: 'San Jose, CA',
    working_distance: '40 miles',
    primary_role: 1,
    years_of_experience: 8,
    hourly_rate: 160.00,
    bio: 'Tech startup videographer creating product demos, explainer videos, and company culture content for Silicon Valley companies.',
    availability: 'Weekdays',
    skills: 'Product Videos, Tech Content, Corporate, Animation',
    certifications: 'Apple Certified Pro',
    equipment_ownership: 'Canon C70, Motion control rig, Green screen setup',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.7,
    is_draft: 0,
    is_active: 1
  },

  // Calabasas/LA Nearby
  {
    first_name: 'Olivia',
    last_name: 'Wright',
    email: 'olivia.wright@example.com',
    phone_number: '+1-818-555-1701',
    location: 'Calabasas, CA',
    working_distance: '35 miles',
    primary_role: 2,
    years_of_experience: 6,
    hourly_rate: 150.00,
    bio: 'Luxury lifestyle photographer specializing in high-end real estate, celebrity portraits, and fashion content.',
    availability: 'By appointment',
    skills: 'Luxury Lifestyle, Real Estate, Portraits, Fashion',
    certifications: 'Architectural Photography Award',
    equipment_ownership: 'Hasselblad X2D, Tilt-shift lenses, Complete lighting',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Lucas',
    last_name: 'Adams',
    email: 'lucas.adams@example.com',
    phone_number: '+1-805-555-1702',
    location: 'Thousand Oaks, CA',
    working_distance: '45 miles',
    primary_role: 1,
    years_of_experience: 10,
    hourly_rate: 175.00,
    bio: 'Commercial and documentary cinematographer with extensive experience in both studio and field productions.',
    availability: 'Project-based',
    skills: 'Commercial, Documentary, Cinematography, Color Science',
    certifications: 'ASC Associate, DaVinci Resolve Master',
    equipment_ownership: 'RED V-Raptor, Full cinema rig, Lighting package',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.9,
    is_draft: 0,
    is_active: 1
  },

  // Pasadena/East LA
  {
    first_name: 'Isabella',
    last_name: 'Brown',
    email: 'isabella.brown@example.com',
    phone_number: '+1-626-555-1801',
    location: 'Pasadena, CA',
    working_distance: '25 miles',
    primary_role: 2,
    years_of_experience: 4,
    hourly_rate: 100.00,
    bio: 'Emerging photographer specializing in product and lifestyle photography for small businesses and startups.',
    availability: 'Flexible',
    skills: 'Product Photography, Lifestyle, E-commerce, Social Media',
    certifications: 'Photography Degree - Art Center',
    equipment_ownership: 'Sony A7C, Prime lenses, Compact studio kit',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.4,
    is_draft: 0,
    is_active: 1
  },

  // Cinematographers (role 3)
  {
    first_name: 'James',
    last_name: 'Harrison',
    email: 'james.harrison@example.com',
    phone_number: '+1-310-555-1901',
    location: 'Venice Beach, CA',
    working_distance: '30 miles',
    primary_role: 3, // Cinematographer
    years_of_experience: 15,
    hourly_rate: 250.00,
    bio: 'Award-winning cinematographer with feature film and commercial credits. Known for distinctive visual storytelling.',
    availability: 'Project-based',
    skills: 'Cinematography, Lighting, Camera Operation, Visual Storytelling',
    certifications: 'ASC Full Member, Oscar Nominee',
    equipment_ownership: 'ARRI Alexa 35, Full cinema glass, Complete grip package',
    is_beige_member: 1,
    is_available: 1,
    rating: 5.0,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Ava',
    last_name: 'Mitchell',
    email: 'ava.mitchell@example.com',
    phone_number: '+1-323-555-1902',
    location: 'Silver Lake, CA',
    working_distance: '20 miles',
    primary_role: 3,
    years_of_experience: 8,
    hourly_rate: 180.00,
    bio: 'Independent film cinematographer with Sundance and SXSW credits. Specializing in naturalistic lighting.',
    availability: 'Project-based',
    skills: 'Independent Film, Documentary, Natural Lighting, Handheld',
    certifications: 'Sundance Fellow',
    equipment_ownership: 'Sony Venice 2, Vintage lenses, Portable lighting',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.9,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'William',
    last_name: 'Garcia',
    email: 'william.garcia@example.com',
    phone_number: '+1-213-555-1903',
    location: 'Downtown LA, CA',
    working_distance: '25 miles',
    primary_role: 3,
    years_of_experience: 11,
    hourly_rate: 195.00,
    bio: 'Music video and commercial cinematographer with major label credits and national ad campaigns.',
    availability: 'Flexible',
    skills: 'Music Videos, Commercials, Creative Cinematography, Color',
    certifications: 'Multiple MTV VMA Nominations',
    equipment_ownership: 'RED V-Raptor XL, Anamorphic collection, LED volumes',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  }
];

async function addCaliforniaCreators() {
  try {
    console.log('🌴 Adding California creators to database...\n');

    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Count existing creators
    const beforeCount = await crew_members.count();
    console.log(`📊 Current creator count: ${beforeCount}\n`);

    // Insert creators
    let addedCount = 0;
    let skippedCount = 0;

    for (const creator of californiaCreators) {
      try {
        // Check if creator already exists
        const existing = await crew_members.findOne({ 
          where: { email: creator.email } 
        });
        
        if (existing) {
          console.log(`⏭️  Skipped (exists): ${creator.first_name} ${creator.last_name}`);
          skippedCount++;
        } else {
          await crew_members.create(creator);
          console.log(`✅ Added: ${creator.first_name} ${creator.last_name} (${creator.location})`);
          addedCount++;
        }
      } catch (err) {
        console.log(`❌ Error adding ${creator.first_name} ${creator.last_name}:`, err.message);
      }
    }

    // Count after
    const afterCount = await crew_members.count();
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Summary:');
    console.log(`   Creators before: ${beforeCount}`);
    console.log(`   Creators added: ${addedCount}`);
    console.log(`   Skipped (existing): ${skippedCount}`);
    console.log(`   Creators after: ${afterCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // List California creators
    const caCreators = await crew_members.findAll({
      where: sequelize.literal("location LIKE '%CA%' OR location LIKE '%California%'"),
      attributes: ['first_name', 'last_name', 'location', 'primary_role'],
      raw: true
    });

    console.log(`\n🌴 All California creators (${caCreators.length} total):`);
    caCreators.forEach(c => {
      const role = c.primary_role === 1 ? 'Videographer' : c.primary_role === 2 ? 'Photographer' : 'Cinematographer';
      console.log(`   - ${c.first_name} ${c.last_name} (${role}) - ${c.location}`);
    });

    console.log('\n🎉 Done!');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run
addCaliforniaCreators()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

