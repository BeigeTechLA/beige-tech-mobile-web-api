const sequelize = require('../db');

const initModels = require('./init-models');

// initialize all auto-generated models properly
const models = initModels(sequelize);

// expose models + sequelize instance
models.sequelize = sequelize;
models.Sequelize = require('sequelize');

module.exports = models;
