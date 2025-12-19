-- Migration: Add equipment ownership and reviews system
-- Created: 2025-12-20

-- Add owner_id to equipment table to track which creator owns the equipment
ALTER TABLE equipment
ADD COLUMN owner_id INT NULL AFTER category_id,
ADD CONSTRAINT fk_equipment_owner
  FOREIGN KEY (owner_id) REFERENCES crew_members(crew_member_id)
  ON DELETE SET NULL;

-- Create index for faster queries by owner
CREATE INDEX idx_equipment_owner_id ON equipment(owner_id);

-- Create crew_member_reviews table
CREATE TABLE IF NOT EXISTS crew_member_reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  crew_member_id INT NOT NULL,
  user_id INT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  shoot_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_crew_member
    FOREIGN KEY (crew_member_id) REFERENCES crew_members(crew_member_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_review_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for reviews
CREATE INDEX idx_reviews_crew_member ON crew_member_reviews(crew_member_id);
CREATE INDEX idx_reviews_rating ON crew_member_reviews(rating);
CREATE INDEX idx_reviews_created_at ON crew_member_reviews(created_at);
