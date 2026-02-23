const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('quotes', {
    quote_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'FK to stream_project_booking if linked'
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    pricing_mode: {
      type: DataTypes.ENUM('general', 'wedding'),
      allowNull: false,
      defaultValue: 'general'
    },
    shoot_hours: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      defaultValue: 0
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    discount_code_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    applied_discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed_amount'),
      allowNull: true
    },
    applied_discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    price_after_discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    margin_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 25.00
    },
    margin_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'confirmed', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'draft'
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    notes: {
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
    tableName: 'quotes',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "quote_id" },
        ]
      },
      {
        name: "idx_quotes_booking",
        using: "BTREE",
        fields: [
          { name: "booking_id" },
        ]
      },
      {
        name: "idx_quotes_user",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "idx_quotes_status",
        using: "BTREE",
        fields: [
          { name: "status" },
        ]
      },
    ]
  });
};

