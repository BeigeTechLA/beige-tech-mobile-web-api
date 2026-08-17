All studio related queries:

use revurge;

CREATE TABLE IF NOT EXISTS studios (
  studio_id INT PRIMARY KEY AUTO_INCREMENT,
  owner_user_id INT NULL,
  host_name VARCHAR(255) NULL,
  host_email VARCHAR(255) NULL,
  studio_name VARCHAR(255) NOT NULL,
  brand_name VARCHAR(255) NULL,
  slug VARCHAR(255) NULL,
  status ENUM('draft', 'active', 'inactive', 'pending_review', 'rejected') NOT NULL DEFAULT 'draft',
  verification_status ENUM('unverified', 'verified') NOT NULL DEFAULT 'unverified',
  space_type VARCHAR(100) NULL,
  description TEXT NULL,
  short_description VARCHAR(500) NULL,
  country VARCHAR(100) NULL,
  address_line1 VARCHAR(255) NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(120) NULL,
  state VARCHAR(120) NULL,
  zip_code VARCHAR(30) NULL,
  latitude DECIMAL(10,8) NULL,
  longitude DECIMAL(11,8) NULL,
  timezone VARCHAR(64) NULL,
  hourly_rate DECIMAL(10,2) NULL,
  overtime_rate DECIMAL(10,2) NULL,
  minimum_booking_hours DECIMAL(5,2) NULL,
  buffer_time_minutes INT NULL,
  capacity_min INT NULL,
  capacity_max INT NULL,
  square_feet INT NULL,
  height VARCHAR(80) NULL,
  width VARCHAR(80) NULL,
  length VARCHAR(80) NULL,
  main_floor_number VARCHAR(80) NULL,
  overnight_stays_allowed BOOLEAN NOT NULL DEFAULT 0,
  security_recording_enabled BOOLEAN NOT NULL DEFAULT 0,
  security_recording_description TEXT NULL,
  wifi_name VARCHAR(255) NULL,
  wifi_password VARCHAR(255) NULL,
  preferred_age VARCHAR(80) NULL,
  parking_options JSON NULL,
  access_features JSON NULL,
  facility_features JSON NULL,
  supported_shoot_types JSON NULL,
  suggested_type VARCHAR(255) NULL,
  activities JSON NULL,
  space_basics JSON NULL,
  amenities JSON NULL,
  description_tags JSON NULL,
  house_rules JSON NULL,
  policies JSON NULL,
  pricing_settings JSON NULL,
  metadata JSON NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_studios_slug (slug),
  INDEX idx_studios_status (status),
  INDEX idx_studios_city_state (city, state),
  INDEX idx_studios_owner (owner_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE studio_media;

CREATE TABLE IF NOT EXISTS studio_media (
  studio_media_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
  url TEXT NOT NULL,
  thumbnail_url TEXT NULL,
  title VARCHAR(255) NULL,
  alt_text VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_media_studio (studio_id),
  INDEX idx_studio_media_cover (studio_id, is_cover),
  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_operating_hours (
  studio_operating_hour_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday, ... 6=Saturday',
  is_open BOOLEAN NOT NULL DEFAULT 1,
  opens_at TIME NULL,
  closes_at TIME NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_studio_operating_day (studio_id, day_of_week),
  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_availability (
  studio_availability_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  availability_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  status ENUM('available', 'disabled', 'shoot_booked', 'conflict') NOT NULL DEFAULT 'available',
  notes TEXT NULL,
  metadata JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_availability_studio_date (studio_id, availability_date),
  INDEX idx_studio_availability_status (status),
  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_reviews (
  studio_review_id INT PRIMARY KEY AUTO_INCREMENT,
  studio_id INT NOT NULL,
  reviewer_user_id INT NULL,
  reviewer_name VARCHAR(255) NULL,
  reviewer_avatar_url TEXT NULL,
  rating DECIMAL(2,1) NOT NULL DEFAULT 5.0,
  cleanliness_rating DECIMAL(2,1) NULL,
  communication_rating DECIMAL(2,1) NULL,
  check_in_rating DECIMAL(2,1) NULL,
  review_text TEXT NULL,
  reviewed_at DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_reviews_studio (studio_id),
  INDEX idx_studio_reviews_user (reviewer_user_id),
  INDEX idx_studio_reviews_active (is_active),

  FOREIGN KEY (studio_id) REFERENCES studios(studio_id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS studio_bookings (
  studio_booking_id INT PRIMARY KEY AUTO_INCREMENT,
  stream_project_booking_id INT NULL,
  studio_id INT NOT NULL,
  user_id INT NULL,

  booking_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  duration_hours DECIMAL(5,2) NULL,

  status ENUM('requested', 'confirmed', 'completed', 'cancelled', 'rejected') NOT NULL DEFAULT 'requested',

  base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  overtime_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  source ENUM('manual', 'book_a_shoot', 'create_new_deal') NOT NULL DEFAULT 'manual',
  metadata JSON NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_studio_bookings_booking (stream_project_booking_id),
  INDEX idx_studio_bookings_studio (studio_id),
  INDEX idx_studio_bookings_user (user_id),
  INDEX idx_studio_bookings_date (booking_date),
  INDEX idx_studio_bookings_status (status),
  INDEX idx_studio_bookings_source (source),

  FOREIGN KEY (stream_project_booking_id)
    REFERENCES stream_project_booking(stream_project_booking_id)
    ON DELETE SET NULL,

  FOREIGN KEY (studio_id)
    REFERENCES studios(studio_id)
    ON DELETE CASCADE,

  FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `studios` ADD `parking_description` TEXT NULL AFTER `parking_options`;




INSERT INTO studios (
  studio_name,
  slug,
  status,
  verification_status,
  space_type,
  description,
  short_description,
  country,
  address_line1,
  city,
  state,
  zip_code,
  latitude,
  longitude,
  timezone,
  hourly_rate,
  minimum_booking_hours,
  square_feet,
  supported_shoot_types,
  suggested_type,
  activities,
  amenities,
  description_tags,
  house_rules,
  pricing_settings,
  metadata,
  is_active
) VALUES
(
  'Beige Studios Hollywood Hills Estate',
  'beige-hollywood-hills-estate',
  'active',
  'verified',
  'Estate',
  'Perched above the city in the heart of the Hollywood Hills, Beige Studios Hollywood Hills is a modern architectural retreat designed for premium productions, content creation, brand campaigns, executive retreats, and intimate gatherings.',
  'Modern Hollywood Hills estate for premium productions, content creation, brand campaigns, executive retreats, and intimate gatherings.',
  'United States',
  '2021 Davies Way',
  'Los Angeles',
  'CA',
  '90046',
  NULL,
  NULL,
  'America/Los_Angeles',
  250.00,
  2.00,
  5000,
  JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content creation', 'Social media content'),
  'Estate',
  JSON_ARRAY('Brand Campaigns', 'Commercial Productions', 'Influencer Content', 'Podcasts', 'Interviews', 'Corporate Retreats', 'Luxury Lifestyle Photography', 'Product Launches', 'Creative Events'),
  JSON_ARRAY('Natural Light Throughout Property', 'Panoramic Los Angeles City Views', 'Hollywood Hills Location', 'Central Air Conditioning & Heating', 'On-Site Parking', 'Street Parking Available', 'Floor-to-Ceiling Windows', 'Vaulted Ceilings', 'Designer Kitchen', 'Luxury Modern Interiors', 'Outdoor Terrace & Lounge Areas', 'Multiple Filming Locations On Property', 'Content Creator Friendly', 'Production Friendly Layout', 'Hair & Makeup Prep Areas', 'Private Restrooms', 'High-Speed WiFi', 'Power Access Throughout Property', 'Load-In / Load-Out Access', 'Furniture & Decor Included', 'Quiet Residential Setting', 'Golden Hour Sunset Views', 'Suitable for Podcasts & Interviews', 'Suitable for Brand Activations & Events'),
  JSON_ARRAY('Panoramic Hollywood Hills & Los Angeles skyline views', 'Dramatic double-height living room with statement windows', 'Designer kitchen and modern luxury interiors', 'Multiple indoor and outdoor filming environments', 'Natural light throughout the day', 'Outdoor terrace and lounge areas perfect for content, interviews, and events'),
  JSON_ARRAY('No smoking, vaping, or illegal substances anywhere on the property.', 'No parties, ticketed events, raves, or unauthorized gatherings.', 'No overnight stays unless specifically approved in writing.', 'No amplified outdoor music.', 'Quiet hours are strictly enforced from 9:00 PM to 8:00 AM.', 'All setup, production, and breakdown time must be included in the reservation.'),
  JSON_OBJECT(
    'mode', 'hourly',
    'priceLabel', 'From $250/Hr',
    'priceValue', 250,
    'options', JSON_ARRAY(
      JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 250, 'minimumHours', 2, 'cleaningFee', 300, 'idealFor', JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content creation', 'Social media content')),
      JSON_OBJECT('key', 'activations_events', 'label', 'Activations & Events', 'hourlyRate', 500, 'minimumHours', 2, 'cleaningFee', 500, 'idealFor', JSON_ARRAY('Brand activations', 'Product launches', 'Corporate events', 'Networking events', 'Workshops', 'Private gatherings', 'VIP experiences')),
      JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 250, 'minimumHours', 2, 'cleaningFee', 300, 'idealFor', JSON_ARRAY('Executive meetings', 'Team offsites', 'Investor presentations', 'Strategy sessions', 'Board meetings', 'Creative workshops'))
    )
  ),
  JSON_OBJECT('frontendId', 'beige-hollywood-hills-estate', 'pricingMode', 'hourly', 'beds', 4, 'baths', 4, 'operatingHours', 'Available by booking', 'weeklySchedule', 'Available 7 days', 'size', '5,000+ Square Feet', 'rating', 5.0, 'reviews', 5, 'priceLabel', 'From $250/Hr'),
  1
),
(
  'Beige Studios West Hollywood Content Studio',
  'beige-west-hollywood-content-studio',
  'active',
  'verified',
  'Content Studio',
  'A West Hollywood content studio designed for photography, video production, podcasts, interviews, and brand content creation.',
  'West Hollywood content studio for photo shoots, video productions, podcasts, interviews, and brand content.',
  'United States',
  '9200 West Sunset Blvd. #215',
  'West Hollywood',
  'CA',
  '90069',
  34.09050000,
  -118.39230000,
  'America/Los_Angeles',
  150.00,
  2.00,
  NULL,
  JSON_ARRAY('Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content'),
  'Content Studio',
  JSON_ARRAY('Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content'),
  JSON_ARRAY('Natural light', 'Product-friendly', 'Content creation', 'Video productions', 'Photography shoots'),
  JSON_ARRAY('West Hollywood location', 'Content creator friendly', 'Production-ready space'),
  JSON_ARRAY('All setup, production, and breakdown time must be included in the reservation.', 'Guest count must not exceed the number specified in the reservation.'),
  JSON_OBJECT(
    'mode', 'hourly',
    'priceLabel', 'From $150/Hr',
    'priceValue', 150,
    'options', JSON_ARRAY(
      JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 150, 'minimumHours', 2, 'cleaningFee', 0, 'idealFor', JSON_ARRAY('Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content')),
      JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 150, 'minimumHours', 2, 'cleaningFee', 0, 'idealFor', JSON_ARRAY('Meetings', 'Team offsites', 'Client presentations'))
    )
  ),
  JSON_OBJECT('frontendId', 'beige-west-hollywood-content-studio', 'pricingMode', 'hourly', 'beds', 0, 'baths', 0, 'operatingHours', 'Available by booking', 'weeklySchedule', 'Available 7 days', 'rating', 5.0, 'reviews', 120, 'priceLabel', 'From $150/Hr'),
  1
),
(
  'Beige Studios Woodland Hills Villa',
  'beige-woodland-hills-villa',
  'active',
  'verified',
  'Villa',
  'A Woodland Hills villa suitable for productions, content creation, lifestyle shoots, meetings, and offsites.',
  'Woodland Hills villa for productions, content creation, lifestyle shoots, meetings, and offsites.',
  'United States',
  '22452 Dolorosa Street',
  'Woodland Hills',
  'CA',
  '91367',
  34.16540000,
  -118.60890000,
  'America/Los_Angeles',
  150.00,
  2.00,
  NULL,
  JSON_ARRAY('Photography shoots', 'Video productions', 'Content creation', 'Meetings', 'Offsites'),
  'Villa',
  JSON_ARRAY('Photography shoots', 'Video productions', 'Content creation', 'Meetings', 'Offsites'),
  JSON_ARRAY('Natural light', 'Product-friendly', 'Production-friendly', 'Residential location'),
  JSON_ARRAY('Woodland Hills location', 'Villa setting', 'Flexible indoor spaces'),
  JSON_ARRAY('All setup, production, and breakdown time must be included in the reservation.', 'Guest count must not exceed the number specified in the reservation.'),
  JSON_OBJECT(
    'mode', 'hourly',
    'priceLabel', 'From $150/Hr',
    'priceValue', 150,
    'options', JSON_ARRAY(
      JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 150, 'minimumHours', 2, 'cleaningFee', 0, 'idealFor', JSON_ARRAY('Photography shoots', 'Video productions', 'Content creation')),
      JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 150, 'minimumHours', 2, 'cleaningFee', 0, 'idealFor', JSON_ARRAY('Meetings', 'Team offsites', 'Creative workshops'))
    )
  ),
  JSON_OBJECT('frontendId', 'beige-woodland-hills-villa', 'pricingMode', 'hourly', 'beds', 0, 'baths', 0, 'rating', 4.5, 'reviews', 120, 'priceLabel', 'From $150/Hr'),
  1
),
(
  'Beige Studios West Hollywood Morning Wellness Club Gym',
  'beige-west-hollywood-wellness-gym',
  'active',
  'verified',
  'Gym',
  'A West Hollywood wellness club gym suitable for fitness productions, wellness content, and active lifestyle shoots.',
  'West Hollywood gym for fitness productions, wellness content, and active lifestyle shoots.',
  'United States',
  '9200 West Sunset Blvd. #215',
  'West Hollywood',
  'CA',
  '90069',
  34.09050000,
  -118.39230000,
  'America/Los_Angeles',
  500.00,
  2.00,
  NULL,
  JSON_ARRAY('Fitness productions', 'Wellness content creation', 'Video productions', 'Photography shoots'),
  'Gym',
  JSON_ARRAY('Fitness productions', 'Wellness content creation', 'Video productions', 'Photography shoots'),
  JSON_ARRAY('Fitness productions', 'Wellness content creation', 'Gym equipment', 'Production-friendly'),
  JSON_ARRAY('Wellness club gym', 'West Hollywood location', 'Fitness content ready'),
  JSON_ARRAY('All setup, production, and breakdown time must be included in the reservation.', 'Guest count must not exceed the number specified in the reservation.'),
  JSON_OBJECT(
    'mode', 'hourly',
    'priceLabel', 'From $500/Hr',
    'priceValue', 500,
    'options', JSON_ARRAY(
      JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 500, 'minimumHours', 2, 'cleaningFee', 0, 'idealFor', JSON_ARRAY('Fitness productions', 'Wellness content creation', 'Video productions', 'Photography shoots'))
    )
  ),
  JSON_OBJECT('frontendId', 'beige-west-hollywood-wellness-gym', 'pricingMode', 'hourly', 'beds', 0, 'baths', 0, 'rating', 5.0, 'reviews', 120, 'priceLabel', 'From $500/Hr'),
  1
),
(
  'Beige Studios Palm Springs Oasis',
  'beige-palm-springs-oasis',
  'active',
  'verified',
  'Oasis',
  'A Palm Desert oasis for productions, lifestyle shoots, brand content, and retreats.',
  'Palm Desert oasis for productions, lifestyle shoots, brand content, and retreats.',
  'United States',
  '72870 Deer Grass Dr.',
  'Palm Desert',
  'CA',
  NULL,
  NULL,
  NULL,
  'America/Los_Angeles',
  250.00,
  2.00,
  NULL,
  JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Lifestyle content', 'Brand content'),
  'Oasis',
  JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Lifestyle content', 'Brand content'),
  JSON_ARRAY('Palm Desert location', 'Outdoor lifestyle setting', 'Production-friendly property'),
  JSON_ARRAY('Palm Desert setting', 'Outdoor production opportunities', 'Lifestyle shoot ready'),
  JSON_ARRAY('All setup, production, and breakdown time must be included in the reservation.', 'Guest count must not exceed the number specified in the reservation.'),
  JSON_OBJECT(
    'mode', 'hourly',
    'priceLabel', 'From $250/Hr',
    'priceValue', 250,
    'options', JSON_ARRAY(
      JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 250, 'minimumHours', 2, 'cleaningFee', 0, 'idealFor', JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Lifestyle content', 'Brand content'))
    )
  ),
  JSON_OBJECT('frontendId', 'beige-palm-springs-oasis', 'pricingMode', 'hourly', 'beds', 0, 'baths', 0, 'rating', 5.0, 'reviews', 5, 'priceLabel', 'From $250/Hr'),
  1
)
ON DUPLICATE KEY UPDATE
  studio_name = VALUES(studio_name),
  status = VALUES(status),
  verification_status = VALUES(verification_status),
  space_type = VALUES(space_type),
  description = VALUES(description),
  short_description = VALUES(short_description),
  country = VALUES(country),
  address_line1 = VALUES(address_line1),
  city = VALUES(city),
  state = VALUES(state),
  zip_code = VALUES(zip_code),
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  timezone = VALUES(timezone),
  hourly_rate = VALUES(hourly_rate),
  minimum_booking_hours = VALUES(minimum_booking_hours),
  square_feet = VALUES(square_feet),
  supported_shoot_types = VALUES(supported_shoot_types),
  suggested_type = VALUES(suggested_type),
  activities = VALUES(activities),
  amenities = VALUES(amenities),
  description_tags = VALUES(description_tags),
  house_rules = VALUES(house_rules),
  pricing_settings = VALUES(pricing_settings),
  metadata = VALUES(metadata),
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;
SET SQL_SAFE_UPDATES = 0; 
DELETE sm FROM studio_media sm
JOIN studios s ON s.studio_id = sm.studio_id
WHERE s.slug IN (
  'beige-hollywood-hills-estate',
  'beige-west-hollywood-content-studio',
  'beige-woodland-hills-villa',
  'beige-west-hollywood-wellness-gym',
  'beige-palm-springs-oasis'
)
AND sm.url LIKE 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/%';

INSERT INTO studio_media (
  studio_id,
  media_type,
  url,
  thumbnail_url,
  title,
  alt_text,
  sort_order,
  is_cover,
  metadata
)
SELECT s.studio_id, 'image', 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/hollywood-hills/living-room-2.png', NULL, s.studio_name, s.studio_name, 0, 1, NULL
FROM studios s WHERE s.slug = 'beige-hollywood-hills-estate'
UNION ALL
SELECT s.studio_id, 'image', 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/weho-content/Weho+Studio-2.jpg', NULL, s.studio_name, s.studio_name, 0, 1, NULL
FROM studios s WHERE s.slug = 'beige-west-hollywood-content-studio'
UNION ALL
SELECT s.studio_id, 'image', 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/woodland-hills/IMG_4805.JPG', NULL, s.studio_name, s.studio_name, 0, 1, NULL
FROM studios s WHERE s.slug = 'beige-woodland-hills-villa'
UNION ALL
SELECT s.studio_id, 'image', 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/weho-gym/Copy+of+DSC00042.jpg', NULL, s.studio_name, s.studio_name, 0, 1, NULL
FROM studios s WHERE s.slug = 'beige-west-hollywood-wellness-gym'
UNION ALL
SELECT s.studio_id, 'image', 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/palm-springs/aim_media_group_high_v2-48.jpg', NULL, s.studio_name, s.studio_name, 0, 1, NULL
FROM studios s WHERE s.slug = 'beige-palm-springs-oasis';

-- Complete frontend studio detail data.
-- Keeps the public studio detail API capable of rendering app/studios/[id]/page.tsx from backend data.

UPDATE studios SET
  description = 'Perched above the city in the heart of the Hollywood Hills, Beige Studios Hollywood Hills is a modern architectural retreat designed for premium productions, content creation, brand campaigns, executive retreats, and intimate gatherings. Featuring soaring vaulted ceilings, floor-to-ceiling glass, abundant natural light, and panoramic views stretching across Los Angeles, the property offers a clean, luxurious backdrop for both lifestyle and commercial shoots.',
  supported_shoot_types = JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content creation', 'Social media content'),
  activities = JSON_ARRAY('Brand Campaigns', 'Commercial Productions', 'Influencer Content', 'Podcasts', 'Interviews', 'Corporate Retreats', 'Luxury Lifestyle Photography', 'Product Launches', 'Creative Events'),
  amenities = JSON_ARRAY('Natural Light Throughout Property', 'Panoramic Los Angeles City Views', 'Hollywood Hills Location', 'Central Air Conditioning & Heating', 'On-Site Parking', 'Street Parking Available', 'Floor-to-Ceiling Windows', 'Vaulted Ceilings', 'Designer Kitchen', 'Luxury Modern Interiors', 'Outdoor Terrace & Lounge Areas', 'Multiple Filming Locations On Property', 'Content Creator Friendly', 'Production Friendly Layout', 'Hair & Makeup Prep Areas', 'Private Restrooms', 'High-Speed WiFi', 'Power Access Throughout Property', 'Load-In / Load-Out Access', 'Furniture & Decor Included', 'Quiet Residential Setting', 'Golden Hour Sunset Views', 'Suitable for Podcasts & Interviews', 'Suitable for Brand Activations & Events'),
  description_tags = JSON_ARRAY('Panoramic Hollywood Hills & Los Angeles skyline views', 'Dramatic double-height living room with statement windows', 'Designer kitchen and modern luxury interiors', 'Multiple indoor and outdoor filming environments', 'Natural light throughout the day', 'Outdoor terrace and lounge areas perfect for content, interviews, and events'),
  house_rules = JSON_ARRAY('No smoking, vaping, or illegal substances anywhere on the property.', 'No parties, ticketed events, raves, or unauthorized gatherings.', 'No overnight stays unless specifically approved in writing.', 'No amplified outdoor music.', 'No excessive noise, yelling, or disruptive behavior.', 'Maximum of 2 vehicles parked on the street at any time.', 'Quiet hours are strictly enforced from 9:00 PM to 8:00 AM.', 'All setup, production, and breakdown time must be included in the reservation.', 'No drilling, painting, nailing, stapling, or attaching items to walls, ceilings, floors, windows, or furniture.', 'Guests are responsible for any damage caused during their booking.', 'Guest count must not exceed the number specified in the reservation.', 'The booking may be immediately terminated without refund for unauthorized parties, excessive noise, smoking violations, unauthorized guest counts, illegal activity, or repeated rule violations.'),
  pricing_settings = JSON_OBJECT('mode', 'hourly', 'priceLabel', 'From $250/Hr', 'priceValue', 250, 'options', JSON_ARRAY(
    JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 250, 'minimumHours', 2, 'cleaningFee', 300, 'idealFor', JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Podcast recordings', 'Interviews', 'Brand content creation', 'Social media content')),
    JSON_OBJECT('key', 'activations_events', 'label', 'Activations & Events', 'hourlyRate', 500, 'minimumHours', 2, 'cleaningFee', 500, 'idealFor', JSON_ARRAY('Brand activations', 'Product launches', 'Corporate events', 'Networking events', 'Workshops', 'Private gatherings', 'VIP experiences')),
    JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 250, 'minimumHours', 2, 'cleaningFee', 300, 'idealFor', JSON_ARRAY('Executive meetings', 'Team offsites', 'Investor presentations', 'Strategy sessions', 'Board meetings', 'Creative workshops'))
  )),
  metadata = JSON_OBJECT('frontendId', 'beige-hollywood-hills-estate', 'pricingMode', 'hourly', 'beds', 4, 'baths', 4, 'poolType', 'Estate', 'operatingHours', 'Available by booking', 'weeklySchedule', 'Available 7 days', 'size', '5,000+ Square Feet', 'rating', 5.0, 'reviews', 5, 'priceLabel', 'From $250/Hr')
WHERE slug = 'beige-hollywood-hills-estate';

UPDATE studios SET
  description = 'Located on the world-famous Sunset Boulevard in the heart of West Hollywood, Beige Studios West Hollywood Content Studio is a premium creator, podcast, and production space designed for brands, entrepreneurs, influencers, and modern media teams. Featuring floor-to-ceiling windows, abundant natural light, designer furnishings, and a sophisticated contemporary aesthetic, the studio provides a turnkey environment for content creation, executive meetings, podcast recordings, interviews, livestreams, and brand activations.',
  supported_shoot_types = JSON_ARRAY('Photography shoots', 'Video productions', 'Brand content', 'Social media content', 'Interviews', 'Creator sessions'),
  activities = JSON_ARRAY('Photography shoots', 'Video productions', 'Brand content', 'Social media content', 'Interviews', 'Creator sessions', 'Executive meetings', 'Team offsites', 'Investor presentations', 'Strategy sessions', 'Workshops', 'Client meetings', 'Podcasts', 'Executive Interviews', 'Thought Leadership Content', 'YouTube Shows', 'Founder Content', 'Panel Discussions', 'Corporate Video Content'),
  amenities = JSON_ARRAY('Prime Sunset Boulevard Location', 'West Hollywood Address', 'Floor-to-Ceiling Windows', 'Abundant Natural Light', 'Modern Designer Furnishings', 'Premium Podcast Studio Environment', '3-Camera Podcast Setup Available', 'Professional Lighting Available', 'Professional Audio Available', 'On-Site Beige Studio Operator Available', 'High-Speed WiFi', 'Central Air Conditioning & Heating', 'Elevator Access', 'Restroom Access', 'Meeting & Conference Space', 'Content Creator Friendly', 'Podcast Friendly', 'Production Friendly', 'Interview Friendly', 'Livestream Friendly', 'Brand Activation Friendly', 'Investor Meeting Friendly', 'Executive Offsite Friendly', 'Secure Building Access', 'Load-In / Load-Out Access'),
  description_tags = JSON_ARRAY('Prime Sunset Boulevard location', 'Located in the heart of West Hollywood', 'Floor-to-ceiling windows with abundant natural light', 'Modern luxury interiors and designer furnishings', 'Content creator and podcast friendly', 'Professional meeting and presentation environment', 'Turnkey space for brands, agencies, founders, and creators'),
  house_rules = JSON_ARRAY('No smoking, vaping, or illegal substances inside the studio or building.', 'No parties, nightclub-style events, or unauthorized gatherings.', 'No overnight use of the studio.', 'Guests must respect the building, neighboring tenants, and common areas.', 'Music must be kept at reasonable levels.', 'Guest count must not exceed the approved reservation capacity.', 'Setup and breakdown time must be included within the reservation.', 'No drilling, painting, nailing, stapling, or attaching anything to walls, windows, furniture, or ceilings.', 'Furniture must be returned to its original position before departure.', 'No confetti, glitter, powder, paint, fake snow, fog machines, smoke effects, pyrotechnics, or open flames.', 'No food or beverages near sensitive production equipment.'),
  pricing_settings = JSON_OBJECT('mode', 'hourly', 'priceLabel', 'From $150/Hr', 'priceValue', 150, 'options', JSON_ARRAY(
    JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 150, 'minimumHours', 2, 'startingAt', 300, 'idealFor', JSON_ARRAY('Photography shoots', 'Video productions', 'Brand content', 'Social media content', 'Interviews', 'Creator sessions')),
    JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 150, 'minimumHours', 2, 'startingAt', 300, 'idealFor', JSON_ARRAY('Executive meetings', 'Team offsites', 'Investor presentations', 'Strategy sessions', 'Workshops', 'Client meetings')),
    JSON_OBJECT('key', 'podcast_production', 'label', 'Turnkey Podcast & Production Package', 'hourlyRate', 375, 'minimumHours', 2, 'startingAt', 750, 'includes', JSON_ARRAY('3-Camera Professional Setup', 'Professional Lighting Package', 'Professional Audio Recording', 'Beige Studio Operator', 'On-Site Technical Support', 'Content Capture & Monitoring'), 'idealFor', JSON_ARRAY('Podcasts', 'Executive Interviews', 'Thought Leadership Content', 'YouTube Shows', 'Founder Content', 'Panel Discussions', 'Corporate Video Content'))
  )),
  metadata = JSON_OBJECT('frontendId', 'beige-west-hollywood-content-studio', 'pricingMode', 'hourly', 'beds', 0, 'baths', 1, 'poolType', 'Content Studio', 'operatingHours', 'Available by booking', 'weeklySchedule', 'Available 7 days', 'rating', 5.0, 'reviews', 7, 'priceLabel', 'From $150/Hr')
