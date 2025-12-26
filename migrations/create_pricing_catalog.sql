-- =====================================================
-- Pricing Catalog System Migration
-- Creates tables for comprehensive pricing management
-- =====================================================

-- =====================================================
-- 1. PRICING CATEGORIES
-- Organizes pricing items into logical groups
-- =====================================================
CREATE TABLE IF NOT EXISTS pricing_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. PRICING ITEMS
-- Individual service/product items with rates
-- =====================================================
CREATE TABLE IF NOT EXISTS pricing_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    pricing_mode ENUM('general', 'wedding', 'both') NOT NULL DEFAULT 'both',
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    rate DECIMAL(10,2) NOT NULL,
    rate_type ENUM('flat', 'per_hour', 'per_day', 'per_unit') NOT NULL DEFAULT 'flat',
    rate_unit VARCHAR(50) DEFAULT NULL COMMENT 'e.g., "per video", "per hour", "25 photos"',
    description TEXT,
    min_quantity INT DEFAULT 0,
    max_quantity INT DEFAULT NULL,
    display_order INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES pricing_categories(category_id) ON DELETE RESTRICT,
    UNIQUE KEY unique_item_slug (slug, pricing_mode)
);

-- Index for faster lookups
CREATE INDEX idx_pricing_items_category ON pricing_items(category_id);
CREATE INDEX idx_pricing_items_mode ON pricing_items(pricing_mode);
CREATE INDEX idx_pricing_items_active ON pricing_items(is_active);

-- =====================================================
-- 3. PRICING DISCOUNT TIERS
-- Hours-based discount percentages
-- =====================================================
CREATE TABLE IF NOT EXISTS pricing_discount_tiers (
    tier_id INT AUTO_INCREMENT PRIMARY KEY,
    pricing_mode ENUM('general', 'wedding') NOT NULL DEFAULT 'general',
    min_hours DECIMAL(4,1) NOT NULL,
    max_hours DECIMAL(4,1) DEFAULT NULL COMMENT 'NULL means unlimited',
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_tier (pricing_mode, min_hours)
);

-- =====================================================
-- 4. QUOTES
-- Saved pricing quotes for bookings
-- =====================================================
CREATE TABLE IF NOT EXISTS quotes (
    quote_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT DEFAULT NULL COMMENT 'FK to stream_project_booking if linked',
    user_id INT DEFAULT NULL,
    guest_email VARCHAR(255) DEFAULT NULL,
    pricing_mode ENUM('general', 'wedding') NOT NULL DEFAULT 'general',
    shoot_hours DECIMAL(4,1) NOT NULL DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_after_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
    margin_percent DECIMAL(5,2) NOT NULL DEFAULT 25.00,
    margin_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status ENUM('draft', 'pending', 'confirmed', 'expired', 'cancelled') NOT NULL DEFAULT 'draft',
    expires_at TIMESTAMP NULL DEFAULT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_quotes_booking (booking_id),
    INDEX idx_quotes_user (user_id),
    INDEX idx_quotes_status (status)
);

-- =====================================================
-- 5. QUOTE LINE ITEMS
-- Individual items selected for a quote
-- =====================================================
CREATE TABLE IF NOT EXISTS quote_line_items (
    line_item_id INT AUTO_INCREMENT PRIMARY KEY,
    quote_id INT NOT NULL,
    item_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL COMMENT 'Snapshot of item name at quote time',
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL COMMENT 'Snapshot of rate at quote time',
    line_total DECIMAL(10,2) NOT NULL,
    notes VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quote_id) REFERENCES quotes(quote_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES pricing_items(item_id) ON DELETE RESTRICT,
    INDEX idx_line_items_quote (quote_id)
);

-- =====================================================
-- SEED DATA: Categories
-- =====================================================
INSERT INTO pricing_categories (name, slug, description, display_order) VALUES
('Pre-Production', 'pre-production', 'Pre-production planning services by project type', 1),
('Services', 'services', 'Core professional services (photographer, videographer, cinematographer)', 2),
('Editing', 'editing', 'Video and photo editing services', 3),
('Crew & Labor', 'crew-labor', 'Additional crew members and labor services', 4),
('Equipment Add-Ons', 'equipment-addons', 'Additional equipment rentals', 5),
('Artist', 'artist', 'Talent and artist services (actors, dancers, makeup, hair)', 6),
('Livestream Services', 'livestream', 'Live streaming services', 7),
('Editing & Post-Production', 'post-production', 'Rush editing and post-production add-ons', 8),
('Studios & Backgrounds', 'studios', 'Studio space and backdrop rentals', 9),
('Scripting', 'scripting', 'Script writing services', 10),
('Travel', 'travel', 'Travel fees', 11);

