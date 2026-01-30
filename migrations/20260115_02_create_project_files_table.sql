-- =====================================================
-- Project Files Table Migration
-- Stores metadata for all project files (RAW, edits, finals)
-- AWS S3 paths and upload/validation tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS project_files (
    file_id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL COMMENT 'FK to projects',

    -- File categorization
    file_category ENUM(
        'RAW_FOOTAGE',
        'RAW_AUDIO',
        'EDIT_DRAFT',
        'EDIT_REVISION',
        'EDIT_FINAL',
        'CLIENT_DELIVERABLE',
        'THUMBNAIL',
        'REFERENCE_MATERIAL'
    ) NOT NULL,

    -- File metadata
    file_name VARCHAR(500) NOT NULL,
    file_path VARCHAR(1000) NOT NULL COMMENT 'S3 path: raw-footage/{project_id}/{filename}',
    file_size_bytes BIGINT NOT NULL,
    file_extension VARCHAR(20) NOT NULL,
    mime_type VARCHAR(100) DEFAULT NULL,

    -- Upload tracking
    upload_status ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    upload_progress INT DEFAULT 0 COMMENT 'Percentage 0-100',
    upload_session_id VARCHAR(100) DEFAULT NULL COMMENT 'For chunked uploads',
    uploaded_by_user_id INT DEFAULT NULL COMMENT 'FK to users - who uploaded this file',

    -- Validation tracking
    validation_status ENUM('PENDING', 'PASSED', 'FAILED') DEFAULT 'PENDING',
    validation_errors TEXT DEFAULT NULL COMMENT 'JSON array of validation issues',

    -- Video metadata (for video files)
    video_duration_seconds INT DEFAULT NULL,
    video_resolution VARCHAR(20) DEFAULT NULL COMMENT 'e.g., 1920x1080, 3840x2160',
    video_fps DECIMAL(5,2) DEFAULT NULL COMMENT 'e.g., 23.98, 29.97, 60.00',
    video_codec VARCHAR(50) DEFAULT NULL COMMENT 'e.g., H.264, H.265, ProRes',
    video_bitrate_kbps INT DEFAULT NULL,

    -- Audio metadata (for audio/video files)
    audio_codec VARCHAR(50) DEFAULT NULL,
    audio_sample_rate INT DEFAULT NULL COMMENT 'e.g., 48000',
    audio_channels INT DEFAULT NULL COMMENT 'e.g., 2 for stereo',

    -- Versioning
    version_number INT DEFAULT 1 COMMENT 'For revisions: v1, v2, etc.',
    replaces_file_id INT DEFAULT NULL COMMENT 'FK to project_files - previous version',

    -- Checksums for integrity
    md5_hash VARCHAR(32) DEFAULT NULL,
    sha256_hash VARCHAR(64) DEFAULT NULL,

    -- S3 metadata
    s3_bucket VARCHAR(100) DEFAULT NULL,
    s3_region VARCHAR(50) DEFAULT NULL,
    s3_etag VARCHAR(100) DEFAULT NULL,

    -- Soft delete
    is_deleted TINYINT(1) DEFAULT 0,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    deleted_by_user_id INT DEFAULT NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign key constraints
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (replaces_file_id) REFERENCES project_files(file_id) ON DELETE SET NULL,
    FOREIGN KEY (deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX idx_project_files_project ON project_files(project_id);
CREATE INDEX idx_project_files_category ON project_files(file_category);
CREATE INDEX idx_project_files_upload_status ON project_files(upload_status);
CREATE INDEX idx_project_files_validation ON project_files(validation_status);
CREATE INDEX idx_project_files_session ON project_files(upload_session_id);
CREATE INDEX idx_project_files_uploaded_by ON project_files(uploaded_by_user_id);
CREATE INDEX idx_project_files_deleted ON project_files(is_deleted);
CREATE INDEX idx_project_files_created_at ON project_files(created_at);
