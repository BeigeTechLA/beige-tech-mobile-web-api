const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_feedback', {
    feedback_id: {
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
    feedback_type: {
      type: DataTypes.ENUM(
        'CLIENT_PREVIEW_FEEDBACK',
        'INTERNAL_QC_REJECTION',
        'COVERAGE_REVIEW_NOTES',
        'REVISION_REQUEST',
        'FINAL_APPROVAL'
      ),
      allowNull: false
    },
    submitted_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    submitted_by_role: {
      type: DataTypes.ENUM('CLIENT', 'QC', 'ADMIN', 'EDITOR'),
      allowNull: false
    },
    related_file_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_files',
        key: 'file_id'
      }
    },
    feedback_text: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    video_timestamps: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      allowNull: true,
      defaultValue: 'MEDIUM'
    },
    translated_for_creator: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    translated_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    translated_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'),
      allowNull: true,
      defaultValue: 'PENDING'
    },
    resolved_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    resolution_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    attachments: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    satisfaction_rating: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    tableName: 'project_feedback',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "feedback_id" },
        ]
      },
      {
        name: "idx_feedback_project",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
      {
        name: "idx_feedback_type",
        using: "BTREE",
        fields: [
          { name: "feedback_type" },
        ]
      },
      {
        name: "idx_feedback_submitted_by",
        using: "BTREE",
        fields: [
          { name: "submitted_by_user_id" },
        ]
      },
      {
        name: "idx_feedback_status",
        using: "BTREE",
        fields: [
          { name: "status" },
        ]
      },
      {
        name: "idx_feedback_file",
        using: "BTREE",
        fields: [
          { name: "related_file_id" },
        ]
      },
      {
        name: "idx_feedback_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
      {
        name: "idx_feedback_priority",
        using: "BTREE",
        fields: [
          { name: "priority" },
        ]
      },
    ]
  });
};
