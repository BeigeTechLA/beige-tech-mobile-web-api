const db = require('../models');

function toMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function parseJson(value, fallback = null) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function toPlain(record) {
    if (!record) return null;
    if (typeof record.get === 'function') return record.get({ plain: true });
    return record;
}

function formatDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function buildCreatorName(creator) {
    if (!creator) return null;
    return [creator.first_name, creator.last_name].filter(Boolean).join(' ').trim() || creator.email || null;
}

function getEarningDisplayStatus(earning, assignedCrew) {
    if (!assignedCrew) return 'pending';

    const crewAccept = Number(assignedCrew.crew_accept);

    if (earning.status === 'paid') return 'paid';
    if (earning.status === 'payout_pending') return 'payout_pending';
    if (earning.status === 'earned') return 'partially_paid';

    if (crewAccept === 0) return 'awaiting_proposal';
    if (crewAccept === 1) return 'booked';
    if (crewAccept === 2) return 'declined';

    return 'pending';
}

function buildEarningStatusLabel(status) {
    const labels = {
        paid: 'Paid',
        partially_paid: 'Partially Paid',
        payout_pending: 'Awaiting Payout',
        awaiting_proposal: 'Awaiting Proposal',
        booked: 'Booked',
        declined: 'Declined',
        pending: 'Pending'
    };
    return labels[status] || 'Pending';
}

function buildPaymentBreakdown(earning, advances = []) {
    const totalCompensation = toMoney(earning.gross_amount || earning.net_earning_amount || 0);
    const advanceTotal = toMoney(
        advances.filter(a => a.status === 'processed').reduce((sum, a) => sum + Number(a.amount || 0), 0)
    );
    const remainingBalance = toMoney(Math.max(totalCompensation - advanceTotal, 0));
    const paymentPercent = totalCompensation > 0
        ? Math.round((advanceTotal / totalCompensation) * 100)
        : 0;

    return {
        total_compensation: totalCompensation,
        advance_paid: advanceTotal,
        remaining_balance: remainingBalance,
        payment_percent: paymentPercent,
        advances: advances.map(advance => ({
            advance_id: advance.advance_id,
            amount: toMoney(advance.amount),
            status: advance.status,
            processed_at: advance.processed_at,
            notes: advance.notes
        }))
    };
}

function buildCompensationBreakdown(compensationItems = [], grossAmount = 0) {
    if (!compensationItems.length) {
        return [{
            label: 'Base Compensation',
            amount: toMoney(grossAmount)
        }];
    }

    return compensationItems
        .filter(item => item.is_active)
        .map(item => ({
            compensation_item_id: item.compensation_item_id,
            label: item.item_label,
            amount: toMoney(item.amount)
        }));
}

function buildTimeline(timelineEvents = [], earning = {}, assignedCrew = null) {
    if (timelineEvents.length > 0) {
        return timelineEvents
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(event => ({
                timeline_event_id: event.timeline_event_id,
                event_type: event.event_type,
                label: event.label,
                sub_label: event.sub_label,
                amount: event.amount ? toMoney(event.amount) : null,
                is_completed: Boolean(event.is_completed),
                event_date: event.event_date ? formatDate(event.event_date) : null
            }));
    }

    const booking = earning.booking || {};
    const timeline = [];

    timeline.push({
        event_type: 'shoot_assigned',
        label: 'New Shoot Received & Shoot assigned to you',
        sub_label: null,
        amount: null,
        is_completed: true,
        event_date: booking.created_at ? formatDate(booking.created_at) : null
    });

    const crewAccept = assignedCrew ? Number(assignedCrew.crew_accept) : null;
    timeline.push({
        event_type: 'shoot_accepted',
        label: 'Shoot Accepted by you for this new Shoot',
        sub_label: null,
        amount: null,
        is_completed: crewAccept === 1,
        event_date: assignedCrew?.responded_at ? formatDate(assignedCrew.responded_at) : null
    });

    const advances = earning.advances || [];
    const processedAdvance = advances.find(a => a.status === 'processed');
    timeline.push({
        event_type: 'advance_payment_processed',
        label: 'Advance Payment',
        sub_label: processedAdvance ? `$${toMoney(processedAdvance.amount)} Has Been Processed` : null,
        amount: processedAdvance ? toMoney(processedAdvance.amount) : null,
        is_completed: Boolean(processedAdvance),
        event_date: processedAdvance?.processed_at ? formatDate(processedAdvance.processed_at) : null
    });

    timeline.push({
        event_type: 'shoot_completed',
        label: 'Shoot Completed',
        sub_label: 'Awaiting Completion',
        amount: null,
        is_completed: Boolean(booking.is_completed),
        event_date: null
    });

    timeline.push({
        event_type: 'awaiting_finance_approval',
        label: 'Awaiting Finance Approval',
        sub_label: null,
        amount: null,
        is_completed: ['earned', 'payout_pending', 'paid'].includes(earning.status),
        event_date: null
    });

    const remainingBalance = toMoney(
        Number(earning.gross_amount || 0) -
        advances.filter(a => a.status === 'processed').reduce((sum, a) => sum + Number(a.amount || 0), 0)
    );
    timeline.push({
        event_type: 'final_payment_processed',
        label: 'Final Payment Processed',
        sub_label: 'Remaining Balance Paid',
        amount: remainingBalance > 0 ? remainingBalance : null,
        is_completed: earning.status === 'paid',
        event_date: null
    });

    return timeline;
}


