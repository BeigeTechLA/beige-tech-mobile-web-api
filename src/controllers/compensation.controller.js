const { Op } = require('sequelize');
const constants = require('../utils/constants');
const {
    cp_compensations,
    cp_compensation_advances,
    cp_compensation_logs,
    stream_project_booking,
    assigned_crew,
    crew_members
} = require('../models');

// ─── HELPERS 

const calcFlatTotal = ({ base_payout, editing_payout, travel_adjustment, bonus_adjustment }) => {
    return (
        parseFloat(base_payout || 0) +
        parseFloat(editing_payout || 0) +
        parseFloat(travel_adjustment || 0) +
        parseFloat(bonus_adjustment || 0)
    );
};

const calcHourlyTotal = ({ hourly_rate, hours_worked, editing_payout, travel_adjustment, bonus_adjustment }) => {
    const base = parseFloat(hourly_rate || 0) * parseFloat(hours_worked || 0);
    return (
        base +
        parseFloat(editing_payout || 0) +
        parseFloat(travel_adjustment || 0) +
        parseFloat(bonus_adjustment || 0)
    );
};

const getProfitability = (totalCompensation, shootAmount) => {
    if (!shootAmount || shootAmount === 0) return { status: 'healthy', percent: 0 };
    const percent = (parseFloat(totalCompensation) / parseFloat(shootAmount)) * 100;
    return {
        status: percent > 25 ? 'warning' : 'healthy',
        percent: parseFloat(percent.toFixed(1))
    };
};

const writeLog = async ({ compensation_id, booking_id, action, performed_by_user_id, snapshot, notes }) => {
    try {
        await cp_compensation_logs.create({
            compensation_id,
            booking_id,
            action,
            performed_by_user_id: performed_by_user_id || null,
            snapshot_json: snapshot ? JSON.stringify(snapshot) : null,
            notes: notes || null
        });
    } catch (err) {
        console.error('[CompensationLog] Failed:', err.message);
    }
};

// ─── GET: All CPs + compensation for a booking

/**
 * Get all assigned CPs + their compensation data for a booking
 * GET /api/compensation/booking/:bookingId
 */
exports.getBookingCompensations = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await stream_project_booking.findOne({
            where: { stream_project_booking_id: bookingId, is_active: 1 },
            attributes: ['stream_project_booking_id', 'project_name', 'budget', 'event_date']
        });

        if (!booking) {
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'Booking not found' });
        }

        const assignedCPs = await assigned_crew.findAll({
            where: { project_id: bookingId, is_active: 1 },
            include: [{
                model: crew_members,
                as: 'crew_member',
                attributes: ['crew_member_id', 'first_name', 'last_name', 'primary_role', 'hourly_rate'],
                required: true
            }]
        });

        if (!assignedCPs.length) {
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'No CPs assigned to this booking' });
        }

        const existingCompensations = await cp_compensations.findAll({
            where: { booking_id: bookingId, is_active: 1 },
            include: [{
                model: cp_compensation_advances,
                as: 'advances',
                required: false,
                where: { status: { [Op.ne]: 'cancelled' } }
            }]
        });

        const compensationMap = {};
        existingCompensations.forEach(c => {
            compensationMap[c.crew_member_id] = c.toJSON();
        });

        const shootAmount = parseFloat(booking.budget || 0);
        const cpCount = assignedCPs.length;
        const equalSplitAmount = shootAmount > 0 && cpCount > 0
            ? parseFloat(((shootAmount * 0.25) / cpCount).toFixed(2))
            : 0;

        const cps = assignedCPs.map(ac => {
            const crew = ac.crew_member;
            return {
                crew_member_id: crew.crew_member_id,
                name: `${crew.first_name} ${crew.last_name}`,
                role: crew.primary_role || 'Crew Member',
                default_hourly_rate: parseFloat(crew.hourly_rate || 0),
                compensation: compensationMap[crew.crew_member_id] || null
            };
        });

        const totalCompensation = existingCompensations.reduce(
            (sum, c) => sum + parseFloat(c.total_compensation || 0), 0
        );
        const profitability = getProfitability(totalCompensation, shootAmount);

        return res.json({
            success: true,
            data: {
                booking: {
                    booking_id: booking.stream_project_booking_id,
                    project_name: booking.project_name,
                    shoot_amount: shootAmount,
                    event_date: booking.event_date
                },
                summary: {
                    total_shoot_amount: shootAmount,
                    total_compensation: parseFloat(totalCompensation.toFixed(2)),
                    compensation_percent: profitability.percent,
                    estimated_margin: parseFloat((shootAmount - totalCompensation).toFixed(2)),
                    profitability: profitability.status,
                    exceeds_25_percent: profitability.percent > 25,
                    cp_count: cpCount,
                    equal_split_amount: equalSplitAmount
                },
                cps
            }
        });

    } catch (error) {
        console.error('[getBookingCompensations]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to fetch compensation data' });
    }
};

