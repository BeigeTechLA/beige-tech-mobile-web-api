const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('creator_payout_requests', {
    creator_payout_request_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    request_code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },
    creator_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
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
    payout_method: {
      type: DataTypes.ENUM('stripe', 'bank_transfer', 'manual'),
      allowNull: false,
      defaultValue: 'manual'
    },
    status: {
      type: DataTypes.ENUM('requested', 'approved', 'processing', 'paid', 'rejected', 'cancelled', 'failed'),
      allowNull: false,
      defaultValue: 'requested'
    },
    external_reference: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
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
    processed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    rejection_reason: {
      type: DataTypes.TEXT,
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
    tableName: 'creator_payout_requests',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'creator_payout_request_id' }] },
      { name: 'uniq_creator_payout_requests_code', unique: true, using: 'BTREE', fields: [{ name: 'request_code' }] },
      { name: 'idx_creator_payout_requests_creator', using: 'BTREE', fields: [{ name: 'creator_id' }] },
      { name: 'idx_creator_payout_requests_status', using: 'BTREE', fields: [{ name: 'status' }] },
      { name: 'idx_creator_payout_requests_requested_at', using: 'BTREE', fields: [{ name: 'requested_at' }] }
    ]
  });
};