// DASHBOARD

async function getCreatorEarningsDashboard(creatorId, filters = {}) {
    console.log('creatorId received:', creatorId, typeof creatorId);

    const earnings = await db.creator_earnings.findAll({
        where: { creator_id: Number(creatorId) },
        include: [
            {
                model: db.stream_project_booking,
                as: 'booking',
                required: false,
                attributes: [
                    'stream_project_booking_id', 'project_name', 'shoot_type',
                    'event_type', 'event_date', 'event_location', 'start_time',
                    'end_time', 'is_completed', 'created_at'
                ],
                include: [
                    {
                        model: db.assigned_crew,
                        as: 'assigned_crews',
                        required: false,
                        where: { crew_member_id: Number(creatorId), is_active: 1 },
                        attributes: ['crew_accept', 'responded_at']
                    }
                ]
            },
            {
                model: db.creator_earning_advances,
                as: 'advances',
                required: false
            },
            {
                model: db.creator_earning_compensation_items,
                as: 'compensation_items',
                required: false
            }
        ],
        order: [['created_at', 'DESC']]
    });

    console.log('EARNINGS FOUND:', earnings.length);

    const plainEarnings = earnings.map(toPlain);

    const upcomingEarnings = toMoney(
        plainEarnings
            .filter(e => !['paid'].includes(e.status))
            .reduce((sum, e) => sum + Number(e.net_earning_amount || 0), 0)
    );

    const pendingEarnings = toMoney(
        plainEarnings
            .filter(e => e.status === 'payout_pending')
            .reduce((sum, e) => sum + Number(e.net_earning_amount || 0), 0)
    );

    const paidEarnings = toMoney(
        plainEarnings
            .filter(e => e.status === 'paid')
            .reduce((sum, e) => sum + Number(e.net_earning_amount || 0), 0)
    );

    const lifetimeEarnings = toMoney(
        plainEarnings.reduce((sum, e) => sum + Number(e.gross_amount || 0), 0)
    );

    const rows = plainEarnings.map(earning => {
        const booking = earning.booking || {};
        const assignedCrew = (booking.assigned_crews || [])[0] || null;
        const advances = earning.advances || [];
        const compensationItems = earning.compensation_items || [];
        const status = getEarningDisplayStatus(earning, assignedCrew);
        const paymentBreakdown = buildPaymentBreakdown(earning, advances);

        return {
            creator_earning_id: earning.creator_earning_id,
            booking_id: earning.booking_id,
            shoot_name: booking.project_name || `Shoot #${earning.booking_id}`,
            shoot_type: booking.shoot_type || booking.event_type || null,
            event_date: booking.event_date ? formatDate(booking.event_date) : null,
            event_location: booking.event_location || null,
            start_time: booking.start_time || null,
            end_time: booking.end_time || null,
            status,
            status_label: buildEarningStatusLabel(status),
            crew_accept: assignedCrew ? Number(assignedCrew.crew_accept) : null,
            total_compensation: toMoney(earning.gross_amount || earning.net_earning_amount || 0),
            advance_paid: paymentBreakdown.advance_paid,
            remaining_balance: paymentBreakdown.remaining_balance,
            payment_percent: paymentBreakdown.payment_percent,
            compensation_items: buildCompensationBreakdown(compensationItems, earning.gross_amount)
        };
    });

    return {
        overview: {
            upcoming_earnings: upcomingEarnings,
            pending_payments: pendingEarnings,
            paid_earnings: paidEarnings,
            total_lifetime_earnings: lifetimeEarnings
        },
        rows
    };
}


// EARNING DETAILS

