const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('finance_calendar_connections', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    provider: {
      type: DataTypes.ENUM('google'),
      allowNull: false,
      defaultValue: 'google',
      unique: true
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
    selected_calendar_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    selected_calendar_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sync_status: {
      type: DataTypes.ENUM('not_connected', 'connected', 'syncing', 'failed', 'revoked'),
      allowNull: false,
      defaultValue: 'not_connected'
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
    tableName: 'finance_calendar_connections',
    timestamps: false
  });
};
