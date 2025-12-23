const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('referrals', {
    referral_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    affiliate_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK to affiliates - the referrer',
      references: {
        model: 'affiliates',
        key: 'affiliate_id'
      }
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'FK to payment_transactions - the booking payment',
      references: {
        model: 'payment_transactions',
        key: 'payment_id'
      }
    },
    referral_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'The referral code used'
    },
    referred_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'FK to users - the referred customer (null for guests)',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    referred_guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Guest email if not a registered user'
    },
    booking_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Total booking amount'
    },
    commission_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 200.00,
      comment: 'Fixed commission per booking (200 SAR)'
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Referral status'
    },
    payout_status: {
      type: DataTypes.ENUM('pending', 'approved', 'paid', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Payout status for this referral'
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
    tableName: 'referrals',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "referral_id" },
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
        name: "idx_payment_id",
        using: "BTREE",
        fields: [
          { name: "payment_id" },
        ]
      },
      {
        name: "idx_referral_code",
        using: "BTREE",
        fields: [
          { name: "referral_code" },
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
        name: "idx_payout_status",
        using: "BTREE",
        fields: [
          { name: "payout_status" },
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

