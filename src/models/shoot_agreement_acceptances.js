const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('shoot_agreement_acceptances', {
    id: { autoIncrement: true, type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    shoot_agreement_recipient_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_agreement_recipients', key: 'id' } },
    shoot_agreement_version_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'shoot_agreement_versions', key: 'id' } },
    status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'cancelled', 'expired'), allowNull: false, defaultValue: 'pending' },
    sent_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.Sequelize.fn('current_timestamp'), onUpdate: Sequelize.Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'shoot_agreement_acceptances', timestamps: false });
};
