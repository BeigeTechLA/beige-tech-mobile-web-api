const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('creator_calendar_connections', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    crew_member_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    provider: {
      type: DataTypes.ENUM('google', 'apple'),
      allowNull: false
    },
    provider_account_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    access_token_encrypted: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    refresh_token_encrypted: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    token_expiry: {
      type: DataTypes.DATE,
      allowNull: true
    },
    selected_calendar_ids_json: {
      type: DataTypes.JSON,
      allowNull: true
    },
    sync_status: {
      type: DataTypes.ENUM('not_connected', 'connected', 'syncing', 'failed', 'revoked'),
      allowNull: false,
      defaultValue: 'connected'
    },
    last_synced_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_sync_error: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    disconnected_at: {
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
    }
  }, {
    sequelize,
    tableName: 'creator_calendar_connections',
    timestamps: false
  });
};
