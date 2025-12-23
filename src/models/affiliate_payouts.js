const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('affiliate_payouts', {
    payout_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    affiliate_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK to affiliates',
      references: {
        model: 'affiliates',
        key: 'affiliate_id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Payout amount in SAR'
    },
    payout_method: {
      type: DataTypes.ENUM('bank_transfer', 'paypal', 'stripe'),
      allowNull: false,
      comment: 'Payout method used'
    },
    payout_details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Payout account details at time of payout'
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'processing', 'paid', 'failed', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Payout status'
    },
    transaction_reference: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'External transaction reference'
    },
    processed_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Admin user ID who processed',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When payout was processed'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Admin notes'
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
    tableName: 'affiliate_payouts',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "payout_id" },
        ]
      },
      {
        name: "idx_affiliate_id",
        using: "BTREE",
        fields: [
          { name: "affiliate_id" },
        ]
      },
      {
        name: "idx_status",
        using: "BTREE",
        fields: [
          { name: "status" },
        ]
      },
      {
        name: "idx_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
      {
        name: "idx_processed_at",
        using: "BTREE",
        fields: [
          { name: "processed_at" },
        ]
      },
    ]
  });
};