// ─── GET: Single CP compensation detail 

/**
 * Get single CP compensation with advance history
 * GET /api/compensation/booking/:bookingId/cp/:crewMemberId
 */
exports.getCpCompensation = async (req, res) => {
    try {
        const { bookingId, crewMemberId } = req.params;

        const compensation = await cp_compensations.findOne({
            where: { booking_id: bookingId, crew_member_id: crewMemberId, is_active: 1 },
            include: [{
                model: cp_compensation_advances,
                as: 'advances',
                required: false,
                where: { status: { [Op.ne]: 'cancelled' } }
            }]
        });

        if (!compensation) {
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'Compensation not found' });
        }

        const compData = compensation.toJSON();
        const totalAdvanced = (compData.advances || []).reduce((sum, a) => sum + parseFloat(a.advance_amount || 0), 0);

        return res.json({
            success: true,
            data: {
                ...compData,
                total_advanced: parseFloat(totalAdvanced.toFixed(2)),
                remaining_balance: parseFloat((parseFloat(compData.total_compensation) - totalAdvanced).toFixed(2))
            }
        });

    } catch (error) {
        console.error('[getCpCompensation]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to fetch compensation' });
    }
};

// ─── GET: Compensation Summary

/**
 * Quick summary for finance overview
 * GET /api/compensation/booking/:bookingId/summary
 */
exports.getCompensationSummary = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await stream_project_booking.findOne({
            where: { stream_project_booking_id: bookingId, is_active: 1 },
            attributes: ['stream_project_booking_id', 'project_name', 'budget']
        });

        if (!booking) {
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'Booking not found' });
        }

        const compensations = await cp_compensations.findAll({
            where: { booking_id: bookingId, is_active: 1 },
            include: [{
                model: cp_compensation_advances,
                as: 'advances',
                required: false,
                where: { status: { [Op.ne]: 'cancelled' } }
            }]
        });

        const shootAmount = parseFloat(booking.budget || 0);
        const totalCompensation = compensations.reduce((sum, c) => sum + parseFloat(c.total_compensation || 0), 0);
        const totalAdvanced = compensations.reduce((sum, c) => {
            return sum + (c.advances || []).reduce((s, a) => s + parseFloat(a.advance_amount || 0), 0);
        }, 0);
        const profitability = getProfitability(totalCompensation, shootAmount);

        return res.json({
            success: true,
            data: {
                booking_id: parseInt(bookingId),
                project_name: booking.project_name,
                shoot_amount: shootAmount,
                total_compensation: parseFloat(totalCompensation.toFixed(2)),
                total_advanced: parseFloat(totalAdvanced.toFixed(2)),
                estimated_margin: parseFloat((shootAmount - totalCompensation).toFixed(2)),
                compensation_percent: profitability.percent,
                profitability: profitability.status,
                exceeds_25_percent: profitability.percent > 25,
                cp_count: compensations.length,
                statuses: compensations.map(c => ({
                    crew_member_id: c.crew_member_id,
                    status: c.status,
                    total_compensation: parseFloat(c.total_compensation)
                }))
            }
        });

    } catch (error) {
        console.error('[getCompensationSummary]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to get compensation summary' });
    }
};

// ─── GET: Audit Logs

/**
 * Audit trail for all compensation actions on a booking
 * GET /api/compensation/booking/:bookingId/logs
 */
