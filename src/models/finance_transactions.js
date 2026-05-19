const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_transactions', {
    finance_transaction_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    transaction_code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'payment_transactions',
        key: 'payment_id'
      }
    },
    invoice_send_history_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'invoice_send_history',
        key: 'invoice_send_history_id'
      }
    },
    client_user_id: {
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
    transaction_type: {
      type: DataTypes.ENUM('client_payment', 'manual_payment', 'refund', 'adjustment', 'credit', 'creator_earning', 'platform_fee'),
      allowNull: false,
      defaultValue: 'client_payment'
    },
    direction: {
      type: DataTypes.ENUM('inflow', 'outflow', 'internal'),
      allowNull: false,
      defaultValue: 'inflow'
    },
    source: {
      type: DataTypes.ENUM('stripe', 'manual', 'account_credit', 'system', 'admin'),
      allowNull: false,
      defaultValue: 'system'
    },
    payment_method: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded', 'void', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    gross_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    platform_fee_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    creator_earnings_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    gateway_fee_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    net_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    external_reference: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    transaction_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    metadata_json: {
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
    tableName: 'finance_transactions',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_transaction_id' }] },
      { name: 'uniq_finance_transaction_code', unique: true, using: 'BTREE', fields: [{ name: 'transaction_code' }] },
      { name: 'idx_finance_transactions_booking', using: 'BTREE', fields: [{ name: 'booking_id' }] },
      { name: 'idx_finance_transactions_payment', using: 'BTREE', fields: [{ name: 'payment_id' }] },
      { name: 'idx_finance_transactions_status', using: 'BTREE', fields: [{ name: 'status' }] },
      { name: 'idx_finance_transactions_type', using: 'BTREE', fields: [{ name: 'transaction_type' }] },
      { name: 'idx_finance_transactions_date', using: 'BTREE', fields: [{ name: 'transaction_date' }] }
    ]
  });
};
