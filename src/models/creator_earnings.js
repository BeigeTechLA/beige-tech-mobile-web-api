const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('creator_earnings', {
    creator_earning_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
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
    net_earning_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    status: {
      type: DataTypes.ENUM('pending', 'earned', 'payout_pending', 'paid', 'held', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    earned_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    payout_id: {
      type: DataTypes.INTEGER,
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
    tableName: 'creator_earnings',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'creator_earning_id' }] },
      { name: 'idx_creator_earnings_booking', using: 'BTREE', fields: [{ name: 'booking_id' }] },
      { name: 'idx_creator_earnings_creator', using: 'BTREE', fields: [{ name: 'creator_id' }] },
      { name: 'idx_creator_earnings_payment', using: 'BTREE', fields: [{ name: 'payment_id' }] },
      { name: 'idx_creator_earnings_status', using: 'BTREE', fields: [{ name: 'status' }] }
    ]
  });
};
