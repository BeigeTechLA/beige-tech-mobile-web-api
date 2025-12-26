#!/usr/bin/env node
/**
 * Seed Pricing Catalog
 * 
 * This script populates the pricing tables with all service items.
 * Run after applying the create_pricing_catalog.sql migration.
 * 
 * Usage: node scripts/seed-pricing-catalog.js
 */

require('dotenv').config();
const db = require('../src/models');

// Categories definition
const categories = [
  { name: 'Pre-Production', slug: 'pre-production', description: 'Pre-production planning services by project type', display_order: 1 },
  { name: 'Services', slug: 'services', description: 'Core professional services (photographer, videographer, cinematographer)', display_order: 2 },
  { name: 'Editing', slug: 'editing', description: 'Video and photo editing services', display_order: 3 },
  { name: 'Crew & Labor', slug: 'crew-labor', description: 'Additional crew members and labor services', display_order: 4 },
  { name: 'Equipment Add-Ons', slug: 'equipment-addons', description: 'Additional equipment rentals', display_order: 5 },
  { name: 'Artist', slug: 'artist', description: 'Talent and artist services (actors, dancers, makeup, hair)', display_order: 6 },
  { name: 'Livestream Services', slug: 'livestream', description: 'Live streaming services', display_order: 7 },
  { name: 'Editing & Post-Production', slug: 'post-production', description: 'Rush editing and post-production add-ons', display_order: 8 },
  { name: 'Studios & Backgrounds', slug: 'studios', description: 'Studio space and backdrop rentals', display_order: 9 },
  { name: 'Scripting', slug: 'scripting', description: 'Script writing services', display_order: 10 },
  { name: 'Travel', slug: 'travel', description: 'Travel fees', display_order: 11 },
];

// Discount tiers
const generalDiscountTiers = [
  { pricing_mode: 'general', min_hours: 0, max_hours: 0.5, discount_percent: 0 },
  { pricing_mode: 'general', min_hours: 0.5, max_hours: 1, discount_percent: 0 },
  { pricing_mode: 'general', min_hours: 1, max_hours: 1.5, discount_percent: 5 },
  { pricing_mode: 'general', min_hours: 1.5, max_hours: 2, discount_percent: 10 },
  { pricing_mode: 'general', min_hours: 2, max_hours: 2.5, discount_percent: 15 },
  { pricing_mode: 'general', min_hours: 2.5, max_hours: 3, discount_percent: 20 },
  { pricing_mode: 'general', min_hours: 3, max_hours: null, discount_percent: 25 },
];

const weddingDiscountTiers = [
  { pricing_mode: 'wedding', min_hours: 0, max_hours: 0.5, discount_percent: 0 },
  { pricing_mode: 'wedding', min_hours: 0.5, max_hours: 1, discount_percent: 0 },
  { pricing_mode: 'wedding', min_hours: 1, max_hours: 1.5, discount_percent: 5 },
  { pricing_mode: 'wedding', min_hours: 1.5, max_hours: 2, discount_percent: 10 },
  { pricing_mode: 'wedding', min_hours: 2, max_hours: 2.5, discount_percent: 15 },
  { pricing_mode: 'wedding', min_hours: 2.5, max_hours: 3, discount_percent: 20 },
  { pricing_mode: 'wedding', min_hours: 3, max_hours: 3.5, discount_percent: 25 },
  { pricing_mode: 'wedding', min_hours: 3.5, max_hours: null, discount_percent: 30 },
];

