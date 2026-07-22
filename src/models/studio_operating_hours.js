const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('studio_operating_hours', {
    studio_operating_hour_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    studio_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'studios',
        key: 'studio_id'
      }
    },
    day_of_week: {
      type: DataTypes.TINYINT,
      allowNull: false,
      comment: '0=Sunday, 1=Monday, ... 6=Saturday'
    },
    is_open: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    opens_at: {
      type: DataTypes.TIME,
      allowNull: true
    },
    closes_at: {
      type: DataTypes.TIME,
      allowNull: true
    },
    metadata: {
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
    tableName: 'studio_operating_hours',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'studio_operating_hour_id' }]
      },
      {
        name: 'uq_studio_operating_day',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'studio_id' }, { name: 'day_of_week' }]
      }
    ]
  });
};
