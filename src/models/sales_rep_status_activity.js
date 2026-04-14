const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('sales_rep_status_activity', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    sales_rep_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    is_available: {
      type: DataTypes.TINYINT,
      allowNull: false,
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
    }
  }, {
    sequelize,
    tableName: 'sales_rep_status_activity',
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
        name: 'idx_sales_rep_status_activity_rep_id',
        using: 'BTREE',
        fields: [
          { name: 'sales_rep_id' }
        ]
      },
      {
        name: 'idx_sales_rep_status_activity_created_at',
        using: 'BTREE',
        fields: [
          { name: 'created_at' }
        ]
      }
    ]
  });
};
