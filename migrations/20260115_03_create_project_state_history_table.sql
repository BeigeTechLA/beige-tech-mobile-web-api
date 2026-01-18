-- =====================================================
-- Project State History Table Migration
-- Complete audit trail of all state transitions
-- Tracks who, when, why for compliance and debugging
-- =====================================================

CREATE TABLE IF NOT EXISTS project_state_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL COMMENT 'FK to projects',

    -- State transition details
    from_state ENUM(
        'RAW_UPLOADED',
        'RAW_TECH_QC_PENDING',
        'RAW_TECH_QC_REJECTED',
        'RAW_TECH_QC_APPROVED',
        'COVERAGE_REVIEW_PENDING',
        'COVERAGE_REJECTED',
        'EDIT_APPROVAL_PENDING',
        'EDIT_IN_PROGRESS',
        'INTERNAL_EDIT_REVIEW_PENDING',
        'CLIENT_PREVIEW_READY',
        'CLIENT_FEEDBACK_RECEIVED',
        'FEEDBACK_INTERNAL_REVIEW',
        'REVISION_IN_PROGRESS',
        'REVISION_QC_PENDING',
        'FINAL_EXPORT_PENDING',
        'READY_FOR_DELIVERY',
        'DELIVERED',
        'PROJECT_CLOSED'
    ) NOT NULL,
    to_state ENUM(
        'RAW_UPLOADED',
        'RAW_TECH_QC_PENDING',
        'RAW_TECH_QC_REJECTED',
        'RAW_TECH_QC_APPROVED',
        'COVERAGE_REVIEW_PENDING',
        'COVERAGE_REJECTED',
        'EDIT_APPROVAL_PENDING',
        'EDIT_IN_PROGRESS',
        'INTERNAL_EDIT_REVIEW_PENDING',
        'CLIENT_PREVIEW_READY',
        'CLIENT_FEEDBACK_RECEIVED',
        'FEEDBACK_INTERNAL_REVIEW',
        'REVISION_IN_PROGRESS',
        'REVISION_QC_PENDING',
        'FINAL_EXPORT_PENDING',
        'READY_FOR_DELIVERY',
        'DELIVERED',
        'PROJECT_CLOSED'
    ) NOT NULL,

    -- Who made the transition
    transitioned_by_user_id INT DEFAULT NULL COMMENT 'FK to users - NULL if system auto-transition',
    transitioned_by_role ENUM('SYSTEM', 'CLIENT', 'CREATOR', 'EDITOR', 'QC', 'ADMIN') NOT NULL,

    -- Why the transition happened
    transition_reason TEXT DEFAULT NULL COMMENT 'User-provided reason or system note',
    transition_type ENUM('MANUAL', 'AUTOMATIC') NOT NULL DEFAULT 'MANUAL',

    -- Related entities
    related_file_id INT DEFAULT NULL COMMENT 'FK to project_files - file that triggered transition',
    related_feedback_id INT DEFAULT NULL COMMENT 'FK to project_feedback - feedback that triggered transition',

    -- Metadata
    ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP address of user who made transition',
    user_agent TEXT DEFAULT NULL COMMENT 'Browser/client info',
    additional_metadata TEXT DEFAULT NULL COMMENT 'JSON for any extra context',

    -- Timestamp (immutable)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (transitioned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (related_file_id) REFERENCES project_files(file_id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_state_history_project ON project_state_history(project_id);
CREATE INDEX idx_state_history_from_state ON project_state_history(from_state);
CREATE INDEX idx_state_history_to_state ON project_state_history(to_state);
CREATE INDEX idx_state_history_user ON project_state_history(transitioned_by_user_id);
CREATE INDEX idx_state_history_created_at ON project_state_history(created_at);
CREATE INDEX idx_state_history_transition_type ON project_state_history(transition_type);
