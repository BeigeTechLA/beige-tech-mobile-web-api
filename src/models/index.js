const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const initModels = require('./init-models');
const salesRepAvailabilityFactory = require('./sales_rep_availability');
const salesRepLiveStatusFactory = require('./sales_rep_live_status');
const salesRepStatusActivityFactory = require('./sales_rep_status_activity');
const userArchiveHistoryFactory = require('./user_archive_history');
const appNotificationsFactory = require('./app_notifications');
const signupCreditPromotionSettingsFactory = require('./signup_credit_promotion_settings');
const shiftsFactory = require('./shifts');
const shiftSalespeopleFactory = require('./shift_salespeople');
const assignmentHistoryFactory = require('./assignment_history');
const creatorAvailabilityRulesFactory = require('./creator_availability_rules');
const creatorAvailabilityBlocksFactory = require('./creator_availability_blocks');
const creatorCalendarConnectionsFactory = require('./creator_calendar_connections');

// initialize all auto-generated models properly
const models = initModels(sequelize);
models.sales_rep_availability = salesRepAvailabilityFactory(sequelize, DataTypes);
models.sales_rep_live_status = salesRepLiveStatusFactory(sequelize, DataTypes);
models.sales_rep_status_activity = salesRepStatusActivityFactory(sequelize, DataTypes);
models.user_archive_history = userArchiveHistoryFactory(sequelize, DataTypes);
models.app_notifications = appNotificationsFactory(sequelize, DataTypes);
models.signup_credit_promotion_settings = signupCreditPromotionSettingsFactory(sequelize, DataTypes);
models.shifts = shiftsFactory(sequelize, DataTypes);
models.shift_salespeople = shiftSalespeopleFactory(sequelize, DataTypes);
models.assignment_history = assignmentHistoryFactory(sequelize, DataTypes);
models.creator_availability_rules = creatorAvailabilityRulesFactory(sequelize, DataTypes);
models.creator_availability_blocks = creatorAvailabilityBlocksFactory(sequelize, DataTypes);
models.creator_calendar_connections = creatorCalendarConnectionsFactory(sequelize, DataTypes);

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

if (models.creator_availability_rules && models.crew_members) {
  models.creator_availability_rules.belongsTo(models.crew_members, {
    foreignKey: 'crew_member_id',
    as: 'crew_member'
  });
  models.crew_members.hasMany(models.creator_availability_rules, {
    foreignKey: 'crew_member_id',
    as: 'availability_rules'
  });
}

if (models.creator_availability_blocks && models.crew_members) {
  models.creator_availability_blocks.belongsTo(models.crew_members, {
    foreignKey: 'crew_member_id',
    as: 'crew_member'
  });
  models.crew_members.hasMany(models.creator_availability_blocks, {
    foreignKey: 'crew_member_id',
    as: 'availability_blocks'
  });
}

if (models.creator_calendar_connections && models.crew_members) {
  models.creator_calendar_connections.belongsTo(models.crew_members, {
    foreignKey: 'crew_member_id',
    as: 'crew_member'
  });
  models.crew_members.hasMany(models.creator_calendar_connections, {
    foreignKey: 'crew_member_id',
    as: 'calendar_connections'
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

if (models.shifts && models.shift_salespeople && models.assignment_history && models.users) {
  models.shifts.hasMany(models.shift_salespeople, { foreignKey: 'shift_id', as: 'salespeople' });
  models.shift_salespeople.belongsTo(models.shifts, { foreignKey: 'shift_id', as: 'shift' });
  models.shift_salespeople.belongsTo(models.users, { foreignKey: 'sales_rep_id', as: 'sales_rep' });
  models.users.hasMany(models.shift_salespeople, { foreignKey: 'sales_rep_id', as: 'shift_links' });
  models.shifts.belongsTo(models.users, { foreignKey: 'next_assignee_sales_rep_id', as: 'next_assignee' });
  models.assignment_history.belongsTo(models.shifts, { foreignKey: 'shift_id', as: 'shift' });
  models.assignment_history.belongsTo(models.users, { foreignKey: 'sales_rep_id', as: 'sales_rep' });
  models.shifts.hasMany(models.assignment_history, { foreignKey: 'shift_id', as: 'assignment_history' });
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
models.signup_credit_promotion_settings.belongsTo(models.users, {
  foreignKey: 'updated_by_user_id',
  as: 'updated_by'
});

const Signature = require('./signature.model')(sequelize, DataTypes);
models.signatures = Signature;

if (models.quotes && models.signatures) {
  models.signatures.belongsTo(models.quotes, { foreignKey: 'quote_id' });
  models.quotes.hasOne(models.signatures, { foreignKey: 'quote_id' });
}

models.sequelize = sequelize;
models.Sequelize = require('sequelize');



module.exports = models;
