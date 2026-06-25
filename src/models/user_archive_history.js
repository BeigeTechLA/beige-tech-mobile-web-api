const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user_archive_history', {
    history_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    target_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    target_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    performed_by_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    performed_by_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    performed_by_role: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    previous_status: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    new_status: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.fn('current_timestamp')
    }
  }, {
    sequelize,
    tableName: 'user_archive_history',
    timestamps: false,
    indexes: [
      {
        name: 'PRIMARY',
        unique: true,
        using: 'BTREE',
        fields: [{ name: 'history_id' }]
      },
      {
        name: 'idx_archive_history_target',
        using: 'BTREE',
        fields: [{ name: 'target_type' }, { name: 'target_id' }]
      },
      {
        name: 'idx_archive_history_user',
        using: 'BTREE',
        fields: [{ name: 'user_id' }]
      },
      {
        name: 'idx_archive_history_action',
        using: 'BTREE',
        fields: [{ name: 'action' }]
      },
      {
        name: 'idx_archive_history_created_at',
        using: 'BTREE',
        fields: [{ name: 'created_at' }]
      }
    ]
  });
};
