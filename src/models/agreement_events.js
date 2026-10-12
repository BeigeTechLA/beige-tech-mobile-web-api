const Sequelize = require('sequelize');

module.exports = function agreementEvents(sequelize, DataTypes) {
  return sequelize.define('agreement_events', {
    agreement_event_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    agreement_document_id: { type: DataTypes.INTEGER, allowNull: false },
    actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
    actor_creator_id: { type: DataTypes.INTEGER, allowNull: true },
    event_type: { type: DataTypes.STRING(80), allowNull: false },
    metadata_json: { type: DataTypes.TEXT('long'), allowNull: true },
    occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('current_timestamp') }
  }, { sequelize, tableName: 'agreement_events', timestamps: false });
};
