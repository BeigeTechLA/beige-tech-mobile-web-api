const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment_requests', {
    request_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    crew_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rental_purpose: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '1= project, 2= Other'
    },
    project_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    purpose: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    checkout_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    expected_return_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    admin_accept: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: '0= pending, 1= accepted, 2= declined'
    },
    is_active: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'equipment_requests',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "request_id" }
        ]
      }
    ]
  });
};