-- =====================================================
-- SEED DATA: General Pricing Discount Tiers
-- =====================================================
INSERT INTO pricing_discount_tiers (pricing_mode, min_hours, max_hours, discount_percent) VALUES
('general', 0, 0.5, 0),
('general', 0.5, 1, 0),
('general', 1, 1.5, 5),
('general', 1.5, 2, 10),
('general', 2, 2.5, 15),
('general', 2.5, 3, 20),
('general', 3, NULL, 25);

-- =====================================================
-- SEED DATA: Wedding Pricing Discount Tiers
-- =====================================================
INSERT INTO pricing_discount_tiers (pricing_mode, min_hours, max_hours, discount_percent) VALUES
('wedding', 0, 0.5, 0),
('wedding', 0.5, 1, 0),
('wedding', 1, 1.5, 5),
('wedding', 1.5, 2, 10),
('wedding', 2, 2.5, 15),
('wedding', 2.5, 3, 20),
('wedding', 3, 3.5, 25),
('wedding', 3.5, NULL, 30);

-- =====================================================
-- SEED DATA: Pre-Production Items (General)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Music Video', 'pre-prod-music-video', 550.00, 'flat', NULL, 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Commercial', 'pre-prod-commercial', 550.00, 'flat', NULL, 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - TV Series', 'pre-prod-tv-series', 550.00, 'flat', NULL, 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Podcast', 'pre-prod-podcast', 550.00, 'flat', NULL, 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Short Film', 'pre-prod-short-film', 550.00, 'flat', NULL, 5),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Movies', 'pre-prod-movies', 550.00, 'flat', NULL, 6),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Corporate Event', 'pre-prod-corporate-event', 550.00, 'flat', NULL, 7),
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'general', 'Pre-production - Private Event', 'pre-prod-private-event', 275.00, 'flat', NULL, 8);

-- Pre-Production Items (Wedding)
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'pre-production'), 'wedding', 'Pre-production - Weddings', 'pre-prod-weddings', 275.00, 'flat', NULL, 1);

-- =====================================================
-- SEED DATA: Services Items (Both modes)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'services'), 'both', 'Photographer', 'photographer', 275.00, 'per_hour', 'per hour', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'services'), 'both', 'Videographer', 'videographer', 275.00, 'per_hour', 'per hour', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'services'), 'both', 'Cinematographer', 'cinematographer', 410.00, 'per_hour', 'per hour', 3);

-- =====================================================
-- SEED DATA: Editing Items (General)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Music Video – Basic', 'edit-music-video-basic', 550.00, 'flat', 'per video', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Music Video – Complex', 'edit-music-video-complex', 1100.00, 'flat', 'per video', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Highlight Video (4–7 minutes)', 'edit-highlight-video', 385.00, 'flat', 'per video', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Feature Video (10–20 minutes)', 'edit-feature-video', 550.00, 'flat', 'per video', 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Full Feature Video (20–40 minutes)', 'edit-full-feature-video', 550.00, 'flat', 'per video', 5),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Reel (30–60 seconds)', 'edit-reel', 275.00, 'flat', 'per video', 6),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Commercial – Basic', 'edit-commercial-basic', 550.00, 'flat', 'per video', 7),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Commercial – Complex', 'edit-commercial-complex', 1100.00, 'flat', 'per video', 8),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Podcast – Full Episode', 'edit-podcast-full', 385.00, 'flat', 'per episode', 9),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Podcast – Short Reel', 'edit-podcast-reel', 275.00, 'flat', 'per reel', 10),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', '2D Animations – Basic', 'edit-2d-animation-basic', 550.00, 'flat', 'per video', 11),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', '2D Animations – Complex', 'edit-2d-animation-complex', 1100.00, 'flat', 'per video', 12),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Special Effects – Basic (included in package)', 'edit-sfx-basic', 0.00, 'flat', 'included', 13),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Special Effects – Complex', 'edit-sfx-complex', 550.00, 'flat', 'per video', 14),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Voiceover (under 2 minutes)', 'edit-voiceover-short', 550.00, 'flat', NULL, 15),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Voiceover (over 2 minutes / up to 15 minutes)', 'edit-voiceover-long', 1100.00, 'flat', NULL, 16),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Short Film (5 minutes or less)', 'edit-short-film-small', 1650.00, 'flat', 'per film', 17),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Short Film (more than 5 minutes / up to 10 minutes)', 'edit-short-film-large', 2750.00, 'flat', 'per film', 18),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Movie (30 minutes or less)', 'edit-movie-base', 3850.00, 'flat', 'per movie', 19),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Movie (every additional 10 minutes – after first 30 minutes)', 'edit-movie-additional', 1100.00, 'per_unit', 'per 10 min', 20),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'TV Series (per episode) – 30 minutes or less', 'edit-tv-episode-base', 3850.00, 'flat', 'per episode', 21),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'TV Series (per episode) – every additional 10 minutes – after first 30 minutes', 'edit-tv-episode-additional', 1100.00, 'per_unit', 'per 10 min', 22),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Extra Edited Photos (25 photos)', 'edit-extra-photos', 275.00, 'flat', '25 photos', 23),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Subtitles', 'edit-subtitles', 385.00, 'flat', 'per video', 24),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'general', 'Translation (per language) – Subtitles', 'edit-translation', 385.00, 'per_unit', 'per language', 25);

