const { sequelize, crew_members } = require('../src/models');

const mockCreators = [
  // Los Angeles Creators
  {
    first_name: 'Alex',
    last_name: 'Rivera',
    email: 'alex.rivera@example.com',
    phone_number: '+1-323-555-0101',
    location: 'Los Angeles, CA',
    working_distance: '50 miles',
    primary_role: 1, // Videographer
    years_of_experience: 8,
    hourly_rate: 150.00,
    bio: 'Award-winning cinematographer specializing in commercials and music videos. Shot content for major brands including Nike, Apple, and Spotify.',
    availability: 'Weekdays and weekends',
    skills: 'Cinematography, Color Grading, Drone Operation, 4K/8K Production',
    certifications: 'FAA Part 107 Drone License, Adobe Certified Expert',
    equipment_ownership: 'RED Komodo, DJI Inspire 3, Complete lighting kit',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.9,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Sarah',
    last_name: 'Chen',
    email: 'sarah.chen@example.com',
    phone_number: '+1-310-555-0102',
    location: 'Los Angeles, CA',
    working_distance: '30 miles',
    primary_role: 2, // Photographer
    years_of_experience: 6,
    hourly_rate: 120.00,
    bio: 'Fashion and portrait photographer with a keen eye for lighting and composition. Featured in Vogue and Harper\'s Bazaar.',
    availability: 'Flexible schedule',
    skills: 'Fashion Photography, Portrait, Studio Lighting, Retouching',
    certifications: 'PPA Certified Professional Photographer',
    equipment_ownership: 'Sony A1, Profoto lighting system, Full lens kit',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Marcus',
    last_name: 'Thompson',
    email: 'marcus.thompson@example.com',
    phone_number: '+1-213-555-0103',
    location: 'Los Angeles, CA',
    working_distance: '40 miles',
    primary_role: 1,
    years_of_experience: 12,
    hourly_rate: 200.00,
    bio: 'Hollywood cinematographer with credits on Netflix originals and major studio films. Specializing in narrative storytelling.',
    availability: 'Project-based',
    skills: 'Cinema Camera Operation, Lighting Design, Color Science, Set Management',
    certifications: 'ASC Associate Member, IATSE Local 600',
    equipment_ownership: 'ARRI Alexa Mini LF, Full cinema lens set',
    is_beige_member: 1,
    is_available: 1,
    rating: 5.0,
    is_draft: 0,
    is_active: 1
  },

  // New York Creators
  {
    first_name: 'Emily',
    last_name: 'Rodriguez',
    email: 'emily.rodriguez@example.com',
    phone_number: '+1-212-555-0201',
    location: 'New York, NY',
    working_distance: '25 miles',
    primary_role: 2,
    years_of_experience: 7,
    hourly_rate: 140.00,
    bio: 'Documentary and street photographer capturing authentic moments. Published in National Geographic and TIME.',
    availability: 'Monday to Friday',
    skills: 'Documentary Photography, Photojournalism, Street Photography, Editorial',
    certifications: 'NPPA Certified',
    equipment_ownership: 'Leica M11, Canon R5, Prime lens collection',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.7,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'David',
    last_name: 'Park',
    email: 'david.park@example.com',
    phone_number: '+1-646-555-0202',
    location: 'Brooklyn, NY',
    working_distance: '30 miles',
    primary_role: 1,
    years_of_experience: 5,
    hourly_rate: 110.00,
    bio: 'Creative videographer specializing in brand content and social media campaigns. Working with startups and agencies.',
    availability: 'Flexible',
    skills: 'Video Production, Motion Graphics, Social Media Content, Short-form Video',
    certifications: 'YouTube Certified Creator',
    equipment_ownership: 'Sony FX3, Gimbal stabilizers, Audio recording kit',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.6,
    is_draft: 0,
    is_active: 1
  },

  // Chicago Creators
  {
    first_name: 'Jennifer',
    last_name: 'Williams',
    email: 'jennifer.williams@example.com',
    phone_number: '+1-312-555-0301',
    location: 'Chicago, IL',
    working_distance: '35 miles',
    primary_role: 2,
    years_of_experience: 9,
    hourly_rate: 130.00,
    bio: 'Commercial photographer specializing in product and food photography. Worked with top Chicago restaurants and brands.',
    availability: 'Weekdays',
    skills: 'Product Photography, Food Photography, Commercial, Tabletop',
    certifications: 'APA Member',
    equipment_ownership: 'Phase One XF, Broncolor lighting, Full studio setup',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },
  {
    first_name: 'Robert',
    last_name: 'Johnson',
    email: 'robert.johnson@example.com',
    phone_number: '+1-773-555-0302',
    location: 'Chicago, IL',
    working_distance: '40 miles',
    primary_role: 1,
    years_of_experience: 10,
    hourly_rate: 160.00,
    bio: 'Event and corporate videographer with extensive experience in live production and multi-camera setups.',
    availability: 'Flexible schedule',
    skills: 'Live Production, Multi-Camera, Event Coverage, Corporate Video',
    certifications: 'Blackmagic Certified Trainer',
    equipment_ownership: 'Blackmagic cameras, Switchers, Complete audio setup',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.7,
    is_draft: 0,
    is_active: 1
  },

  // Austin Creators
  {
    first_name: 'Jessica',
    last_name: 'Martinez',
    email: 'jessica.martinez@example.com',
    phone_number: '+1-512-555-0401',
    location: 'Austin, TX',
    working_distance: '50 miles',
    primary_role: 1,
    years_of_experience: 6,
    hourly_rate: 125.00,
    bio: 'Music video director and cinematographer. Worked with emerging artists and Austin\'s vibrant music scene.',
    availability: 'Weekends and evenings',
    skills: 'Music Videos, Creative Direction, Color Grading, Performance Video',
    certifications: 'Apple Certified Pro - Final Cut Pro',
    equipment_ownership: 'Canon C70, Anamorphic lenses, RGB lighting',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.5,
    is_draft: 0,
    is_active: 1
  },

  // Miami Creators
  {
    first_name: 'Carlos',
    last_name: 'Gonzalez',
    email: 'carlos.gonzalez@example.com',
    phone_number: '+1-305-555-0501',
    location: 'Miami, FL',
    working_distance: '30 miles',
    primary_role: 2,
    years_of_experience: 8,
    hourly_rate: 135.00,
    bio: 'Lifestyle and travel photographer capturing the essence of Miami culture. Specializing in vibrant, high-energy shoots.',
    availability: 'Flexible',
    skills: 'Lifestyle Photography, Travel, Beach Photography, Editorial',
    certifications: 'WPPI Award Winner',
    equipment_ownership: 'Nikon Z9, Underwater housing, Full lighting kit',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },

  // Seattle Creators
  {
    first_name: 'Michael',
    last_name: 'Anderson',
    email: 'michael.anderson@example.com',
    phone_number: '+1-206-555-0601',
    location: 'Seattle, WA',
    working_distance: '45 miles',
    primary_role: 1,
    years_of_experience: 7,
    hourly_rate: 145.00,
    bio: 'Tech and corporate videographer. Created content for Amazon, Microsoft, and Seattle startups.',
    availability: 'Monday to Friday',
    skills: 'Corporate Video, Product Demos, Interviews, Promotional Content',
    certifications: 'Adobe Video Specialist',
    equipment_ownership: 'Sony FX6, Teleprompter, Complete audio kit',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.7,
    is_draft: 0,
    is_active: 1
  },

  // Denver Creators
  {
    first_name: 'Ashley',
    last_name: 'Taylor',
    email: 'ashley.taylor@example.com',
    phone_number: '+1-303-555-0701',
    location: 'Denver, CO',
    working_distance: '60 miles',
    primary_role: 2,
    years_of_experience: 5,
    hourly_rate: 115.00,
    bio: 'Adventure and outdoor photographer specializing in landscape and action sports photography.',
    availability: 'Weekends preferred',
    skills: 'Outdoor Photography, Landscape, Action Sports, Adventure',
    certifications: 'Leave No Trace Certified',
    equipment_ownership: 'Sony A7IV, Telephoto lenses, Portable lighting',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.6,
    is_draft: 0,
    is_active: 1
  },

  // Atlanta Creators
  {
    first_name: 'Tyrone',
    last_name: 'Washington',
    email: 'tyrone.washington@example.com',
    phone_number: '+1-404-555-0801',
    location: 'Atlanta, GA',
    working_distance: '40 miles',
    primary_role: 1,
    years_of_experience: 11,
    hourly_rate: 175.00,
    bio: 'Hip-hop and R&B music video director. Worked with major label artists and independent musicians.',
    availability: 'Project-based',
    skills: 'Music Video Direction, Color Grading, Creative Storytelling, Performance Coverage',
    certifications: 'DaVinci Resolve Certified',
    equipment_ownership: 'RED Komodo, Anamorphic glass, RGB tube lights',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.9,
    is_draft: 0,
    is_active: 1
  },

  // San Francisco Creators
  {
    first_name: 'Priya',
    last_name: 'Patel',
    email: 'priya.patel@example.com',
    phone_number: '+1-415-555-0901',
    location: 'San Francisco, CA',
    working_distance: '30 miles',
    primary_role: 2,
    years_of_experience: 6,
    hourly_rate: 155.00,
    bio: 'Tech and startup photographer specializing in corporate headshots and company culture photography.',
    availability: 'Weekdays',
    skills: 'Corporate Photography, Headshots, Event Photography, Tech Industry',
    certifications: 'Certified Professional Photographer',
    equipment_ownership: 'Canon R5, Studio strobes, Portable backdrop system',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  },

  // Boston Creators
  {
    first_name: 'Thomas',
    last_name: 'O\'Brien',
    email: 'thomas.obrien@example.com',
    phone_number: '+1-617-555-1001',
    location: 'Boston, MA',
    working_distance: '25 miles',
    primary_role: 1,
    years_of_experience: 9,
    hourly_rate: 140.00,
    bio: 'Documentary filmmaker and educator. Teaching at local universities while producing independent documentaries.',
    availability: 'Evenings and weekends',
    skills: 'Documentary Production, Interviews, Educational Content, Post-Production',
    certifications: 'DOC NYC Certified',
    equipment_ownership: 'Canon C300 Mark III, Audio recorder, Interview lighting',
    is_beige_member: 0,
    is_available: 1,
    rating: 4.7,
    is_draft: 0,
    is_active: 1
  },

  // Portland Creators
  {
    first_name: 'Samantha',
    last_name: 'Green',
    email: 'samantha.green@example.com',
    phone_number: '+1-503-555-1101',
    location: 'Portland, OR',
    working_distance: '35 miles',
    primary_role: 2,
    years_of_experience: 7,
    hourly_rate: 125.00,
    bio: 'Fine art and portrait photographer with a focus on environmental portraiture and storytelling.',
    availability: 'Flexible',
    skills: 'Portrait Photography, Fine Art, Environmental Portraits, Natural Light',
    certifications: 'PPA Master Photographer',
    equipment_ownership: 'Fujifilm GFX, Prime lenses, Reflectors and diffusers',
    is_beige_member: 1,
    is_available: 1,
    rating: 4.8,
    is_draft: 0,
    is_active: 1
  }
];

