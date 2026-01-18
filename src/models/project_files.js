const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_files', {
    file_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'project_id'
      }
    },
    file_category: {
      type: DataTypes.ENUM(
        'RAW_FOOTAGE',
        'RAW_AUDIO',
        'EDIT_DRAFT',
        'EDIT_REVISION',
        'EDIT_FINAL',
        'CLIENT_DELIVERABLE',
        'THUMBNAIL',
        'REFERENCE_MATERIAL'
      ),
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING(1000),
      allowNull: false
    },
    file_size_bytes: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    file_extension: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    upload_status: {
      type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    upload_progress: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    upload_session_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    uploaded_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    validation_status: {
      type: DataTypes.ENUM('PENDING', 'PASSED', 'FAILED'),
      allowNull: true,
      defaultValue: 'PENDING'
    },
    validation_errors: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    video_duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    video_resolution: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    video_fps: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: true
    },
    video_codec: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    video_bitrate_kbps: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    audio_codec: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    audio_sample_rate: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    audio_channels: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    version_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1
    },
    replaces_file_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_files',
        key: 'file_id'
      }
    },
    md5_hash: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    sha256_hash: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    s3_bucket: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    s3_region: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    s3_etag: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    is_deleted: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    deleted_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'project_files',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "file_id" },
        ]
      },
      {
        name: "idx_project_files_project",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
      {
        name: "idx_project_files_category",
        using: "BTREE",
        fields: [
          { name: "file_category" },
        ]
      },
      {
        name: "idx_project_files_upload_status",
        using: "BTREE",
        fields: [
          { name: "upload_status" },
        ]
      },
      {
        name: "idx_project_files_validation",
        using: "BTREE",
        fields: [
          { name: "validation_status" },
        ]
      },
      {
        name: "idx_project_files_session",
        using: "BTREE",
        fields: [
          { name: "upload_session_id" },
        ]
      },
      {
        name: "idx_project_files_uploaded_by",
        using: "BTREE",
        fields: [
          { name: "uploaded_by_user_id" },
        ]
      },
      {
        name: "idx_project_files_deleted",
        using: "BTREE",
        fields: [
          { name: "is_deleted" },
        ]
      },
      {
        name: "idx_project_files_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
    ]
  });
};
