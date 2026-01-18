const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('projects', {
    project_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    project_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: "project_code"
    },
    project_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    current_state: {
      type: DataTypes.ENUM(
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
      ),
      allowNull: false,
      defaultValue: 'RAW_UPLOADED'
    },
    state_changed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    client_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    assigned_creator_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    assigned_editor_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    assigned_qc_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    raw_upload_deadline: {
      type: DataTypes.DATE,
      allowNull: true
    },
    edit_delivery_deadline: {
      type: DataTypes.DATE,
      allowNull: true
    },
    final_delivery_deadline: {
      type: DataTypes.DATE,
      allowNull: true
    },
    project_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    client_requirements: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    total_raw_size_bytes: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: 0
    },
    total_files_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
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
    tableName: 'projects',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
      {
        name: "project_code",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "project_code" },
        ]
      },
      {
        name: "idx_projects_booking",
        using: "BTREE",
        fields: [
          { name: "booking_id" },
        ]
      },
      {
        name: "idx_projects_client",
        using: "BTREE",
        fields: [
          { name: "client_user_id" },
        ]
      },
      {
        name: "idx_projects_current_state",
        using: "BTREE",
        fields: [
          { name: "current_state" },
        ]
      },
      {
        name: "idx_projects_creator",
        using: "BTREE",
        fields: [
          { name: "assigned_creator_id" },
        ]
      },
      {
        name: "idx_projects_editor",
        using: "BTREE",
        fields: [
          { name: "assigned_editor_id" },
        ]
      },
      {
        name: "idx_projects_state_changed",
        using: "BTREE",
        fields: [
          { name: "state_changed_at" },
        ]
      },
      {
        name: "idx_projects_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
    ]
  });
};
