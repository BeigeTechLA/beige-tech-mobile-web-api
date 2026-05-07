const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const StudioRules = sequelize.define('StudioRules', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studio_id: { type: DataTypes.INTEGER, allowNull: false },
    smoking_allowed: { type: DataTypes.BOOLEAN, defaultValue: false },
    alcohol_allowed: { type: DataTypes.BOOLEAN, defaultValue: true },
    cooking_allowed: { type: DataTypes.BOOLEAN, defaultValue: true },
    electricity_allowed: { type: DataTypes.BOOLEAN, defaultValue: true },
    external_food_allowed: { type: DataTypes.BOOLEAN, defaultValue: false },
    pets_allowed: { type: DataTypes.BOOLEAN, defaultValue: false },
    custom_rule: { type: DataTypes.TEXT },
}, {
    tableName: 'studio_rules',
    timestamps: true,
});

module.exports = StudioRules;