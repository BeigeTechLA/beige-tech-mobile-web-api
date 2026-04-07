const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('project_meetings', {
    meeting_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id',
      },
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'projects',
        key: 'project_id',
      },
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    meeting_title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    meeting_type: {
      type: DataTypes.ENUM('pre_production', 'post_production'),
      allowNull: false,
      defaultValue: 'post_production',
    },
    meeting_status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'in_progress', 'change_request', 'completed', 'cancelled', 'rescheduled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    meeting_platform: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    meeting_date_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    meeting_end_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    meet_link: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    participants_json: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    send_notification: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp'),
    },
  }, {
    sequelize,
    tableName: 'project_meetings',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'meeting_id' }],
      },
      {
        name: 'idx_project_meetings_booking',
        using: 'BTREE',
        fields: [{ name: 'booking_id' }],
      },
      {
        name: 'idx_project_meetings_project',
        using: 'BTREE',
        fields: [{ name: 'project_id' }],
      },
      {
        name: 'idx_project_meetings_created_by',
        using: 'BTREE',
        fields: [{ name: 'created_by_user_id' }],
      },
      {
        name: 'idx_project_meetings_status',
        using: 'BTREE',
        fields: [{ name: 'meeting_status' }],
      },
      {
        name: 'idx_project_meetings_datetime',
        using: 'BTREE',
        fields: [{ name: 'meeting_date_time' }],
      },
    ],
  });
};
