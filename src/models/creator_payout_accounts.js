const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('creator_payout_accounts', {
    creator_payout_account_id: {
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
    payout_method: {
      type: DataTypes.ENUM('stripe', 'bank_transfer', 'manual'),
      allowNull: false,
      defaultValue: 'manual'
    },
    account_label: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    stripe_account_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    account_holder_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    bank_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    account_last4: {
      type: DataTypes.STRING(4),
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD'
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('pending', 'verified', 'disabled'),
      allowNull: false,
      defaultValue: 'pending'
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
    tableName: 'creator_payout_accounts',
    timestamps: false,
    indexes: [
      { name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'creator_payout_account_id' }] },
      { name: 'idx_creator_payout_accounts_creator', using: 'BTREE', fields: [{ name: 'creator_id' }] },
      { name: 'idx_creator_payout_accounts_status', using: 'BTREE', fields: [{ name: 'status' }] }
    ]
  });
};
