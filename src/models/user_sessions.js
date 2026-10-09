module.exports = function userSessionsModel(sequelize, DataTypes) {
  return sequelize.define('user_sessions', {
    session_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    login_session_id: { type: DataTypes.STRING(36), allowNull: true, unique: true },
    permissions_version: { type: DataTypes.INTEGER, allowNull: true },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    previous_token_hash: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    last_used_at: { type: DataTypes.DATE, allowNull: false },
    user_agent: { type: DataTypes.STRING(512), allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false }
  }, { tableName: 'user_sessions', timestamps: false });
};
