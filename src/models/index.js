const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const initModels = require('./init-models');
const salesRepAvailabilityFactory = require('./sales_rep_availability');
const salesRepLiveStatusFactory = require('./sales_rep_live_status');
const salesRepStatusActivityFactory = require('./sales_rep_status_activity');

const cpCompensationsFactory = require('./cp_compensations');
const cpCompensationAdvancesFactory = require('./cp_compensation_advances');
const cpCompensationLogsFactory = require('./cp_compensation_logs');

// initialize all auto-generated models properly
const models = initModels(sequelize);
models.sales_rep_availability = salesRepAvailabilityFactory(sequelize, DataTypes);
models.sales_rep_live_status = salesRepLiveStatusFactory(sequelize, DataTypes);
models.sales_rep_status_activity = salesRepStatusActivityFactory(sequelize, DataTypes);

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

const Signature = require('./signature.model')(sequelize, DataTypes);
models.signatures = Signature;

if (models.quotes && models.signatures) {
  models.signatures.belongsTo(models.quotes, { foreignKey: 'quote_id' });
  models.quotes.hasOne(models.signatures, { foreignKey: 'quote_id' });
}

models.cp_compensations = cpCompensationsFactory(sequelize, DataTypes);
models.cp_compensation_advances = cpCompensationAdvancesFactory(sequelize, DataTypes);
models.cp_compensation_logs = cpCompensationLogsFactory(sequelize, DataTypes);

if (models.cp_compensations && models.cp_compensation_advances) {
  models.cp_compensations.hasMany(models.cp_compensation_advances, {
    foreignKey: 'compensation_id',
    as: 'advances'
  });
  models.cp_compensation_advances.belongsTo(models.cp_compensations, {
    foreignKey: 'compensation_id',
    as: 'compensation'
  });
}

if (models.cp_compensations && models.cp_compensation_logs) {
  models.cp_compensations.hasMany(models.cp_compensation_logs, {
    foreignKey: 'compensation_id',
    as: 'logs'
  });
  models.cp_compensation_logs.belongsTo(models.cp_compensations, {
    foreignKey: 'compensation_id',
    as: 'compensation'
  });
}

if (models.cp_compensations && models.stream_project_booking) {
  models.stream_project_booking.hasMany(models.cp_compensations, {
    foreignKey: 'booking_id',
    as: 'cp_compensations'
  });
  models.cp_compensations.belongsTo(models.stream_project_booking, {
    foreignKey: 'booking_id',
    as: 'booking'
  });
}

if (models.cp_compensations && models.crew_members) {
  models.crew_members.hasMany(models.cp_compensations, {
    foreignKey: 'crew_member_id',
    as: 'compensations'
  });
  models.cp_compensations.belongsTo(models.crew_members, {
    foreignKey: 'crew_member_id',
    as: 'crew_member'
  });
}


models.sequelize = sequelize;
models.Sequelize = require('sequelize');



module.exports = models;
