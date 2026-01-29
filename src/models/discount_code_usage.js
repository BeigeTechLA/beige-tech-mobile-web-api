const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('discount_code_usage', {
    usage_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    discount_code_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'discount_codes',
        key: 'discount_code_id'
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
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    guest_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    original_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    final_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'discount_code_usage',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "usage_id" },
        ]
      },
      {
        name: "idx_discount_code",
        using: "BTREE",
        fields: [
          { name: "discount_code_id" },
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
        name: "idx_user",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "idx_used_at",
        using: "BTREE",
        fields: [
          { name: "used_at" },
        ]
      },
    ]
  });
};