async function getCreatorEarningDetails(creatorEarningId, creatorId) {
    const earning = await db.creator_earnings.findOne({
        where: {
            creator_earning_id: creatorEarningId,
            creator_id: creatorId
        },
        include: [
            {
                model: db.stream_project_booking,
                as: 'booking',
                required: false,
                include: [
                    {
                        model: db.assigned_crew,
                        as: 'assigned_crews',
                        required: false,
                        where: { crew_member_id: creatorId, is_active: 1 },
                        attributes: ['crew_accept', 'responded_at']
                    }
                ]
            },
            {
                model: db.creator_earning_advances,
                as: 'advances',
                required: false
            },
            {
                model: db.creator_earning_compensation_items,
                as: 'compensation_items',
                required: false,
                where: { is_active: 1 }
            },
            {
                model: db.creator_earning_timeline_events,
                as: 'timeline_events',
                required: false,
                order: [['sort_order', 'ASC']]
            },
            {
                model: db.crew_members,
                as: 'creator',
                required: false,
                attributes: ['crew_member_id', 'first_name', 'last_name', 'email']
            }
        ]
    });

    if (!earning) {
        const error = new Error('Earning not found');
        error.statusCode = 404;
        throw error;
    }

    const plain = toPlain(earning);
    const booking = plain.booking || {};
    const assignedCrew = (booking.assigned_crews || [])[0] || null;
    const advances = plain.advances || [];
    const compensationItems = plain.compensation_items || [];
    const timelineEvents = plain.timeline_events || [];
    const status = getEarningDisplayStatus(plain, assignedCrew);
    const paymentBreakdown = buildPaymentBreakdown(plain, advances);

    return {
        creator_earning_id: plain.creator_earning_id,
        booking_id: plain.booking_id,
        shoot_info: {
            shoot_name: booking.project_name || `Shoot #${plain.booking_id}`,
            shoot_type: booking.shoot_type || booking.event_type || null,
            creator_name: buildCreatorName(plain.creator),
            status_label: buildEarningStatusLabel(status),
            status,
            event_date: booking.event_date ? formatDate(booking.event_date) : null,
            event_location: booking.event_location || null
        },
        compensation_breakdown: buildCompensationBreakdown(compensationItems, plain.gross_amount),
        total_compensation: toMoney(plain.gross_amount || plain.net_earning_amount || 0),
        payment_breakdown: paymentBreakdown,
        timeline: buildTimeline(timelineEvents, plain, assignedCrew)
    };
}


// ACCEPT / DECLINE

async function respondToEarning(bookingId, creatorId, action) {
    const assignedCrew = await db.assigned_crew.findOne({
        where: {
            project_id: bookingId,
            crew_member_id: creatorId,
            is_active: 1
        }
    });

    if (!assignedCrew) {
        const error = new Error('Assignment not found');
        error.statusCode = 404;
        throw error;
    }

    if (Number(assignedCrew.crew_accept) !== 0) {
        const error = new Error('Already responded to this shoot');
        error.statusCode = 409;
        throw error;
    }

    const crewAcceptValue = action === 'accept' ? 1 : 2;
    await assignedCrew.update({
        crew_accept: crewAcceptValue,
        responded_at: new Date()
    });

    const earning = await db.creator_earnings.findOne({
        where: { booking_id: bookingId, creator_id: creatorId }
    });

    if (earning && action === 'accept') {
        const existingEvent = await db.creator_earning_timeline_events.findOne({
            where: {
                creator_earning_id: earning.creator_earning_id,
                event_type: 'shoot_accepted'
            }
        });

        if (!existingEvent) {
            await db.creator_earning_timeline_events.create({
                creator_earning_id: earning.creator_earning_id,
                booking_id: bookingId,
                creator_id: creatorId,
                event_type: 'shoot_accepted',
                label: 'Shoot Accepted by you for this new Shoot',
                is_completed: 1,
                event_date: new Date(),
                sort_order: 2
            });
        } else {
            await existingEvent.update({ is_completed: 1, event_date: new Date() });
        }
    }

    return { success: true, action, booking_id: bookingId };
}


// ADMIN — Add Advance Payment

