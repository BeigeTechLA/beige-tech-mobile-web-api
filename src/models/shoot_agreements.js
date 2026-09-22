const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_agreements', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shoot_request_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_requests', key: 'id' } },
    assignment_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    creative_partner_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'crew_members', key: 'crew_member_id' } },
    role: { type: DataTypes.STRING(100), allowNull: false },
    compensation: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    production_date: { type: DataTypes.DATEONLY, allowNull: true },
    location: { type: DataTypes.STRING(255), allowNull: true },
    call_time: { type: DataTypes.TIME, allowNull: true },
    expected_end_time: { type: DataTypes.TIME, allowNull: true },
    scope_of_services: { type: DataTypes.TEXT, allowNull: true },
    equipment_requirements: { type: DataTypes.TEXT, allowNull: true },
    deliverables: { type: DataTypes.TEXT, allowNull: true },
    approved_expenses: { type: DataTypes.TEXT, allowNull: true },
    special_instructions: { type: DataTypes.TEXT, allowNull: true },
    current_version_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'shoot_agreement_versions', key: 'id' } },
    status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired'), allowNull: false, defaultValue: 'pending' },
    created_by: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    is_deleted: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    deleted_by_user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_agreements', timestamps: false, indexes: [{ name: 'PRIMARY', unique: true, using: 'BTREE', fields: [{ name: 'id' }] }, { name: 'shoot_request_id', using: 'BTREE', fields: [{ name: 'shoot_request_id' }] }, { name: 'creative_partner_id_status', using: 'BTREE', fields: [{ name: 'creative_partner_id' }, { name: 'status' }] }] });
};
