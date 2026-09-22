const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const initModels = require('./init-models');
const salesRepAvailabilityFactory = require('./sales_rep_availability');
const salesRepLiveStatusFactory = require('./sales_rep_live_status');
const salesRepStatusActivityFactory = require('./sales_rep_status_activity');
const userArchiveHistoryFactory = require('./user_archive_history');
const appNotificationsFactory = require('./app_notifications');
const signupCreditPromotionSettingsFactory = require('./signup_credit_promotion_settings');
const signupCreditPromoHistoryFactory = require('./signup_credit_promo_history');
const shiftsFactory = require('./shifts');
const shiftSalespeopleFactory = require('./shift_salespeople');
const assignmentHistoryFactory = require('./assignment_history');
const agreementsFactory = require('./agreements');
const agreementVersionsFactory = require('./agreement_versions');
const agreementSectionsFactory = require('./agreement_sections');
const cpGeneralAgreementAcceptanceFactory = require('./cp_general_agreement_acceptance');
const shootRequestsFactory = require('./shoot_requests');
const shootAgreementsFactory = require('./shoot_agreements');
const shootAgreementVersionsFactory = require('./shoot_agreement_versions');
const agreementActivityLogFactory = require('./agreement_activity_log');

// initialize all auto-generated models properly
const models = initModels(sequelize);
models.sales_rep_availability = salesRepAvailabilityFactory(sequelize, DataTypes);
models.sales_rep_live_status = salesRepLiveStatusFactory(sequelize, DataTypes);
models.sales_rep_status_activity = salesRepStatusActivityFactory(sequelize, DataTypes);
models.user_archive_history = userArchiveHistoryFactory(sequelize, DataTypes);
models.app_notifications = appNotificationsFactory(sequelize, DataTypes);
models.signup_credit_promotion_settings = signupCreditPromotionSettingsFactory(sequelize, DataTypes);
models.signup_credit_promo_history = signupCreditPromoHistoryFactory(sequelize, DataTypes);
models.shifts = shiftsFactory(sequelize, DataTypes);
models.shift_salespeople = shiftSalespeopleFactory(sequelize, DataTypes);
models.assignment_history = assignmentHistoryFactory(sequelize, DataTypes);
models.agreements = agreementsFactory(sequelize, DataTypes);
models.agreement_versions = agreementVersionsFactory(sequelize, DataTypes);
models.agreement_sections = agreementSectionsFactory(sequelize, DataTypes);
models.cp_general_agreement_acceptance = cpGeneralAgreementAcceptanceFactory(sequelize, DataTypes);
models.shoot_requests = shootRequestsFactory(sequelize, DataTypes);
models.shoot_agreements = shootAgreementsFactory(sequelize, DataTypes);
models.shoot_agreement_versions = shootAgreementVersionsFactory(sequelize, DataTypes);
models.agreement_activity_log = agreementActivityLogFactory(sequelize, DataTypes);

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

models.signup_credit_promo_history.belongsTo(models.signup_credit_promotion_settings, {
  foreignKey: 'signup_credit_promotion_setting_id',
  as: 'setting'
});

models.signup_credit_promo_history.belongsTo(models.users, {
  foreignKey: 'changed_by_user_id',
  as: 'changed_by'
});

const Signature = require('./signature.model')(sequelize, DataTypes);
models.signatures = Signature;

if (models.agreements && models.agreement_versions && models.agreement_sections) {
  models.agreements.hasMany(models.agreement_versions, { foreignKey: 'agreement_id', as: 'versions' });
  models.agreement_versions.belongsTo(models.agreements, { foreignKey: 'agreement_id', as: 'agreement' });
  models.agreement_versions.hasMany(models.agreement_sections, { foreignKey: 'agreement_version_id', as: 'sections' });
  models.agreement_sections.belongsTo(models.agreement_versions, { foreignKey: 'agreement_version_id', as: 'version' });
  models.agreements.belongsTo(models.agreement_versions, { foreignKey: 'current_version_id', as: 'current_version' });
  models.cp_general_agreement_acceptance.belongsTo(models.agreement_versions, { foreignKey: 'agreement_version_id' });
  models.cp_general_agreement_acceptance.belongsTo(models.crew_members, { foreignKey: 'creative_partner_id', targetKey: 'crew_member_id', as: 'creative_partner' });
}

if (models.shoot_requests && models.shoot_agreements && models.shoot_agreement_versions) {
  models.shoot_agreements.belongsTo(models.shoot_requests, { foreignKey: 'shoot_request_id' });
  models.shoot_requests.hasOne(models.shoot_agreements, { foreignKey: 'shoot_request_id', as: 'agreement' });
  models.shoot_agreements.hasMany(models.shoot_agreement_versions, { foreignKey: 'shoot_agreement_id', as: 'versions' });
  models.shoot_agreement_versions.belongsTo(models.shoot_agreements, { foreignKey: 'shoot_agreement_id' });
  models.shoot_agreements.belongsTo(models.shoot_agreement_versions, { foreignKey: 'current_version_id', as: 'current_version' });
  models.shoot_requests.belongsTo(models.crew_members, { foreignKey: 'creative_partner_id', targetKey: 'crew_member_id', as: 'creative_partner' });
  models.shoot_agreements.belongsTo(models.crew_members, { foreignKey: 'creative_partner_id', targetKey: 'crew_member_id', as: 'creative_partner' });
}

if (models.quotes && models.signatures) {
  models.signatures.belongsTo(models.quotes, { foreignKey: 'quote_id' });
  models.quotes.hasOne(models.signatures, { foreignKey: 'quote_id' });
}

models.sequelize = sequelize;
models.Sequelize = require('sequelize');



module.exports = models;
