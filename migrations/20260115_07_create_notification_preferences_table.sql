-- =====================================================
-- Notification Preferences Table Migration
-- Per-user notification settings and daily digest config
-- Controls email and in-app notification delivery
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    preference_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE COMMENT 'FK to users - one preference record per user',

    -- Email notification toggles (per notification type)
    email_state_transitions TINYINT(1) DEFAULT 1,
    email_new_assignments TINYINT(1) DEFAULT 1,
    email_feedback_received TINYINT(1) DEFAULT 1,
    email_deadline_approaching TINYINT(1) DEFAULT 1,
    email_file_uploaded TINYINT(1) DEFAULT 1,
    email_file_validation_failed TINYINT(1) DEFAULT 1,
    email_project_delivered TINYINT(1) DEFAULT 1,
    email_assignment_responses TINYINT(1) DEFAULT 1,
    email_qc_rejections TINYINT(1) DEFAULT 1,
    email_client_approvals TINYINT(1) DEFAULT 1,
    email_general_messages TINYINT(1) DEFAULT 1,

    -- In-app notification toggles (per notification type)
    inapp_state_transitions TINYINT(1) DEFAULT 1,
    inapp_new_assignments TINYINT(1) DEFAULT 1,
    inapp_feedback_received TINYINT(1) DEFAULT 1,
    inapp_deadline_approaching TINYINT(1) DEFAULT 1,
    inapp_file_uploaded TINYINT(1) DEFAULT 1,
    inapp_file_validation_failed TINYINT(1) DEFAULT 1,
    inapp_project_delivered TINYINT(1) DEFAULT 1,
    inapp_assignment_responses TINYINT(1) DEFAULT 1,
    inapp_qc_rejections TINYINT(1) DEFAULT 1,
    inapp_client_approvals TINYINT(1) DEFAULT 1,
    inapp_general_messages TINYINT(1) DEFAULT 1,

    -- Daily digest configuration
    enable_daily_digest TINYINT(1) DEFAULT 0 COMMENT 'If enabled, batch notifications into daily email',
    digest_delivery_time TIME DEFAULT '09:00:00' COMMENT 'Time to send daily digest',
    digest_timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',
    last_digest_sent_at TIMESTAMP NULL DEFAULT NULL,

    -- Quiet hours (no email notifications during this time)
    enable_quiet_hours TINYINT(1) DEFAULT 0,
    quiet_hours_start TIME DEFAULT '22:00:00',
    quiet_hours_end TIME DEFAULT '08:00:00',
    quiet_hours_timezone VARCHAR(50) DEFAULT 'America/Los_Angeles',

    -- Global notification toggles
    enable_all_emails TINYINT(1) DEFAULT 1 COMMENT 'Master switch for all email notifications',
    enable_all_inapp TINYINT(1) DEFAULT 1 COMMENT 'Master switch for all in-app notifications',

    -- Communication preferences
    preferred_email VARCHAR(255) DEFAULT NULL COMMENT 'Override email (if different from user.email)',
    notification_frequency ENUM('REALTIME', 'HOURLY', 'DAILY', 'WEEKLY') DEFAULT 'REALTIME',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_preferences_user ON notification_preferences(user_id);
CREATE INDEX idx_preferences_digest_enabled ON notification_preferences(enable_daily_digest);
CREATE INDEX idx_preferences_last_digest ON notification_preferences(last_digest_sent_at);
