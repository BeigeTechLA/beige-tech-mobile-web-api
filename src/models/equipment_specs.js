const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment_specs', {
    spec_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'equipment',
        key: 'equipment_id'
      }
    },
    spec_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    spec_value: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_active: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 1
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'equipment_specs',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "spec_id" },
        ]
      },
      {
        name: "equipment_id",
        using: "BTREE",
        fields: [
          { name: "equipment_id" },
        ]
      },
    ]
  });
};
