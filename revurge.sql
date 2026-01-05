--19-12-25

ALTER TABLE equipment_category ADD COLUMN category_name VARCHAR(150) NOT NULL AFTER name, ADD COLUMN description TEXT NULL AFTER category_name;

ALTER TABLE equipment ADD COLUMN brand VARCHAR(100) NULL AFTER manufacturer;

ALTER TABLE equipment
ADD COLUMN rental_price_per_hour DECIMAL(10,2) NULL AFTER daily_rental_rate,
ADD COLUMN availability_status ENUM('available', 'unavailable', 'maintenance', 'rented') NULL DEFAULT 'available' AFTER rental_price_per_hour,
ADD COLUMN condition_status VARCHAR(50) NULL AFTER availability_status;

--05-01-26

ALTER TABLE skills_master ADD COLUMN sub_skills TEXT NULL AFTER name;
ALTER TABLE crew_members MODIFY COLUMN primary_role TEXT NULL;


INSERT INTO `skills_master` (`id`, `name`, `sub_skills`, `is_active`, `created_at`) VALUES (NULL, 'Corporate Event', 'Conferences, summits, company offsites', '1', current_timestamp()), (NULL, 'Weddings', 'Ceremony, reception, highlight films', '1', current_timestamp());
INSERT INTO `skills_master` (`id`, `name`, `sub_skills`, `is_active`, `created_at`) VALUES (NULL, 'Private Events', 'Parties, birthdays, celebrations', '1', current_timestamp()), (NULL, 'Commercial & Advertising', 'Brand ads, promos, campaigns', '1', current_timestamp()), (NULL, 'Social Content', 'Reels, TikToks, YouTube', '1', current_timestamp()), (NULL, 'Podcasts & Shows', 'Video podcasts, livestreams', '1', current_timestamp()), (NULL, 'Music Videos', 'Artist-led productions', '1', current_timestamp()), (NULL, 'Short Films & Narrative', 'Scripted, cinematic stories', '1', current_timestamp()), (NULL, 'Brand & Product', 'Products, lifestyle, e-commerce', '1', current_timestamp()), (NULL, 'People & Teams', 'Headshots and portraits', '1', current_timestamp()), (NULL, 'Behind-the-Scenes', 'Candid, production moments', '1', current_timestamp());
INSERT INTO `skills_master` (`id`, `name`, `sub_skills`, `is_active`, `created_at`) VALUES (NULL, 'Corporate Event Video Editor', ' Conferences, summits, company offsites', '1', current_timestamp()), (NULL, 'Wedding Video Editor', 'Ceremony, reception, highlight films', '1', current_timestamp()), (NULL, 'Private Event Video Editor', 'Parties, birthdays, celebrations', '1', current_timestamp()), (NULL, 'Commercial & Advertising  Video Editor', 'Brand ads, promos, campaigns', '1', current_timestamp()), (NULL, 'Social Content  Video Editor', 'Reels, TikToks, YouTube', '1', current_timestamp()), (NULL, 'Podcasts & Shows Video Editor', 'Video podcasts, livestreams', '1', current_timestamp()), (NULL, 'Music Videos Video Editor', 'Artist-led productions', '1', current_timestamp()), (NULL, 'Short Films & Narrative Video Editor', 'Scripted, cinematic stories', '1', current_timestamp()), (NULL, 'Corporate Events Photo Editor', 'Conferences, company gatherings', '1', current_timestamp()), (NULL, 'Weddings Photo Editor', 'Ceremony and reception', '1', current_timestamp()), (NULL, 'Private Events Photo Editor', 'Parties, celebrations', '1', current_timestamp()), (NULL, 'Brand & Product Photo Editor', 'Products, lifestyle, e-commerce', '1', current_timestamp()), (NULL, 'Social Content Photo Editor', 'Content for social platforms', '1', current_timestamp());