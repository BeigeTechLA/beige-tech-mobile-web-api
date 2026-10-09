const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('creator_availability_blocks', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    crew_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    source: {
      type: DataTypes.ENUM('manual', 'beige_booking', 'google_calendar', 'apple_calendar'),
      allowNull: false
    },
    source_external_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    start_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('unavailable', 'tentative', 'cancelled'),
      allowNull: false,
      defaultValue: 'unavailable'
    },
    metadata_json: {
      type: DataTypes.JSON,
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
    tableName: 'creator_availability_blocks',
    timestamps: false
  });
};
