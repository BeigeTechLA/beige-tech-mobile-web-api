const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('payment_links', {
    payment_link_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    link_token: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_leads',
        key: 'lead_id'
      }
    },
    client_lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'client_leads',
        key: 'lead_id'
      }
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    quote_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'sales_quotes',
        key: 'sales_quote_id'
      }
    },
    discount_code_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'discount_codes',
        key: 'discount_code_id'
      }
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    payment_context: {
      type: DataTypes.ENUM('booking_payment', 'additional_quote_payment'),
      allowNull: false,
      defaultValue: 'booking_payment'
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    is_used: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 0
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'payment_links',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "payment_link_id" },
        ]
      },
      {
        name: "link_token",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "link_token" },
        ]
      },
      {
        name: "idx_token",
        using: "BTREE",
        fields: [
          { name: "link_token" },
        ]
      },
      {
        name: "idx_lead",
        using: "BTREE",
        fields: [
          { name: "lead_id" },
        ]
      },
      {
        name: "idx_client_lead",
        using: "BTREE",
        fields: [
          { name: "client_lead_id" },
        ]
      },
      {
        name: "idx_booking",
        using: "BTREE",
        fields: [
          { name: "booking_id" },
        ]
      },
      {
        name: "idx_quote",
        using: "BTREE",
        fields: [
          { name: "quote_id" },
        ]
      },
      {
        name: "idx_payment_context",
        using: "BTREE",
        fields: [
          { name: "payment_context" },
        ]
      },
      {
        name: "idx_expires",
        using: "BTREE",
        fields: [
          { name: "expires_at" },
        ]
      },
      {
        name: "idx_is_used",
        using: "BTREE",
        fields: [
          { name: "is_used" },
        ]
      },
    ]
  });
};