WHERE slug = 'beige-west-hollywood-content-studio';

UPDATE studios SET
  description = 'Escape the city without leaving Los Angeles. Beige Studios Woodland Hills Villa is a modern luxury content house designed for creators, brands, entrepreneurs, and production teams seeking a private, elevated environment for filming, meetings, and activations. Featuring warm contemporary interiors, abundant natural light, designer finishes, luxury lounge spaces, a private outdoor courtyard, and a curated production-friendly layout, the villa blends California comfort with premium content creation functionality.',
  supported_shoot_types = JSON_ARRAY('Photography shoots', 'Video productions', 'Podcasts', 'Interviews', 'Brand content', 'Social media content', 'Creator sessions'),
  activities = JSON_ARRAY('Content Creation', 'Brand Campaigns', 'Commercial Productions', 'Podcasts & Interviews', 'Executive Offsites', 'Investor Meetings', 'Wellness & Lifestyle Shoots', 'Product Launches', 'Luxury Automotive Content', 'Intimate Activations'),
  amenities = JSON_ARRAY('Natural Light Throughout Property', 'Private Villa Setting', 'Modern Luxury Interiors', 'Designer Kitchen', 'Open Concept Living Area', 'Private Outdoor Courtyard', 'Outdoor Lounge Seating', 'High-Speed WiFi', 'Central Air Conditioning & Heating', 'On-Site Parking', 'Street Parking Available', 'Power Access Throughout Property', 'Private Restroom Access', 'Production-Friendly Layout', 'Content Creator Friendly', 'Podcast Friendly', 'Meeting & Offsite Friendly', 'Brand Activation Friendly', 'Furniture & Decor Included', 'Luxury Lifestyle Aesthetic', 'Indoor & Outdoor Filming Areas', 'Load-In / Load-Out Access', 'Coffee Station', 'Catering Friendly', 'Executive Meeting Space', 'Investor Meeting Friendly', 'Photo & Video Production Friendly'),
  description_tags = JSON_ARRAY('Modern luxury villa aesthetic', 'Production-ready indoor and outdoor environments', 'Private courtyard and lounge areas', 'Natural light throughout the day', 'Designer kitchen and open-concept living spaces', 'Ideal backdrop for luxury, wellness, lifestyle, and business content', 'Convenient access to Calabasas, Hidden Hills, and Malibu'),
  house_rules = JSON_ARRAY('Minimum booking is 2 hours.', 'Respect neighbors and the surrounding community at all times.', 'No smoking, vaping, or illegal substances on the property.', 'No unauthorized gatherings, ticketed events, or parties.', 'All setup and breakdown time must be included in the reservation.', 'Furniture and decor must be returned to their original locations.', 'Guests are responsible for damage, excessive cleaning, and rule violations.'),
  pricing_settings = JSON_OBJECT('mode', 'hourly', 'priceLabel', 'From $150/Hr', 'priceValue', 150, 'options', JSON_ARRAY(
    JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 150, 'minimumHours', 2, 'cleaningFee', 200, 'idealFor', JSON_ARRAY('Photography shoots', 'Video productions', 'Podcasts', 'Interviews', 'Brand content', 'Social media content', 'Creator sessions')),
    JSON_OBJECT('key', 'activations_events', 'label', 'Activations & Events', 'hourlyRate', 350, 'minimumHours', 2, 'cleaningFee', 500, 'idealFor', JSON_ARRAY('Brand activations', 'Product launches', 'Networking events', 'Workshops', 'Private gatherings', 'Wellness experiences', 'Community events')),
    JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 150, 'minimumHours', 2, 'cleaningFee', 200, 'idealFor', JSON_ARRAY('Executive meetings', 'Team offsites', 'Strategy sessions', 'Investor meetings', 'Workshops', 'Creative planning sessions'))
  )),
  metadata = JSON_OBJECT('frontendId', 'beige-woodland-hills-villa', 'pricingMode', 'hourly', 'beds', 4, 'baths', 3, 'poolType', 'Villa', 'operatingHours', 'Available by booking', 'weeklySchedule', 'Available 7 days', 'rating', 5.0, 'reviews', 32, 'priceLabel', 'From $150/Hr')