-- Editing Items (Wedding)
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Highlight Video (4–7 minutes)', 'wedding-edit-highlight', 385.00, 'flat', 'per video', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Feature Video (10–20 minutes)', 'wedding-edit-feature', 550.00, 'flat', 'per video', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Full Feature Video (30–40 minutes)', 'wedding-edit-full-feature', 550.00, 'flat', 'per video', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Reel (10–60 seconds)', 'wedding-edit-reel', 275.00, 'flat', 'per video', 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Extra Edited Photos (25 photos)', 'wedding-edit-extra-photos', 275.00, 'flat', '25 photos', 5),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Subtitles', 'wedding-edit-subtitles', 385.00, 'flat', 'per video', 6),
((SELECT category_id FROM pricing_categories WHERE slug = 'editing'), 'wedding', 'Translation (per language) – Subtitles', 'wedding-edit-translation', 385.00, 'per_unit', 'per language', 7);

-- =====================================================
-- SEED DATA: Crew & Labor Items (General only)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'crew-labor'), 'general', 'Production Assistant (per hour)', 'crew-production-assistant', 220.00, 'per_hour', 'per hour', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'crew-labor'), 'general', 'Sound Engineer (per hour)', 'crew-sound-engineer', 275.00, 'per_hour', 'per hour', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'crew-labor'), 'general', 'Director (per hour)', 'crew-director', 275.00, 'per_hour', 'per hour', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'crew-labor'), 'general', 'Gaffer – Lighting Technician (per hour)', 'crew-gaffer', 275.00, 'per_hour', 'per hour', 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'crew-labor'), 'general', 'Onsite Editor (full day)', 'crew-onsite-editor', 1100.00, 'per_day', 'full day', 5);

-- =====================================================
-- SEED DATA: Equipment Add-Ons Items
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'both', 'Additional Camera (flat rate)', 'equip-additional-camera', 385.00, 'flat', NULL, 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'both', 'Teleprompter', 'equip-teleprompter', 275.00, 'flat', NULL, 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'general', 'Drone – Corporate', 'equip-drone-corporate', 1100.00, 'flat', NULL, 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'both', 'Drone – Non-Corporate', 'equip-drone-non-corporate', 550.00, 'flat', NULL, 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'both', 'Additional Lavalier Microphones (per mic)', 'equip-lav-mic', 275.00, 'per_unit', 'per mic', 5),
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'both', 'Additional Lights', 'equip-additional-lights', 385.00, 'flat', NULL, 6),
((SELECT category_id FROM pricing_categories WHERE slug = 'equipment-addons'), 'both', 'Hard Drive (flat rate)', 'equip-hard-drive', 550.00, 'flat', NULL, 7);

