const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('cp_general_agreement_acceptance', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    creative_partner_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'crew_members', key: 'crew_member_id' } },
    agreement_version_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'agreement_versions', key: 'id' } },
    project_id: { type: DataTypes.INTEGER, allowNull: true },
    role: { type: DataTypes.STRING(100), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'not_accepted', 'expired', 'cancelled'), allowNull: false, defaultValue: 'pending' },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    is_deleted: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    deleted_by_user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'cp_general_agreement_acceptance', timestamps: false, indexes: [{ name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'id' }] }, { name: 'creative_partner_id', using: 'BTREE', fields: [{ name: 'creative_partner_id' }] }, { name: 'agreement_version_id', using: 'BTREE', fields: [{ name: 'agreement_version_id' }] }] });
};
