var DataTypes = require("sequelize").DataTypes;
var _assigned_crew = require("./assigned_crew");
var _assigned_equipment = require("./assigned_equipment");
var _assignment_checklist = require("./assignment_checklist");
var _certifications_master = require("./certifications_master");
var _checklist_master = require("./checklist_master");
var _crew_availability = require("./crew_availability");
var _crew_member_files = require("./crew_member_files");
var _crew_member_reviews = require("./crew_member_reviews");
var _crew_members = require("./crew_members");
var _crew_roles = require("./crew_roles");
var _equipment = require("./equipment");
var _equipment_accessories = require("./equipment_accessories");
var _equipment_assignments = require("./equipment_assignments");
var _equipment_category = require("./equipment_category");
var _equipment_documents = require("./equipment_documents");
var _equipment_photos = require("./equipment_photos");
var _equipment_return_checklist = require("./equipment_return_checklist");
var _equipment_return_issues = require("./equipment_return_issues");
var _equipment_returns = require("./equipment_returns");
var _equipment_specs = require("./equipment_specs");
var _event_type_master = require("./event_type_master");
var _payments = require("./payments");
var _payment_transactions = require("./payment_transactions");
var _payment_equipment = require("./payment_equipment");
var _project_brief = require("./project_brief");
var _skills_master = require("./skills_master");
var _stream_project_booking = require("./stream_project_booking");
var _tasks = require("./tasks");
var _user_type = require("./user_type");
var _users = require("./users");
var _waitlist = require("./waitlist");
var _investors = require("./investors");
var _affiliates = require("./affiliates");
var _referrals = require("./referrals");
var _affiliate_payouts = require("./affiliate_payouts");
var _pricing_categories = require("./pricing_categories");
var _pricing_items = require("./pricing_items");
var _pricing_discount_tiers = require("./pricing_discount_tiers");
var _quotes = require("./quotes");
var _quote_line_items = require("./quote_line_items");
var _crew_equipment = require("./crew_equipment");
var _crew_equipment_photos = require("./crew_equipment_photos");
var _activity_logs = require("./activity_logs");
var _equipment_request = require("./equipment_request");

