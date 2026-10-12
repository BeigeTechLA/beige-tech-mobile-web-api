const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../models');
const { QueryTypes } = require('sequelize');
const { S3UploadFiles, toAbsoluteBeigeAssetUrl } = require('../utils/common');

const uploadDir = path.join(__dirname, '../../public/uploads/media');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)),
});

const query = (sql, replacements = [], transaction) => db.sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT });
const execute = (sql, replacements = [], transaction) => db.sequelize.query(sql, { replacements, transaction });
const publicPath = (pathValue) => pathValue ? toAbsoluteBeigeAssetUrl(pathValue) : pathValue;
const asInt = (value) => Number.isInteger(Number(value)) ? Number(value) : NaN;
const validRate = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
const jsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};
const imagePaths = (value) => jsonArray(value).map((image) => typeof image === 'string' ? image : image?.file_path).filter(Boolean);
const toSqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const parseSqlDateTimeAsUtc = (value) => {
  if (!value) return null;
  const normalized = value instanceof Date ? value.toISOString() : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};
const calculateRentalCharge = (start, end, rate, unit, quantity = 1) => {
  const elapsed = end.getTime() - start.getTime();
  const unitMs = unit === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const billableUnits = Math.max(1, Math.ceil(elapsed / unitMs));
  return Math.round(billableUnits * Number(rate) * quantity * 100) / 100;
};
const validImagePaths = (paths) => Array.isArray(paths) && paths.length > 0 && paths.length <= 8 && paths.every((path) => typeof path === 'string' && path.trim());
const imageReferences = (value) => jsonArray(value).map((file_path) => ({ file_path, url: publicPath(file_path) }));

async function overlappingReservedQuantity(modelId, pickup, due, transaction, excludeRequestId) {
  const exclude = Number.isInteger(Number(excludeRequestId)) ? 'AND r.id<>?' : '';
  const replacements = [modelId, toSqlDateTime(due), toSqlDateTime(due), toSqlDateTime(pickup)];
  if (exclude) replacements.push(Number(excludeRequestId));
  const rows = await query(`SELECT COALESCE(SUM(ri.quantity),0) AS reserved
    FROM inventory_request_items ri JOIN inventory_requests r ON r.id=ri.request_id
    WHERE ri.inventory_model_id=? AND r.status IN ('pending','accepted') AND ri.returned_at IS NULL
      AND ((ri.issued_at IS NOT NULL AND ri.issued_at < ?) OR (ri.issued_at IS NULL AND (ri.expected_pickup_at IS NULL OR ri.expected_pickup_at < ?)))
      AND (ri.issued_at IS NOT NULL OR ri.expected_return_at IS NULL OR ri.expected_return_at > ?) ${exclude}`, replacements, transaction);
  return Number(rows[0]?.reserved || 0);
}

