const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('sales_rep_live_status', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    sales_rep_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: 'uniq_sales_rep_live_status_rep',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    is_available: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '1 = available/on, 0 = unavailable/off'
    },
    reason: {
      type: DataTypes.STRING(255),
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
    tableName: 'sales_rep_live_status',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'id' }
        ]
      },
      {
        name: 'uniq_sales_rep_live_status_rep',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'sales_rep_id' }
        ]
      }
    ]
  });
};
