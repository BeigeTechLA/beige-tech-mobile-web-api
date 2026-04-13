const Sequelize = require('sequelize');

module.exports = function (sequelize, DataTypes) {
  return sequelize.define('sales_rep_availability', {
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    availability_status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      comment: '1 = available, 2 = unavailable'
    },
    start_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    end_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    recurrence: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1,
      comment: '1=none,2=daily,3=weekly,4=monthly'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_full_day: {
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
    },
    recurrence_until: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    recurrence_days: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    recurrence_day_of_month: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'sales_rep_availability',
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
        name: 'idx_sales_rep_availability_rep_id',
        using: 'BTREE',
        fields: [
          { name: 'sales_rep_id' }
        ]
      },
      {
        name: 'idx_sales_rep_availability_rep_date',
        using: 'BTREE',
        fields: [
          { name: 'sales_rep_id' },
          { name: 'date' }
        ]
      }
    ]
  });
};
