const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('tasks', {
    assign_task_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    priority_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    due_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    estimated_duration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    dependencies: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    additional_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assigned_to: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    send_sms: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    send_email: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    checklist: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('draft','assigned','completed'),
      allowNull: true,
      defaultValue: "assigned"
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
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'tasks',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "assign_task_id" },
        ]
      },
      {
        name: "assigned_to",
        using: "BTREE",
        fields: [
          { name: "assigned_to" },
        ]
      },
    ]
  });
};
