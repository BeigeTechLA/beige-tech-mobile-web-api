const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('quote_catalog_items', {
    catalog_item_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    section_type: {
      type: DataTypes.ENUM('service','addon','logistics'),
      allowNull: false
    },
    pricing_mode: {
      type: DataTypes.ENUM('general','wedding','both'),
      allowNull: false,
      defaultValue: "both"
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    default_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    rate_type: {
      type: DataTypes.ENUM('flat','per_hour','per_day','per_unit'),
      allowNull: false,
      defaultValue: "flat"
    },
    rate_unit: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    is_system_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by_user_id: {
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
    tableName: 'quote_catalog_items',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "catalog_item_id" },
        ]
      },
      {
        name: "idx_quote_catalog_section",
        using: "BTREE",
        fields: [
          { name: "section_type" },
          { name: "pricing_mode" },
          { name: "is_active" },
        ]
      },
    ]
  });
};
