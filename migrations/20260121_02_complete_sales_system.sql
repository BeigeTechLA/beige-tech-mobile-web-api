-- Migration: Complete Sales System Setup
-- Description: Add missing sales_lead_activities table and update stream_project_booking
-- Date: 2026-01-21

SET @db_name = DATABASE();

-- =====================================================
-- 1. Create sales_lead_activities table
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_lead_activities (
  activity_id INT PRIMARY KEY AUTO_INCREMENT,
  lead_id INT NOT NULL,
  activity_type ENUM('created', 'status_changed', 'assigned', 'contacted_sales', 'payment_link_generated', 'discount_code_generated', 'payment_link_opened', 'discount_applied', 'payment_completed') NOT NULL,
  activity_data JSON NULL,
  performed_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_lead (lead_id),
  INDEX idx_activity_type (activity_type),
  INDEX idx_created_at (created_at),
  
  FOREIGN KEY (lead_id) REFERENCES sales_leads(lead_id) ON DELETE CASCADE,
  FOREIGN KEY (performed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. Add columns to stream_project_booking table
-- =====================================================

-- Check and add lead_status column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'stream_project_booking' 
                   AND COLUMN_NAME = 'lead_status');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE stream_project_booking ADD COLUMN lead_status ENUM(''in_progress_self_serve'', ''in_progress_sales_assisted'', ''payment_link_sent'', ''discount_applied'', ''booked'', ''abandoned'') NULL',
    'SELECT "Column lead_status already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add sales_assisted column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'stream_project_booking' 
                   AND COLUMN_NAME = 'sales_assisted');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE stream_project_booking ADD COLUMN sales_assisted BOOLEAN DEFAULT 0',
    'SELECT "Column sales_assisted already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add tracking_started_at column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'stream_project_booking' 
                   AND COLUMN_NAME = 'tracking_started_at');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE stream_project_booking ADD COLUMN tracking_started_at TIMESTAMP NULL',
    'SELECT "Column tracking_started_at already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add payment_page_reached_at column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'stream_project_booking' 
                   AND COLUMN_NAME = 'payment_page_reached_at');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE stream_project_booking ADD COLUMN payment_page_reached_at TIMESTAMP NULL',
    'SELECT "Column payment_page_reached_at already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add indexes for new columns (if they don't exist)
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'stream_project_booking' 
                   AND INDEX_NAME = 'idx_lead_status');

SET @query = IF(@idx_exists = 0,
    'ALTER TABLE stream_project_booking ADD INDEX idx_lead_status (lead_status)',
    'SELECT "Index idx_lead_status already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'stream_project_booking' 
                   AND INDEX_NAME = 'idx_sales_assisted');

SET @query = IF(@idx_exists = 0,
    'ALTER TABLE stream_project_booking ADD INDEX idx_sales_assisted (sales_assisted)',
    'SELECT "Index idx_sales_assisted already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migration Complete
-- =====================================================
SELECT '✅ Sales System Migration Completed Successfully!' AS Status;
SELECT CONCAT('Created/verified: sales_lead_activities table') AS Summary;
SELECT CONCAT('Updated: stream_project_booking with sales tracking columns') AS Summary;
