-- =====================================================
-- Project Feedback Table Migration
-- Client and internal feedback with video timestamps
-- Admin-translated feedback for creators
-- =====================================================

CREATE TABLE IF NOT EXISTS project_feedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL COMMENT 'FK to projects',

    -- Feedback type and source
    feedback_type ENUM(
        'CLIENT_PREVIEW_FEEDBACK',
        'INTERNAL_QC_REJECTION',
        'COVERAGE_REVIEW_NOTES',
        'REVISION_REQUEST',
        'FINAL_APPROVAL'
    ) NOT NULL,
    submitted_by_user_id INT NOT NULL COMMENT 'FK to users - who submitted this feedback',
    submitted_by_role ENUM('CLIENT', 'QC', 'ADMIN', 'EDITOR') NOT NULL,

    -- Related file
    related_file_id INT DEFAULT NULL COMMENT 'FK to project_files - file being reviewed',

    -- Feedback content
    feedback_text TEXT NOT NULL,
    video_timestamps TEXT DEFAULT NULL COMMENT 'JSON array: [{"time": "00:01:23", "note": "Adjust color"}]',
    priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',

    -- Translation for creators (admin translates harsh client feedback)
    translated_for_creator TEXT DEFAULT NULL COMMENT 'Admin-sanitized version for creator',
    translated_by_user_id INT DEFAULT NULL COMMENT 'FK to users - admin who translated',
    translated_at TIMESTAMP NULL DEFAULT NULL,

    -- Feedback status
    status ENUM('PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED') DEFAULT 'PENDING',
    resolved_by_user_id INT DEFAULT NULL COMMENT 'FK to users - who resolved this feedback',
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    resolution_notes TEXT DEFAULT NULL,

    -- Attachments (reference images, etc.)
    attachments TEXT DEFAULT NULL COMMENT 'JSON array of S3 paths for reference images',

    -- Client satisfaction (for final feedback)
    satisfaction_rating INT DEFAULT NULL COMMENT '1-5 stars, only for final approval',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (related_file_id) REFERENCES project_files(file_id) ON DELETE SET NULL,
    FOREIGN KEY (translated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_feedback_project ON project_feedback(project_id);
CREATE INDEX idx_feedback_type ON project_feedback(feedback_type);
CREATE INDEX idx_feedback_submitted_by ON project_feedback(submitted_by_user_id);
CREATE INDEX idx_feedback_status ON project_feedback(status);
CREATE INDEX idx_feedback_file ON project_feedback(related_file_id);
CREATE INDEX idx_feedback_created_at ON project_feedback(created_at);
CREATE INDEX idx_feedback_priority ON project_feedback(priority);
