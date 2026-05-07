const sequelize = require('../db');
const { DataTypes } = require('sequelize');

const initModels = require('./init-models');
const salesRepAvailabilityFactory = require('./sales_rep_availability');
const salesRepLiveStatusFactory = require('./sales_rep_live_status');
const salesRepStatusActivityFactory = require('./sales_rep_status_activity');

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

// Studio Models
const Studio = require('./studio.model');
const StudioAddress = require('./studioAddress.model');
const StudioInfo = require('./studioInfo.model');
const StudioFacilities = require('./studioFacilities.model');
const StudioMedia = require('./studioMedia.model');
const StudioDetails = require('./studioDetails.model');
const StudioHours = require('./studioHours.model');
const StudioRules = require('./studioRules.model');
const StudioBudget = require('./studioBudget.model');
const StudioCategory = require('./studioCategory.model');
const StudioEquipment = require('./studioEquipment.model');
const StudioPolicies = require('./studioPolicies.model');
const StudioBooking = require('./StudioBooking');
const StudioBookingMedia = require('./StudioBookingMedia');
const StudioRevenueSnapshot = require('./StudioRevenueSnapshot');
const StudioRequest = require('./studioRequest.model');

if (models.quotes && models.signatures) {
  models.signatures.belongsTo(models.quotes, { foreignKey: 'quote_id' });
  models.quotes.hasOne(models.signatures, { foreignKey: 'quote_id' });
}

models.studios = Studio;
models.studio_addresses = StudioAddress;
models.studio_info = StudioInfo;
models.studio_facilities = StudioFacilities;
models.studio_media = StudioMedia;
models.studio_details = StudioDetails;
models.studio_hours = StudioHours;
models.studio_rules = StudioRules;
models.studio_budgets = StudioBudget;
models.studio_budget_categories = StudioCategory;
models.studio_equipment = StudioEquipment;
models.studio_policies = StudioPolicies;
models.studio_bookings = StudioBooking;                         
models.studio_booking_media = StudioBookingMedia;               
models.studio_revenue_snapshots = StudioRevenueSnapshot;   
models.studio_requests = StudioRequest;     

// Studio Associations
Studio.hasOne(StudioAddress, { foreignKey: 'studio_id', as: 'address', onDelete: 'CASCADE' });
Studio.hasOne(StudioInfo, { foreignKey: 'studio_id', as: 'info', onDelete: 'CASCADE' });
Studio.hasOne(StudioFacilities, { foreignKey: 'studio_id', as: 'facilities', onDelete: 'CASCADE' });
Studio.hasOne(StudioDetails, { foreignKey: 'studio_id', as: 'details', onDelete: 'CASCADE' });
Studio.hasOne(StudioRules, { foreignKey: 'studio_id', as: 'rules', onDelete: 'CASCADE' });
Studio.hasOne(StudioBudget, { foreignKey: 'studio_id', as: 'budget', onDelete: 'CASCADE' });
Studio.hasOne(StudioPolicies, { foreignKey: 'studio_id', as: 'policies', onDelete: 'CASCADE' });
Studio.hasMany(StudioMedia, { foreignKey: 'studio_id', as: 'media', onDelete: 'CASCADE' });
Studio.hasMany(StudioHours, { foreignKey: 'studio_id', as: 'hours', onDelete: 'CASCADE' });
Studio.hasMany(StudioCategory, { foreignKey: 'studio_id', as: 'categories', onDelete: 'CASCADE' });
Studio.hasMany(StudioEquipment, { foreignKey: 'studio_id', as: 'equipment', onDelete: 'CASCADE' });

StudioAddress.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioInfo.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioFacilities.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioMedia.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioDetails.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioHours.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioRules.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioBudget.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioCategory.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioEquipment.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioPolicies.belongsTo(Studio, { foreignKey: 'studio_id' });
Studio.hasMany(StudioBooking, { foreignKey: 'studio_id', as: 'bookings', onDelete: 'CASCADE' });
StudioBooking.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio' });

StudioBooking.hasMany(StudioBookingMedia, { foreignKey: 'booking_id', as: 'media', onDelete: 'CASCADE' });
StudioBookingMedia.belongsTo(StudioBooking, { foreignKey: 'booking_id', as: 'booking' });

StudioBooking.belongsTo(StudioInfo, { foreignKey: 'studio_id', targetKey: 'studio_id', as: 'studioInfo' });

Studio.hasMany(StudioRevenueSnapshot, { foreignKey: 'studio_id', as: 'revenue_snapshots', onDelete: 'CASCADE' });
StudioRevenueSnapshot.belongsTo(Studio, { foreignKey: 'studio_id' });
StudioBudget.hasMany(StudioCategory, { foreignKey: 'studio_id', as: 'categories' });
StudioCategory.belongsTo(StudioBudget, { foreignKey: 'studio_id' });

StudioBudget.hasMany(StudioEquipment, { foreignKey: 'studio_id', as: 'equipment' });
StudioEquipment.belongsTo(StudioBudget, { foreignKey: 'studio_id' });

Studio.hasMany(StudioRequest, { foreignKey: 'studio_id', as: 'requests', onDelete: 'CASCADE' });
StudioRequest.belongsTo(Studio, { foreignKey: 'studio_id', as: 'studio' });
StudioRequest.belongsTo(models.users, { foreignKey: 'user_id', as: 'user' });
models.users.hasMany(StudioRequest, { foreignKey: 'user_id', as: 'studio_requests' });

models.sequelize = sequelize;
models.Sequelize = require('sequelize');



module.exports = models;
