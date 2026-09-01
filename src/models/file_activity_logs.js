const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('file_activity_logs', {
    id: {
      autoIncrement: true,
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      primaryKey: true
    },
    client_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    client_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    action: {
      type: DataTypes.ENUM('created', 'deleted'),
      allowNull: false
    },
    folder_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    stage: {
      type: DataTypes.ENUM('pre_production', 'post_production'),
      allowNull: false
    },
    performed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    performed_by_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'file_activity_logs',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'id' }]
      },
      {
        name: 'idx_file_activity_logs_client',
        using: 'BTREE',
        fields: [{ name: 'client_id' }]
      },
      {
        name: 'idx_file_activity_logs_stage_action',
        using: 'BTREE',
        fields: [{ name: 'stage' }, { name: 'action' }]
      },
      {
        name: 'idx_file_activity_logs_created_at',
        using: 'BTREE',
        fields: [{ name: 'created_at' }]
      }
    ]
  });
};
