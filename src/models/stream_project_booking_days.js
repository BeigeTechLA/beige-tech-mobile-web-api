const Sequelize = require('sequelize');
module.exports = function (sequelize, DataTypes) {
  return sequelize.define('stream_project_booking_days', {
    stream_project_booking_day_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    stream_project_booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    event_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    duration_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    time_zone: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'stream_project_booking_days',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "stream_project_booking_day_id" }
        ]
      },
      {
        name: "idx_booking_id",
        using: "BTREE",
        fields: [
          { name: "stream_project_booking_id" }
        ]
      },
      {
        name: "idx_event_date",
        using: "BTREE",
        fields: [
          { name: "event_date" }
        ]
      }
    ]
  });
};
