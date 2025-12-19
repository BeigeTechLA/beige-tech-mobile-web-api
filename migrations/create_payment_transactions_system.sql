-- Migration: Create Payment Transactions System for CP + Equipment Bookings
-- Replaces old payment system with comprehensive transaction tracking

-- Create payment_transactions table
CREATE TABLE payment_transactions (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  creator_id INT NOT NULL COMMENT 'FK to crew_members - the CP being booked',
  user_id INT NULL COMMENT 'FK to users - null for guest checkouts',
  guest_email VARCHAR(255) NULL COMMENT 'Email for guest bookings',
  hours DECIMAL(10,2) NOT NULL COMMENT 'Number of hours booked',
  hourly_rate DECIMAL(10,2) NOT NULL COMMENT 'CP hourly rate at time of booking',
  cp_cost DECIMAL(10,2) NOT NULL COMMENT 'Total CP cost (hours × hourly_rate)',
  equipment_cost DECIMAL(10,2) NOT NULL COMMENT 'Total equipment rental cost',
  subtotal DECIMAL(10,2) NOT NULL COMMENT 'cp_cost + equipment_cost',
  beige_margin_percent DECIMAL(5,2) DEFAULT 25.00 COMMENT 'Platform margin percentage',
  beige_margin_amount DECIMAL(10,2) NOT NULL COMMENT 'Platform margin in dollars',
  total_amount DECIMAL(10,2) NOT NULL COMMENT 'Final amount charged to customer',
  shoot_date DATE NOT NULL COMMENT 'Date of the shoot',
  location VARCHAR(255) NOT NULL COMMENT 'Shoot location',
  shoot_type VARCHAR(100) NULL COMMENT 'Type of shoot (e.g., wedding, corporate)',
  notes TEXT NULL COMMENT 'Additional booking notes',
  status ENUM('pending', 'succeeded', 'failed', 'refunded') DEFAULT 'pending' COMMENT 'Payment status',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign key constraints
  FOREIGN KEY (creator_id) REFERENCES crew_members(crew_member_id),
  FOREIGN KEY (user_id) REFERENCES users(id),

  -- Indexes for performance
  INDEX idx_stripe_payment_intent (stripe_payment_intent_id),
  INDEX idx_creator_id (creator_id),
  INDEX idx_user_id (user_id),
  INDEX idx_shoot_date (shoot_date),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Payment transactions for CP + equipment bookings with margin tracking';

-- Create payment_equipment junction table
CREATE TABLE payment_equipment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL COMMENT 'FK to payment_transactions',
  equipment_id INT NOT NULL COMMENT 'FK to equipment',
  equipment_price DECIMAL(10,2) NOT NULL COMMENT 'Equipment price at time of booking',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key constraints
  FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id) ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id),

  -- Indexes for performance
  INDEX idx_payment_id (payment_id),
  INDEX idx_equipment_id (equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Equipment items associated with payment transactions';

-- Add check constraints (MySQL 8.0+)
ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_hours_positive CHECK (hours > 0),
  ADD CONSTRAINT chk_hourly_rate_positive CHECK (hourly_rate >= 0),
  ADD CONSTRAINT chk_cp_cost_positive CHECK (cp_cost >= 0),
  ADD CONSTRAINT chk_equipment_cost_nonnegative CHECK (equipment_cost >= 0),
  ADD CONSTRAINT chk_subtotal_positive CHECK (subtotal > 0),
  ADD CONSTRAINT chk_beige_margin_percent_range CHECK (beige_margin_percent >= 0 AND beige_margin_percent <= 100),
  ADD CONSTRAINT chk_beige_margin_amount_nonnegative CHECK (beige_margin_amount >= 0),
  ADD CONSTRAINT chk_total_amount_positive CHECK (total_amount > 0),
  ADD CONSTRAINT chk_guest_or_user CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

ALTER TABLE payment_equipment
  ADD CONSTRAINT chk_equipment_price_nonnegative CHECK (equipment_price >= 0);