async function inventoryDetails(itemIds) {
  if (!itemIds.length) return [];
  const inList = itemIds.map(() => '?').join(',');
  const items = await query(`SELECT * FROM inventory_items WHERE id IN (${inList}) ORDER BY id DESC`, itemIds);
  const models = await query(`SELECT m.*,
      COALESCE(SUM(CASE WHEN u.status='available' THEN 1 ELSE 0 END),0) AS available_quantity,
      COALESCE(SUM(CASE WHEN u.status='assigned' THEN 1 ELSE 0 END),0) AS assigned_unit_quantity
    FROM inventory_models m LEFT JOIN inventory_model_units u ON u.inventory_model_id=m.id
    WHERE m.inventory_item_id IN (${inList}) GROUP BY m.id ORDER BY m.id`, itemIds);
  const modelIds = models.map((model) => model.id);
  const units = modelIds.length ? await query(`SELECT id,inventory_model_id,status FROM inventory_model_units WHERE inventory_model_id IN (${modelIds.map(() => '?').join(',')}) ORDER BY id`, modelIds) : [];
  const pending = modelIds.length ? await query(`SELECT ri.inventory_model_id,SUM(ri.quantity) AS requested_quantity FROM inventory_request_items ri JOIN inventory_requests r ON r.id=ri.request_id WHERE ri.inventory_model_id IN (${modelIds.map(() => '?').join(',')}) AND r.status='pending' AND ri.returned_at IS NULL AND (ri.expected_pickup_at IS NULL OR ri.expected_pickup_at<=UTC_TIMESTAMP()) AND (ri.expected_return_at IS NULL OR ri.expected_return_at>UTC_TIMESTAMP()) GROUP BY ri.inventory_model_id`, modelIds) : [];
  const legacyAssigned = modelIds.length ? await query(`SELECT ri.inventory_model_id,SUM(ri.quantity) AS assigned_quantity FROM inventory_request_items ri JOIN inventory_requests r ON r.id=ri.request_id WHERE ri.inventory_model_id IN (${modelIds.map(() => '?').join(',')}) AND r.status='accepted' AND ri.assigned_unit_ids IS NULL AND ri.returned_at IS NULL AND (ri.expected_pickup_at IS NULL OR ri.expected_pickup_at<=UTC_TIMESTAMP()) AND (ri.expected_return_at IS NULL OR ri.expected_return_at>UTC_TIMESTAMP()) GROUP BY ri.inventory_model_id`, modelIds) : [];
  const pendingByModel = new Map(pending.map((row) => [Number(row.inventory_model_id), Number(row.requested_quantity)]));
  const legacyAssignedByModel = new Map(legacyAssigned.map((row) => [Number(row.inventory_model_id), Number(row.assigned_quantity)]));
  const modelsByItem = new Map();
  for (const model of models) {
    const paths = imagePaths(model.image_urls);
    const modelImages = paths.map((file_path) => ({ file_path, url: publicPath(file_path) }));
    const modelUnits = units.filter((unit) => Number(unit.inventory_model_id) === Number(model.id));
    const requested = pendingByModel.get(Number(model.id)) || 0;
    const legacy = legacyAssignedByModel.get(Number(model.id)) || 0;
    const assigned = Number(model.assigned_unit_quantity) + legacy;
    const record = { ...model, price: Number(model.price), total_quantity: Number(model.total_quantity), available_quantity: Math.max(0, Number(model.available_quantity) - requested - legacy), requested_quantity: requested, assigned_quantity: assigned, images: modelImages, image_urls: paths, units: modelUnits };
    const list = modelsByItem.get(Number(model.inventory_item_id)) || [];
    list.push(record); modelsByItem.set(Number(model.inventory_item_id), list);
  }
  return items.map((item) => ({ ...item, image_url: publicPath(item.image_url), models: modelsByItem.get(Number(item.id)) || [] }));
}

function validateItem(body) {
  const name = String(body.name || '').trim();
  if (!name) return 'Item name is required';
  if (!Array.isArray(body.models) || !body.models.length) return 'At least one model is required';
  const names = new Set();
  for (const model of body.models) {
    const modelName = String(model.name || '').trim();
    const quantity = asInt(model.total_quantity);
    if (!modelName) return 'Each model needs a name';
    if (names.has(modelName.toLowerCase())) return 'Model names must be unique within an item';
    names.add(modelName.toLowerCase());
    if (!validRate(model.hourly_rental_rate ?? 0) || !validRate(model.daily_rental_rate ?? 0)) return 'Model rental rates must be zero or a positive amount';
    if (Number(model.hourly_rental_rate || 0) === 0 && Number(model.daily_rental_rate || 0) === 0) return 'Set at least one hourly or daily rental rate for each model';
    if (!Number.isSafeInteger(quantity) || quantity < 1) return 'Each model quantity must be a positive whole number';
    const images = Array.isArray(model.image_urls) ? model.image_urls : [];
    if (images.length < 1 || images.length > 8 || images.some((image) => typeof image !== 'string' || !image.trim())) return 'Each model must have 1 to 8 valid images';
  }
  return null;
}

