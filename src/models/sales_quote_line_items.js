const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sales_quote_line_items', {
    line_item_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    sales_quote_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'sales_quotes',
        key: 'sales_quote_id'
      }
    },
    catalog_item_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'quote_catalog_items',
        key: 'catalog_item_id'
      }
    },
    source_type: {
      type: DataTypes.ENUM('catalog','custom'),
      allowNull: false,
      defaultValue: "catalog"
    },
    section_type: {
      type: DataTypes.ENUM('service','addon','logistics','custom'),
      allowNull: false
    },
    item_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
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
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    duration_hours: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    crew_size: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    estimated_pricing: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    unit_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    line_total: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: false,
      defaultValue: 0.00
    },
    configuration_json: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
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
    tableName: 'sales_quote_line_items',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "line_item_id" },
        ]
      },
      {
        name: "idx_sales_quote_line_items_quote",
        using: "BTREE",
        fields: [
          { name: "sales_quote_id" },
          { name: "section_type" },
        ]
      },
      {
        name: "sales_quote_line_items_ibfk_2",
        using: "BTREE",
        fields: [
          { name: "catalog_item_id" },
        ]
      }
    ]
  });
};
