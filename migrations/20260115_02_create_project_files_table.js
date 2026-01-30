'use strict';

/**
 * Project Files Table Migration
 * Stores metadata for all project files (RAW, edits, finals)
 * AWS S3 paths and upload/validation tracking
 */

const FILE_CATEGORIES = [
  'RAW_FOOTAGE',
  'RAW_AUDIO',
  'EDIT_DRAFT',
  'EDIT_REVISION',
  'EDIT_FINAL',
  'CLIENT_DELIVERABLE',
  'THUMBNAIL',
  'REFERENCE_MATERIAL'
];

const UPLOAD_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];
const VALIDATION_STATUSES = ['PENDING', 'PASSED', 'FAILED'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('project_files', {
      file_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      project_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'project_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        comment: 'FK to projects'
      },
      file_category: {
        type: Sequelize.ENUM(...FILE_CATEGORIES),
        allowNull: false
      },
      file_name: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING(1000),
        allowNull: false,
        comment: 'S3 path: raw-footage/{project_id}/{filename}'
      },
      file_size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      file_extension: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      upload_status: {
        type: Sequelize.ENUM(...UPLOAD_STATUSES),
        allowNull: false,
        defaultValue: 'PENDING'
      },
      upload_progress: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: 'Percentage 0-100'
      },
      upload_session_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'For chunked uploads'
      },
      uploaded_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to users - who uploaded this file'
      },
      validation_status: {
        type: Sequelize.ENUM(...VALIDATION_STATUSES),
        allowNull: true,
        defaultValue: 'PENDING'
      },
      validation_errors: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JSON array of validation issues'
      },
      video_duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      video_resolution: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'e.g., 1920x1080, 3840x2160'
      },
      video_fps: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'e.g., 23.98, 29.97, 60.00'
      },
      video_codec: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'e.g., H.264, H.265, ProRes'
      },
      video_bitrate_kbps: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      audio_codec: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      audio_sample_rate: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'e.g., 48000'
      },
      audio_channels: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'e.g., 2 for stereo'
      },
      version_number: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
        comment: 'For revisions: v1, v2, etc.'
      },
      replaces_file_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'project_files',
          key: 'file_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        comment: 'FK to project_files - previous version'
      },
      md5_hash: {
        type: Sequelize.STRING(32),
        allowNull: true
      },
      sha256_hash: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      s3_bucket: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      s3_region: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      s3_etag: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      is_deleted: {
        type: Sequelize.TINYINT,
        allowNull: true,
        defaultValue: 0
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      deleted_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('project_files', ['project_id'], {
      name: 'idx_project_files_project'
    });
    await queryInterface.addIndex('project_files', ['file_category'], {
      name: 'idx_project_files_category'
    });
    await queryInterface.addIndex('project_files', ['upload_status'], {
      name: 'idx_project_files_upload_status'
    });
    await queryInterface.addIndex('project_files', ['validation_status'], {
      name: 'idx_project_files_validation'
    });
    await queryInterface.addIndex('project_files', ['upload_session_id'], {
      name: 'idx_project_files_session'
    });
    await queryInterface.addIndex('project_files', ['uploaded_by_user_id'], {
      name: 'idx_project_files_uploaded_by'
    });
    await queryInterface.addIndex('project_files', ['is_deleted'], {
      name: 'idx_project_files_deleted'
    });
    await queryInterface.addIndex('project_files', ['created_at'], {
      name: 'idx_project_files_created_at'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('project_files');
  }
};