async function saveModels(itemId, models, transaction) {
  const existingModels = await query('SELECT * FROM inventory_models WHERE inventory_item_id=? FOR UPDATE', [itemId], transaction);
  const existingById = new Map(existingModels.map((model) => [Number(model.id), model]));
  const keepModelIds = [];
  for (const model of models) {
    const modelId = model.id == null || model.id === '' ? null : asInt(model.id);
    if (modelId && (!Number.isInteger(modelId) || !existingById.has(modelId))) throw new Error('Model does not belong to this inventory item');
    let row;
    if (modelId) {
      row = existingById.get(modelId);
      await execute('UPDATE inventory_models SET name=?,description=?,price=0,hourly_rental_rate=?,daily_rental_rate=?,total_quantity=?,image_urls=?,is_active=?,updated_at=NOW() WHERE id=?', [String(model.name).trim(), String(model.description || '').trim() || null, Number(model.hourly_rental_rate || 0), Number(model.daily_rental_rate || 0), Number(model.total_quantity), JSON.stringify(model.image_urls || []), model.is_active === 0 ? 0 : 1, modelId], transaction);
    } else {
      const [insertedModelId] = await execute('INSERT INTO inventory_models (inventory_item_id,name,description,price,hourly_rental_rate,daily_rental_rate,total_quantity,image_urls,is_active) VALUES (?,?,?,?,?,?,?,?,?)', [itemId, String(model.name).trim(), String(model.description || '').trim() || null, 0, Number(model.hourly_rental_rate || 0), Number(model.daily_rental_rate || 0), Number(model.total_quantity), JSON.stringify(model.image_urls || []), model.is_active === 0 ? 0 : 1], transaction);
      row = { id: insertedModelId };
    }
    const currentUnits = await query('SELECT * FROM inventory_model_units WHERE inventory_model_id=? FOR UPDATE', [row.id], transaction);
    const targetQuantity = Number(model.total_quantity);
    const reservations = await query(`SELECT COALESCE(SUM(CASE WHEN r.status='pending' THEN ri.quantity ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN r.status='accepted' AND ri.assigned_unit_ids IS NULL THEN ri.quantity ELSE 0 END),0) AS legacy_assigned
      FROM inventory_request_items ri JOIN inventory_requests r ON r.id=ri.request_id WHERE ri.inventory_model_id=?`, [row.id], transaction);
    const assignedCount = currentUnits.filter((unit) => unit.status === 'assigned').length;
    if (targetQuantity < Number(reservations[0].pending) + Number(reservations[0].legacy_assigned) + assignedCount) throw new Error('Model quantity cannot be lower than its pending or assigned request quantities');
    const availableUnits = currentUnits.filter((unit) => unit.status === 'available');
    const removeCount = Math.max(0, currentUnits.length - targetQuantity);
    for (const unit of availableUnits.slice(0, removeCount)) await execute('DELETE FROM inventory_model_units WHERE id=?', [unit.id], transaction);
    const addCount = targetQuantity - currentUnits.length;
    for (let i = 0; i < addCount; i += 1) await execute("INSERT INTO inventory_model_units (inventory_model_id,status) VALUES (?,'available')", [row.id], transaction);
    keepModelIds.push(Number(row.id));
  }
  const removed = existingModels.filter((model) => !keepModelIds.includes(Number(model.id)));
  for (const model of removed) {
    const dependencies = await query(`SELECT COUNT(*) AS n FROM inventory_request_items WHERE inventory_model_id=?`, [model.id], transaction);
    if (Number(dependencies[0].n) > 0) throw new Error('Models with request history cannot be removed');
    await execute('DELETE FROM inventory_models WHERE id=?', [model.id], transaction);
  }
}

exports.uploadModelImages = [upload.array('images', 8), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length || files.some((file) => !file.mimetype.startsWith('image/'))) return res.status(400).json({ success: false, message: 'Upload between 1 and 8 image files' });
    const uploaded = await S3UploadFiles({ images: files });
    const rows = (uploaded || []).map((file) => ({ file_path: file.file_path, url: publicPath(file.file_path) }));
    return res.status(201).json({ success: true, data: rows });
  } catch (error) { console.error('Upload Inventory Model Images:', error); return res.status(500).json({ success: false, message: 'Unable to upload model images' }); }
}];

exports.uploadConditionImages = [upload.array('images', 8), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length || files.some((file) => !file.mimetype.startsWith('image/'))) return res.status(400).json({ success: false, message: 'Upload between 1 and 8 condition images' });
    const uploaded = await S3UploadFiles({ images: files });
    const data = (uploaded || []).map((file) => ({ file_path: file.file_path, url: publicPath(file.file_path) }));
    return res.status(201).json({ success: true, data });
  } catch (error) { console.error('Upload inventory condition images:', error); return res.status(500).json({ success: false, message: 'Unable to upload condition images' }); }
}];