WHERE slug = 'beige-woodland-hills-villa';

UPDATE studios SET
  description = 'Located on iconic Sunset Boulevard in the heart of West Hollywood, Beige Studios Morning Wellness Club Gym is a premium wellness, fitness, and performance space designed for content creators, fitness brands, athletes, coaches, and production teams. Featuring floor-to-ceiling windows, abundant natural light, state-of-the-art fitness equipment, luxury locker rooms, sauna access, recovery amenities, and a modern wellness-focused design, the space provides a unique backdrop for fitness productions, wellness content, brand campaigns, workshops, and private training experiences.',
  supported_shoot_types = JSON_ARRAY('Fitness content creation', 'Commercial productions', 'Brand campaigns', 'Athlete shoots', 'Wellness photography', 'Influencer content', 'Podcast and interview productions'),
  activities = JSON_ARRAY('Fitness Productions', 'Wellness Content Creation', 'Athletic Brand Campaigns', 'Commercial Productions', 'Product Launches', 'Corporate Wellness Events', 'Fitness Workshops', 'Health & Wellness Photography', 'Influencer Content', 'Athlete Training Content', 'Recovery Content', 'Team Offsites', 'Executive Meetings', 'Networking Events', 'Luxury Lifestyle Content'),
  amenities = JSON_ARRAY('Prime Sunset Boulevard Location', 'West Hollywood Address', 'Luxury Fitness & Wellness Facility', 'State-of-the-Art Gym Equipment', 'Functional Training Area', 'Strength Training Equipment', 'Cardio Equipment', 'Floor-to-Ceiling Windows', 'Abundant Natural Light', 'Premium Locker Rooms', 'Private Changing Rooms', 'Sauna Access', 'Luxury Showers', 'Restroom Access', 'Recovery & Wellness Environment', 'High-Speed WiFi', 'Central Air Conditioning & Heating', 'Elevator Access', 'On-Site Staff Available', 'Production-Friendly Layout', 'Content Creator Friendly', 'Fitness Content Friendly', 'Wellness Content Friendly', 'Podcast & Interview Friendly', 'Corporate Wellness Event Friendly', 'Load-In / Load-Out Access', 'Catering Friendly'),
  description_tags = JSON_ARRAY('Prime Sunset Boulevard location', 'Luxury fitness and wellness facility', 'Floor-to-ceiling windows with abundant natural light', 'Premium strength and conditioning equipment', 'Functional training space', 'Luxury locker rooms and changing facilities', 'Sauna access', 'Recovery-focused environment'),
  house_rules = JSON_ARRAY('No smoking, vaping, or illegal substances anywhere on the premises.', 'No parties, nightclub-style events, or unauthorized gatherings.', 'No alcohol consumption without prior written approval.', 'Equipment must be used as intended and with proper care.', 'Return all equipment, weights, benches, and accessories to their original locations after use.', 'Setup and breakdown time must be included within the reservation.', 'No drilling, painting, nailing, stapling, or attaching items to walls, mirrors, ceilings, floors, or equipment.', 'Sauna use is at your own risk.', 'Leave the facility in the same condition it was received.', 'Guest count may not exceed the approved reservation.', 'Bookings may be immediately terminated without refund for smoking violations, unauthorized parties, excessive noise, property damage, unsafe conduct, illegal activity, or facility-policy violations.'),
  pricing_settings = JSON_OBJECT('mode', 'hourly', 'priceLabel', 'From $500/Hr', 'priceValue', 500, 'options', JSON_ARRAY(
    JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 500, 'minimumHours', 2, 'cleaningFee', 250, 'startingAt', 1250, 'idealFor', JSON_ARRAY('Fitness content creation', 'Commercial productions', 'Brand campaigns', 'Athlete shoots', 'Wellness photography', 'Influencer content', 'Podcast and interview productions')),
    JSON_OBJECT('key', 'events_activations', 'label', 'Events & Activations', 'hourlyRate', 750, 'minimumHours', 4, 'cleaningFee', 500, 'startingAt', 3500, 'idealFor', JSON_ARRAY('Wellness events', 'Fitness workshops', 'Brand activations', 'Product launches', 'Networking events', 'Corporate wellness experiences', 'Community gatherings')),
    JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 500, 'minimumHours', 2, 'cleaningFee', 250, 'startingAt', 1250, 'idealFor', JSON_ARRAY('Executive meetings', 'Team offsites', 'Investor meetings', 'Strategy sessions', 'Wellness retreats', 'Leadership workshops'))
  )),
  metadata = JSON_OBJECT('frontendId', 'beige-west-hollywood-wellness-gym', 'pricingMode', 'hourly', 'beds', 0, 'baths', 1, 'poolType', 'Gym', 'operatingHours', '7 Days A Week 4pm-2am', 'weeklySchedule', '7 Days A Week 4pm-2am', 'rating', 5.0, 'reviews', 81, 'priceLabel', 'From $500/Hr')
