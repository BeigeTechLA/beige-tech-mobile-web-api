-- Migration: Create Sales System Tables
-- Description: Create tables for sales-driven discount and payment links system
-- Date: 2026-01-21

-- =====================================================
-- 1. Create sales_leads table
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_leads (
  lead_id INT PRIMARY KEY AUTO_INCREMENT,
  booking_id INT NULL,
  user_id INT NULL,
  guest_email VARCHAR(255) NULL,
  client_name VARCHAR(255) NULL,
  lead_type ENUM('self_serve', 'sales_assisted') NOT NULL,
  lead_status ENUM('in_progress_self_serve', 'in_progress_sales_assisted', 'payment_link_sent', 'discount_applied', 'booked', 'abandoned') NOT NULL DEFAULT 'in_progress_self_serve',
  assigned_sales_rep_id INT NULL,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  contacted_sales_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_lead_status (lead_status),
  INDEX idx_assigned_rep (assigned_sales_rep_id),
  INDEX idx_booking (booking_id),
  INDEX idx_last_activity (last_activity_at),
  INDEX idx_lead_type (lead_type),
  
  FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_sales_rep_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 2. Create discount_codes table
-- =====================================================
CREATE TABLE IF NOT EXISTS discount_codes (
  discount_code_id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  lead_id INT NULL,
  booking_id INT NULL,
  discount_type ENUM('percentage', 'fixed_amount') NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL,
  usage_type ENUM('one_time', 'multi_use') NOT NULL DEFAULT 'one_time',
  max_uses INT NULL,
  current_uses INT DEFAULT 0,
  expires_at TIMESTAMP NULL,
  created_by_user_id INT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_code (code),
  INDEX idx_lead (lead_id),
  INDEX idx_booking (booking_id),
  INDEX idx_active (is_active),
  INDEX idx_expires (expires_at),
  
  FOREIGN KEY (lead_id) REFERENCES sales_leads(lead_id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 3. Create discount_code_usage table (Audit Log)
-- =====================================================
CREATE TABLE IF NOT EXISTS discount_code_usage (
  usage_id INT PRIMARY KEY AUTO_INCREMENT,
  discount_code_id INT NOT NULL,
  booking_id INT NULL,
  user_id INT NULL,
  guest_email VARCHAR(255) NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  original_amount DECIMAL(10,2) NOT NULL,
  final_amount DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_discount_code (discount_code_id),
  INDEX idx_booking (booking_id),
  INDEX idx_user (user_id),
  INDEX idx_used_at (used_at),
  
  FOREIGN KEY (discount_code_id) REFERENCES discount_codes(discount_code_id) ON DELETE RESTRICT,
  FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 4. Create payment_links table
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_links (
  payment_link_id INT PRIMARY KEY AUTO_INCREMENT,
  link_token VARCHAR(100) UNIQUE NOT NULL,
  lead_id INT NULL,
  booking_id INT NOT NULL,
  discount_code_id INT NULL,
  created_by_user_id INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT 0,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_token (link_token),
  INDEX idx_lead (lead_id),
  INDEX idx_booking (booking_id),
  INDEX idx_expires (expires_at),
  INDEX idx_is_used (is_used),
  
  FOREIGN KEY (lead_id) REFERENCES sales_leads(lead_id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES stream_project_booking(stream_project_booking_id) ON DELETE CASCADE,
  FOREIGN KEY (discount_code_id) REFERENCES discount_codes(discount_code_id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- 5. Alter stream_project_booking table (Safe method)
-- =====================================================
SET @db_name = DATABASE();

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
-- 6. Alter quotes table (Safe method)
-- =====================================================

-- Check and add discount_code_id column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'quotes' 
                   AND COLUMN_NAME = 'discount_code_id');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE quotes ADD COLUMN discount_code_id INT NULL',
    'SELECT "Column discount_code_id already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add applied_discount_type column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'quotes' 
                   AND COLUMN_NAME = 'applied_discount_type');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE quotes ADD COLUMN applied_discount_type ENUM(''percentage'', ''fixed_amount'') NULL',
    'SELECT "Column applied_discount_type already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add applied_discount_value column
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'quotes' 
                   AND COLUMN_NAME = 'applied_discount_value');

SET @query = IF(@col_exists = 0,
    'ALTER TABLE quotes ADD COLUMN applied_discount_value DECIMAL(10,2) NULL',
    'SELECT "Column applied_discount_value already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for discount_code_id
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
                   WHERE TABLE_SCHEMA = @db_name 
                   AND TABLE_NAME = 'quotes' 
                   AND INDEX_NAME = 'idx_discount_code');

SET @query = IF(@idx_exists = 0,
    'ALTER TABLE quotes ADD INDEX idx_discount_code (discount_code_id)',
    'SELECT "Index idx_discount_code already exists" AS Info');
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key for discount_code_id if not exists
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                  WHERE CONSTRAINT_SCHEMA = @db_name 
                  AND TABLE_NAME = 'quotes' 
                  AND CONSTRAINT_NAME = 'fk_quotes_discount_code');

SET @query = IF(@fk_exists = 0,
    'ALTER TABLE quotes ADD CONSTRAINT fk_quotes_discount_code FOREIGN KEY (discount_code_id) REFERENCES discount_codes(discount_code_id) ON DELETE SET NULL',
    'SELECT "Foreign key fk_quotes_discount_code already exists" AS Info');

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- 7. Create activity log table for lead tracking
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
-- 8. Insert or update sales_rep user type
-- =====================================================
INSERT INTO user_type (user_role, is_active)
VALUES ('sales_rep', 1)
ON DUPLICATE KEY UPDATE is_active = 1;

-- =====================================================
-- Migration Complete
-- =====================================================
SELECT 'Migration completed successfully!' AS Status;