exports.createItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const validation = validateItem(req.body);
    if (validation) { await transaction.rollback(); return res.status(400).json({ success: false, message: validation }); }
    const [duplicates] = await execute('SELECT id FROM inventory_items WHERE name=? LIMIT 1', [String(req.body.name).trim()], transaction);
    if (duplicates.length) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'An inventory item with this name already exists' }); }
    const [itemId] = await execute('INSERT INTO inventory_items (name,description,price,total_quantity,is_active) VALUES (?,NULL,0,0,?)', [String(req.body.name).trim(), req.body.is_active === 0 ? 0 : 1], transaction);
    await saveModels(itemId, req.body.models, transaction);
    await transaction.commit();
    const data = (await inventoryDetails([itemId]))[0];
    return res.status(201).json({ success: true, message: 'Inventory item created', data });
  } catch (error) { await transaction.rollback(); const status = /serial number|Assigned units|available units|Model does not|images are not|unique within/.test(error.message) ? 409 : 400; return res.status(status).json({ success: false, message: error.message || 'Unable to create inventory item' }); }
};

exports.updateItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const itemId = asInt(req.params.id);
    if (!Number.isInteger(itemId) || itemId < 1) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Valid inventory item ID is required' }); }
    const [items] = await execute('SELECT id FROM inventory_items WHERE id=? FOR UPDATE', [itemId], transaction);
    if (!items.length) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Inventory item not found' }); }
    const validation = validateItem(req.body);
    if (validation) { await transaction.rollback(); return res.status(400).json({ success: false, message: validation }); }
    const [duplicates] = await execute('SELECT id FROM inventory_items WHERE name=? AND id<>? LIMIT 1', [String(req.body.name).trim(), itemId], transaction);
    if (duplicates.length) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'An inventory item with this name already exists' }); }
    await execute('UPDATE inventory_items SET name=?,description=NULL,updated_at=NOW() WHERE id=?', [String(req.body.name).trim(), itemId], transaction);
    await saveModels(itemId, req.body.models, transaction);
    await transaction.commit();
    return res.json({ success: true, message: 'Inventory item updated', data: (await inventoryDetails([itemId]))[0] });
  } catch (error) { await transaction.rollback(); const status = /serial number|Assigned units|available units|Model does not|images are not|unique within/.test(error.message) ? 409 : 400; return res.status(status).json({ success: false, message: error.message || 'Unable to update inventory item' }); }
};

