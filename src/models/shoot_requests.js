const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_requests', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    project_name: { type: DataTypes.STRING(255), allowNull: false },
    project_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    client_name: { type: DataTypes.STRING(255), allowNull: true },
    creative_partner_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'crew_members', key: 'crew_member_id' } },
    role: { type: DataTypes.STRING(100), allowNull: false },
    shoot_type: { type: DataTypes.STRING(100), allowNull: true },
    compensation_offer: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    production_date: { type: DataTypes.DATEONLY, allowNull: true },
    location: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'declined'), allowNull: false, defaultValue: 'pending' },
    created_by: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    is_deleted: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    deleted_by_user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_requests', timestamps: false, indexes: [{ name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'id' }] }, { name: 'creative_partner_id', using: 'BTREE', fields: [{ name: 'creative_partner_id' }] }, { name: 'created_by', using: 'BTREE', fields: [{ name: 'created_by' }] }] });
};
