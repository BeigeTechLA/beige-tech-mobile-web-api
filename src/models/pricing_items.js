const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('pricing_items', {
    item_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'pricing_categories',
        key: 'category_id'
      }
    },
    pricing_mode: {
      type: DataTypes.ENUM('general', 'wedding', 'both'),
      allowNull: false,
      defaultValue: 'both'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    rate_type: {
      type: DataTypes.ENUM('flat', 'per_hour', 'per_day', 'per_unit'),
      allowNull: false,
      defaultValue: 'flat'
    },
    rate_unit: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'e.g., "per video", "per hour", "25 photos"'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    min_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    max_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
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
    tableName: 'pricing_items',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "item_id" },
        ]
      },
      {
        name: "unique_item_slug",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "slug" },
          { name: "pricing_mode" },
        ]
      },
      {
        name: "idx_pricing_items_category",
        using: "BTREE",
        fields: [
          { name: "category_id" },
        ]
      },
      {
        name: "idx_pricing_items_mode",
        using: "BTREE",
        fields: [
          { name: "pricing_mode" },
        ]
      },
      {
        name: "idx_pricing_items_active",
        using: "BTREE",
        fields: [
          { name: "is_active" },
        ]
      },
    ]
  });
};