exports.listItems = async (req, res) => {
  try {
    const page = Math.max(1, asInt(req.query.page) || 1), limit = Math.min(100, Math.max(1, asInt(req.query.limit) || 20));
    const search = String(req.query.search || '').trim();
    const status = req.query.status || 'all';
    if (!['all', 'active', 'inactive'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be active, inactive, or all' });
    const where = [], args = [];
    if (search) { where.push('(i.name LIKE ? OR i.description LIKE ? OR EXISTS (SELECT 1 FROM inventory_models sm WHERE sm.inventory_item_id=i.id AND sm.name LIKE ?))'); args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status !== 'all') { where.push('EXISTS (SELECT 1 FROM inventory_models status_model WHERE status_model.inventory_item_id=i.id AND status_model.is_active=?)'); args.push(status === 'active' ? 1 : 0); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const counts = await query(`SELECT COUNT(*) AS total FROM inventory_items i ${clause}`, args);
    const ids = await query(`SELECT i.id FROM inventory_items i ${clause} ORDER BY i.id DESC LIMIT ? OFFSET ?`, [...args, limit, (page - 1) * limit]);
    const data = await inventoryDetails(ids.map((row) => row.id));
    return res.json({ success: true, data, pagination: { page, limit, total: Number(counts[0].total), total_pages: Math.ceil(Number(counts[0].total) / limit) } });
  } catch (error) { console.error('List inventory:', error); return res.status(500).json({ success: false, message: 'Unable to fetch inventory items' }); }
};

exports.getItem = async (req, res) => {
  const id = asInt(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Valid inventory item ID is required' });
  try { const data = (await inventoryDetails([id]))[0]; return data ? res.json({ success: true, data }) : res.status(404).json({ success: false, message: 'Inventory item not found' }); }
  catch (error) { return res.status(500).json({ success: false, message: 'Unable to fetch inventory item' }); }
};

exports.setItemStatus = async (req, res) => {
  const id = asInt(req.params.id), active = Number(req.body.is_active);
  if (!Number.isInteger(id) || id < 1 || ![0, 1, '0', '1', true, false].includes(req.body.is_active)) return res.status(400).json({ success: false, message: 'Valid model ID and is_active value are required' });
  const [result] = await execute('UPDATE inventory_models SET is_active=?,updated_at=NOW() WHERE id=?', [active, id]);
  if (!result?.affectedRows) return res.status(404).json({ success: false, message: 'Inventory model not found' });
  const rows = await query('SELECT inventory_item_id FROM inventory_models WHERE id=?', [id]);
  const data = (await inventoryDetails([rows[0].inventory_item_id]))[0];
  return res.json({ success: true, data });
};

exports.listCreatorItems = async (_req, res) => {
  try {
    const ids = await query('SELECT DISTINCT i.id FROM inventory_items i JOIN inventory_models m ON m.inventory_item_id=i.id AND m.is_active=1 ORDER BY i.name');
    const data = await inventoryDetails(ids.map((row) => row.id));
    return res.json({ success: true, data: data.map((item) => ({ ...item, models: item.models.filter((model) => Number(model.is_active) === 1).map(({ units, ...model }) => model) })) });
  } catch (error) { return res.status(500).json({ success: false, message: 'Unable to fetch inventory' }); }
};

exports.getModelAvailability = async (req, res) => {
  const modelId = asInt(req.params.modelId), pickup = new Date(req.query.pickup_at), due = new Date(req.query.return_at);
  if (!Number.isInteger(modelId) || modelId < 1 || Number.isNaN(pickup.getTime()) || Number.isNaN(due.getTime()) || due <= pickup) return res.status(400).json({ success: false, message: 'Provide a valid model ID and pickup/return range' });
  try {
    const models = await query('SELECT id,total_quantity FROM inventory_models WHERE id=? AND is_active=1', [modelId]);
    if (!models.length) return res.status(404).json({ success: false, message: 'Inventory model not found' });
    const reserved = await overlappingReservedQuantity(modelId, pickup, due);
    return res.json({ success: true, data: { inventory_model_id: modelId, total_quantity: Number(models[0].total_quantity), reserved_quantity: reserved, available_quantity: Math.max(0, Number(models[0].total_quantity) - reserved) } });
  } catch (error) { console.error('Check inventory model availability:', error); return res.status(500).json({ success: false, message: 'Unable to check model availability' }); }
};

exports.createRequest = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const cp = await db.crew_members.findOne({ where: { user_id: req.user.userId } });
    if (!cp) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Creative partner not found' }); }
    const { purpose, shoot_id = null, items } = req.body;
    if (!['personal', 'shoot'].includes(purpose) || (purpose === 'shoot' && !shoot_id) || (purpose === 'personal' && shoot_id) || !Array.isArray(items) || !items.length) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Provide a valid purpose and at least one model with quantity' }); }
    if (purpose === 'shoot') {
      const assigned = await query('SELECT id FROM assigned_crew WHERE crew_member_id=? AND project_id=? AND crew_accept=1 AND is_active=1 LIMIT 1', [cp.crew_member_id, shoot_id], transaction);
      if (!assigned.length) { await transaction.rollback(); return res.status(403).json({ success: false, message: 'Shoot is not assigned to this CP' }); }
    }
    const quantities = new Map();
    for (const entry of items) {
      const modelId = asInt(entry.inventory_model_id), quantity = asInt(entry.quantity);
      const pickup = new Date(entry.expected_pickup_at), due = new Date(entry.expected_return_at);
      const unit = entry.billing_unit;
      if (!Number.isInteger(modelId) || modelId < 1 || !Number.isInteger(quantity) || quantity < 1 || !['hour', 'day'].includes(unit) || Number.isNaN(pickup.getTime()) || Number.isNaN(due.getTime()) || due <= pickup) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Each request line needs a model, quantity, billing unit, and valid pickup/return times' }); }
      if (quantities.has(modelId)) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Each model can appear only once in a request' }); }
      quantities.set(modelId, { quantity, pickup, due, unit });
    }
    const modelIds = [...quantities.keys()];
    await query(`SELECT id FROM inventory_models WHERE id IN (${modelIds.map(() => '?').join(',')}) FOR UPDATE`, modelIds, transaction);
    const models = await query(`SELECT m.*,i.name AS item_name FROM inventory_models m JOIN inventory_items i ON i.id=m.inventory_item_id WHERE m.id IN (${modelIds.map(() => '?').join(',')}) AND m.is_active=1 FOR UPDATE`, modelIds, transaction);
    if (models.length !== modelIds.length) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'One or more models are no longer available' }); }
    for (const model of models) {
      const line = quantities.get(Number(model.id));
      const rate = Number(line.unit === 'hour' ? model.hourly_rental_rate : model.daily_rental_rate);
      if (!(rate > 0)) { await transaction.rollback(); return res.status(400).json({ success: false, message: `${model.item_name} ${model.name} has no ${line.unit} rental rate` }); }
      const reserved = await overlappingReservedQuantity(model.id, line.pickup, line.due, transaction);
      if (Number(model.total_quantity) - reserved < line.quantity) { await transaction.rollback(); return res.status(409).json({ success: false, message: `Only ${Math.max(0, Number(model.total_quantity) - reserved)} unit(s) are available for ${model.item_name} ${model.name} during the selected dates` }); }
    }
    const [requestId] = await execute('INSERT INTO inventory_requests (cp_id,purpose,shoot_id,status) VALUES (?,?,?,\'pending\')', [cp.crew_member_id, purpose, shoot_id], transaction);
    for (const model of models) {
      const line = quantities.get(Number(model.id)), hourly = Number(model.hourly_rental_rate || 0), daily = Number(model.daily_rental_rate || 0);
      const rent = calculateRentalCharge(line.pickup, line.due, line.unit === 'hour' ? hourly : daily, line.unit, line.quantity);
      const selectedRate = line.unit === 'hour' ? hourly : daily;
      await execute('INSERT INTO inventory_request_items (request_id,inventory_item_id,inventory_model_id,quantity,unit_price,expected_pickup_at,expected_return_at,billing_unit,hourly_rate_snapshot,daily_rate_snapshot,base_rent,total_rent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [requestId, model.inventory_item_id, model.id, line.quantity, selectedRate, toSqlDateTime(line.pickup), toSqlDateTime(line.due), line.unit, hourly, daily, rent, rent], transaction);
    }
    await transaction.commit();
    return res.status(201).json({ success: true, message: 'Inventory request submitted', data: { id: requestId, status: 'pending' } });
  } catch (error) { await transaction.rollback(); console.error('Create inventory request:', error); return res.status(500).json({ success: false, message: 'Unable to submit inventory request' }); }
};

