const Sequelize = require('sequelize');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_agreements', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    booking_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'stream_project_booking', key: 'stream_project_booking_id' } },
    agreement_mode: { type: DataTypes.ENUM('individual', 'common'), allowNull: false, defaultValue: 'individual' },
    current_version_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'shoot_agreement_versions', key: 'id' } },
    status: { type: DataTypes.ENUM('draft', 'sent', 'accepted', 'rejected', 'cancelled', 'expired'), allowNull: false, defaultValue: 'draft' },
    created_by: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    is_deleted: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 0 },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    deleted_by_user_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_agreements', timestamps: false });
};