WHERE slug = 'beige-west-hollywood-wellness-gym';

UPDATE studios SET
  description = 'Escape to a private desert retreat where luxury, creativity, and relaxation come together. Beige Studios Palm Springs Oasis is a resort-style estate designed for premium productions, brand campaigns, executive retreats, wellness experiences, and unforgettable content creation. Surrounded by towering palm trees, mountain views, and iconic Palm Springs architecture, the property features expansive outdoor living spaces, a stunning resort-style pool, designer interiors, multiple lounge areas, and seamless indoor-outdoor flow.',
  supported_shoot_types = JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Brand campaigns', 'Social media content', 'Influencer content', 'Product photography'),
  activities = JSON_ARRAY('Commercial Productions', 'Brand Campaigns', 'Luxury Lifestyle Photography', 'Influencer Content', 'Product Launches', 'Executive Retreats', 'Team Offsites', 'Wellness Retreats', 'Corporate Events', 'Social Media Content', 'Fashion Shoots', 'Swimwear & Resort Wear Campaigns', 'Podcast Recordings', 'Private Dinners', 'Networking Events'),
  amenities = JSON_ARRAY('Resort-Style Swimming Pool', 'Private Palm Springs Estate', 'Stunning Mountain Views', 'Palm Tree-Lined Grounds', 'Luxury Outdoor Lounge Areas', 'Outdoor Dining Area', 'Indoor-Outdoor Living Experience', 'Private Courtyards', 'Designer Interiors', 'Modern Desert Architecture', 'Abundant Natural Light', 'Multiple Content Creation Environments', 'Open Concept Living Spaces', 'Designer Kitchen', 'Multiple Bedrooms', 'Luxury Bathrooms', 'High-Speed WiFi', 'Central Air Conditioning & Heating', 'On-Site Parking', 'Street Parking Available', 'Private Gated Property', 'Power Access Throughout Property', 'Production-Friendly Layout', 'Content Creator Friendly', 'Influencer Friendly', 'Brand Activation Friendly', 'Event Friendly', 'Retreat Friendly', 'Meeting & Offsite Friendly', 'Podcast Friendly', 'Photography Friendly', 'Video Production Friendly', 'Furniture & Decor Included', 'Catering Friendly', 'Load-In / Load-Out Access'),
  description_tags = JSON_ARRAY('Resort-Style Desert Estate', 'Private Palm Springs Location', 'Expansive Swimming Pool', 'Stunning Mountain Views', 'Iconic Palm Tree-Lined Grounds', 'Indoor-Outdoor Living Experience', 'Luxury Outdoor Dining & Lounge Areas', 'Designer Interiors', 'Multiple Content Creation Environments', 'Golden Hour Friendly'),
  house_rules = JSON_ARRAY('No smoking, vaping, or illegal substances inside the home.', 'No house parties, raves, ticketed events, or unauthorized gatherings.', 'No overnight stays unless specifically approved in writing.', 'Guest count may not exceed the approved reservation.', 'Quiet hours are strictly enforced from 10:00 PM to 8:00 AM.', 'No amplified outdoor music after quiet hours.', 'No glass containers in or around the pool area.', 'Setup and breakdown time must be included within the reservation.', 'No drilling, painting, stapling, nailing, or attaching items to walls, floors, furniture, windows, or landscaping.', 'Drone operations must comply with all FAA regulations and local restrictions.', 'Park only in designated areas and do not block neighboring driveways, streets, gates, or emergency routes.', 'Guests are responsible for all food, beverage, and trash cleanup.', 'Bookings may be terminated without refund for unauthorized parties, excessive noise complaints, smoking violations, illegal activity, property damage, unauthorized guest counts, or Palm Springs city regulation violations.'),
  pricing_settings = JSON_OBJECT('mode', 'hourly', 'priceLabel', 'From $250/Hr', 'priceValue', 250, 'options', JSON_ARRAY(
    JSON_OBJECT('key', 'productions', 'label', 'Productions', 'hourlyRate', 250, 'minimumHours', 2, 'startingAt', 500, 'idealFor', JSON_ARRAY('Commercial productions', 'Photography shoots', 'Video productions', 'Brand campaigns', 'Social media content', 'Influencer content', 'Product photography')),
    JSON_OBJECT('key', 'activations_events', 'label', 'Activations & Events', 'hourlyRate', 500, 'minimumHours', 2, 'startingAt', 1000, 'idealFor', JSON_ARRAY('Brand activations', 'Product launches', 'Networking events', 'Private dinners', 'Corporate gatherings', 'Wellness experiences', 'Luxury experiences')),
    JSON_OBJECT('key', 'meetings_offsites', 'label', 'Meetings & Offsites', 'hourlyRate', 250, 'minimumHours', 2, 'startingAt', 500, 'idealFor', JSON_ARRAY('Executive meetings', 'Team offsites', 'Leadership retreats', 'Investor meetings', 'Strategy sessions', 'Workshops', 'Creative planning sessions'))
  )),
  metadata = JSON_OBJECT('frontendId', 'beige-palm-springs-oasis', 'pricingMode', 'hourly', 'beds', 4, 'baths', 4, 'poolType', 'Oasis', 'operatingHours', 'Available by booking', 'weeklySchedule', 'Available 7 days', 'rating', 5.0, 'reviews', 7, 'priceLabel', 'From $250/Hr')