// Pricing items by category slug
const pricingItemsByCategory = {
  'pre-production': [
    // General pre-production
    { pricing_mode: 'general', name: 'Pre-production - Music Video', slug: 'pre-prod-music-video', rate: 550.00, rate_type: 'flat', display_order: 1 },
    { pricing_mode: 'general', name: 'Pre-production - Commercial', slug: 'pre-prod-commercial', rate: 550.00, rate_type: 'flat', display_order: 2 },
    { pricing_mode: 'general', name: 'Pre-production - TV Series', slug: 'pre-prod-tv-series', rate: 550.00, rate_type: 'flat', display_order: 3 },
    { pricing_mode: 'general', name: 'Pre-production - Podcast', slug: 'pre-prod-podcast', rate: 550.00, rate_type: 'flat', display_order: 4 },
    { pricing_mode: 'general', name: 'Pre-production - Short Film', slug: 'pre-prod-short-film', rate: 550.00, rate_type: 'flat', display_order: 5 },
    { pricing_mode: 'general', name: 'Pre-production - Movies', slug: 'pre-prod-movies', rate: 550.00, rate_type: 'flat', display_order: 6 },
    { pricing_mode: 'general', name: 'Pre-production - Corporate Event', slug: 'pre-prod-corporate-event', rate: 550.00, rate_type: 'flat', display_order: 7 },
    { pricing_mode: 'general', name: 'Pre-production - Private Event', slug: 'pre-prod-private-event', rate: 275.00, rate_type: 'flat', display_order: 8 },
    // Wedding pre-production
    { pricing_mode: 'wedding', name: 'Pre-production - Weddings', slug: 'pre-prod-weddings', rate: 275.00, rate_type: 'flat', display_order: 1 },
  ],
  
  'services': [
    { pricing_mode: 'both', name: 'Photographer', slug: 'photographer', rate: 275.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 1 },
    { pricing_mode: 'both', name: 'Videographer', slug: 'videographer', rate: 275.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 2 },
    { pricing_mode: 'both', name: 'Cinematographer', slug: 'cinematographer', rate: 410.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 3 },
  ],
  
  'editing': [
    // General editing
    { pricing_mode: 'general', name: 'Music Video – Basic', slug: 'edit-music-video-basic', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 1 },
    { pricing_mode: 'general', name: 'Music Video – Complex', slug: 'edit-music-video-complex', rate: 1100.00, rate_type: 'flat', rate_unit: 'per video', display_order: 2 },
    { pricing_mode: 'general', name: 'Highlight Video (4–7 minutes)', slug: 'edit-highlight-video', rate: 385.00, rate_type: 'flat', rate_unit: 'per video', display_order: 3 },
    { pricing_mode: 'general', name: 'Feature Video (10–20 minutes)', slug: 'edit-feature-video', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 4 },
    { pricing_mode: 'general', name: 'Full Feature Video (20–40 minutes)', slug: 'edit-full-feature-video', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 5 },
    { pricing_mode: 'general', name: 'Reel (30–60 seconds)', slug: 'edit-reel', rate: 275.00, rate_type: 'flat', rate_unit: 'per video', display_order: 6 },
    { pricing_mode: 'general', name: 'Commercial – Basic', slug: 'edit-commercial-basic', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 7 },
    { pricing_mode: 'general', name: 'Commercial – Complex', slug: 'edit-commercial-complex', rate: 1100.00, rate_type: 'flat', rate_unit: 'per video', display_order: 8 },
    { pricing_mode: 'general', name: 'Podcast – Full Episode', slug: 'edit-podcast-full', rate: 385.00, rate_type: 'flat', rate_unit: 'per episode', display_order: 9 },
    { pricing_mode: 'general', name: 'Podcast – Short Reel', slug: 'edit-podcast-reel', rate: 275.00, rate_type: 'flat', rate_unit: 'per reel', display_order: 10 },
    { pricing_mode: 'general', name: '2D Animations – Basic', slug: 'edit-2d-animation-basic', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 11 },
    { pricing_mode: 'general', name: '2D Animations – Complex', slug: 'edit-2d-animation-complex', rate: 1100.00, rate_type: 'flat', rate_unit: 'per video', display_order: 12 },
    { pricing_mode: 'general', name: 'Special Effects – Basic (included in package)', slug: 'edit-sfx-basic', rate: 0.00, rate_type: 'flat', rate_unit: 'included', display_order: 13 },
    { pricing_mode: 'general', name: 'Special Effects – Complex', slug: 'edit-sfx-complex', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 14 },
    { pricing_mode: 'general', name: 'Voiceover (under 2 minutes)', slug: 'edit-voiceover-short', rate: 550.00, rate_type: 'flat', display_order: 15 },
    { pricing_mode: 'general', name: 'Voiceover (over 2 minutes / up to 15 minutes)', slug: 'edit-voiceover-long', rate: 1100.00, rate_type: 'flat', display_order: 16 },
    { pricing_mode: 'general', name: 'Short Film (5 minutes or less)', slug: 'edit-short-film-small', rate: 1650.00, rate_type: 'flat', rate_unit: 'per film', display_order: 17 },
    { pricing_mode: 'general', name: 'Short Film (more than 5 minutes / up to 10 minutes)', slug: 'edit-short-film-large', rate: 2750.00, rate_type: 'flat', rate_unit: 'per film', display_order: 18 },
    { pricing_mode: 'general', name: 'Movie (30 minutes or less)', slug: 'edit-movie-base', rate: 3850.00, rate_type: 'flat', rate_unit: 'per movie', display_order: 19 },
    { pricing_mode: 'general', name: 'Movie (every additional 10 minutes – after first 30 minutes)', slug: 'edit-movie-additional', rate: 1100.00, rate_type: 'per_unit', rate_unit: 'per 10 min', display_order: 20 },
    { pricing_mode: 'general', name: 'TV Series (per episode) – 30 minutes or less', slug: 'edit-tv-episode-base', rate: 3850.00, rate_type: 'flat', rate_unit: 'per episode', display_order: 21 },
    { pricing_mode: 'general', name: 'TV Series (per episode) – every additional 10 minutes – after first 30 minutes', slug: 'edit-tv-episode-additional', rate: 1100.00, rate_type: 'per_unit', rate_unit: 'per 10 min', display_order: 22 },
    { pricing_mode: 'general', name: 'Extra Edited Photos (25 photos)', slug: 'edit-extra-photos', rate: 275.00, rate_type: 'flat', rate_unit: '25 photos', display_order: 23 },
    { pricing_mode: 'general', name: 'Subtitles', slug: 'edit-subtitles', rate: 385.00, rate_type: 'flat', rate_unit: 'per video', display_order: 24 },
    { pricing_mode: 'general', name: 'Translation (per language) – Subtitles', slug: 'edit-translation', rate: 385.00, rate_type: 'per_unit', rate_unit: 'per language', display_order: 25 },
    // Wedding editing
    { pricing_mode: 'wedding', name: 'Highlight Video (4–7 minutes)', slug: 'wedding-edit-highlight', rate: 385.00, rate_type: 'flat', rate_unit: 'per video', display_order: 1 },
    { pricing_mode: 'wedding', name: 'Feature Video (10–20 minutes)', slug: 'wedding-edit-feature', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 2 },
    { pricing_mode: 'wedding', name: 'Full Feature Video (30–40 minutes)', slug: 'wedding-edit-full-feature', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 3 },
    { pricing_mode: 'wedding', name: 'Reel (10–60 seconds)', slug: 'wedding-edit-reel', rate: 275.00, rate_type: 'flat', rate_unit: 'per video', display_order: 4 },
    { pricing_mode: 'wedding', name: 'Extra Edited Photos (25 photos)', slug: 'wedding-edit-extra-photos', rate: 275.00, rate_type: 'flat', rate_unit: '25 photos', display_order: 5 },
    { pricing_mode: 'wedding', name: 'Subtitles', slug: 'wedding-edit-subtitles', rate: 385.00, rate_type: 'flat', rate_unit: 'per video', display_order: 6 },
    { pricing_mode: 'wedding', name: 'Translation (per language) – Subtitles', slug: 'wedding-edit-translation', rate: 385.00, rate_type: 'per_unit', rate_unit: 'per language', display_order: 7 },
  ],
  
  'crew-labor': [
    { pricing_mode: 'general', name: 'Production Assistant (per hour)', slug: 'crew-production-assistant', rate: 220.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 1 },
    { pricing_mode: 'general', name: 'Sound Engineer (per hour)', slug: 'crew-sound-engineer', rate: 275.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 2 },
    { pricing_mode: 'general', name: 'Director (per hour)', slug: 'crew-director', rate: 275.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 3 },
    { pricing_mode: 'general', name: 'Gaffer – Lighting Technician (per hour)', slug: 'crew-gaffer', rate: 275.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 4 },
    { pricing_mode: 'general', name: 'Onsite Editor (full day)', slug: 'crew-onsite-editor', rate: 1100.00, rate_type: 'per_day', rate_unit: 'full day', display_order: 5 },
  ],
  
  'equipment-addons': [
    { pricing_mode: 'both', name: 'Additional Camera (flat rate)', slug: 'equip-additional-camera', rate: 385.00, rate_type: 'flat', display_order: 1 },
    { pricing_mode: 'both', name: 'Teleprompter', slug: 'equip-teleprompter', rate: 275.00, rate_type: 'flat', display_order: 2 },
    { pricing_mode: 'general', name: 'Drone – Corporate', slug: 'equip-drone-corporate', rate: 1100.00, rate_type: 'flat', display_order: 3 },
    { pricing_mode: 'both', name: 'Drone – Non-Corporate', slug: 'equip-drone-non-corporate', rate: 550.00, rate_type: 'flat', display_order: 4 },
    { pricing_mode: 'both', name: 'Additional Lavalier Microphones (per mic)', slug: 'equip-lav-mic', rate: 275.00, rate_type: 'per_unit', rate_unit: 'per mic', display_order: 5 },
    { pricing_mode: 'both', name: 'Additional Lights', slug: 'equip-additional-lights', rate: 385.00, rate_type: 'flat', display_order: 6 },
    { pricing_mode: 'both', name: 'Hard Drive (flat rate)', slug: 'equip-hard-drive', rate: 550.00, rate_type: 'flat', display_order: 7 },
  ],
  
  'artist': [
    { pricing_mode: 'both', name: 'Actor (4 hours or less)', slug: 'artist-actor-short', rate: 385.00, rate_type: 'flat', rate_unit: 'up to 4 hours', display_order: 1 },
    { pricing_mode: 'both', name: 'Actor (5–8 hours)', slug: 'artist-actor-long', rate: 770.00, rate_type: 'flat', rate_unit: '5-8 hours', display_order: 2 },
    { pricing_mode: 'both', name: 'Dancer (4 hours or less)', slug: 'artist-dancer-short', rate: 385.00, rate_type: 'flat', rate_unit: 'up to 4 hours', display_order: 3 },
    { pricing_mode: 'both', name: 'Dancer (5–8 hours)', slug: 'artist-dancer-long', rate: 770.00, rate_type: 'flat', rate_unit: '5-8 hours', display_order: 4 },
    { pricing_mode: 'both', name: 'Makeup Artist (up to 4 hours)', slug: 'artist-makeup-short', rate: 1100.00, rate_type: 'flat', rate_unit: 'up to 4 hours', display_order: 5 },
    { pricing_mode: 'both', name: 'Makeup Artist (5–8 hours)', slug: 'artist-makeup-long', rate: 2200.00, rate_type: 'flat', rate_unit: '5-8 hours', display_order: 6 },
    { pricing_mode: 'both', name: 'Hair Stylist (up to 4 hours)', slug: 'artist-hair-short', rate: 1100.00, rate_type: 'flat', rate_unit: 'up to 4 hours', display_order: 7 },
    { pricing_mode: 'both', name: 'Hair Stylist (5–8 hours)', slug: 'artist-hair-long', rate: 2200.00, rate_type: 'flat', rate_unit: '5-8 hours', display_order: 8 },
    { pricing_mode: 'both', name: 'Hair + Makeup (one person doing both) – up to 4 hours', slug: 'artist-hair-makeup-short', rate: 1650.00, rate_type: 'flat', rate_unit: 'up to 4 hours', display_order: 9 },
    { pricing_mode: 'both', name: 'Hair + Makeup (one person doing both) – 5 to 8 hours', slug: 'artist-hair-makeup-long', rate: 3300.00, rate_type: 'flat', rate_unit: '5-8 hours', display_order: 10 },
  ],
  
  'livestream': [
    { pricing_mode: 'both', name: 'Livestream – iPhone (first hour)', slug: 'livestream-iphone-first', rate: 1100.00, rate_type: 'flat', rate_unit: 'first hour', display_order: 1 },
    { pricing_mode: 'both', name: 'Livestream – iPhone (additional hour)', slug: 'livestream-iphone-additional', rate: 275.00, rate_type: 'per_hour', rate_unit: 'additional hour', display_order: 2 },
    { pricing_mode: 'both', name: 'Livestream – 4K Camera (first hour)', slug: 'livestream-4k-first', rate: 1650.00, rate_type: 'flat', rate_unit: 'first hour', display_order: 3 },
    { pricing_mode: 'both', name: 'Livestream – 4K Camera (additional hour)', slug: 'livestream-4k-additional', rate: 550.00, rate_type: 'per_hour', rate_unit: 'additional hour', display_order: 4 },
  ],
  
  'post-production': [
    { pricing_mode: 'both', name: 'Same-Day Editing (per video)', slug: 'post-same-day', rate: 1100.00, rate_type: 'flat', rate_unit: 'per video', display_order: 1 },
    { pricing_mode: 'both', name: 'Next-Day Editing (per video)', slug: 'post-next-day', rate: 825.00, rate_type: 'flat', rate_unit: 'per video', display_order: 2 },
    { pricing_mode: 'both', name: 'Expedited Editing – 1 Week (per video)', slug: 'post-expedited', rate: 550.00, rate_type: 'flat', rate_unit: 'per video', display_order: 3 },
    { pricing_mode: 'both', name: 'Additional Revisions (Editing)', slug: 'post-revisions', rate: 275.00, rate_type: 'per_unit', rate_unit: 'per revision', display_order: 4 },
    { pricing_mode: 'both', name: 'Photo Album', slug: 'post-photo-album', rate: 550.00, rate_type: 'flat', display_order: 5 },
    { pricing_mode: 'wedding', name: 'Onsite Editor (full day)', slug: 'wedding-onsite-editor', rate: 1100.00, rate_type: 'per_day', rate_unit: 'full day', display_order: 6 },
  ],
  
  'studios': [
    { pricing_mode: 'general', name: 'Green Screen (flat rate per screen)', slug: 'studio-green-screen', rate: 550.00, rate_type: 'flat', rate_unit: 'per screen', display_order: 1 },
    { pricing_mode: 'general', name: 'Backdrop (flat rate per backdrop)', slug: 'studio-backdrop', rate: 550.00, rate_type: 'flat', rate_unit: 'per backdrop', display_order: 2 },
    { pricing_mode: 'general', name: 'Photo Studio Reservation – Basic (per hour)', slug: 'studio-photo-basic', rate: 440.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 3 },
    { pricing_mode: 'general', name: 'Video Studio Reservation – Advanced (per hour)', slug: 'studio-video-advanced', rate: 440.00, rate_type: 'per_hour', rate_unit: 'per hour', display_order: 4 },
  ],
  
  'scripting': [
    { pricing_mode: 'general', name: 'Script (0–10 minutes)', slug: 'script-short', rate: 550.00, rate_type: 'flat', rate_unit: '0-10 min', display_order: 1 },
    { pricing_mode: 'general', name: 'Script (10–29 minutes)', slug: 'script-medium', rate: 825.00, rate_type: 'flat', rate_unit: '10-29 min', display_order: 2 },
    { pricing_mode: 'general', name: 'Script (30 minutes – 1 hour)', slug: 'script-long', rate: 1100.00, rate_type: 'flat', rate_unit: '30-60 min', display_order: 3 },
  ],
  
  'travel': [
    { pricing_mode: 'both', name: 'Travel', slug: 'travel-fee', rate: 275.00, rate_type: 'flat', rate_unit: 'flat rate', display_order: 1 },
  ],
};

