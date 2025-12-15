const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment_returns', {
    return_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    assignment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'equipment_assignments',
        key: 'assignment_id'
      }
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'equipment',
        key: 'equipment_id'
      }
    },
    condition: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    inspection_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    returned_on: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'equipment_returns',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "return_id" },
        ]
      },
      {
        name: "assignment_id",
        using: "BTREE",
        fields: [
          { name: "assignment_id" },
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
