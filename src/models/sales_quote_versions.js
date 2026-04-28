const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sales_quote_versions', {
    sales_quote_version_id: {
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
    version_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    source_activity_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_quote_activities',
        key: 'activity_id'
      }
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    change_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    quote_snapshot_json: {
      type: DataTypes.TEXT('long'),
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'sales_quote_versions',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'sales_quote_version_id' },
        ]
      },
      {
        name: 'uniq_sales_quote_version_number',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'sales_quote_id' },
          { name: 'version_number' },
        ]
      },
      {
        name: 'idx_sales_quote_versions_quote',
        using: 'BTREE',
        fields: [
          { name: 'sales_quote_id' },
          { name: 'created_at' },
        ]
      },
      {
        name: 'idx_sales_quote_versions_activity',
        using: 'BTREE',
        fields: [
          { name: 'source_activity_id' },
        ]
      }
    ]
  });
};
