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
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
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
        name: "idx_booking",
        using: "BTREE",
        fields: [
          { name: "booking_id" },
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
