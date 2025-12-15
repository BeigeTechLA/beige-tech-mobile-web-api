const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('crew_member_files', {
    crew_files_id: {
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
    file_type: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_path: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'crew_member_files',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "crew_files_id" },
        ]
      },
      {
        name: "crew_member_id",
        using: "BTREE",
        fields: [
          { name: "crew_member_id" },
        ]
      },
    ]
  });
};