function initModels(sequelize) {
  var assigned_crew = _assigned_crew(sequelize, DataTypes);
  var assigned_equipment = _assigned_equipment(sequelize, DataTypes);
  var assignment_checklist = _assignment_checklist(sequelize, DataTypes);
  var certifications_master = _certifications_master(sequelize, DataTypes);
  var checklist_master = _checklist_master(sequelize, DataTypes);
  var crew_member_files = _crew_member_files(sequelize, DataTypes);
  var crew_member_reviews = _crew_member_reviews(sequelize, DataTypes);
  var crew_members = _crew_members(sequelize, DataTypes);
  var crew_roles = _crew_roles(sequelize, DataTypes);
  var equipment = _equipment(sequelize, DataTypes);
  var equipment_accessories = _equipment_accessories(sequelize, DataTypes);
  var equipment_assignments = _equipment_assignments(sequelize, DataTypes);
  var equipment_category = _equipment_category(sequelize, DataTypes);
  var equipment_documents = _equipment_documents(sequelize, DataTypes);
  var equipment_photos = _equipment_photos(sequelize, DataTypes);
  var equipment_return_checklist = _equipment_return_checklist(sequelize, DataTypes);
  var equipment_return_issues = _equipment_return_issues(sequelize, DataTypes);
  var equipment_returns = _equipment_returns(sequelize, DataTypes);
  var equipment_specs = _equipment_specs(sequelize, DataTypes);
  var event_type_master = _event_type_master(sequelize, DataTypes);
  var payments = _payments(sequelize, DataTypes);
  var payment_transactions = _payment_transactions(sequelize, DataTypes);
  var payment_equipment = _payment_equipment(sequelize, DataTypes);
  var project_brief = _project_brief(sequelize, DataTypes);
  var skills_master = _skills_master(sequelize, DataTypes);
  var stream_project_booking = _stream_project_booking(sequelize, DataTypes);
  var tasks = _tasks(sequelize, DataTypes);
  var user_type = _user_type(sequelize, DataTypes);
  var users = _users(sequelize, DataTypes);
  var waitlist = _waitlist(sequelize, DataTypes);
  var investors = _investors(sequelize, DataTypes);
  var affiliates = _affiliates(sequelize, DataTypes);
  var referrals = _referrals(sequelize, DataTypes);
  var affiliate_payouts = _affiliate_payouts(sequelize, DataTypes);
  var pricing_categories = _pricing_categories(sequelize, DataTypes);
  var pricing_items = _pricing_items(sequelize, DataTypes);
  var pricing_discount_tiers = _pricing_discount_tiers(sequelize, DataTypes);
  var quotes = _quotes(sequelize, DataTypes);
  var quote_line_items = _quote_line_items(sequelize, DataTypes);
    var crew_availability = _crew_availability(sequelize, DataTypes);
    var crew_equipment = _crew_equipment(sequelize, DataTypes);
  var crew_equipment_photos = _crew_equipment_photos(sequelize, DataTypes);
  var activity_logs = _activity_logs(sequelize, DataTypes);
  var equipment_request = _equipment_request(sequelize, DataTypes);

  assignment_checklist.belongsTo(checklist_master, { as: "checklist", foreignKey: "checklist_id"});
  checklist_master.hasMany(assignment_checklist, { as: "assignment_checklists", foreignKey: "checklist_id"});
  assigned_crew.belongsTo(crew_members, { as: "crew_member", foreignKey: "crew_member_id"});
  crew_members.hasMany(assigned_crew, { as: "assigned_crews", foreignKey: "crew_member_id"});
  crew_member_files.belongsTo(crew_members, { as: "crew_member", foreignKey: "crew_member_id"});
  crew_members.hasMany(crew_member_files, { as: "crew_member_files", foreignKey: "crew_member_id"});
  crew_member_reviews.belongsTo(crew_members, { as: "crew_member", foreignKey: "crew_member_id"});
  crew_members.hasMany(crew_member_reviews, { as: "crew_member_reviews", foreignKey: "crew_member_id"});
  crew_member_reviews.belongsTo(users, { as: "user", foreignKey: "user_id"});
  users.hasMany(crew_member_reviews, { as: "crew_member_reviews", foreignKey: "user_id"});
  equipment.belongsTo(crew_members, { as: "owner", foreignKey: "owner_id"});
  crew_members.hasMany(equipment, { as: "owned_equipment", foreignKey: "owner_id"});
  equipment_assignments.belongsTo(crew_members, { as: "crew_member", foreignKey: "crew_member_id"});
  crew_members.hasMany(equipment_assignments, { as: "equipment_assignments", foreignKey: "crew_member_id"});
  tasks.belongsTo(crew_members, { as: "assigned_to_crew_member", foreignKey: "assigned_to"});
  crew_members.hasMany(tasks, { as: "tasks", foreignKey: "assigned_to"});
  assigned_equipment.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(assigned_equipment, { as: "assigned_equipments", foreignKey: "equipment_id"});
  equipment_accessories.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(equipment_accessories, { as: "equipment_accessories", foreignKey: "equipment_id"});
  equipment_assignments.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(equipment_assignments, { as: "equipment_assignments", foreignKey: "equipment_id"});
  equipment_documents.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(equipment_documents, { as: "equipment_documents", foreignKey: "equipment_id"});
  equipment_photos.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(equipment_photos, { as: "equipment_photos", foreignKey: "equipment_id"});
  equipment_returns.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(equipment_returns, { as: "equipment_returns", foreignKey: "equipment_id"});
  equipment_specs.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(equipment_specs, { as: "equipment_specs", foreignKey: "equipment_id"});
  assignment_checklist.belongsTo(equipment_assignments, { as: "assignment", foreignKey: "assignment_id"});
  equipment_assignments.hasMany(assignment_checklist, { as: "assignment_checklists", foreignKey: "assignment_id"});
  equipment_returns.belongsTo(equipment_assignments, { as: "assignment", foreignKey: "assignment_id"});
  equipment_assignments.hasMany(equipment_returns, { as: "equipment_returns", foreignKey: "assignment_id"});
  equipment.belongsTo(equipment_category, { as: "category", foreignKey: "category_id"});
  equipment_category.hasMany(equipment, { as: "equipments", foreignKey: "category_id"});
  equipment_return_checklist.belongsTo(equipment_returns, { as: "return", foreignKey: "return_id"});
  equipment_returns.hasMany(equipment_return_checklist, { as: "equipment_return_checklists", foreignKey: "return_id"});
  equipment_return_issues.belongsTo(equipment_returns, { as: "return", foreignKey: "return_id"});
  equipment_returns.hasMany(equipment_return_issues, { as: "equipment_return_issues", foreignKey: "return_id"});
  assigned_crew.belongsTo(stream_project_booking, { as: "project", foreignKey: "project_id"});
  stream_project_booking.hasMany(assigned_crew, { as: "assigned_crews", foreignKey: "project_id"});
  assigned_equipment.belongsTo(stream_project_booking, { as: "project", foreignKey: "project_id"});
  stream_project_booking.hasMany(assigned_equipment, { as: "assigned_equipments", foreignKey: "project_id"});
  equipment_assignments.belongsTo(stream_project_booking, { as: "project", foreignKey: "project_id"});
  stream_project_booking.hasMany(equipment_assignments, { as: "equipment_assignments", foreignKey: "project_id"});
  project_brief.belongsTo(stream_project_booking, { as: "project", foreignKey: "project_id"});
  stream_project_booking.hasMany(project_brief, { as: "project_briefs", foreignKey: "project_id"});
  users.belongsTo(user_type, {
    as: 'userType',
    foreignKey: 'user_type',
    targetKey: 'user_type_id',
    constraints: false
  });

  user_type.hasMany(users, {
    as: 'users',
    foreignKey: 'user_type',
    sourceKey: 'user_type_id',
    constraints: false
  });

  // Payment relationships (old system)
  payments.belongsTo(stream_project_booking, { as: "booking", foreignKey: "booking_id"});
  stream_project_booking.hasMany(payments, { as: "payments", foreignKey: "booking_id"});
  payments.belongsTo(users, { as: "user", foreignKey: "user_id"});
  users.hasMany(payments, { as: "payments", foreignKey: "user_id"});

  // Payment Transactions relationships (new system for CP + equipment)
  payment_transactions.belongsTo(crew_members, { as: "creator", foreignKey: "creator_id"});
  crew_members.hasMany(payment_transactions, { as: "payment_transactions", foreignKey: "creator_id"});
  payment_transactions.belongsTo(users, { as: "user", foreignKey: "user_id"});
  users.hasMany(payment_transactions, { as: "payment_transactions", foreignKey: "user_id"});

  // Payment Equipment relationships
  payment_equipment.belongsTo(payment_transactions, { as: "payment", foreignKey: "payment_id"});
  payment_transactions.hasMany(payment_equipment, { as: "equipment_items", foreignKey: "payment_id"});
  payment_equipment.belongsTo(equipment, { as: "equipment", foreignKey: "equipment_id"});
  equipment.hasMany(payment_equipment, { as: "payment_equipment", foreignKey: "equipment_id"});

  // Affiliate relationships
  affiliates.belongsTo(users, { as: "user", foreignKey: "user_id"});
  users.hasOne(affiliates, { as: "affiliate", foreignKey: "user_id"});

  // Referral relationships
  referrals.belongsTo(affiliates, { as: "affiliate", foreignKey: "affiliate_id"});
  affiliates.hasMany(referrals, { as: "referrals", foreignKey: "affiliate_id"});
  referrals.belongsTo(payment_transactions, { as: "payment", foreignKey: "payment_id"});
  payment_transactions.hasOne(referrals, { as: "referral", foreignKey: "payment_id"});
  referrals.belongsTo(users, { as: "referred_user", foreignKey: "referred_user_id"});
  users.hasMany(referrals, { as: "referred_bookings", foreignKey: "referred_user_id"});

  // Affiliate Payout relationships
  affiliate_payouts.belongsTo(affiliates, { as: "affiliate", foreignKey: "affiliate_id"});
  affiliates.hasMany(affiliate_payouts, { as: "payouts", foreignKey: "affiliate_id"});
  affiliate_payouts.belongsTo(users, { as: "processor", foreignKey: "processed_by"});
  users.hasMany(affiliate_payouts, { as: "processed_payouts", foreignKey: "processed_by"});

  // Pricing Catalog relationships
  pricing_items.belongsTo(pricing_categories, { as: "category", foreignKey: "category_id"});
  pricing_categories.hasMany(pricing_items, { as: "items", foreignKey: "category_id"});

  // Quote relationships
  quote_line_items.belongsTo(quotes, { as: "quote", foreignKey: "quote_id"});
  quotes.hasMany(quote_line_items, { as: "line_items", foreignKey: "quote_id"});
  quote_line_items.belongsTo(pricing_items, { as: "pricing_item", foreignKey: "item_id"});
  pricing_items.hasMany(quote_line_items, { as: "quote_line_items", foreignKey: "item_id"});
  quotes.belongsTo(users, { as: "user", foreignKey: "user_id"});
  users.hasMany(quotes, { as: "quotes", foreignKey: "user_id"});
  quotes.belongsTo(stream_project_booking, { as: "booking", foreignKey: "booking_id"});
  stream_project_booking.hasMany(quotes, { as: "quotes", foreignKey: "booking_id"});
  
  // Booking -> Quote relationship (booking can reference a primary quote)
  stream_project_booking.belongsTo(quotes, { as: "primary_quote", foreignKey: "quote_id"});
  quotes.hasMany(stream_project_booking, { as: "bookings", foreignKey: "quote_id"});

  return {
    activity_logs,
    assigned_crew,
    assigned_equipment,
    assignment_checklist,
    certifications_master,
    checklist_master,
    crew_availability,
    crew_member_files,
    crew_member_reviews,
    crew_members,
    crew_roles,
    equipment,
    equipment_accessories,
    equipment_assignments,
    equipment_category,
    equipment_documents,
    equipment_photos,
    equipment_return_checklist,
    equipment_return_issues,
    equipment_returns,
    equipment_specs,
    event_type_master,
    payments,
    payment_transactions,
    payment_equipment,
    project_brief,
    skills_master,
    stream_project_booking,
    tasks,
    user_type,
    users,
    waitlist,
    investors,
    affiliates,
    referrals,
    affiliate_payouts,
    pricing_categories,
    pricing_items,
    pricing_discount_tiers,
    quotes,
    quote_line_items,
    crew_equipment,
    crew_equipment_photos,
    equipment_request
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
