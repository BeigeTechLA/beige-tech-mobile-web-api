const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_dispute_payout_holds', {
    finance_dispute_payout_hold_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    finance_dispute_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'finance_disputes',
        key: 'finance_dispute_id'
      }
    },
    creator_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    creator_earning_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'creator_earnings',
        key: 'creator_earning_id'
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
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    hold_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    released_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('held', 'partially_released', 'released', 'cancelled'),
      allowNull: false,
      defaultValue: 'held'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    held_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    held_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    released_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    released_at: {
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
    tableName: 'finance_dispute_payout_holds',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'finance_dispute_payout_hold_id' }] },
      { name: 'idx_finance_dispute_holds_dispute', using: 'BTREE', fields: [{ name: 'finance_dispute_id' }] },
      { name: 'idx_finance_dispute_holds_creator', using: 'BTREE', fields: [{ name: 'creator_id' }] },
      { name: 'idx_finance_dispute_holds_status', using: 'BTREE', fields: [{ name: 'status' }] }
    ]
  });
};
