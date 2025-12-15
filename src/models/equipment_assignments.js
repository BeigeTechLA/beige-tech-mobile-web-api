const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment_assignments', {
    assignment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'equipment',
        key: 'equipment_id'
      }
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    crew_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    check_out_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    expected_return_date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    rent_calculation: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    pickup_location: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    send_email: {
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
    tableName: 'equipment_assignments',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "assignment_id" },
        ]
      },
      {
        name: "fk_eq_assign_equipment",
        using: "BTREE",
        fields: [
          { name: "equipment_id" },
        ]
      },
      {
        name: "fk_eq_assign_project",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
      {
        name: "fk_eq_assign_crew",
        using: "BTREE",
        fields: [
          { name: "crew_member_id" },
        ]
      },
    ]
  });
};
