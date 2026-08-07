const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const initModels = require('./init-models');
const salesRepAvailabilityFactory = require('./sales_rep_availability');
const salesRepLiveStatusFactory = require('./sales_rep_live_status');
const salesRepStatusActivityFactory = require('./sales_rep_status_activity');
const userArchiveHistoryFactory = require('./user_archive_history');
const appNotificationsFactory = require('./app_notifications');

// initialize all auto-generated models properly
const models = initModels(sequelize);
models.sales_rep_availability = salesRepAvailabilityFactory(sequelize, DataTypes);
models.sales_rep_live_status = salesRepLiveStatusFactory(sequelize, DataTypes);
models.sales_rep_status_activity = salesRepStatusActivityFactory(sequelize, DataTypes);
models.user_archive_history = userArchiveHistoryFactory(sequelize, DataTypes);
models.app_notifications = appNotificationsFactory(sequelize, DataTypes);

if (models.sales_rep_availability && models.users) {
  models.sales_rep_availability.belongsTo(models.users, {
    foreignKey: 'sales_rep_id',
    as: 'sales_rep'
  });

  models.users.hasMany(models.sales_rep_availability, {
    foreignKey: 'sales_rep_id',
    as: 'sales_rep_availability_entries'
  });
}

if (models.sales_rep_live_status && models.users) {
  models.sales_rep_live_status.belongsTo(models.users, {
    foreignKey: 'sales_rep_id',
    as: 'sales_rep'
  });

  models.users.hasOne(models.sales_rep_live_status, {
    foreignKey: 'sales_rep_id',
    as: 'sales_rep_live_status'
  });
}

if (models.sales_rep_status_activity && models.users) {
  models.sales_rep_status_activity.belongsTo(models.users, {
    foreignKey: 'sales_rep_id',
    as: 'sales_rep'
  });

  models.users.hasMany(models.sales_rep_status_activity, {
    foreignKey: 'sales_rep_id',
    as: 'sales_rep_status_activities'
  });
}

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

models.clients.belongsTo(models.users, {
  foreignKey: 'archived_by_user_id',
  as: 'archived_by'
});

models.clients.belongsTo(models.users, {
  foreignKey: 'restored_by_user_id',
  as: 'restored_by'
});

models.user_archive_history.belongsTo(models.users, {
  foreignKey: 'performed_by_user_id',
  as: 'performed_by'
});

if (models.app_notifications && models.users) {
  models.app_notifications.belongsTo(models.users, {
    foreignKey: 'user_id',
    as: 'user'
  });

  models.users.hasMany(models.app_notifications, {
    foreignKey: 'user_id',
    as: 'app_notifications'
  });

  models.app_notifications.belongsTo(models.users, {
    foreignKey: 'sender_user_id',
    as: 'sender_user'
  });

  models.users.hasMany(models.app_notifications, {
    foreignKey: 'sender_user_id',
    as: 'sender_user_app_notifications'
  });
}

const Signature = require('./signature.model')(sequelize, DataTypes);
models.signatures = Signature;

if (models.quotes && models.signatures) {
  models.signatures.belongsTo(models.quotes, { foreignKey: 'quote_id' });
  models.quotes.hasOne(models.signatures, { foreignKey: 'quote_id' });
}

models.sequelize = sequelize;
models.Sequelize = require('sequelize');



module.exports = models;
