const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('sales_leads', {
    lead_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
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
    client_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    lead_type: {
      type: DataTypes.ENUM('self_serve', 'sales_assisted'),
      allowNull: false
    },
    lead_status: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'in_progress_self_serve'
    },
    intent: {
      type: DataTypes.ENUM('Hot','Warm','Cold'),
      allowNull: true
    },
    lead_source: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    assigned_sales_rep_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    last_activity_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    },
    contacted_sales_at: {
      type: DataTypes.DATE,
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
    },
    intent_updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    intent_updated_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'sales_leads',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "lead_id" },
        ]
      },
      {
        name: "idx_lead_status",
        using: "BTREE",
        fields: [
          { name: "lead_status" },
        ]
      },
      {
        name: "idx_assigned_rep",
        using: "BTREE",
        fields: [
          { name: "assigned_sales_rep_id" },
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
        name: "idx_last_activity",
        using: "BTREE",
        fields: [
          { name: "last_activity_at" },
        ]
      },
      {
        name: "idx_lead_type",
        using: "BTREE",
        fields: [
          { name: "lead_type" },
        ]
      },
      {
        name: "user_id",
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
    ]
  });
};
