const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_assignments', {
    assignment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'projects',
        key: 'project_id'
      }
    },
    role_type: {
      type: DataTypes.ENUM('CREATOR', 'EDITOR', 'QC_REVIEWER', 'ADMIN'),
      allowNull: false
    },
    assigned_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    assigned_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM(
        'PENDING_ACCEPTANCE',
        'ACCEPTED',
        'DECLINED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED'
      ),
      allowNull: false,
      defaultValue: 'PENDING_ACCEPTANCE'
    },
    estimated_hours: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: true
    },
    actual_hours: {
      type: DataTypes.DECIMAL(5,2),
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    response_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    response_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assignment_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    priority: {
      type: DataTypes.ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT'),
      allowNull: true,
      defaultValue: 'NORMAL'
    },
    deadline: {
      type: DataTypes.DATE,
      allowNull: true
    },
    agreed_rate: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    rate_type: {
      type: DataTypes.ENUM('FLAT', 'HOURLY', 'PROJECT'),
      allowNull: true
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
    tableName: 'project_assignments',
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
        name: "idx_assignments_project",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
      {
        name: "idx_assignments_user",
        using: "BTREE",
        fields: [
          { name: "assigned_user_id" },
        ]
      },
      {
        name: "idx_assignments_role",
        using: "BTREE",
        fields: [
          { name: "role_type" },
        ]
      },
      {
        name: "idx_assignments_status",
        using: "BTREE",
        fields: [
          { name: "status" },
        ]
      },
      {
        name: "idx_assignments_deadline",
        using: "BTREE",
        fields: [
          { name: "deadline" },
        ]
      },
      {
        name: "idx_assignments_created_at",
        using: "BTREE",
        fields: [
          { name: "created_at" },
        ]
      },
    ]
  });
};