WHERE slug = 'beige-palm-springs-oasis';

DELETE sm FROM studio_media sm
JOIN studios s ON s.studio_id = sm.studio_id
WHERE s.slug IN (
  'beige-hollywood-hills-estate',
  'beige-west-hollywood-content-studio',
  'beige-woodland-hills-villa',
  'beige-west-hollywood-wellness-gym',
  'beige-palm-springs-oasis'
)
AND sm.url LIKE 'https://d2jhn32fsulyac.cloudfront.net/assets/studio/%';

INSERT INTO studio_media (studio_id, media_type, url, thumbnail_url, title, alt_text, sort_order, is_cover, metadata)
SELECT s.studio_id, 'image', CONCAT('https://d2jhn32fsulyac.cloudfront.net/assets/studio/', image_path), NULL, s.studio_name, s.studio_name, ord - 1, IF(ord = 1, 1, 0), NULL
FROM studios s
CROSS JOIN (
  SELECT 1 AS ord, 'hollywood-hills/living-room-2.png' AS image_path
  UNION ALL SELECT 2, 'hollywood-hills/bathroom-1.png'
  UNION ALL SELECT 3, 'hollywood-hills/bedroom-2.png'
  UNION ALL SELECT 4, 'hollywood-hills/bedroom.PNG'
  UNION ALL SELECT 5, 'hollywood-hills/entry-foyer-1.png'
  UNION ALL SELECT 6, 'hollywood-hills/kitchen.png'
  UNION ALL SELECT 7, 'hollywood-hills/living+room.png'
  UNION ALL SELECT 8, 'hollywood-hills/living-room-3.png'
  UNION ALL SELECT 9, 'hollywood-hills/living-room-4.png'
  UNION ALL SELECT 10, 'hollywood-hills/loft+bedroom.png'
  UNION ALL SELECT 11, 'hollywood-hills/loft-view-1.png'
  UNION ALL SELECT 12, 'hollywood-hills/outdoor-lounge-1.png'
  UNION ALL SELECT 13, 'hollywood-hills/powder-room-1.png'
  UNION ALL SELECT 14, 'hollywood-hills/rooftop-firepit-2.png'
  UNION ALL SELECT 15, 'hollywood-hills/wellness-room-1.png'
) images
WHERE s.slug = 'beige-hollywood-hills-estate';

