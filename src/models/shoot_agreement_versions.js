const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_agreement_versions', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shoot_agreement_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_agreements', key: 'id' } },
    version_number: { type: DataTypes.STRING(20), allowNull: false },
    project_snapshot: { type: DataTypes.JSON, allowNull: false },
    snapshot: { type: DataTypes.JSON, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    is_deleted: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    deleted_by_user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_agreement_versions', timestamps: false });
};
