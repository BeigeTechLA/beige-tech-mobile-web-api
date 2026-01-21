const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('crew_equipment_photos', {
    crew_equipment_photo_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    crew_equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'crew_equipment',
        key: 'crew_equipment_id'
      }
    },
    file_url: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    sort_order: {
      type: DataTypes.INTEGER,
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
      allowNull: true,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'crew_equipment_photos',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "crew_equipment_photo_id" },
        ]
      },
      {
        name: "fk_ce_photo",
        using: "BTREE",
        fields: [
          { name: "crew_equipment_id" },
        ]
      },
    ]
  });
};
