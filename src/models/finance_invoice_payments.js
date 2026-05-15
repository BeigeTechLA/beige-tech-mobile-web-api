const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_invoice_payments', {
    finance_invoice_payment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    invoice_send_history_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'invoice_send_history',
        key: 'invoice_send_history_id'
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
    finance_transaction_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'finance_transactions',
        key: 'finance_transaction_id'
      }
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'void'),
      allowNull: false,
      defaultValue: 'pending'
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata_json: {
      type: DataTypes.TEXT,
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
    tableName: 'finance_invoice_payments',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_invoice_payment_id' }] },
      { name: 'idx_finance_invoice_payments_invoice', using: 'BTREE', fields: [{ name: 'invoice_send_history_id' }] },
      { name: 'idx_finance_invoice_payments_payment', using: 'BTREE', fields: [{ name: 'payment_id' }] },
      { name: 'idx_finance_invoice_payments_booking', using: 'BTREE', fields: [{ name: 'booking_id' }] },
      { name: 'idx_finance_invoice_payments_status', using: 'BTREE', fields: [{ name: 'status' }] }
    ]
  });
};