exports.listRequests = async (req, res, role) => {
  try {
    let cpId = null;
    if (role === 'creator') { const cp = await db.crew_members.findOne({ where: { user_id: req.user.userId } }); if (!cp) return res.status(404).json({ success: false, message: 'Creative partner not found' }); cpId = cp.crew_member_id; }
    const status = role === 'admin' && req.query.status ? req.query.status : null;
    const rows = await query(`SELECT r.*,c.first_name,c.last_name,b.project_name AS shoot_name,ri.inventory_item_id,ri.inventory_model_id,ri.quantity,ri.unit_price,
      i.name AS item_name,m.name AS model_name,m.description AS model_description,m.image_urls AS model_image_urls,
      ri.id AS request_item_id,ri.assigned_unit_ids,ri.expected_pickup_at,ri.expected_return_at,ri.billing_unit,
      ri.hourly_rate_snapshot,ri.daily_rate_snapshot,ri.base_rent,ri.issued_at,ri.fulfillment_status,ri.handover_images,
      ri.returned_at,ri.return_images,ri.late_charge,ri.total_rent
      FROM inventory_requests r JOIN crew_members c ON c.crew_member_id=r.cp_id
      LEFT JOIN stream_project_booking b ON b.stream_project_booking_id=r.shoot_id
      JOIN inventory_request_items ri ON ri.request_id=r.id JOIN inventory_items i ON i.id=ri.inventory_item_id
      LEFT JOIN inventory_models m ON m.id=ri.inventory_model_id
      WHERE (? IS NULL OR r.status=?) AND (? IS NULL OR r.cp_id=?) ORDER BY r.created_at DESC`, [status, status, cpId, cpId]);
    return res.json({ success: true, data: rows.map((row) => {
      const dueAt = row.expected_return_at ? parseSqlDateTimeAsUtc(row.expected_return_at) : null;
      const fulfillmentStatus = row.fulfillment_status === 'issued' && dueAt && dueAt.getTime() < Date.now() ? 'overdue' : row.fulfillment_status;
      return { ...row, fulfillment_status: fulfillmentStatus, image_url: publicPath(imagePaths(row.model_image_urls)[0]), model_description: row.model_description || '', handover_images: imageReferences(row.handover_images), return_images: imageReferences(row.return_images), base_rent: Number(row.base_rent || 0), late_charge: Number(row.late_charge || 0), total_rent: Number(row.total_rent || 0), unit_ids: jsonArray(row.assigned_unit_ids).join(', '), item_name: `${row.item_name}${row.model_name ? ` — ${row.model_name}` : ''}` };
    }) });
  } catch (error) { console.error('List inventory requests:', error); return res.status(500).json({ success: false, message: 'Unable to fetch inventory requests' }); }
};

