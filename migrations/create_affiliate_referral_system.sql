-- Migration: Create Affiliate & Referral System Tables
-- For Phase 1 MVP: Referral code tracking, affiliate earnings, and payout management

-- ============================================================================
-- AFFILIATES TABLE
-- Stores affiliate accounts (auto-created on user signup)
-- ============================================================================
CREATE TABLE affiliates (
  affiliate_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT 'FK to users - the affiliate owner',
  referral_code VARCHAR(20) NOT NULL UNIQUE COMMENT 'Unique referral code for the affiliate',
  status ENUM('active', 'paused', 'suspended') NOT NULL DEFAULT 'active' COMMENT 'Affiliate account status',
  total_referrals INT NOT NULL DEFAULT 0 COMMENT 'Total number of referrals made',
  successful_referrals INT NOT NULL DEFAULT 0 COMMENT 'Number of successful paid referrals',
  total_earnings DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Total earnings in SAR',
  pending_earnings DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Pending earnings awaiting payout',
  paid_earnings DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Total paid out earnings',
  payout_method ENUM('bank_transfer', 'paypal', 'stripe') NULL COMMENT 'Preferred payout method',
  payout_details JSON NULL COMMENT 'Payout account details (bank info, email, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign key constraint
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

  -- Indexes for performance
  INDEX idx_user_id (user_id),
  INDEX idx_referral_code (referral_code),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Affiliate accounts for referral program';

-- ============================================================================
-- REFERRALS TABLE
-- Tracks each referral and its status (linked to payment_transactions)
-- ============================================================================
CREATE TABLE referrals (
  referral_id INT AUTO_INCREMENT PRIMARY KEY,
  affiliate_id INT NOT NULL COMMENT 'FK to affiliates - the referrer',
  payment_id INT NULL COMMENT 'FK to payment_transactions - the booking payment',
  referral_code VARCHAR(20) NOT NULL COMMENT 'The referral code used',
  referred_user_id INT NULL COMMENT 'FK to users - the referred customer (null for guests)',
  referred_guest_email VARCHAR(255) NULL COMMENT 'Guest email if not a registered user',
  booking_amount DECIMAL(10,2) NULL COMMENT 'Total booking amount',
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 200.00 COMMENT 'Fixed commission per booking (200 SAR)',
  status ENUM('pending', 'completed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending' COMMENT 'Referral status',
  payout_status ENUM('pending', 'approved', 'paid', 'rejected') NOT NULL DEFAULT 'pending' COMMENT 'Payout status for this referral',
  notes TEXT NULL COMMENT 'Admin notes',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign key constraints
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(affiliate_id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payment_transactions(payment_id) ON DELETE SET NULL,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE SET NULL,

  -- Indexes for performance
  INDEX idx_affiliate_id (affiliate_id),
  INDEX idx_payment_id (payment_id),
  INDEX idx_referral_code (referral_code),
  INDEX idx_status (status),
  INDEX idx_payout_status (payout_status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Individual referral transactions';

-- ============================================================================
-- AFFILIATE_PAYOUTS TABLE
-- Tracks payout requests and their processing status
-- ============================================================================
CREATE TABLE affiliate_payouts (
  payout_id INT AUTO_INCREMENT PRIMARY KEY,
  affiliate_id INT NOT NULL COMMENT 'FK to affiliates',
  amount DECIMAL(10,2) NOT NULL COMMENT 'Payout amount in SAR',
  payout_method ENUM('bank_transfer', 'paypal', 'stripe') NOT NULL COMMENT 'Payout method used',
  payout_details JSON NULL COMMENT 'Payout account details at time of payout',
  status ENUM('pending', 'approved', 'processing', 'paid', 'failed', 'rejected') NOT NULL DEFAULT 'pending' COMMENT 'Payout status',
  transaction_reference VARCHAR(255) NULL COMMENT 'External transaction reference',
  processed_by INT NULL COMMENT 'Admin user ID who processed',
  processed_at TIMESTAMP NULL COMMENT 'When payout was processed',
  notes TEXT NULL COMMENT 'Admin notes',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign key constraints
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(affiliate_id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,

  -- Indexes for performance
  INDEX idx_affiliate_id (affiliate_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_processed_at (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Affiliate payout records';

-- ============================================================================
-- ADD REFERRAL CODE TO PAYMENT_TRANSACTIONS
-- Track referral code used for each payment
-- ============================================================================
ALTER TABLE payment_transactions
  ADD COLUMN referral_code VARCHAR(20) NULL COMMENT 'Referral code used for this booking' AFTER notes,
  ADD COLUMN referral_id INT NULL COMMENT 'FK to referrals table' AFTER referral_code,
  ADD INDEX idx_referral_code (referral_code);

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================
ALTER TABLE referrals
  ADD CONSTRAINT chk_commission_positive CHECK (commission_amount >= 0),
  ADD CONSTRAINT chk_referred_user_or_guest CHECK (referred_user_id IS NOT NULL OR referred_guest_email IS NOT NULL);

ALTER TABLE affiliate_payouts
  ADD CONSTRAINT chk_payout_amount_positive CHECK (amount > 0);

