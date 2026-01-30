const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('notifications', {
    notification_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    notification_type: {
      type: DataTypes.ENUM(
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
      ),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    action_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    related_project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'project_id'
      }
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
    related_assignment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'project_assignments',
        key: 'assignment_id'
      }
    },
    is_read: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    email_sent: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    email_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    email_delivery_status: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED'),
      allowNull: true,
      defaultValue: 'PENDING'
    },
    email_delivery_error: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    email_opened: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    email_opened_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT'),
      allowNull: true,
      defaultValue: 'NORMAL'
    },
    expires_at: {
      type: DataTypes.DATE,
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
    tableName: 'notifications',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "notification_id" },
        ]
      },
      {
        name: "idx_notifications_user",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "idx_notifications_type",
        using: "BTREE",
        fields: [
          { name: "notification_type" },
        ]
      },
      {
        name: "idx_notifications_read",
        using: "BTREE",
        fields: [
          { name: "is_read" },
        ]
      },
      {
        name: "idx_notifications_project",
        using: "BTREE",
        fields: [
          { name: "related_project_id" },
        ]
      },
      {
        name: "idx_notifications_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
      {
        name: "idx_notifications_priority",
        using: "BTREE",
        fields: [
          { name: "priority" },
        ]
      },
      {
        name: "idx_notifications_email_status",
        using: "BTREE",
        fields: [
          { name: "email_delivery_status" },
        ]
      },
      {
        name: "idx_notifications_expires_at",
        using: "BTREE",
        fields: [
          { name: "expires_at" },
        ]
      },
      {
        name: "idx_notifications_user_unread",
        using: "BTREE",
        fields: [
          { name: "user_id" },
          { name: "is_read" },
          { name: "created_at" },
        ]
      },
    ]
  });
};