async function seedPricingCatalog() {
  try {
    console.log('Starting pricing catalog seed...');
    
    // Check if data already exists
    const existingCategories = await db.pricing_categories.count();
    if (existingCategories > 0) {
      console.log('⚠️  Pricing catalog already has data. Skipping seed.');
      console.log('   To re-seed, first clear the tables:');
      console.log('   DELETE FROM quote_line_items; DELETE FROM quotes; DELETE FROM pricing_items; DELETE FROM pricing_discount_tiers; DELETE FROM pricing_categories;');
      process.exit(0);
    }

    // Create categories
    console.log('Creating categories...');
    const categoryMap = {};
    for (const cat of categories) {
      const created = await db.pricing_categories.create(cat);
      categoryMap[cat.slug] = created.category_id;
      console.log(`  ✓ ${cat.name}`);
    }

    // Create discount tiers
    console.log('\nCreating discount tiers...');
    for (const tier of [...generalDiscountTiers, ...weddingDiscountTiers]) {
      await db.pricing_discount_tiers.create(tier);
    }
    console.log(`  ✓ Created ${generalDiscountTiers.length} general tiers`);
    console.log(`  ✓ Created ${weddingDiscountTiers.length} wedding tiers`);

    // Create pricing items
    console.log('\nCreating pricing items...');
    let totalItems = 0;
    for (const [categorySlug, items] of Object.entries(pricingItemsByCategory)) {
      const categoryId = categoryMap[categorySlug];
      if (!categoryId) {
        console.error(`Category not found: ${categorySlug}`);
        continue;
      }

      for (const item of items) {
        await db.pricing_items.create({
          ...item,
          category_id: categoryId,
        });
        totalItems++;
      }
      console.log(`  ✓ ${categorySlug}: ${items.length} items`);
    }

    console.log(`\n✅ Seeding complete!`);
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Discount Tiers: ${generalDiscountTiers.length + weddingDiscountTiers.length}`);
    console.log(`   Pricing Items: ${totalItems}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding pricing catalog:', error);
    process.exit(1);
  }
}

seedPricingCatalog();