INSERT INTO studio_media (studio_id, media_type, url, thumbnail_url, title, alt_text, sort_order, is_cover, metadata)
SELECT s.studio_id, 'image', CONCAT('https://d2jhn32fsulyac.cloudfront.net/assets/studio/', image_path), NULL, s.studio_name, s.studio_name, ord - 1, IF(ord = 1, 1, 0), NULL
FROM studios s
CROSS JOIN (
  SELECT 1 AS ord, 'woodland-hills/IMG_4805.JPG' AS image_path
  UNION ALL SELECT 2, 'woodland-hills/301A5652.jpg'
  UNION ALL SELECT 3, 'woodland-hills/301A5653.jpg'
  UNION ALL SELECT 4, 'woodland-hills/301A5665.jpg'
  UNION ALL SELECT 5, 'woodland-hills/301A5994.jpg'
  UNION ALL SELECT 6, 'woodland-hills/Copy+of+IMG_4802.JPG'
  UNION ALL SELECT 7, 'woodland-hills/IMG_4793.JPG'
  UNION ALL SELECT 8, 'woodland-hills/IMG_4794.JPG'
  UNION ALL SELECT 9, 'woodland-hills/IMG_4795.JPG'
  UNION ALL SELECT 10, 'woodland-hills/IMG_4796.JPG'
  UNION ALL SELECT 11, 'woodland-hills/IMG_4797.JPG'
  UNION ALL SELECT 12, 'woodland-hills/IMG_4798.JPG'
  UNION ALL SELECT 13, 'woodland-hills/IMG_4800.JPG'
  UNION ALL SELECT 14, 'woodland-hills/IMG_4801.JPG'
  UNION ALL SELECT 15, 'woodland-hills/IMG_4802.JPG'
  UNION ALL SELECT 16, 'woodland-hills/IMG_4803.JPG'
  UNION ALL SELECT 17, 'woodland-hills/IMG_4804.JPG'
  UNION ALL SELECT 18, 'woodland-hills/IMG_4806.JPG'
  UNION ALL SELECT 19, 'woodland-hills/IMG_4807.JPG'
  UNION ALL SELECT 20, 'woodland-hills/IMG_4808.JPG'
  UNION ALL SELECT 21, 'woodland-hills/IMG_4812.WEBP'
  UNION ALL SELECT 22, 'woodland-hills/KAWSER-4.jpg'
  UNION ALL SELECT 23, 'woodland-hills/KAWSER-71.jpg'
  UNION ALL SELECT 24, 'woodland-hills/KAWSER-476+(1).jpg'
  UNION ALL SELECT 25, 'woodland-hills/KAWSER-541+(2).jpg'
  UNION ALL SELECT 26, 'woodland-hills/Photo+Dec+23+2025%2C+2+39+14+PM.jpg'
  UNION ALL SELECT 27, 'woodland-hills/Photo+Dec+23+2025%2C+2+41+09+PM.jpg'
  UNION ALL SELECT 28, 'woodland-hills/Photo+Dec+23+2025%2C+10+36+39+AM.jpg'
  UNION ALL SELECT 29, 'woodland-hills/Photo+Dec+23+2025%2C+10+46+04+AM.jpg'
  UNION ALL SELECT 30, 'woodland-hills/Photo+Dec+23+2025%2C+11+07+01+AM.jpg'
  UNION ALL SELECT 31, 'woodland-hills/Photo+Dec+23+2025%2C+11+58+50+AM.jpg'
  UNION ALL SELECT 32, 'woodland-hills/Photo+Dec+23+2025%2C+12+14+58+PM.jpg'
  UNION ALL SELECT 33, 'woodland-hills/Photo+Dec+23+2025%2C+12+36+32+PM.jpg'
) images
WHERE s.slug = 'beige-woodland-hills-villa';

INSERT INTO studio_media (studio_id, media_type, url, thumbnail_url, title, alt_text, sort_order, is_cover, metadata)
SELECT s.studio_id, 'image', CONCAT('https://d2jhn32fsulyac.cloudfront.net/assets/studio/', image_path), NULL, s.studio_name, s.studio_name, ord - 1, IF(ord = 1, 1, 0), NULL
FROM studios s
CROSS JOIN (
  SELECT 1 AS ord, 'weho-content/Weho+Studio-2.jpg' AS image_path
  UNION ALL SELECT 2, 'weho-content/Weho+Studio-1.jpg'
  UNION ALL SELECT 3, 'weho-content/Weho+Studio-3.jpg'
  UNION ALL SELECT 4, 'weho-content/Weho+Studio-4.jpg'
  UNION ALL SELECT 5, 'weho-content/Weho+Studio-5.jpg'
  UNION ALL SELECT 6, 'weho-content/Weho+Studio-6.jpg'
  UNION ALL SELECT 7, 'weho-content/Weho+Studio-7.jpg'
  UNION ALL SELECT 8, 'weho-content/Weho+Studio-8.jpg'
  UNION ALL SELECT 9, 'weho-content/Weho+Studio-9.jpg'
  UNION ALL SELECT 10, 'weho-content/Weho+Studio-10.jpg'
  UNION ALL SELECT 11, 'weho-content/Weho+Studio-11.jpg'
  UNION ALL SELECT 12, 'weho-content/Weho+Studio-12.jpg'
  UNION ALL SELECT 13, 'weho-content/Weho+Studio-13.jpg'
  UNION ALL SELECT 14, 'weho-content/Weho+Studio-14.jpg'
  UNION ALL SELECT 15, 'weho-content/Weho+Studio-15.jpg'
  UNION ALL SELECT 16, 'weho-content/Weho+Studio-16.jpg'
  UNION ALL SELECT 17, 'weho-content/Weho+Studio-17.jpg'
  UNION ALL SELECT 18, 'weho-content/Weho+Studio-18.jpg'
  UNION ALL SELECT 19, 'weho-content/Weho+Studio-19.jpg'
  UNION ALL SELECT 20, 'weho-content/Weho+Studio-20.jpg'
  UNION ALL SELECT 21, 'weho-content/Weho+Studio-21.jpg'
  UNION ALL SELECT 22, 'weho-content/Weho+Studio-22.jpg'
  UNION ALL SELECT 23, 'weho-content/Weho+Studio-23.jpg'
  UNION ALL SELECT 24, 'weho-content/Weho+Studio-24.jpg'
  UNION ALL SELECT 25, 'weho-content/Weho+Studio-25.jpg'
  UNION ALL SELECT 26, 'weho-content/Weho+Studio-26.jpg'
  UNION ALL SELECT 27, 'weho-content/Weho+Studio-27.jpg'
  UNION ALL SELECT 28, 'weho-content/Weho+Studio-28.jpg'
  UNION ALL SELECT 29, 'weho-content/Weho+Studio-29.jpg'
  UNION ALL SELECT 30, 'weho-content/Weho+Studio-30.jpg'
  UNION ALL SELECT 31, 'weho-content/Weho+Studio-31.jpg'
  UNION ALL SELECT 32, 'weho-content/Weho+Studio-32.jpg'
  UNION ALL SELECT 33, 'weho-content/Weho+Studio-33.jpg'
  UNION ALL SELECT 34, 'weho-content/Weho+Studio-34.jpg'
  UNION ALL SELECT 35, 'weho-content/Weho+Studio-35.jpg'
  UNION ALL SELECT 36, 'weho-content/Weho+Studio-36.jpg'
  UNION ALL SELECT 37, 'weho-content/Weho+Studio-37.jpg'
  UNION ALL SELECT 38, 'weho-content/Weho+Studio-38.jpg'
  UNION ALL SELECT 39, 'weho-content/Weho+Studio-39.jpg'
  UNION ALL SELECT 40, 'weho-content/Weho+Studio-40.jpg'
  UNION ALL SELECT 41, 'weho-content/Weho+Studio-41.jpg'
  UNION ALL SELECT 42, 'weho-content/Weho+Studio-42.jpg'
  UNION ALL SELECT 43, 'weho-content/Weho+Studio-43.jpg'
  UNION ALL SELECT 44, 'weho-content/Weho+Studio-44.jpg'
) images
WHERE s.slug = 'beige-west-hollywood-content-studio';

