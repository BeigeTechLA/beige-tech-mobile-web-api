const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sales_ai_editing_types', {
    sales_ai_editing_type_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    category: {
      type: DataTypes.ENUM('video', 'photo'),
      allowNull: false
    },
    type_key: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
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
    tableName: 'sales_ai_editing_types',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'sales_ai_editing_type_id' }
        ]
      },
      {
        name: 'uniq_sales_ai_editing_type_key',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'type_key' }
        ]
      },
      {
        name: 'uniq_sales_ai_editing_type_label',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'category' },
          { name: 'label' }
        ]
      },
      {
        name: 'idx_sales_ai_editing_types_active',
        using: 'BTREE',
        fields: [
          { name: 'category' },
          { name: 'is_active' },
          { name: 'display_order' }
        ]
      }
    ]
  });
};