async function seedMockCreators() {
  try {
    console.log('🌱 Starting to seed mock creators...');

    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Clear existing mock creators (optional - comment out if you want to keep existing data)
    // await crew_members.destroy({ where: { email: { [Op.like]: '%@example.com' } } });
    // console.log('🗑️  Cleared existing mock creators');

    // Insert mock creators
    const createdCreators = await crew_members.bulkCreate(mockCreators, {
      ignoreDuplicates: true // Skip if email already exists
    });

    console.log(`✅ Successfully seeded ${createdCreators.length} mock creators`);

    console.log('\n📊 Mock Creators Summary:');
    console.log(`   Los Angeles: 3 creators`);
    console.log(`   New York: 2 creators`);
    console.log(`   Chicago: 2 creators`);
    console.log(`   Austin: 1 creator`);
    console.log(`   Miami: 1 creator`);
    console.log(`   Seattle: 1 creator`);
    console.log(`   Denver: 1 creator`);
    console.log(`   Atlanta: 1 creator`);
    console.log(`   San Francisco: 1 creator`);
    console.log(`   Boston: 1 creator`);
    console.log(`   Portland: 1 creator`);
    console.log(`\n   Total: ${createdCreators.length} creators across major US cities`);

    console.log('\n🎉 Mock creators seeded successfully!');

  } catch (error) {
    console.error('❌ Error seeding mock creators:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('👋 Database connection closed');
  }
}

// Run the seed function
seedMockCreators()
  .then(() => {
    console.log('\n✨ Seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Seeding failed:', error);
    process.exit(1);
  });
