-- Add more California-based creators for testing
-- Run this on the production database

INSERT INTO crew_members (first_name, last_name, email, phone_number, location, working_distance, primary_role, years_of_experience, hourly_rate, bio, availability, skills, certifications, equipment_ownership, is_beige_member, is_available, rating, is_draft, is_active, created_at, updated_at)
VALUES 
-- San Diego Creators
('Jordan', 'Blake', 'jordan.blake@example.com', '+1-619-555-1201', 'San Diego, CA', '40 miles', 1, 7, 145.00, 'Surf and outdoor videographer capturing the essence of San Diego lifestyle. Worked with brands like Billabong and Quicksilver.', 'Flexible', 'Action Sports, Lifestyle Video, Drone, Color Grading', 'FAA Part 107, Premiere Pro Certified', 'Sony FX3, DJI Mavic 3 Pro, Full audio kit', 1, 1, 4.8, 0, 1, NOW(), NOW()),

('Mia', 'Santos', 'mia.santos@example.com', '+1-619-555-1202', 'San Diego, CA', '35 miles', 2, 5, 120.00, 'Beach and lifestyle photographer with a passion for golden hour portraits and brand photography.', 'Weekends preferred', 'Beach Photography, Portraits, Brand Content, Lifestyle', 'PPA Certified', 'Canon R6, Prime lenses, Reflector kit', 1, 1, 4.7, 0, 1, NOW(), NOW()),

-- Orange County Creators  
('Ethan', 'Morris', 'ethan.morris@example.com', '+1-949-555-1301', 'Irvine, CA', '30 miles', 1, 9, 165.00, 'Commercial videographer specializing in real estate and luxury brand content. Featured work for top OC agencies.', 'Weekdays', 'Real Estate Video, Commercial, Drone, Motion Graphics', 'FAA Part 107, RED Certified Operator', 'RED Komodo, Complete gimbal setup, Drone fleet', 1, 1, 4.9, 0, 1, NOW(), NOW()),

('Sophia', 'Lee', 'sophia.lee@example.com', '+1-714-555-1302', 'Anaheim, CA', '40 miles', 2, 6, 130.00, 'Event and portrait photographer covering weddings, corporate events, and family sessions throughout Southern California.', 'Flexible', 'Event Photography, Weddings, Portraits, Corporate', 'WPPI Award Winner', 'Sony A7IV, Flash system, Backdrop kit', 0, 1, 4.6, 0, 1, NOW(), NOW()),

-- Hollywood/LA Area Additional
('Nathan', 'Cooper', 'nathan.cooper@example.com', '+1-323-555-1401', 'Hollywood, CA', '25 miles', 1, 12, 200.00, 'Award-winning music video director with credits on MTV and BET. Worked with Grammy-nominated artists.', 'Project-based', 'Music Videos, Creative Direction, Narrative, Performance', 'IATSE Local 600 Member', 'ARRI Alexa Mini, Anamorphic lenses, Full grip equipment', 1, 1, 5.0, 0, 1, NOW(), NOW()),

('Chloe', 'Martinez', 'chloe.martinez@example.com', '+1-818-555-1402', 'Burbank, CA', '30 miles', 2, 8, 140.00, 'Studio and headshot photographer working with actors and models in the entertainment industry.', 'Weekdays and weekends', 'Headshots, Fashion, Studio, Editorial', 'LA Photo Festival Winner', 'Phase One, Profoto lighting, Full studio', 1, 1, 4.8, 0, 1, NOW(), NOW()),

-- Sacramento Area
('Ryan', 'Hughes', 'ryan.hughes@example.com', '+1-916-555-1501', 'Sacramento, CA', '50 miles', 1, 5, 110.00, 'Political and corporate videographer covering events, campaigns, and interviews in the capital region.', 'Flexible', 'Corporate Video, Political Content, Interviews, Live Streaming', 'Adobe Certified', 'Sony FX6, Teleprompter, Complete audio kit', 0, 1, 4.5, 0, 1, NOW(), NOW()),

