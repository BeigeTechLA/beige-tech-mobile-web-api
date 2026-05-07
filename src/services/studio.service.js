const db = require('../models');
const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────────
//  createStudio
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create a blank studio record owned by user_id.
 * @param {number} user_id
 * @returns {Promise<object>} Newly created studio plain object
 */
async function createStudio(user_id) {
    try {
        const studio = await db.studios.create({
            user_id,
            status: 'draft',
        });
        return studio.toJSON();
    } catch (error) {
        console.error('Error creating studio:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveAddress
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Upsert address for a studio.
 * @param {number} studio_id
 * @param {object} body - address fields
 * @param {string} body.address_line1
 * @param {string} [body.address_line2]
 * @param {string} body.city
 * @param {string} body.state
 * @param {string} body.country
 * @param {string} body.postal_code
 * @param {number} [body.latitude]
 * @param {number} [body.longitude]
 * @returns {Promise<object>}
 */
async function saveAddress(studio_id, body) {
    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const {
            address_line1,
            address_line2,
            city,
            state,
            country,
            postal_code,
            latitude,
            longitude,
        } = body;

        const [record] = await db.studio_addresses.upsert({
            studio_id,
            address_line1,
            address_line2: address_line2 || null,
            city,
            state,
            country,
            postal_code,
            latitude: latitude || null,
            longitude: longitude || null,
        });

        return record.toJSON();
    } catch (error) {
        console.error('Error saving studio address:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveInfo
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Upsert general info (name, type, description, capacity, size) for a studio.
 * @param {number} studio_id
 * @param {object} body
 * @param {string} body.studio_name
 * @param {string} body.studio_type
 * @param {string} [body.description]
 * @param {number} [body.capacity]
 * @param {number} [body.size_sqft]
 * @returns {Promise<object>}
 */
async function saveInfo(studio_id, body) {
    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const { studio_name, studio_type, description, capacity, size_sqft } = body;

        const [record] = await db.studio_info.upsert({
            studio_id,
            studio_name: studio_name || null,
            studio_type: studio_type || null,
            description: description || null,
            capacity: capacity || null,
            size_sqft: size_sqft || null,
        });

        // Keep parent studio name in sync
        if (studio_name) {
            await studio.update({ studio_name });
        }

        return record.toJSON();
    } catch (error) {
        console.error('Error saving studio info:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveFacilities
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Replace all facilities for a studio (destroy-then-bulkCreate).
 * @param {number} studio_id
 * @param {object} body
 * @param {Array<string|{facility_name: string, is_available: boolean}>} body.facilities
 * @returns {Promise<object[]>}
 */
async function saveFacilities(studio_id, body) {
    const transaction = await db.sequelize.transaction();

    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const { facilities = [] } = body;

        await db.studio_facilities.destroy({ where: { studio_id }, transaction });

        const records = await db.studio_facilities.bulkCreate(
            facilities.map((f) => ({
                studio_id,
                facility_name: typeof f === 'string' ? f : f.facility_name,
                is_available: typeof f === 'object' && f.is_available !== undefined ? f.is_available : true,
            })),
            { transaction }
        );

        await transaction.commit();
        return records.map((r) => r.toJSON());
    } catch (error) {
        await transaction.rollback();
        console.error('Error saving studio facilities:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveMedia
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Replace all media for a studio (destroy-then-bulkCreate).
 * @param {number} studio_id
 * @param {Array<{ url: string, type: string, sort_order: number }>} media
 * @returns {Promise<object[]>}
 */
async function saveMedia(studio_id, media) {
    const transaction = await db.sequelize.transaction();

    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        await db.studio_media.destroy({ where: { studio_id }, transaction });

        const records = await db.studio_media.bulkCreate(
            media.map((m) => ({
                studio_id,
                url: m.url,
                type: m.type || 'image',
                sort_order: m.sort_order || 0,
            })),
            { transaction }
        );

        await transaction.commit();
        return records.map((r) => r.toJSON());
    } catch (error) {
        await transaction.rollback();
        console.error('Error saving studio media:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveDetails
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Upsert extra details (parking, accessibility, etc.) for a studio.
 * @param {number} studio_id
 * @param {object} body
 * @param {boolean} [body.parking_available]
 * @param {string}  [body.accessibility]
 * @param {number}  [body.floor_level]
 * @param {boolean} [body.has_elevator]
 * @param {string}  [body.additional_info]
 * @returns {Promise<object>}
 */
async function saveDetails(studio_id, body) {
    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const { parking_available, accessibility, floor_level, has_elevator, additional_info, guests, bedrooms, beds, bathrooms } = body;

        const [record] = await db.studio_details.upsert({
            studio_id,
            parking_available: parking_available !== undefined ? parking_available : false,
            accessibility: accessibility || null,
            floor_level: floor_level || null,
            has_elevator: has_elevator !== undefined ? has_elevator : false,
            additional_info: additional_info || null,
            guests: guests !== undefined ? guests : 0,    
            bedrooms: bedrooms !== undefined ? bedrooms : 0, 
            beds: beds !== undefined ? beds : 0,             
            bathrooms: bathrooms !== undefined ? bathrooms : 0,
        });

        return record.toJSON();
    } catch (error) {
        console.error('Error saving studio details:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveHoursAndRules
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Replace operating hours and upsert house rules for a studio.
 * @param {number} studio_id
 * @param {object} body
 * @param {Array<{ day: string, is_open: boolean, is_24hrs: boolean, opening_time: string, closing_time: string }>} body.hours
 * @param {{ smoking_allowed, alcohol_allowed, pets_allowed, loud_music_allowed, outside_food_allowed, custom_rule }} body.rules
 * @returns {Promise<{ hours: object[], rules: object }>}
 */
async function saveHoursAndRules(studio_id, body) {
    const transaction = await db.sequelize.transaction();

    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const { hours = [], rules = {} } = body;

        // Hours — destroy-then-bulkCreate
        await db.studio_hours.destroy({ where: { studio_id }, transaction });

        const hourRecords = await db.studio_hours.bulkCreate(
            hours.map((h) => ({
                studio_id,
                day: h.day,
                is_open: h.is_open !== undefined ? h.is_open : true,
                is_24hrs: h.is_24hrs || false,
                opening_time: h.opening_time || null,
                closing_time: h.closing_time || null,
            })),
            { transaction }
        );

        // Rules — upsert
        const [ruleRecord] = await db.studio_rules.upsert(
            {
                studio_id,
                smoking_allowed: rules.smoking_allowed || false,
                alcohol_allowed: rules.alcohol_allowed || false,
                pets_allowed: rules.pets_allowed || false,
                loud_music_allowed: rules.loud_music_allowed || false,
                outside_food_allowed: rules.outside_food_allowed || false,
                custom_rule: rules.custom_rule || null,
            },
            { transaction }
        );

        await transaction.commit();

        return {
            hours: hourRecords.map((r) => r.toJSON()),
            rules: ruleRecord.toJSON(),
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error saving studio hours and rules:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  saveBudget
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Upsert budget + replace categories and equipment for a studio.
 * @param {number} studio_id
 * @param {object} body
 * @param {number} body.hourly_rate
 * @param {number} [body.overtime_rate]
 * @param {number} [body.minimum_booking]
 * @param {number} [body.buffer_time]
 * @param {Array<{ name, price_per_hour, min_hours, max_people, is_selected, includes }>} body.categories
 * @param {Array<{ name, cost }>} body.equipment
 * @returns {Promise<{ budget: object, categories: object[], equipment: object[] }>}
 */
async function saveBudget(studio_id, body) {
    const transaction = await db.sequelize.transaction();

    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const {
            hourly_rate,
            overtime_rate,
            minimum_booking,
            buffer_time,
            categories = [],
            equipment = [],
        } = body;

        // Upsert main budget row
        const [budgetRecord] = await db.studio_budgets.upsert(
            {
                studio_id,
                hourly_rate: parseFloat(hourly_rate) || 0,
                overtime_rate: parseFloat(overtime_rate) || 0,
                minimum_booking: parseFloat(minimum_booking) || 0,
                buffer_time: parseInt(buffer_time) || 0,
            },
            { transaction }
        );

        // Categories — destroy-then-bulkCreate
        await db.studio_budget_categories.destroy({ where: { studio_id }, transaction });

        const categoryRecords = await db.studio_budget_categories.bulkCreate(
            categories.map((c) => ({
                studio_id,
                name: c.name,
                price_per_hour: parseFloat(c.price_per_hour) || 0,
                min_hours: parseInt(c.min_hours) || 1,
                max_people: parseInt(c.max_people) || null,
                is_selected: c.is_selected || false,
                includes: Array.isArray(c.includes) ? c.includes : c.includes || null,
            })),
            { transaction }
        );

        // Equipment — destroy-then-bulkCreate
        await db.studio_equipment.destroy({ where: { studio_id }, transaction });

        const equipmentRecords = await db.studio_equipment.bulkCreate(
            equipment.map((e) => ({
                studio_id,
                name: e.name,
                cost: parseFloat(e.cost) || 0,
            })),
            { transaction }
        );

        await transaction.commit();

        return {
            budget: budgetRecord.toJSON(),
            categories: categoryRecords.map((r) => r.toJSON()),
            equipment: equipmentRecords.map((r) => r.toJSON()),
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error saving studio budget:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  savePolicies  — Final publish step
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Replace policies and mark studio as published.
 * @param {number} studio_id
 * @param {object} body
 * @param {string[]} body.selected_policies - e.g. ["Cancellation Window & Refunded", ...]
 * @returns {Promise<{ policies: object[], studio: object }>}
 */
async function savePolicies(studio_id, body) {
    const transaction = await db.sequelize.transaction();
    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const { selected_policies = [] } = body;
        await db.studio_policies.destroy({ where: { studio_id }, transaction });
        const policyRecord = await db.studio_policies.create({
            studio_id,
            selected_policies: selected_policies,
        }, { transaction });

        await studio.update({ status: 'published' }, { transaction });
        await transaction.commit();

        return {
            policies: policyRecord.toJSON(),
            studio: studio.toJSON(),
        };
    } catch (error) {
        await transaction.rollback();
        console.error('Error saving studio policies:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  getStudioById
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Fetch a studio by ID with all related data.
 * @param {number} studio_id
 * @returns {Promise<object|null>}
 */
async function getStudioById(studio_id) {
    try {
        const studio = await db.studios.findOne({
            where: { id: studio_id },
            include: [
                { model: db.studio_addresses, as: 'address' },
                { model: db.studio_info, as: 'info' },
                { model: db.studio_facilities, as: 'facilities' },
                { model: db.studio_media, as: 'media', order: [['sort_order', 'ASC']] },
                { model: db.studio_details, as: 'details' },
                { model: db.studio_hours, as: 'hours' },
                { model: db.studio_rules, as: 'rules' },
                {
                    model: db.studio_budgets, as: 'budget',
                    include: [
                        { model: db.studio_budget_categories, as: 'categories' },
                        { model: db.studio_equipment, as: 'equipment' },
                    ],
                },
                { model: db.studio_policies, as: 'policies' },
            ],
        });

        if (!studio) return null;

        return studio.toJSON();
    } catch (error) {
        console.error('Error fetching studio by ID:', error);
        throw error;
    }
}

/**
 * Fetch all studios owned by a user.
 * @param {number} user_id
 * @returns {Promise<object[]>}
 */
async function getStudiosByUser(user_id) {
    try {
        const studios = await db.studios.findAll({
            where: { user_id },
            include: [
                { model: db.studio_addresses, as: 'address' },
                { model: db.studio_info, as: 'info' },
                { model: db.studio_media, as: 'media', order: [['sort_order', 'ASC']] },
                {
                    model: db.studio_budgets, as: 'budget',
                    include: [
                        { model: db.studio_budget_categories, as: 'categories' },
                    ],
                },
            ],
            order: [['createdAt', 'DESC']],
        });

        return studios.map((s) => s.toJSON());
    } catch (error) {
        console.error('Error fetching studios by user:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  deleteStudio
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Soft-delete a studio by setting status to 'deleted'.
 * All child records remain intact for audit purposes.
 * @param {number} studio_id
 * @returns {Promise<object>} Updated studio plain object
 */
async function deleteStudio(studio_id) {
    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        await studio.update({ status: 'deleted' });

        return studio.toJSON();
    } catch (error) {
        console.error('Error deleting studio:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  updateStudio  — Single API to update all studio data at once
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Update all studio sections in one call (like quotes updateQuote).
 * Only updates sections whose keys are present in body.
 * @param {number} studio_id
 * @param {object} body - any combination of address, info, facilities, media,
 *                        details, hours, rules, budget, policies fields
 * @returns {Promise<object>} 
 */
async function updateStudio(studio_id, body) {
    const transaction = await db.sequelize.transaction();

    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const {
            // Address
            address_line1, address_line2, city, state, country, postal_code, latitude, longitude,

            // Info
            studio_name, studio_type, description, capacity, size_sqft,

            // Facilities
            facilities,

            // Media
            media,

            // Details
            parking_available, accessibility, floor_level, has_elevator, additional_info, guests, bedrooms, beds, bathrooms, 

            // Hours & Rules
            hours, rules,

            // Budget
            hourly_rate, overtime_rate, minimum_booking, buffer_time, categories, equipment,

            // Policies
            selected_policies,
        } = body;

        // ── Address ──────────────────────────────────────────────────────────
        if (address_line1 || city || state || country || postal_code) {
            await db.studio_addresses.upsert({
                studio_id,
                address_line1: address_line1 || null,
                address_line2: address_line2 || null,
                city: city || null,
                state: state || null,
                country: country || null,
                postal_code: postal_code || null,
                latitude: latitude || null,
                longitude: longitude || null,
            }, { transaction });
        }

        // ── Info ─────────────────────────────────────────────────────────────
        if (studio_name || studio_type || description || capacity || size_sqft) {
            await db.studio_info.upsert({
                studio_id,
                studio_name: studio_name || null,
                studio_type: studio_type || null,
                description: description || null,
                capacity: capacity || null,
                size_sqft: size_sqft || null,
            }, { transaction });

            if (studio_name) {
                await studio.update({ studio_name }, { transaction });
            }
        }

        // ── Facilities ───────────────────────────────────────────────────────
        if (facilities && Array.isArray(facilities)) {
            await db.studio_facilities.destroy({ where: { studio_id }, transaction });
            await db.studio_facilities.bulkCreate(
                facilities.map((f) => ({
                    studio_id,
                    facility_name: typeof f === 'string' ? f : f.facility_name,
                    is_available: typeof f === 'object' && f.is_available !== undefined ? f.is_available : true,
                })),
                { transaction }
            );
        }

        // ── Media ────────────────────────────────────────────────────────────
        if (media && Array.isArray(media)) {
            await db.studio_media.destroy({ where: { studio_id }, transaction });
            await db.studio_media.bulkCreate(
                media.map((m) => ({
                    studio_id,
                    url: m.url,
                    type: m.type || 'image',
                    sort_order: m.sort_order || 0,
                })),
                { transaction }
            );
        }

        // ── Details ──────────────────────────────────────────────────────────
        if (
            parking_available !== undefined || accessibility || floor_level !== undefined ||
            has_elevator !== undefined || additional_info ||
            guests !== undefined || bedrooms !== undefined || beds !== undefined || bathrooms !== undefined 
        ) {
            await db.studio_details.upsert({
                studio_id,
                parking_available: parking_available !== undefined ? parking_available : false,
                accessibility: accessibility || null,
                floor_level: floor_level || null,
                has_elevator: has_elevator !== undefined ? has_elevator : false,
                additional_info: additional_info || null,
                guests: guests !== undefined ? guests : 0,          
                bedrooms: bedrooms !== undefined ? bedrooms : 0,    
                beds: beds !== undefined ? beds : 0,                
                bathrooms: bathrooms !== undefined ? bathrooms : 0, 
            }, { transaction });
        }

        // ── Hours ────────────────────────────────────────────────────────────
        if (hours && Array.isArray(hours)) {
            await db.studio_hours.destroy({ where: { studio_id }, transaction });
            await db.studio_hours.bulkCreate(
                hours.map((h) => ({
                    studio_id,
                    day: h.day,
                    is_open: h.is_open !== undefined ? h.is_open : true,
                    is_24hrs: h.is_24hrs || false,
                    opening_time: h.opening_time || null,
                    closing_time: h.closing_time || null,
                })),
                { transaction }
            );
        }

        // ── Rules ────────────────────────────────────────────────────────────
        if (rules && typeof rules === 'object') {
            await db.studio_rules.upsert({
                studio_id,
                smoking_allowed: rules.smoking_allowed || false,
                alcohol_allowed: rules.alcohol_allowed || false,
                pets_allowed: rules.pets_allowed || false,
                loud_music_allowed: rules.loud_music_allowed || false,
                outside_food_allowed: rules.outside_food_allowed || false,
                custom_rule: rules.custom_rule || null,
            }, { transaction });
        }

        // ── Budget ───────────────────────────────────────────────────────────
        if (hourly_rate !== undefined) {
            await db.studio_budgets.upsert({
                studio_id,
                hourly_rate: parseFloat(hourly_rate) || 0,
                overtime_rate: parseFloat(overtime_rate) || 0,
                minimum_booking: parseFloat(minimum_booking) || 0,
                buffer_time: parseInt(buffer_time) || 0,
            }, { transaction });

            if (categories && Array.isArray(categories)) {
                await db.studio_budget_categories.destroy({ where: { studio_id }, transaction });
                await db.studio_budget_categories.bulkCreate(
                    categories.map((c) => ({
                        studio_id,
                        name: c.name,
                        price_per_hour: parseFloat(c.price_per_hour) || 0,
                        min_hours: parseInt(c.min_hours) || 1,
                        max_people: parseInt(c.max_people) || null,
                        is_selected: c.is_selected || false,
                        includes: Array.isArray(c.includes) ? c.includes : c.includes || null,
                    })),
                    { transaction }
                );
            }

            if (equipment && Array.isArray(equipment)) {
                await db.studio_equipment.destroy({ where: { studio_id }, transaction });
                await db.studio_equipment.bulkCreate(
                    equipment.map((e) => ({
                        studio_id,
                        name: e.name,
                        cost: parseFloat(e.cost) || 0,
                    })),
                    { transaction }
                );
            }
        }

        // ── Policies ─────────────────────────────────────────────────────────
        if (selected_policies && Array.isArray(selected_policies)) {
            await db.studio_policies.destroy({ where: { studio_id }, transaction });
            await db.studio_policies.create({
                studio_id,
                selected_policies,
            }, { transaction });
        }

        await transaction.commit();

        // Return fresh full studio data
        return await getStudioById(studio_id);
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating studio:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  getOverview
// ─────────────────────────────────────────────────────────────────────────────
async function getOverview(studio_id, month) {
    try {
        const where = { studio_id };

        if (month) {
            const start = new Date(`${month}-01`);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            where.snapshot_month = { [Op.between]: [start, end] };
        }

        const snapshots = await db.studio_revenue_snapshots.findAll({
            where,
            order: [['snapshot_month', 'ASC']],
        });

        // Metrics — sum all snapshots in range
        const metrics = snapshots.reduce(
            (acc, s) => {
                acc.total_revenue += parseFloat(s.total_revenue || 0);
                acc.total_bookings += parseInt(s.total_bookings || 0);
                acc.overtime_revenue += parseFloat(s.overtime_revenue || 0);
                return acc;
            },
            { total_revenue: 0, total_bookings: 0, overtime_revenue: 0 }
        );

        metrics.avg_booking_value =
            metrics.total_bookings > 0
                ? parseFloat((metrics.total_revenue / metrics.total_bookings).toFixed(2))
                : 0;

        // Chart data
        const chart = snapshots.map((s) => ({
            month: new Date(s.snapshot_month).toLocaleString('default', { month: 'short' }),
            revenue: parseFloat(s.total_revenue || 0),
        }));

        return { metrics, chart };
    } catch (error) {
        console.error('Error fetching overview:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  getBookings
// ─────────────────────────────────────────────────────────────────────────────
async function getBookings(studio_id, { status, month } = {}) {
    try {
        // ── DUMMY DATA (remove when real bookings come) ──
        const allDummy = [
            {
                id: 1, studio_id: parseInt(studio_id),
                project_name: 'Brand Shoot - Nike',
                contact_name: 'Rahul Mehta',
                contact_email: 'rahul@nike.com',
                crew_count: 5,
                booking_date: '2026-05-15',
                start_time: '09:00:00', end_time: '17:00:00',
                hours: 8, base_revenue: 4000, overtime_amount: 500,
                platform_fee: 450, net_earnings: 4050,
                status: 'upcoming', media: [],
            },
            {
                id: 2, studio_id: parseInt(studio_id),
                project_name: 'Wedding Promo',
                contact_name: 'Priya Shah',
                contact_email: 'priya@weddings.com',
                crew_count: 3,
                booking_date: '2026-04-10',
                start_time: '10:00:00', end_time: '16:00:00',
                hours: 6, base_revenue: 3000, overtime_amount: 0,
                platform_fee: 300, net_earnings: 2700,
                status: 'completed', media: [],
            },
            {
                id: 3, studio_id: parseInt(studio_id),
                project_name: 'Music Video - DJ Arjun',
                contact_name: 'Arjun Kapoor',
                contact_email: 'arjun@music.com',
                crew_count: 8,
                booking_date: '2026-04-20',
                start_time: '12:00:00', end_time: '20:00:00',
                hours: 8, base_revenue: 5000, overtime_amount: 1000,
                platform_fee: 600, net_earnings: 5400,
                status: 'cancelled', media: [],
            },
        ];

        let filtered = allDummy;
        if (status) filtered = filtered.filter(b => b.status === status);
        return filtered;
        // ── END DUMMY DATA ──
    } catch (error) {
        console.error('Error fetching bookings:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  getLedger
// ─────────────────────────────────────────────────────────────────────────────
async function getLedger(studio_id, month) {
    try {
        // ── DUMMY DATA (remove when real bookings come) ──
        return [
            {
                id: 1,
                date: '2026-04-10',
                studio_name: 'My Studio',
                booking_id: '#IB-00001',
                hours: 6,
                base_revenue: 3000,
                overtime: 0,
                platform_fee: 300,
                net_earnings: 2700,
            },
            {
                id: 2,
                date: '2026-04-20',
                studio_name: 'My Studio',
                booking_id: '#IB-00002',
                hours: 8,
                base_revenue: 5000,
                overtime: 1000,
                platform_fee: 600,
                net_earnings: 5400,
            },
        ];
        // ── END DUMMY DATA ──
    } catch (error) {
        console.error('Error fetching ledger:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  createBooking
// ─────────────────────────────────────────────────────────────────────────────
async function createBooking(studio_id, body) {
    const transaction = await db.sequelize.transaction();

    try {
        const studio = await db.studios.findByPk(studio_id);
        if (!studio) {
            const err = new Error('Studio not found');
            err.status = 404;
            throw err;
        }

        const {
            user_id, project_name, contact_name, contact_email,
            crew_count, booking_date, start_time, end_time,
            hours, base_revenue, overtime_amount, platform_fee,
            net_earnings, media = [],
        } = body;

        const booking = await db.studio_bookings.create({
            studio_id,
            user_id: user_id || null,
            project_name: project_name || null,
            contact_name: contact_name || null,
            contact_email: contact_email || null,
            crew_count: crew_count || 1,
            booking_date,
            start_time,
            end_time,
            hours: parseFloat(hours) || 0,
            base_revenue: parseFloat(base_revenue) || 0,
            overtime_amount: parseFloat(overtime_amount) || 0,
            platform_fee: parseFloat(platform_fee) || 0,
            net_earnings: parseFloat(net_earnings) || 0,
            status: 'upcoming',
        }, { transaction });

        if (media.length > 0) {
            await db.studio_booking_media.bulkCreate(
                media.map((m, i) => ({
                    booking_id: booking.id,
                    url: m.url,
                    type: m.type || 'image',
                    sort_order: m.sort_order || i,
                })),
                { transaction }
            );
        }

        await transaction.commit();
        await _updateRevenueSnapshot(studio_id, booking_date, {
            overtime_amount: parseFloat(overtime_amount) || 0,
            net_earnings: parseFloat(net_earnings) || 0,
        });
        return booking.toJSON();
    } catch (error) {
        await transaction.rollback();
        console.error('Error creating booking:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  updateBookingStatus
// ─────────────────────────────────────────────────────────────────────────────
async function updateBookingStatus(studio_id, booking_id, status) {
    try {
        const booking = await db.studio_bookings.findOne({
            where: { id: booking_id, studio_id },
        });

        if (!booking) return null;

        await booking.update({ status });
        return booking.toJSON();
    } catch (error) {
        console.error('Error updating booking status:', error);
        throw error;
    }
}
async function _updateRevenueSnapshot(studio_id, booking_date, amounts) {
    try {
        const month = new Date(booking_date);
        const snapshot_month = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;

        const existing = await db.studio_revenue_snapshots.findOne({
            where: { studio_id, snapshot_month },
        });

        if (existing) {
            const new_total = parseFloat(existing.total_revenue) + amounts.net_earnings;
            const new_bookings = existing.total_bookings + 1;
            await existing.update({
                total_revenue: new_total,
                total_bookings: new_bookings,
                overtime_revenue: parseFloat(existing.overtime_revenue) + amounts.overtime_amount,
                avg_booking_value: parseFloat((new_total / new_bookings).toFixed(2)),
            });
        } else {
            await db.studio_revenue_snapshots.create({
                studio_id,
                snapshot_month,
                total_revenue: amounts.net_earnings,
                total_bookings: 1,
                overtime_revenue: amounts.overtime_amount,
                avg_booking_value: amounts.net_earnings,
            });
        }
    } catch (error) {
        console.error('Error updating revenue snapshot:', error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  createStudioRequest
// ─────────────────────────────────────────────────────────────────────────────
async function createStudioRequest(body) {
    try {
        const { studio_id, user_id, message } = body;
        const request = await db.studio_requests.create({
            studio_id,
            user_id,
            message: message || null,
            status: 'pending',
        });
        return request.toJSON();
    } catch (error) {
        console.error('Error creating studio request:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  getStudioRequests
// ─────────────────────────────────────────────────────────────────────────────
async function getStudioRequests({ status, month } = {}) {
    try {
        const where = {};
        if (status) where.status = status;
        if (month) {
            const start = new Date(`${month}-01`);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            where.created_at = { [Op.between]: [start, end] };
        }

        const requests = await db.studio_requests.findAll({
            where,
            include: [
                {
                    model: db.studios,
                    as: 'studio',
                    include: [
                        {
                            model: db.studio_info,
                            as: 'info',
                            attributes: ['space_title', 'brand_name', 'suggest_type', 'description'],
                        },
                        {
                            model: db.studio_addresses,
                            as: 'address',
                            attributes: ['city', 'state', 'country'],
                        },
                    ],
                },
                {
                    model: db.users,
                    as: 'user',
                    attributes: ['id', 'name', 'email'],
                },
            ],
            order: [['created_at', 'DESC']],
        });

        const seen = new Set();
        const unique = requests.filter((r) => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            return true;
        });

        return unique.map((r) => {
            const data = r.toJSON();
            if (Array.isArray(data.studio?.info)) {
                data.studio.info = data.studio.info[0] || null;
            }
            if (Array.isArray(data.studio?.address)) {
                data.studio.address = data.studio.address[0] || null;
            }
            return data;
        });
    } catch (error) {
        console.error('Error fetching studio requests:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  updateStudioRequestStatus
// ─────────────────────────────────────────────────────────────────────────────
async function updateStudioRequestStatus(request_id, status) {
    try {
        const request = await db.studio_requests.findByPk(request_id);
        if (!request) return null;
        await request.update({ status });
        return request.toJSON();
    } catch (error) {
        console.error('Error updating studio request status:', error);
        throw error;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  deleteStudioRequest
// ─────────────────────────────────────────────────────────────────────────────
async function deleteStudioRequest(request_id) {
    try {
        const request = await db.studio_requests.findByPk(request_id);
        if (!request) return null;
        await request.destroy();
        return { id: request_id, deleted: true };
    } catch (error) {
        console.error('Error deleting studio request:', error);
        throw error;
    }
}

module.exports = {
    createStudio,
    saveAddress,
    saveInfo,
    saveFacilities,
    saveMedia,
    saveDetails,
    saveHoursAndRules,
    saveBudget,
    savePolicies,
    getStudioById,
    getStudiosByUser,
    deleteStudio,
    updateStudio,
    getOverview,
    getBookings,
    getLedger,
    createBooking,
    updateBookingStatus,
    createStudioRequest,
    getStudioRequests,
    updateStudioRequestStatus,
    deleteStudioRequest,
};