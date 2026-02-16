const sequelize = require('../db');

const initModels = require('./init-models');

// initialize all auto-generated models properly
const models = initModels(sequelize);

if (models.users) {
  models.users.addScope(
    'defaultScope',
    {
      where: { is_active: 1 }
    },
    { override: true }
  );

  models.users.addScope('all', {
    where: {}
  });
}

models.clients.belongsTo(models.users, {
  foreignKey: 'user_id',
  as: 'user'
});

models.sequelize = sequelize;
models.Sequelize = require('sequelize');

module.exports = models;
