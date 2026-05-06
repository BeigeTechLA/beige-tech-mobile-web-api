-- Add assign_lead flag to users
-- 0 = disabled, 1 = enabled

ALTER TABLE users
ADD COLUMN assign_lead TINYINT(1) NOT NULL DEFAULT 1;