exports.getCompensationLogs = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const logs = await cp_compensation_logs.findAll({
            where: { booking_id: bookingId },
            order: [['created_at', 'DESC']]
        });

        return res.json({ success: true, data: logs });

    } catch (error) {
        console.error('[getCompensationLogs]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to fetch logs' });
    }
};

// ─── POST: Save compensation (draft) 

/**
 * Save compensation as draft for one or all CPs
 * POST /api/compensation/booking/:bookingId/save
 */
exports.saveCompensations = async (req, res) => {
    const t = await stream_project_booking.sequelize.transaction();
    try {
        const { bookingId } = req.params;
        const userId = req.userId;
        const body = req.body || {};
        const { compensation_method, cps } = body;

        if (!compensation_method || !['equal_split', 'role_based', 'manual'].includes(compensation_method)) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Invalid compensation_method. Must be: equal_split, role_based, manual' });
        }

        if (!Array.isArray(cps) || cps.length === 0) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'cps array is required' });
        }

        const booking = await stream_project_booking.findOne({
            where: { stream_project_booking_id: bookingId, is_active: 1 },
            attributes: ['stream_project_booking_id', 'budget']
        });

        if (!booking) {
            await t.rollback();
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'Booking not found' });
        }

        const shootAmount = parseFloat(booking.budget || 0);
        const savedCompensations = [];

        for (const cp of cps) {
            const { crew_member_id, rate_type, base_payout, editing_payout, travel_adjustment, bonus_adjustment, notes, hourly_rate, hours_worked } = cp;

            if (!crew_member_id) {
                await t.rollback();
                return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'crew_member_id is required for each CP' });
            }

            if (!rate_type || !['flat', 'hourly'].includes(rate_type)) {
                await t.rollback();
                return res.status(constants.BAD_REQUEST.code).json({ success: false, message: `Invalid rate_type for crew_member_id ${crew_member_id}` });
            }

            if (rate_type === 'hourly' && (parseFloat(hourly_rate || 0) <= 0 || parseFloat(hours_worked || 0) <= 0)) {
                await t.rollback();
                return res.status(constants.BAD_REQUEST.code).json({ success: false, message: `hourly_rate and hours_worked must be greater than 0 for crew_member_id ${crew_member_id}` });
            }

            const total_compensation = rate_type === 'flat'
                ? calcFlatTotal({ base_payout, editing_payout, travel_adjustment, bonus_adjustment })
                : calcHourlyTotal({ hourly_rate, hours_worked, editing_payout, travel_adjustment, bonus_adjustment });

            if (rate_type === 'flat' && total_compensation <= 0) {
                await t.rollback();
                return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Flat compensation total must be greater than 0' });
            }

            const [compensation, created] = await cp_compensations.findOrCreate({
                where: { booking_id: bookingId, crew_member_id },
                defaults: {
                    compensation_method,
                    rate_type,
                    base_payout: parseFloat(base_payout || 0),
                    editing_payout: parseFloat(editing_payout || 0),
                    travel_adjustment: parseFloat(travel_adjustment || 0),
                    bonus_adjustment: parseFloat(bonus_adjustment || 0),
                    notes: notes || null,
                    hourly_rate: rate_type === 'hourly' ? parseFloat(hourly_rate) : null,
                    hours_worked: rate_type === 'hourly' ? parseFloat(hours_worked) : null,
                    total_compensation,
                    status: 'draft'
                },
                transaction: t
            });

            if (!created) {
                await compensation.update({
                    compensation_method,
                    rate_type,
                    base_payout: parseFloat(base_payout || 0),
                    editing_payout: parseFloat(editing_payout || 0),
                    travel_adjustment: parseFloat(travel_adjustment || 0),
                    bonus_adjustment: parseFloat(bonus_adjustment || 0),
                    notes: notes || null,
                    hourly_rate: rate_type === 'hourly' ? parseFloat(hourly_rate) : null,
                    hours_worked: rate_type === 'hourly' ? parseFloat(hours_worked) : null,
                    total_compensation,
                    status: 'draft',
                    submitted_at: null,
                    submitted_by_user_id: null
                }, { transaction: t });
            }

            savedCompensations.push(compensation.toJSON());

            await writeLog({
                compensation_id: compensation.compensation_id,
                booking_id: bookingId,
                action: created ? 'created' : 'updated',
                performed_by_user_id: userId,
                snapshot: compensation.toJSON()
            });
        }

        await t.commit();

        const allComps = await cp_compensations.findAll({ where: { booking_id: bookingId, is_active: 1 } });
        const totalCompensation = allComps.reduce((sum, c) => sum + parseFloat(c.total_compensation || 0), 0);
        const profitability = getProfitability(totalCompensation, shootAmount);

        return res.json({
            success: true,
            message: 'Compensation saved successfully',
            data: {
                compensations: savedCompensations,
                summary: {
                    total_shoot_amount: shootAmount,
                    total_compensation: parseFloat(totalCompensation.toFixed(2)),
                    compensation_percent: profitability.percent,
                    estimated_margin: parseFloat((shootAmount - totalCompensation).toFixed(2)),
                    profitability: profitability.status,
                    exceeds_25_percent: profitability.percent > 25
                }
            }
        });

    } catch (error) {
        await t.rollback();
        console.error('[saveCompensations]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to save compensation' });
    }
};

