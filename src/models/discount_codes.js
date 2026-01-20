const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('discount_codes', {
    discount_code_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    code: {
      type: DataTypes.STRING(50),
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
      allowNull: true,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed_amount'),
      allowNull: false,
      defaultValue: 'percentage'
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    usage_type: {
      type: DataTypes.ENUM('one_time', 'multi_use'),
      allowNull: false,
      defaultValue: 'one_time'
    },
    max_uses: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    current_uses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
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
    tableName: 'discount_codes',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "discount_code_id" },
        ]
      },
      {
        name: "code",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "code" },
        ]
      },
      {
        name: "idx_code",
        using: "BTREE",
        fields: [
          { name: "code" },
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
        name: "idx_active",
        using: "BTREE",
        fields: [
          { name: "is_active" },
        ]
      },
      {
        name: "idx_expires",
        using: "BTREE",
        fields: [
          { name: "expires_at" },
        ]
      },
    ]
  });
};