INSERT INTO studio_media (
    studio_id,
    media_type,
    url,
    thumbnail_url,
    title,
    alt_text,
    sort_order,
    is_cover,
    metadata
)
SELECT
    s.studio_id,
    'image',
    CONCAT('https://d2jhn32fsulyac.cloudfront.net/assets/studio/', i.image_path),
    NULL,
    s.studio_name,
    s.studio_name,
    i.ord - 1,
    IF(i.ord = 1, 1, 0),
    NULL
FROM studios s
CROSS JOIN (
    SELECT 1 AS ord, 'weho-gym/Copy+of+DSC00042.jpg' AS image_path
    UNION ALL
    SELECT 2, 'weho-gym/Copy+of+DSC00056.jpg'
    UNION ALL
    SELECT 3, 'weho-gym/Copy+of+IMG_1280.jpg'
    UNION ALL
    SELECT 4, 'weho-gym/Copy+of+IMG_7584.jpg'
    UNION ALL
    SELECT 5, 'weho-gym/Copy+of+IMG_7595.jpg'

    UNION ALL

    SELECT
        g.n + 5,
        CONCAT('weho-gym/MWC+Weho+Studio-', g.n, '.jpg')
    FROM (
        SELECT 1 AS n
        UNION ALL SELECT 2
        UNION ALL SELECT 3
        UNION ALL SELECT 4
        UNION ALL SELECT 5
        UNION ALL SELECT 6
        UNION ALL SELECT 7
        UNION ALL SELECT 8
        UNION ALL SELECT 9
        UNION ALL SELECT 10
        UNION ALL SELECT 11
        UNION ALL SELECT 12
        UNION ALL SELECT 13
        UNION ALL SELECT 14
        UNION ALL SELECT 15
        UNION ALL SELECT 16
        UNION ALL SELECT 17
        UNION ALL SELECT 18
        UNION ALL SELECT 19
        UNION ALL SELECT 20
        UNION ALL SELECT 21
        UNION ALL SELECT 22
        UNION ALL SELECT 23
        UNION ALL SELECT 24
        UNION ALL SELECT 25
        UNION ALL SELECT 26
        UNION ALL SELECT 27
        UNION ALL SELECT 28
        UNION ALL SELECT 29
        UNION ALL SELECT 30
        UNION ALL SELECT 31
        UNION ALL SELECT 32
        UNION ALL SELECT 33
        UNION ALL SELECT 34
        UNION ALL SELECT 35
        UNION ALL SELECT 36
        UNION ALL SELECT 37
        UNION ALL SELECT 38
        UNION ALL SELECT 39
        UNION ALL SELECT 40
        UNION ALL SELECT 41
        UNION ALL SELECT 42
        UNION ALL SELECT 43
        UNION ALL SELECT 44
        UNION ALL SELECT 45
        UNION ALL SELECT 46
        UNION ALL SELECT 47
        UNION ALL SELECT 48
        UNION ALL SELECT 49
        UNION ALL SELECT 50
        UNION ALL SELECT 51
        UNION ALL SELECT 52
        UNION ALL SELECT 53
        UNION ALL SELECT 54
        UNION ALL SELECT 55
        UNION ALL SELECT 56
        UNION ALL SELECT 57
        UNION ALL SELECT 58
        UNION ALL SELECT 59
        UNION ALL SELECT 60
        UNION ALL SELECT 61
        UNION ALL SELECT 62
        UNION ALL SELECT 63
        UNION ALL SELECT 64
        UNION ALL SELECT 65
        UNION ALL SELECT 66
        UNION ALL SELECT 67
        UNION ALL SELECT 68
        UNION ALL SELECT 69
        UNION ALL SELECT 70
        UNION ALL SELECT 71
        UNION ALL SELECT 72
        UNION ALL SELECT 73
        UNION ALL SELECT 74
        UNION ALL SELECT 75
        UNION ALL SELECT 76
        UNION ALL SELECT 77
    ) g
) i
WHERE s.slug = 'beige-west-hollywood-wellness-gym';

INSERT INTO studio_media (studio_id, media_type, url, thumbnail_url, title, alt_text, sort_order, is_cover, metadata)
SELECT s.studio_id, 'image', CONCAT('https://d2jhn32fsulyac.cloudfront.net/assets/studio/', image_path), NULL, s.studio_name, s.studio_name, ord - 1, IF(ord = 1, 1, 0), NULL
FROM studios s
CROSS JOIN (
  SELECT 1 AS ord, 'palm-springs/aim_media_group_high_v2-48.jpg' AS image_path
  UNION ALL SELECT 2, 'palm-springs/aim_media_group_high_v2-10.jpg'
  UNION ALL SELECT 3, 'palm-springs/aim_media_group_high_v2-11.jpg'
  UNION ALL SELECT 4, 'palm-springs/aim_media_group_high_v2-12.jpg'
  UNION ALL SELECT 5, 'palm-springs/aim_media_group_high_v2-13.jpg'
  UNION ALL SELECT 6, 'palm-springs/aim_media_group_high_v2-14.jpg'
  UNION ALL SELECT 7, 'palm-springs/aim_media_group_high_v2-16.jpg'
  UNION ALL SELECT 8, 'palm-springs/aim_media_group_high_v2-17.jpg'
  UNION ALL SELECT 9, 'palm-springs/aim_media_group_high_v2-18.jpg'
  UNION ALL SELECT 10, 'palm-springs/aim_media_group_high_v2-22.jpg'
  UNION ALL SELECT 11, 'palm-springs/aim_media_group_high_v2-29.jpg'
  UNION ALL SELECT 12, 'palm-springs/aim_media_group_high_v2-30.jpg'
  UNION ALL SELECT 13, 'palm-springs/aim_media_group_high_v2-32.jpg'
  UNION ALL SELECT 14, 'palm-springs/aim_media_group_high_v2-33.jpg'
  UNION ALL SELECT 15, 'palm-springs/aim_media_group_high_v2-35.jpg'
  UNION ALL SELECT 16, 'palm-springs/aim_media_group_high_v2-41.jpg'
  UNION ALL SELECT 17, 'palm-springs/aim_media_group_high_v2-42.jpg'
  UNION ALL SELECT 18, 'palm-springs/aim_media_group_high_v2-43.jpg'
  UNION ALL SELECT 19, 'palm-springs/aim_media_group_high_v2-44.jpg'
  UNION ALL SELECT 20, 'palm-springs/aim_media_group_high_v2-46.jpg'
  UNION ALL SELECT 21, 'palm-springs/aim_media_group_high_v2-47.jpg'
  UNION ALL SELECT 22, 'palm-springs/aim_media_group_high_v2-49.jpg'
  UNION ALL SELECT 23, 'palm-springs/aim_media_group_high_v2-50.jpg'
  UNION ALL SELECT 24, 'palm-springs/aim_media_group_high_v2-51.jpg'
  UNION ALL SELECT 25, 'palm-springs/aim_media_group_low_v2-44.jpg'
  UNION ALL SELECT 26, 'palm-springs/aim_media_group_low_v2-45.jpg'
  UNION ALL SELECT 27, 'palm-springs/aim_media_group_low_v2-46.jpg'
  UNION ALL SELECT 28, 'palm-springs/aim_media_group_low_v2-47.jpg'
  UNION ALL SELECT 29, 'palm-springs/aim_media_group_low_v2-48.jpg'
  UNION ALL SELECT 30, 'palm-springs/aim_media_group_low_v2-49.jpg'
  UNION ALL SELECT 31, 'palm-springs/aim_media_group_low_v2-50.jpg'
  UNION ALL SELECT 32, 'palm-springs/aim_media_group_low_v2-51.jpg'
  UNION ALL SELECT 33, 'palm-springs/aim_media_group_low-4.jpg'
  UNION ALL SELECT 34, 'palm-springs/aim_media_group_low-5.jpg'
  UNION ALL SELECT 35, 'palm-springs/aim_media_group_low-6.jpg'
  UNION ALL SELECT 36, 'palm-springs/aim_media_group_low-7.jpg'
  UNION ALL SELECT 37, 'palm-springs/aim_media_group_low-8.jpg'
  UNION ALL SELECT 38, 'palm-springs/aim_media_group_low-9.jpg'
  UNION ALL SELECT 39, 'palm-springs/aim_media_group_low-10.jpg'
  UNION ALL SELECT 40, 'palm-springs/aim_media_group_low-11.jpg'
  UNION ALL SELECT 41, 'palm-springs/aim_media_group_low-12.jpg'
  UNION ALL SELECT 42, 'palm-springs/aim_media_group_low-13.jpg'
  UNION ALL SELECT 43, 'palm-springs/aim_media_group_low-14.jpg'
  UNION ALL SELECT 44, 'palm-springs/aim_media_group_low-15.jpg'
  UNION ALL SELECT 45, 'palm-springs/aim_media_group_low-16.jpg'
  UNION ALL SELECT 46, 'palm-springs/aim_media_group_low-17.jpg'
  UNION ALL SELECT 47, 'palm-springs/aim_media_group_low-18.jpg'
  UNION ALL SELECT 48, 'palm-springs/aim_media_group_low-19.jpg'
  UNION ALL SELECT 49, 'palm-springs/aim_media_group_low-20.jpg'
  UNION ALL SELECT 50, 'palm-springs/aim_media_group_low-21.jpg'
  UNION ALL SELECT 51, 'palm-springs/aim_media_group_low-22.jpg'
  UNION ALL SELECT 52, 'palm-springs/aim_media_group_low-23.jpg'
  UNION ALL SELECT 53, 'palm-springs/aim_media_group_low-24.jpg'
  UNION ALL SELECT 54, 'palm-springs/aim_media_group_low-26.jpg'
  UNION ALL SELECT 55, 'palm-springs/aim_media_group_low-27.jpg'
  UNION ALL SELECT 56, 'palm-springs/aim_media_group_low-28.jpg'
  UNION ALL SELECT 57, 'palm-springs/aim_media_group_low-29.jpg'
  UNION ALL SELECT 58, 'palm-springs/aim_media_group_low-30.jpg'
  UNION ALL SELECT 59, 'palm-springs/aim_media_group_low-31.jpg'
  UNION ALL SELECT 60, 'palm-springs/aim_media_group_low-32.jpg'
  UNION ALL SELECT 61, 'palm-springs/aim_media_group_low-33.jpg'
  UNION ALL SELECT 62, 'palm-springs/aim_media_group_low-34.jpg'
  UNION ALL SELECT 63, 'palm-springs/aim_media_group_low-35.jpg'
  UNION ALL SELECT 64, 'palm-springs/aim_media_group_low-36.jpg'
  UNION ALL SELECT 65, 'palm-springs/aim_media_group_low-37.jpg'
  UNION ALL SELECT 66, 'palm-springs/aim_media_group_low-38.jpg'
  UNION ALL SELECT 67, 'palm-springs/aim_media_group_low-39.jpg'
  UNION ALL SELECT 68, 'palm-springs/aim_media_group_low-41.jpg'
  UNION ALL SELECT 69, 'palm-springs/aim_media_group_low-42.jpg'
) images
WHERE s.slug = 'beige-palm-springs-oasis';