// ─── POST: Submit to Finance 

/**
 * Save + submit compensation to Finance
 * POST /api/compensation/booking/:bookingId/submit
 */
exports.submitToFinance = async (req, res) => {
    const t = await stream_project_booking.sequelize.transaction();
    try {
        const { bookingId } = req.params;
        const userId = req.userId;
        const body = req.body || {};
        const { compensation_method } = body;

        if (compensation_method && !['equal_split', 'role_based', 'manual'].includes(compensation_method)) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Invalid compensation_method. Must be: equal_split, role_based, manual' });
        }

        const booking = await stream_project_booking.findOne({
            where: { stream_project_booking_id: bookingId, is_active: 1 },
            attributes: ['stream_project_booking_id', 'budget']
        });

        if (!booking) {
            await t.rollback();
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'Booking not found' });
        }

        const savedCompensations = await cp_compensations.findAll({
            where: {
                booking_id: bookingId,
                is_active: 1,
                status: 'draft'
            },
            transaction: t
        });

        if (!savedCompensations.length) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Please save compensation for at least one CP before submitting to finance'
            });
        }

        for (const compensation of savedCompensations) {
            const {
                compensation_id,
                crew_member_id,
                rate_type,
                base_payout,
                editing_payout,
                travel_adjustment,
                bonus_adjustment,
                hourly_rate,
                hours_worked
            } = compensation;

            const flatTotal = calcFlatTotal({ base_payout, editing_payout, travel_adjustment, bonus_adjustment });

            if (rate_type === 'flat' && flatTotal <= 0) {
                await t.rollback();
                return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'Flat compensation total must be greater than 0' });
            }

            if (rate_type === 'hourly' && (parseFloat(hourly_rate || 0) <= 0 || parseFloat(hours_worked || 0) <= 0)) {
                await t.rollback();
                return res.status(constants.BAD_REQUEST.code).json({ success: false, message: `hourly_rate and hours_worked must be greater than 0 for crew_member_id ${crew_member_id}` });
            }

            await compensation.update({
                compensation_method: compensation_method || compensation.compensation_method,
                status: 'submitted',
                submitted_at: new Date(),
                submitted_by_user_id: userId
            }, { transaction: t });

            await writeLog({
                compensation_id,
                booking_id: bookingId,
                action: 'submitted',
                performed_by_user_id: userId,
                snapshot: compensation.toJSON()
            });
        }

        await t.commit();

        return res.json({
            success: true,
            message: 'Compensation submitted to finance successfully'
        });

    } catch (error) {
        await t.rollback();
        console.error('[submitToFinance]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to submit compensation to finance' });
    }
};

// ─── POST: Add Advance Payment 

/**
 * Add advance payment for a specific CP
 * POST /api/compensation/booking/:bookingId/cp/:crewMemberId/advance
 */
