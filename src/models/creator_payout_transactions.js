const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('creator_payout_transactions', {
    creator_payout_transaction_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    creator_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    creator_payout_request_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'creator_payout_requests',
        key: 'creator_payout_request_id'
      }
    },
    creator_payout_account_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'creator_payout_accounts',
        key: 'creator_payout_account_id'
      }
    },
    transaction_type: {
      type: DataTypes.ENUM('earning_pending', 'earning_released', 'payout_requested', 'payout_paid', 'payout_returned', 'hold_reserved', 'hold_released', 'manual_adjustment'),
      allowNull: false
    },
    direction: {
      type: DataTypes.ENUM('credit', 'debit', 'internal'),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    source_type: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    source_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    source_reference: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    balance_pending_after: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    balance_available_after: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    balance_reserved_after: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('posted', 'void'),
      allowNull: false,
      defaultValue: 'posted'
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
    tableName: 'creator_payout_transactions',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'creator_payout_transaction_id' }] },
      { name: 'idx_creator_payout_transactions_creator', using: 'BTREE', fields: [{ name: 'creator_id' }] },
      { name: 'idx_creator_payout_transactions_request', using: 'BTREE', fields: [{ name: 'creator_payout_request_id' }] },
      { name: 'idx_creator_payout_transactions_source', using: 'BTREE', fields: [{ name: 'source_type' }, { name: 'source_reference' }] }
    ]
  });
};
