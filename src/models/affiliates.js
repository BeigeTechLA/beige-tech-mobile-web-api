const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('affiliates', {
    affiliate_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK to users - the affiliate owner',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    referral_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      comment: 'Unique referral code for the affiliate'
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Affiliate account status'
    },
    total_referrals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total number of referrals made'
    },
    successful_referrals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of successful paid referrals'
    },
    total_earnings: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Total earnings in SAR'
    },
    pending_earnings: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Pending earnings awaiting payout'
    },
    paid_earnings: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Total paid out earnings'
    },
    payout_method: {
      type: DataTypes.ENUM('bank_transfer', 'paypal', 'stripe'),
      allowNull: true,
      comment: 'Preferred payout method'
    },
    payout_details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Payout account details (bank info, email, etc.)'
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
    tableName: 'affiliates',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "affiliate_id" },
        ]
      },
      {
        name: "referral_code",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "referral_code" },
        ]
      },
      {
        name: "idx_user_id",
        using: "BTREE",
        fields: [
          { name: "user_id" },
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
    ]
  });
};

