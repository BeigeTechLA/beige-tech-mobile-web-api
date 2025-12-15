const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_brief', {
    project_brief_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stream_project_booking',
        key: 'stream_project_booking_id'
      }
    },
    brief_title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    project_overview: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    event_time: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    event_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    call_time_schedule: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    key_deliverables: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    special_instructions: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    main_contact_name: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    contact_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    contact_email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    assigned_crew: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assigned_equipment: {
      type: DataTypes.TEXT,
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
    tableName: 'project_brief',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "project_brief_id" },
        ]
      },
      {
        name: "fk_project_brief_project",
        using: "BTREE",
        fields: [
          { name: "project_id" },
        ]
      },
    ]
  });
};