exports.reviewRequest = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const id = asInt(req.params.id), { status, admin_note } = req.body;
    if (!Number.isInteger(id) || id < 1 || !['accepted', 'rejected'].includes(status)) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Valid request ID and accepted/rejected status are required' }); }
    const requests = await query('SELECT * FROM inventory_requests WHERE id=? FOR UPDATE', [id], transaction);
    if (!requests.length) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Request not found' }); }
    if (requests[0].status !== 'pending') { await transaction.rollback(); return res.status(409).json({ success: false, message: 'Request has already been reviewed' }); }
    if (status === 'accepted') {
      const items = await query('SELECT ri.*,m.total_quantity FROM inventory_request_items ri JOIN inventory_models m ON m.id=ri.inventory_model_id WHERE ri.request_id=? FOR UPDATE', [id], transaction);
      for (const item of items) {
        await query('SELECT id FROM inventory_models WHERE id=? FOR UPDATE', [item.inventory_model_id], transaction);
        const pickup = parseSqlDateTimeAsUtc(item.expected_pickup_at), due = parseSqlDateTimeAsUtc(item.expected_return_at);
        if (!pickup || !due) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'This request has no valid rental date range' }); }
        const reserved = await overlappingReservedQuantity(item.inventory_model_id, pickup, due, transaction, id);
        if (Number(item.total_quantity) - reserved < Number(item.quantity)) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'Insufficient inventory for these rental dates' }); }
      }
    }
    await execute('UPDATE inventory_requests SET status=?,admin_id=?,admin_note=? WHERE id=?', [status, req.user.userId, admin_note || null, id], transaction);
    if (status === 'accepted') await execute("UPDATE inventory_request_items SET fulfillment_status='pending_issue' WHERE request_id=? AND issued_at IS NULL AND returned_at IS NULL", [id], transaction);
    await transaction.commit();
    return res.json({ success: true, message: `Request ${status}`, data: { id, status } });
  } catch (error) { await transaction.rollback(); console.error('Review inventory request:', error); return res.status(500).json({ success: false, message: 'Unable to review inventory request' }); }
};

