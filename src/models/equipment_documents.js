const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('equipment_documents', {
    document_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'equipment',
        key: 'equipment_id'
      }
    },
    doc_type: {
      type: DataTypes.ENUM('manual','warranty'),
      allowNull: true
    },
    file_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_active: {
      type: DataTypes.TINYINT,
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
    tableName: 'equipment_documents',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "document_id" },
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
