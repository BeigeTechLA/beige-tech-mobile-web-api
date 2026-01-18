const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('notification_preferences', {
    preference_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: "user_id",
      references: {
        model: 'users',
        key: 'id'
      }
    },
    email_state_transitions: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_new_assignments: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_feedback_received: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_deadline_approaching: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_file_uploaded: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_file_validation_failed: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_project_delivered: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_assignment_responses: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_qc_rejections: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_client_approvals: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    email_general_messages: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_state_transitions: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_new_assignments: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_feedback_received: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_deadline_approaching: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_file_uploaded: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_file_validation_failed: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_project_delivered: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_assignment_responses: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_qc_rejections: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_client_approvals: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    inapp_general_messages: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    enable_daily_digest: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    digest_delivery_time: {
      type: DataTypes.TIME,
      allowNull: true,
      defaultValue: "09:00:00"
    },
    digest_timezone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "America/Los_Angeles"
    },
    last_digest_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    enable_quiet_hours: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    quiet_hours_start: {
      type: DataTypes.TIME,
      allowNull: true,
      defaultValue: "22:00:00"
    },
    quiet_hours_end: {
      type: DataTypes.TIME,
      allowNull: true,
      defaultValue: "08:00:00"
    },
    quiet_hours_timezone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "America/Los_Angeles"
    },
    enable_all_emails: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    enable_all_inapp: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    preferred_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notification_frequency: {
      type: DataTypes.ENUM('REALTIME', 'HOURLY', 'DAILY', 'WEEKLY'),
      allowNull: true,
      defaultValue: 'REALTIME'
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
    tableName: 'notification_preferences',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "preference_id" },
        ]
      },
      {
        name: "user_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "idx_preferences_user",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "idx_preferences_digest_enabled",
        using: "BTREE",
        fields: [
          { name: "enable_daily_digest" },
        ]
      },
      {
        name: "idx_preferences_last_digest",
        using: "BTREE",
        fields: [
          { name: "last_digest_sent_at" },
        ]
      },
    ]
  });
};
