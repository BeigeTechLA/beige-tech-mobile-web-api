const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('assignment_checklist', {
    id: {
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
    checklist_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'checklist_master',
        key: 'checklist_id'
      }
    },
    value: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
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
    tableName: 'assignment_checklist',
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
        name: "fk_ac_assignment",
        using: "BTREE",
        fields: [
          { name: "assignment_id" },
        ]
      },
      {
        name: "fk_ac_checklist",
        using: "BTREE",
        fields: [
          { name: "checklist_id" },
        ]
      },
    ]
  });
};