exports.issueRequestItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const requestId = asInt(req.params.requestId), itemId = asInt(req.params.itemId), images = req.body.image_paths;
    if (!validImagePaths(images)) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Upload 1 to 8 handover condition images first' }); }
    const request = await query("SELECT id FROM inventory_requests WHERE id=? AND status='accepted' FOR UPDATE", [requestId], transaction);
    if (!request.length) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Accepted inventory request not found' }); }
    const lines = await query('SELECT id,inventory_model_id,quantity,assigned_unit_ids,issued_at,returned_at FROM inventory_request_items WHERE id=? AND request_id=? FOR UPDATE', [itemId, requestId], transaction);
    if (!lines.length) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Request item not found' }); }
    const line = lines[0];
    if (line.issued_at || line.returned_at) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'This item has already been issued or returned' }); }
    let unitIds = jsonArray(line.assigned_unit_ids).map(Number).filter(Number.isInteger);
    if (!unitIds.length) {
      const units = await query("SELECT id FROM inventory_model_units WHERE inventory_model_id=? AND status='available' ORDER BY id LIMIT ? FOR UPDATE", [line.inventory_model_id, Number(line.quantity)], transaction);
      if (units.length < Number(line.quantity)) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'Not enough physical units are currently available to hand over' }); }
      unitIds = units.map((unit) => Number(unit.id));
      for (const unitId of unitIds) await execute("UPDATE inventory_model_units SET status='assigned',updated_at=UTC_TIMESTAMP() WHERE id=?", [unitId], transaction);
      await execute('UPDATE inventory_request_items SET assigned_unit_ids=? WHERE id=?', [JSON.stringify(unitIds), itemId], transaction);
    }
    await execute("UPDATE inventory_request_items SET issued_at=UTC_TIMESTAMP(),fulfillment_status='issued',handover_images=? WHERE id=?", [JSON.stringify(images), itemId], transaction);
    await transaction.commit();
    return res.json({ success: true, message: 'Inventory item issued', data: { request_item_id: itemId } });
  } catch (error) { await transaction.rollback(); console.error('Issue inventory item:', error); return res.status(500).json({ success: false, message: 'Unable to issue inventory item' }); }
};

exports.returnRequestItem = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const requestId = asInt(req.params.requestId), itemId = asInt(req.params.itemId), images = req.body.image_paths;
    if (!validImagePaths(images)) { await transaction.rollback(); return res.status(400).json({ success: false, message: 'Upload 1 to 8 return condition images first' }); }
    const cp = await db.crew_members.findOne({ where: { user_id: req.user.userId } });
    if (!cp) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Creative partner not found' }); }
    const requests = await query("SELECT id FROM inventory_requests WHERE id=? AND cp_id=? AND status='accepted' FOR UPDATE", [requestId, cp.crew_member_id], transaction);
    if (!requests.length) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Accepted inventory request not found' }); }
    const lines = await query('SELECT * FROM inventory_request_items WHERE id=? AND request_id=? FOR UPDATE', [itemId, requestId], transaction);
    if (!lines.length || !jsonArray(lines[0].assigned_unit_ids).length) { await transaction.rollback(); return res.status(404).json({ success: false, message: 'Assigned request item not found' }); }
    const line = lines[0];
    if (!line.issued_at) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'Admin must issue this item before it can be returned' }); }
    if (line.returned_at) { await transaction.rollback(); return res.status(409).json({ success: false, message: 'This item has already been returned' }); }
    const now = new Date(), due = parseSqlDateTimeAsUtc(line.expected_return_at);
    const late = due && now > due ? calculateRentalCharge(due, now, line.billing_unit === 'hour' ? line.hourly_rate_snapshot : line.daily_rate_snapshot, line.billing_unit, Number(line.quantity)) : 0;
    const total = Math.round((Number(line.base_rent || 0) + late) * 100) / 100;
    const unitIds = jsonArray(line.assigned_unit_ids).map(Number).filter(Number.isInteger);
    for (const unitId of unitIds) await execute("UPDATE inventory_model_units SET status='available',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='assigned'", [unitId], transaction);
    await execute("UPDATE inventory_request_items SET returned_at=UTC_TIMESTAMP(),fulfillment_status='returned',return_images=?,late_charge=?,total_rent=? WHERE id=?", [JSON.stringify(images), late, total, itemId], transaction);
    await transaction.commit();
    return res.json({ success: true, message: 'Inventory item returned', data: { request_item_id: itemId, base_rent: Number(line.base_rent || 0), late_charge: late, total_rent: total } });
  } catch (error) { await transaction.rollback(); console.error('Return inventory item:', error); return res.status(500).json({ success: false, message: 'Unable to return inventory item' }); }
};
