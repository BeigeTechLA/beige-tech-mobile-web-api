const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('pricing_discount_tiers', {
    tier_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    pricing_mode: {
      type: DataTypes.ENUM('general', 'wedding'),
      allowNull: false,
      defaultValue: 'general'
    },
    min_hours: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false
    },
    max_hours: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: true,
      defaultValue: null,
      comment: 'NULL means unlimited'
    },
    discount_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
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
    tableName: 'pricing_discount_tiers',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "tier_id" },
        ]
      },
      {
        name: "unique_tier",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "pricing_mode" },
          { name: "min_hours" },
        ]
      },
    ]
  });
};

