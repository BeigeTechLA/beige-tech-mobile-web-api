const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_state_history', {
    history_id: {
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
    from_state: {
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
      allowNull: false
    },
    to_state: {
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
      allowNull: false
    },
    transitioned_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    transitioned_by_role: {
      type: DataTypes.ENUM('SYSTEM', 'CLIENT', 'CREATOR', 'EDITOR', 'QC', 'ADMIN'),
      allowNull: false
    },
    transition_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    transition_type: {
      type: DataTypes.ENUM('MANUAL', 'AUTOMATIC'),
      allowNull: false,
      defaultValue: 'MANUAL'
    },
    related_file_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_files',
        key: 'file_id'
      }
    },
    related_feedback_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    additional_metadata: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'project_state_history',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "history_id" },
        ]
      },
      {
        name: "idx_state_history_project",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
      {
        name: "idx_state_history_from_state",
        using: "BTREE",
        fields: [
          { name: "from_state" },
        ]
      },
      {
        name: "idx_state_history_to_state",
        using: "BTREE",
        fields: [
          { name: "to_state" },
        ]
      },
      {
        name: "idx_state_history_user",
        using: "BTREE",
        fields: [
          { name: "transitioned_by_user_id" },
        ]
      },
      {
        name: "idx_state_history_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
      {
        name: "idx_state_history_transition_type",
        using: "BTREE",
        fields: [
          { name: "transition_type" },
        ]
      },
    ]
  });
};
