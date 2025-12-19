const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('payment_transactions', {
    payment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    stripe_payment_intent_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      comment: 'Stripe PaymentIntent ID'
    },
    stripe_charge_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Stripe Charge ID'
    },
    creator_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK to crew_members - the CP being booked',
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'FK to users - null for guest checkouts',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Email for guest bookings'
    },
    hours: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Number of hours booked'
    },
    hourly_rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'CP hourly rate at time of booking'
    },
    cp_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Total CP cost (hours × hourly_rate)'
    },
    equipment_cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Total equipment rental cost'
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'cp_cost + equipment_cost'
    },
    beige_margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 25.00,
      comment: 'Platform margin percentage'
    },
    beige_margin_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Platform margin in dollars'
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Final amount charged to customer'
    },
    shoot_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Date of the shoot'
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Shoot location'
    },
    shoot_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Type of shoot (e.g., wedding, corporate)'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional booking notes'
    },
    status: {
      type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Payment status'
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
    tableName: 'payment_transactions',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "payment_id" },
        ]
      },
      {
        name: "stripe_payment_intent_id",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "stripe_payment_intent_id" },
        ]
      },
      {
        name: "idx_creator_id",
        using: "BTREE",
        fields: [
          { name: "creator_id" },
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
        name: "idx_shoot_date",
        using: "BTREE",
        fields: [
          { name: "shoot_date" },
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
      }
    ]
  });
};
