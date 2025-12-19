const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('payment_equipment', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK to payment_transactions',
      references: {
        model: 'payment_transactions',
        key: 'payment_id'
      }
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'FK to equipment',
      references: {
        model: 'equipment',
        key: 'equipment_id'
      }
    },
    equipment_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Equipment price at time of booking'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'payment_equipment',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
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
        name: "idx_equipment_id",
        using: "BTREE",
        fields: [
          { name: "equipment_id" },
        ]
      }
    ]
  });
};