DELETE soh FROM studio_operating_hours soh
JOIN studios s ON s.studio_id = soh.studio_id
WHERE s.slug IN (
  'beige-hollywood-hills-estate',
  'beige-west-hollywood-content-studio',
  'beige-woodland-hills-villa',
  'beige-west-hollywood-wellness-gym',
  'beige-palm-springs-oasis'
)
AND JSON_UNQUOTE(JSON_EXTRACT(soh.metadata, '$.label')) IN ('Available by booking', 'Available 7 days', '7 Days A Week 4pm-2am');

INSERT INTO studio_operating_hours (studio_id, day_of_week, is_open, opens_at, closes_at, metadata)
SELECT s.studio_id, days.day_of_week, 1, NULL, NULL, JSON_OBJECT('label', JSON_UNQUOTE(JSON_EXTRACT(s.metadata, '$.operatingHours')))
FROM studios s
CROSS JOIN (
  SELECT 0 AS day_of_week UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) days
WHERE s.slug IN (
  'beige-hollywood-hills-estate',
  'beige-west-hollywood-content-studio',
  'beige-woodland-hills-villa',
  'beige-west-hollywood-wellness-gym',
  'beige-palm-springs-oasis'
)
ON DUPLICATE KEY UPDATE
  is_open = VALUES(is_open),
  opens_at = VALUES(opens_at),
  closes_at = VALUES(closes_at),
  metadata = VALUES(metadata),
  updated_at = CURRENT_TIMESTAMP;

DELETE sr FROM studio_reviews sr
JOIN studios s ON s.studio_id = sr.studio_id
WHERE s.slug IN (
  'beige-hollywood-hills-estate',
  'beige-west-hollywood-content-studio',
  'beige-woodland-hills-villa',
  'beige-west-hollywood-wellness-gym',
  'beige-palm-springs-oasis'
)
AND sr.reviewer_name IN ('Mira', 'Shayna', 'Jose', 'Faiza', 'Vladko');

INSERT INTO studio_reviews (studio_id, reviewer_name, reviewer_avatar_url, rating, cleanliness_rating, communication_rating, check_in_rating, review_text, reviewed_at, is_active, metadata)
SELECT s.studio_id, reviews.reviewer_name, reviews.reviewer_avatar_url, reviews.rating, reviews.cleanliness_rating, reviews.communication_rating, reviews.check_in_rating, reviews.review_text, reviews.reviewed_at, 1, NULL
FROM studios s
CROSS JOIN (
  SELECT 'Mira' AS reviewer_name, '/images/crew/CREW(8).png' AS reviewer_avatar_url, 5.0 AS rating, 3.5 AS cleanliness_rating, 4.6 AS communication_rating, 4.5 AS check_in_rating, 'Host was very attentive.' AS review_text, '2021-12-01' AS reviewed_at
  UNION ALL SELECT 'Shayna', '/images/crew/CREW(9).png', 5.0, 3.5, 4.6, 4.5, 'Wonderful neighborhood, easy access to restaurants and the subway, cozy studio apartment with a super comfortable bed. Great host, super helpful and responsive. Cool murphy bed and extra amenities made the stay very smooth.', '2021-12-01'
  UNION ALL SELECT 'Jose', '/images/crew/CREW(10).png', 5.0, 3.5, 4.6, 4.5, 'Morbi id interdum velit. Fusce vel leo ut eros aliquam lacinia in sed dolor. Vestibulum maximus, orci quis maximus euismod, dui lorem sodales tellus, id aliquet nunc nisi non diam. Vestibulum nec mauris convallis, imperdiet tellus a, porta risus. Pellentesque pharetra velit vel mi luctus congue. Vivamus non tincidunt felis, vitae luctus libero.', '2020-11-01'
  UNION ALL SELECT 'Faiza', '/images/crew/CREW(2).png', 5.0, 3.5, 4.6, 4.5, 'This is amazing place. It has everything one needs for a monthly business stay. Very clean and organized place. Amazing hospitality affordable price.', '2020-11-01'
  UNION ALL SELECT 'Vladko', '/images/crew/CREW(3).png', 5.0, 3.5, 4.6, 4.5, 'This is amazing place. It has everything one needs for a monthly business stay. Very clean and organized place. Amazing hospitality affordable price.', '2020-11-01'
) reviews
WHERE s.slug IN (
  'beige-hollywood-hills-estate',
  'beige-west-hollywood-content-studio',
  'beige-woodland-hills-villa',
  'beige-west-hollywood-wellness-gym',
  'beige-palm-springs-oasis'
);

ALTER TABLE studio_bookings
ADD COLUMN guest_email VARCHAR(255) NULL AFTER user_id;

ALTER TABLE studio_bookings
ADD INDEX idx_studio_bookings_guest_email (guest_email);

UPDATE studio_bookings sb
JOIN stream_project_booking spb
  ON spb.stream_project_booking_id = sb.stream_project_booking_id
SET sb.guest_email = spb.guest_email
WHERE sb.guest_email IS NULL
  AND spb.guest_email IS NOT NULL;
ALTER TABLE `project_meetings`
  ADD COLUMN `google_calendar_event_id` VARCHAR(255) NULL AFTER `meet_link`,
  ADD COLUMN `google_calendar_id` VARCHAR(255) NULL DEFAULT 'primary' AFTER `google_calendar_event_id`;

ALTER TABLE studio_bookings
  MODIFY source ENUM('manual', 'book_a_shoot', 'create_new_deal') NOT NULL DEFAULT 'manual';
  

ALTER TABLE studio_bookings DROP FOREIGN KEY studio_bookings_ibfk_2;
ALTER TABLE studio_bookings MODIFY studio_id VARCHAR(255) NOT NULL;
ALTER TABLE studio_bookings ADD COLUMN time_zone VARCHAR(100) NULL AFTER duration_hours;