-- Bay Area Additional
('Emma', 'Wilson', 'emma.wilson@example.com', '+1-510-555-1601', 'Oakland, CA', '30 miles', 2, 7, 145.00, 'Documentary and street photographer capturing urban life and social movements in the Bay Area.', 'Flexible', 'Documentary, Street Photography, Editorial, Portraits', 'Pulitzer Center Grantee', 'Leica Q3, Fuji X-T5, Compact lighting', 1, 1, 4.9, 0, 1, NOW(), NOW()),

('Daniel', 'Kim', 'daniel.kim@example.com', '+1-408-555-1602', 'San Jose, CA', '40 miles', 1, 8, 160.00, 'Tech startup videographer creating product demos, explainer videos, and company culture content for Silicon Valley companies.', 'Weekdays', 'Product Videos, Tech Content, Corporate, Animation', 'Apple Certified Pro', 'Canon C70, Motion control rig, Green screen setup', 1, 1, 4.7, 0, 1, NOW(), NOW()),

-- Calabasas/LA Nearby
('Olivia', 'Wright', 'olivia.wright@example.com', '+1-818-555-1701', 'Calabasas, CA', '35 miles', 2, 6, 150.00, 'Luxury lifestyle photographer specializing in high-end real estate, celebrity portraits, and fashion content.', 'By appointment', 'Luxury Lifestyle, Real Estate, Portraits, Fashion', 'Architectural Photography Award', 'Hasselblad X2D, Tilt-shift lenses, Complete lighting', 1, 1, 4.8, 0, 1, NOW(), NOW()),

('Lucas', 'Adams', 'lucas.adams@example.com', '+1-805-555-1702', 'Thousand Oaks, CA', '45 miles', 1, 10, 175.00, 'Commercial and documentary cinematographer with extensive experience in both studio and field productions.', 'Project-based', 'Commercial, Documentary, Cinematography, Color Science', 'ASC Associate, DaVinci Resolve Master', 'RED V-Raptor, Full cinema rig, Lighting package', 1, 1, 4.9, 0, 1, NOW(), NOW()),

-- Pasadena/East LA
('Isabella', 'Brown', 'isabella.brown@example.com', '+1-626-555-1801', 'Pasadena, CA', '25 miles', 2, 4, 100.00, 'Emerging photographer specializing in product and lifestyle photography for small businesses and startups.', 'Flexible', 'Product Photography, Lifestyle, E-commerce, Social Media', 'Photography Degree - Art Center', 'Sony A7C, Prime lenses, Compact studio kit', 0, 1, 4.4, 0, 1, NOW(), NOW());

-- Also add some with cinematographer role (role_id = 3)
INSERT INTO crew_members (first_name, last_name, email, phone_number, location, working_distance, primary_role, years_of_experience, hourly_rate, bio, availability, skills, certifications, equipment_ownership, is_beige_member, is_available, rating, is_draft, is_active, created_at, updated_at)
VALUES 
('James', 'Harrison', 'james.harrison@example.com', '+1-310-555-1901', 'Venice Beach, CA', '30 miles', 3, 15, 250.00, 'Award-winning cinematographer with feature film and commercial credits. Known for distinctive visual storytelling.', 'Project-based', 'Cinematography, Lighting, Camera Operation, Visual Storytelling', 'ASC Full Member, Oscar Nominee', 'ARRI Alexa 35, Full cinema glass, Complete grip package', 1, 1, 5.0, 0, 1, NOW(), NOW()),

('Ava', 'Mitchell', 'ava.mitchell@example.com', '+1-323-555-1902', 'Silver Lake, CA', '20 miles', 3, 8, 180.00, 'Independent film cinematographer with Sundance and SXSW credits. Specializing in naturalistic lighting.', 'Project-based', 'Independent Film, Documentary, Natural Lighting, Handheld', 'Sundance Fellow', 'Sony Venice 2, Vintage lenses, Portable lighting', 1, 1, 4.9, 0, 1, NOW(), NOW()),

('William', 'Garcia', 'william.garcia@example.com', '+1-213-555-1903', 'Downtown LA, CA', '25 miles', 3, 11, 195.00, 'Music video and commercial cinematographer with major label credits and national ad campaigns.', 'Flexible', 'Music Videos, Commercials, Creative Cinematography, Color', 'Multiple MTV VMA Nominations', 'RED V-Raptor XL, Anamorphic collection, LED volumes', 1, 1, 4.8, 0, 1, NOW(), NOW());

