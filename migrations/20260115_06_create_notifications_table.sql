-- =====================================================
-- Notifications Table Migration
-- In-app and email notifications for state transitions
-- Tracks read status and email delivery
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,

    -- Recipient
    user_id INT NOT NULL COMMENT 'FK to users - recipient of this notification',

    -- Notification type and content
    notification_type ENUM(
        'STATE_TRANSITION',
        'NEW_ASSIGNMENT',
        'FEEDBACK_RECEIVED',
        'DEADLINE_APPROACHING',
        'FILE_UPLOADED',
        'FILE_VALIDATION_FAILED',
        'PROJECT_DELIVERED',
        'ASSIGNMENT_ACCEPTED',
        'ASSIGNMENT_DECLINED',
        'QC_REJECTION',
        'CLIENT_APPROVAL',
        'GENERAL_MESSAGE'
    ) NOT NULL,

    title VARCHAR(255) NOT NULL COMMENT 'Notification title',
    message TEXT NOT NULL COMMENT 'Notification body',
    action_url VARCHAR(500) DEFAULT NULL COMMENT 'URL to navigate to when clicked',

    -- Related entities
    related_project_id INT DEFAULT NULL COMMENT 'FK to projects',
    related_file_id INT DEFAULT NULL COMMENT 'FK to project_files',
    related_feedback_id INT DEFAULT NULL COMMENT 'FK to project_feedback',
    related_assignment_id INT DEFAULT NULL COMMENT 'FK to project_assignments',

    -- In-app notification status
    is_read TINYINT(1) DEFAULT 0,
    read_at TIMESTAMP NULL DEFAULT NULL,

    -- Email delivery tracking
    email_sent TINYINT(1) DEFAULT 0,
    email_sent_at TIMESTAMP NULL DEFAULT NULL,
    email_delivery_status ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED') DEFAULT 'PENDING',
    email_delivery_error TEXT DEFAULT NULL,
    email_opened TINYINT(1) DEFAULT 0,
    email_opened_at TIMESTAMP NULL DEFAULT NULL,

    -- Priority
    priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') DEFAULT 'NORMAL',

    -- Expiration (for temporary notifications)
    expires_at TIMESTAMP NULL DEFAULT NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (related_file_id) REFERENCES project_files(file_id) ON DELETE SET NULL,
    FOREIGN KEY (related_assignment_id) REFERENCES project_assignments(assignment_id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(notification_type);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_project ON notifications(related_project_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_priority ON notifications(priority);
CREATE INDEX idx_notifications_email_status ON notifications(email_delivery_status);
CREATE INDEX idx_notifications_expires_at ON notifications(expires_at);

-- Composite index for unread notifications query
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at);
