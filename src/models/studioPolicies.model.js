const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioPolicies = sequelize.define('StudioPolicies', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    // JSON array of selected policy group titles
    selected_policies: { type: DataTypes.JSON },
}, {
    tableName: 'studio_policies',
    timestamps: true,
});

module.exports = StudioPolicies;