async function addAdvancePayment(payload = {}, options = {}) {
    const { creator_earning_id, booking_id, creator_id, amount, notes } = payload;

    if (!creator_earning_id || !amount) {
        const error = new Error('creator_earning_id and amount are required');
        error.statusCode = 400;
        throw error;
    }

    const earning = await db.creator_earnings.findByPk(creator_earning_id);
    if (!earning) {
        const error = new Error('Earning not found');
        error.statusCode = 404;
        throw error;
    }

    const advance = await db.creator_earning_advances.create({
        creator_earning_id,
        booking_id: booking_id || earning.booking_id,
        creator_id: creator_id || earning.creator_id,
        amount: Number(amount),
        status: 'processed',
        processed_at: new Date(),
        notes: notes || null,
        created_by_user_id: options.userId || null
    });

    const existingEvent = await db.creator_earning_timeline_events.findOne({
        where: {
            creator_earning_id,
            event_type: 'advance_payment_processed'
        }
    });

    if (existingEvent) {
        await existingEvent.update({
            is_completed: 1,
            amount: Number(amount),
            event_date: new Date(),
            sub_label: `$${Number(amount).toFixed(2)} Has Been Processed`
        });
    } else {
        await db.creator_earning_timeline_events.create({
            creator_earning_id,
            booking_id: booking_id || earning.booking_id,
            creator_id: creator_id || earning.creator_id,
            event_type: 'advance_payment_processed',
            label: 'Advance Payment',
            sub_label: `$${Number(amount).toFixed(2)} Has Been Processed`,
            amount: Number(amount),
            is_completed: 1,
            event_date: new Date(),
            sort_order: 3
        });
    }

    return advance;
}


// GET ALL EARNINGS WITH FILTERS (Dashboard list)

