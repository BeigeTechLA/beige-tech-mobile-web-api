const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('account_credit_ledger', {
    account_credit_ledger_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    sales_quote_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_quotes',
        key: 'sales_quote_id'
      }
    },
    sales_quote_activity_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_quote_activities',
        key: 'activity_id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    entry_type: {
      type: DataTypes.ENUM('credit_created', 'credit_used', 'credit_reversed'),
      allowNull: false,
      defaultValue: 'credit_created'
    },
    status: {
      type: DataTypes.ENUM('pending', 'available', 'used', 'reversed', 'expired'),
      allowNull: false,
      defaultValue: 'pending'
    },
    source: {
      type: DataTypes.ENUM('quote_reduction', 'manual_admin', 'payment_adjustment'),
      allowNull: false,
      defaultValue: 'quote_reduction'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    approved_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    approved_at: {
      type: DataTypes.DATE,
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
    tableName: 'account_credit_ledger',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'account_credit_ledger_id' }
        ]
      },
      {
        name: 'idx_account_credit_user',
        using: 'BTREE',
        fields: [
          { name: 'user_id' }
        ]
      },
      {
        name: 'idx_account_credit_guest_email',
        using: 'BTREE',
        fields: [
          { name: 'guest_email' }
        ]
      },
      {
        name: 'idx_account_credit_booking',
        using: 'BTREE',
        fields: [
          { name: 'booking_id' }
        ]
      },
      {
        name: 'idx_account_credit_quote',
        using: 'BTREE',
        fields: [
          { name: 'sales_quote_id' }
        ]
      },
      {
        name: 'idx_account_credit_status',
        using: 'BTREE',
        fields: [
          { name: 'status' }
        ]
      },
      {
        name: 'uniq_account_credit_source_activity',
        unique: true,
        using: 'BTREE',
        fields: [
          { name: 'sales_quote_activity_id' },
          { name: 'entry_type' }
        ]
      }
    ]
  });
};