-- =====================================================
-- SEED DATA: Artist Items (Both modes)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Actor (4 hours or less)', 'artist-actor-short', 385.00, 'flat', 'up to 4 hours', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Actor (5–8 hours)', 'artist-actor-long', 770.00, 'flat', '5-8 hours', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Dancer (4 hours or less)', 'artist-dancer-short', 385.00, 'flat', 'up to 4 hours', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Dancer (5–8 hours)', 'artist-dancer-long', 770.00, 'flat', '5-8 hours', 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Makeup Artist (up to 4 hours)', 'artist-makeup-short', 1100.00, 'flat', 'up to 4 hours', 5),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Makeup Artist (5–8 hours)', 'artist-makeup-long', 2200.00, 'flat', '5-8 hours', 6),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Hair Stylist (up to 4 hours)', 'artist-hair-short', 1100.00, 'flat', 'up to 4 hours', 7),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Hair Stylist (5–8 hours)', 'artist-hair-long', 2200.00, 'flat', '5-8 hours', 8),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Hair + Makeup (one person doing both) – up to 4 hours', 'artist-hair-makeup-short', 1650.00, 'flat', 'up to 4 hours', 9),
((SELECT category_id FROM pricing_categories WHERE slug = 'artist'), 'both', 'Hair + Makeup (one person doing both) – 5 to 8 hours', 'artist-hair-makeup-long', 3300.00, 'flat', '5-8 hours', 10);

-- =====================================================
-- SEED DATA: Livestream Services Items (Both modes)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'livestream'), 'both', 'Livestream – iPhone (first hour)', 'livestream-iphone-first', 1100.00, 'flat', 'first hour', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'livestream'), 'both', 'Livestream – iPhone (additional hour)', 'livestream-iphone-additional', 275.00, 'per_hour', 'additional hour', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'livestream'), 'both', 'Livestream – 4K Camera (first hour)', 'livestream-4k-first', 1650.00, 'flat', 'first hour', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'livestream'), 'both', 'Livestream – 4K Camera (additional hour)', 'livestream-4k-additional', 550.00, 'per_hour', 'additional hour', 4);

-- =====================================================
-- SEED DATA: Editing & Post-Production Items (Both modes)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'post-production'), 'both', 'Same-Day Editing (per video)', 'post-same-day', 1100.00, 'flat', 'per video', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'post-production'), 'both', 'Next-Day Editing (per video)', 'post-next-day', 825.00, 'flat', 'per video', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'post-production'), 'both', 'Expedited Editing – 1 Week (per video)', 'post-expedited', 550.00, 'flat', 'per video', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'post-production'), 'both', 'Additional Revisions (Editing)', 'post-revisions', 275.00, 'per_unit', 'per revision', 4),
((SELECT category_id FROM pricing_categories WHERE slug = 'post-production'), 'both', 'Photo Album', 'post-photo-album', 550.00, 'flat', NULL, 5),
((SELECT category_id FROM pricing_categories WHERE slug = 'post-production'), 'wedding', 'Onsite Editor (full day)', 'wedding-onsite-editor', 1100.00, 'per_day', 'full day', 6);

-- =====================================================
-- SEED DATA: Studios & Backgrounds Items (General only)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'studios'), 'general', 'Green Screen (flat rate per screen)', 'studio-green-screen', 550.00, 'flat', 'per screen', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'studios'), 'general', 'Backdrop (flat rate per backdrop)', 'studio-backdrop', 550.00, 'flat', 'per backdrop', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'studios'), 'general', 'Photo Studio Reservation – Basic (per hour)', 'studio-photo-basic', 440.00, 'per_hour', 'per hour', 3),
((SELECT category_id FROM pricing_categories WHERE slug = 'studios'), 'general', 'Video Studio Reservation – Advanced (per hour)', 'studio-video-advanced', 440.00, 'per_hour', 'per hour', 4);

-- =====================================================
-- SEED DATA: Scripting Items (General only)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'scripting'), 'general', 'Script (0–10 minutes)', 'script-short', 550.00, 'flat', '0-10 min', 1),
((SELECT category_id FROM pricing_categories WHERE slug = 'scripting'), 'general', 'Script (10–29 minutes)', 'script-medium', 825.00, 'flat', '10-29 min', 2),
((SELECT category_id FROM pricing_categories WHERE slug = 'scripting'), 'general', 'Script (30 minutes – 1 hour)', 'script-long', 1100.00, 'flat', '30-60 min', 3);

-- =====================================================
-- SEED DATA: Travel Items (Both modes)
-- =====================================================
INSERT INTO pricing_items (category_id, pricing_mode, name, slug, rate, rate_type, rate_unit, display_order) VALUES
((SELECT category_id FROM pricing_categories WHERE slug = 'travel'), 'both', 'Travel', 'travel-fee', 275.00, 'flat', 'flat rate', 1);

