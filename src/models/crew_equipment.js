const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('crew_equipment', {
    crew_equipment_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    crew_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_members',
        key: 'crew_member_id'
      }
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'equipment',
        key: 'equipment_id'
      }
    },
    equipment_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'equipment_category',
        key: 'category_id'
      }
    },
    manufacturer: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    model: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    model_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    serial_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    market_price: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    rental_price: {
      type: DataTypes.DECIMAL(10,2),
      allowNull: true
    },
    rental_price_type: {
      type: DataTypes.TINYINT,
      allowNull: true,
      comment: "1=hour,2=day,3=unit"
    },
    is_available_for_rent: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    storage_location: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    condition_notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_completed: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 0
    },
    is_draft: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 1
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: 1
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
    },
     last_maintenance_date: {
    type: DataTypes.DATEONLY, // or DataTypes.STRING depending on your DB
    allowNull: true
  },
  equipment_on_maintenance: {
    type: DataTypes.INTEGER, // 1 or 0
    defaultValue: 0,
    comment: "0= available, 1= maintenance"
  }
  }, {
    sequelize,
    tableName: 'crew_equipment',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "crew_equipment_id" },
        ]
      },
      {
        name: "uniq_crew_equipment",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "crew_member_id" },
          { name: "equipment_id" },
        ]
      },
      {
        name: "fk_crew_equipment_category",
        using: "BTREE",
        fields: [
          { name: "category_id" },
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