exports.addAdvancePayment = async (req, res) => {
    const t = await stream_project_booking.sequelize.transaction();
    try {
        const { bookingId, crewMemberId } = req.params;
        const userId = req.userId;
        const { advance_amount, payment_date, notes } = req.body;

        if (!advance_amount || parseFloat(advance_amount) <= 0) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({ success: false, message: 'advance_amount must be greater than 0' });
        }

        const compensation = await cp_compensations.findOne({
            where: { booking_id: bookingId, crew_member_id: crewMemberId, is_active: 1 }
        });

        if (!compensation) {
            await t.rollback();
            return res.status(constants.NOT_FOUND.code).json({
                success: false,
                message: 'Compensation record not found. Please save compensation before adding advance.'
            });
        }

        if (compensation.rate_type === 'flat' && parseFloat(compensation.total_compensation || 0) <= 0) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: 'Flat compensation total must be greater than 0'
            });
        }

        const existingAdvances = await cp_compensation_advances.findAll({
            where: {
                compensation_id: compensation.compensation_id,
                status: { [Op.ne]: 'cancelled' }
            }
        });

        const totalAdvanced = existingAdvances.reduce((sum, a) => sum + parseFloat(a.advance_amount || 0), 0);
        const newAdvanceAmt = parseFloat(advance_amount);

        if ((totalAdvanced + newAdvanceAmt) > parseFloat(compensation.total_compensation)) {
            await t.rollback();
            return res.status(constants.BAD_REQUEST.code).json({
                success: false,
                message: `Advance amount exceeds remaining balance of $${(parseFloat(compensation.total_compensation) - totalAdvanced).toFixed(2)}`
            });
        }

        const remaining_balance = parseFloat(compensation.total_compensation) - (totalAdvanced + newAdvanceAmt);

        const advance = await cp_compensation_advances.create({
            compensation_id: compensation.compensation_id,
            booking_id: bookingId,
            crew_member_id: crewMemberId,
            advance_amount: newAdvanceAmt,
            remaining_balance,
            payment_date: payment_date || null,
            notes: notes || null,
            status: 'pending',
            created_by_user_id: userId
        }, { transaction: t });

        await writeLog({
            compensation_id: compensation.compensation_id,
            booking_id: bookingId,
            action: 'advance_added',
            performed_by_user_id: userId,
            snapshot: advance.toJSON(),
            notes: `Advance of $${newAdvanceAmt} added. Remaining: $${remaining_balance.toFixed(2)}`
        });

        await t.commit();

        return res.status(constants.CREATED.code).json({
            success: true,
            message: 'Advance payment added successfully',
            data: {
                advance_id: advance.advance_id,
                compensation_id: compensation.compensation_id,
                total_compensation: parseFloat(compensation.total_compensation),
                advance_amount: newAdvanceAmt,
                total_advanced: parseFloat((totalAdvanced + newAdvanceAmt).toFixed(2)),
                remaining_balance: parseFloat(remaining_balance.toFixed(2)),
                payment_date: advance.payment_date,
                status: advance.status
            }
        });

    } catch (error) {
        await t.rollback();
        console.error('[addAdvancePayment]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to add advance payment' });
    }
};

// ─── PATCH: Cancel Advance 
/**
 * Cancel a pending advance payment
 * PATCH /api/compensation/booking/:bookingId/cp/:crewMemberId/advance/:advanceId/cancel
 */
exports.cancelAdvance = async (req, res) => {
    try {
        const { advanceId } = req.params;
        const userId = req.userId;

        const advance = await cp_compensation_advances.findByPk(advanceId);

        if (!advance) {
            return res.status(constants.NOT_FOUND.code).json({ success: false, message: 'Advance not found' });
        }

        if (advance.status !== 'pending') {
            return res.status(constants.BAD_REQUEST.code).json({ success: false, message: `Cannot cancel advance with status: ${advance.status}` });
        }

        await advance.update({ status: 'cancelled' });

        await writeLog({
            compensation_id: advance.compensation_id,
            booking_id: advance.booking_id,
            action: 'updated',
            performed_by_user_id: userId,
            notes: `Advance #${advanceId} cancelled`
        });

        return res.json({ success: true, message: 'Advance payment cancelled' });

    } catch (error) {
        console.error('[cancelAdvance]', error);
        return res.status(constants.INTERNAL_SERVER_ERROR.code).json({ success: false, message: 'Failed to cancel advance' });
    }
};



    
