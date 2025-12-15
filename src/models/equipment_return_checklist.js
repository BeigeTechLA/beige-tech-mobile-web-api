const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment_return_checklist', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    return_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'equipment_returns',
        key: 'return_id'
      }
    },
    checklist_title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    value: {
      type: DataTypes.TINYINT,
      allowNull: true,
      defaultValue: 0
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'equipment_return_checklist',
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
        name: "return_id",
        using: "BTREE",
        fields: [
          { name: "return_id" },
        ]
      },
    ]
  });
};