async function getCreatorEarningsList(creatorId, filters = {}) {
    const page = Math.max(parseInt(filters.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const where = { creator_id: Number(creatorId) };

    const earnings = await db.creator_earnings.findAndCountAll({
        where,
        limit,
        offset,
        order: [['created_at', 'DESC']],
        include: [
            {
                model: db.stream_project_booking,
                as: 'booking',
                required: false,
                attributes: [
                    'stream_project_booking_id', 'project_name', 'shoot_type',
                    'event_type', 'event_date', 'event_location',
                    'start_time', 'end_time', 'is_completed', 'created_at'
                ],
                include: [
                    {
                        model: db.assigned_crew,
                        as: 'assigned_crews',
                        required: false,
                        where: { crew_member_id: Number(creatorId), is_active: 1 },
                        attributes: ['crew_accept', 'responded_at']
                    }
                ]
            },
            {
                model: db.creator_earning_advances,
                as: 'advances',
                required: false
            },
            {
                model: db.creator_earning_compensation_items,
                as: 'compensation_items',
                required: false
            }
        ]
    });

    const rows = earnings.rows.map(earning => {
        const plain = toPlain(earning);
        const booking = plain.booking || {};
        const assignedCrew = (booking.assigned_crews || [])[0] || null;
        const advances = plain.advances || [];
        const compensationItems = plain.compensation_items || [];
        const status = getEarningDisplayStatus(plain, assignedCrew);
        const paymentBreakdown = buildPaymentBreakdown(plain, advances);

        return {
            creator_earning_id: plain.creator_earning_id,
            booking_id: plain.booking_id,
            shoot_name: booking.project_name || `Shoot #${plain.booking_id}`,
            shoot_type: booking.shoot_type || booking.event_type || null,
            event_date: booking.event_date ? formatDate(booking.event_date) : null,
            event_location: booking.event_location || null,
            start_time: booking.start_time || null,
            end_time: booking.end_time || null,
            status,
            status_label: buildEarningStatusLabel(status),
            crew_accept: assignedCrew ? Number(assignedCrew.crew_accept) : null,
            can_accept: assignedCrew ? Number(assignedCrew.crew_accept) === 0 : false,
            can_decline: assignedCrew ? Number(assignedCrew.crew_accept) === 0 : false,
            total_compensation: toMoney(plain.gross_amount || plain.net_earning_amount || 0),
            advance_paid: paymentBreakdown.advance_paid,
            remaining_balance: paymentBreakdown.remaining_balance,
            payment_percent: paymentBreakdown.payment_percent,
            compensation_items: buildCompensationBreakdown(compensationItems, plain.gross_amount)
        };
    });

    return {
        rows,
        pagination: {
            page,
            limit,
            total: earnings.count,
            total_pages: Math.ceil(earnings.count / limit)
        }
    };
}


// ACCEPT SHOOT

async function acceptShoot(bookingId, creatorId) {
    console.log('acceptShoot called:', { bookingId, creatorId });
    const assignedCrew = await db.assigned_crew.findOne({
        where: { project_id: bookingId, crew_member_id: creatorId, is_active: 1 }
    });
    console.log('assignedCrew found:', assignedCrew);

    if (!assignedCrew) {
        const error = new Error('Assignment not found');
        error.statusCode = 404;
        throw error;
    }

    if (Number(assignedCrew.crew_accept) !== 0) {
        const error = new Error('Already responded to this shoot');
        error.statusCode = 409;
        throw error;
    }

    await assignedCrew.update({ crew_accept: 1, responded_at: new Date() });

    const earning = await db.creator_earnings.findOne({
        where: { booking_id: bookingId, creator_id: creatorId }
    });

    if (earning) {
        const existing = await db.creator_earning_timeline_events.findOne({
            where: { creator_earning_id: earning.creator_earning_id, event_type: 'shoot_accepted' }
        });

        if (existing) {
            await existing.update({ is_completed: 1, event_date: new Date() });
        } else {
            await db.creator_earning_timeline_events.create({
                creator_earning_id: earning.creator_earning_id,
                booking_id: bookingId,
                creator_id: creatorId,
                event_type: 'shoot_accepted',
                label: 'Shoot Accepted by you for this new Shoot',
                sub_label: null,
                is_completed: 1,
                event_date: new Date(),
                sort_order: 2
            });
        }
    }

    return {
        success: true,
        booking_id: bookingId,
        creator_id: creatorId,
        status: 'accepted'
    };
}


// DECLINE SHOOT

async function declineShoot(bookingId, creatorId) {
    const assignedCrew = await db.assigned_crew.findOne({
        where: { project_id: bookingId, crew_member_id: creatorId, is_active: 1 }
    });

    if (!assignedCrew) {
        const error = new Error('Assignment not found');
        error.statusCode = 404;
        throw error;
    }

    if (Number(assignedCrew.crew_accept) !== 0) {
        const error = new Error('Already responded to this shoot');
        error.statusCode = 409;
        throw error;
    }

    await assignedCrew.update({ crew_accept: 2, responded_at: new Date() });

    return {
        success: true,
        booking_id: bookingId,
        creator_id: creatorId,
        status: 'declined'
    };
}


// GET PAYOUT TIMELINE

async function getPayoutTimeline(creatorEarningId, creatorId) {
    const earning = await db.creator_earnings.findOne({
        where: { creator_earning_id: creatorEarningId, creator_id: creatorId },
        include: [
            {
                model: db.stream_project_booking,
                as: 'booking',
                required: false,
                include: [
                    {
                        model: db.assigned_crew,
                        as: 'assigned_crews',
                        required: false,
                        where: { crew_member_id: creatorId, is_active: 1 },
                        attributes: ['crew_accept', 'responded_at']
                    }
                ]
            },
            { model: db.creator_earning_advances, as: 'advances', required: false },
            {
                model: db.creator_earning_timeline_events,
                as: 'timeline_events',
                required: false
            }
        ]
    });

    if (!earning) {
        const error = new Error('Earning not found');
        error.statusCode = 404;
        throw error;
    }

    const plain = toPlain(earning);
    const booking = plain.booking || {};
    const assignedCrew = (booking.assigned_crews || [])[0] || null;

    return {
        creator_earning_id: plain.creator_earning_id,
        booking_id: plain.booking_id,
        shoot_name: booking.project_name || `Shoot #${plain.booking_id}`,
        timeline: buildTimeline(plain.timeline_events || [], plain, assignedCrew)
    };
}

 
// ADMIN — Upsert Compensation Items

async function upsertCompensationItems(creatorEarningId, items = [], options = {}) {
    if (!creatorEarningId || !items.length) {
        const error = new Error('creator_earning_id and items are required');
        error.statusCode = 400;
        throw error;
    }

    const earning = await db.creator_earnings.findByPk(creatorEarningId);
    if (!earning) {
        const error = new Error('Earning not found');
        error.statusCode = 404;
        throw error;
    }

    await db.creator_earning_compensation_items.update(
        { is_active: 0 },
        { where: { creator_earning_id: creatorEarningId } }
    );

    const created = await db.creator_earning_compensation_items.bulkCreate(
        items.map(item => ({
            creator_earning_id: creatorEarningId,
            booking_id: earning.booking_id,
            creator_id: earning.creator_id,
            item_label: item.label || item.item_label,
            amount: Number(item.amount || 0),
            is_active: 1
        }))
    );

    return created;
}

module.exports = {
    getCreatorEarningsDashboard,
    getCreatorEarningsList,
    getCreatorEarningDetails,
    acceptShoot,
    declineShoot,
    respondToEarning,
    getPayoutTimeline,
    addAdvancePayment,
    upsertCompensationItems
};