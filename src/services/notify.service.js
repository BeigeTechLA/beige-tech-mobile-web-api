const { notify, users } = require('../models');

const compactIds = (values = []) => [...new Set(values.map(Number).filter(Boolean))];

const getAdminUserIds = async () => {
    const adminUsers = await users.findAll({
        where: { user_type: 1, is_active: 1 },
        attributes: ['id']
    });

    return compactIds(adminUsers.map(user => user.id));
};

const createNotification = async ({ user_id, type, title, message, data = null }) => {
    try {
        if (!user_id || !type || !title || !message) {
            return null;
        }

        const notification = await notify.create({
            user_id,
            type,
            title,
            message,
            data: data || null,
            is_read: 0
        });
        return notification;
    } catch (error) {
        console.error('Create Notification Error:', error);
        return null;
    }
};

const notifyBookAShoot = async ({ booking_id, client_name, shoot_type, event_date, admin_user_ids = [] }) => {
    const title = 'New Booking Received';
    const message = `${client_name || 'Client'} has booked a ${shoot_type || 'shoot'} on ${event_date || 'TBD'}`;
    const recipientIds = compactIds(admin_user_ids.length ? admin_user_ids : await getAdminUserIds());

    return Promise.allSettled(
        recipientIds.map(user_id =>
            createNotification({
                user_id,
                type: 'book_a_shoot',
                title,
                message,
                data: { booking_id, client_name, shoot_type, event_date }
            })
        )
    );
};

const notifyQuoteApproval = async ({ quote_id, booking_id, client_name, total_amount, sales_rep_user_id }) => {
    return createNotification({
        user_id: sales_rep_user_id,
        type: 'quote_approval',
        title: 'Quote Approved',
        message: `${client_name || 'Client'} has approved the quote of $${total_amount || 0}`,
        data: { quote_id, booking_id, client_name, total_amount }
    });
};

const notifyQuoteRejected = async ({ quote_id, booking_id, client_name, sales_rep_user_id }) => {
    return createNotification({
        user_id: sales_rep_user_id,
        type: 'quote_rejected',
        title: 'Quote Rejected',
        message: `${client_name || 'Client'} has rejected the quote`,
        data: { quote_id, booking_id, client_name, action: 'rejected' }
    });
};

const notifyCPBookingRequest = async ({ crew_user_id, crew_member_id, booking_id, project_name, event_date }) => {
    return createNotification({
        user_id: crew_user_id,
        type: 'cp_booking_request',
        title: 'New Shoot Request',
        message: `You have a new shoot request for ${project_name || 'a project'}`,
        data: { crew_member_id, booking_id, project_name, event_date, action: 'request' }
    });
};

const notifyCPRequestApproved = async ({ crew_user_id, crew_member_id, crew_name }) => {
    return createNotification({
        user_id: crew_user_id,
        type: 'cp_request_approved',
        title: 'Creative Partner Approved',
        message: `${crew_name || 'Your creative partner profile'} has been approved`,
        data: { crew_member_id, crew_name, action: 'approved' }
    });
};

const notifyCPRequestRejected = async ({ crew_user_id, crew_member_id, crew_name }) => {
    return createNotification({
        user_id: crew_user_id,
        type: 'cp_request_rejected',
        title: 'Creative Partner Rejected',
        message: `${crew_name || 'Your creative partner profile'} has been rejected`,
        data: { crew_member_id, crew_name, action: 'rejected' }
    });
};

const notifyCPRequestReviewedForAdmins = async ({ crew_member_id, crew_name, status, admin_user_ids = [] }) => {
    const isApproved = Number(status) === 1;
    const type = isApproved ? 'cp_request_approved' : 'cp_request_rejected';
    const title = isApproved ? 'CP Request Approved' : 'CP Request Rejected';
    const action = isApproved ? 'approved' : 'rejected';
    const recipientIds = compactIds(admin_user_ids.length ? admin_user_ids : await getAdminUserIds());

    return Promise.allSettled(
        recipientIds.map(user_id =>
            createNotification({
                user_id,
                type,
                title,
                message: `${crew_name || 'Creative partner'} has been ${action}`,
                data: { crew_member_id, crew_name, action }
            })
        )
    );
};

const notifyCPAccepted = async ({ crew_member_id, crew_name, booking_id, project_name, admin_user_ids = [] }) => {
    const title = 'CP Accepted Booking';
    const message = `${crew_name || 'Creative partner'} has accepted the assignment for ${project_name || 'Project'}`;
    const recipientIds = compactIds(admin_user_ids.length ? admin_user_ids : await getAdminUserIds());

    return Promise.allSettled(
        recipientIds.map(user_id =>
            createNotification({
                user_id,
                type: 'cp_accepted',
                title,
                message,
                data: { crew_member_id, booking_id, project_name, crew_name }
            })
        )
    );
};

const notifyCPRejected = async ({ crew_member_id, crew_name, booking_id, project_name, admin_user_ids = [] }) => {
    const title = 'CP Rejected Booking';
    const message = `${crew_name || 'Creative partner'} has rejected the assignment for ${project_name || 'Project'}`;
    const recipientIds = compactIds(admin_user_ids.length ? admin_user_ids : await getAdminUserIds());

    return Promise.allSettled(
        recipientIds.map(user_id =>
            createNotification({
                user_id,
                type: 'cp_rejected',
                title,
                message,
                data: { crew_member_id, booking_id, project_name, crew_name }
            })
        )
    );
};
const notifyQuoteChangeRequest = async ({
    quote_id,
    quote_number,
    booking_id,
    client_name,
    change_type,
    change_amount,
    before_amount,
    after_amount,
    activity_id,
    admin_user_ids = []
}) => {
    const direction = change_type === 'increase' ? '⬆ Increase' : '⬇ Decrease';
    const title = 'Quote Change Request';
    const message = `${client_name || 'Client'}'s quote ${quote_number || `#${quote_id}`} has a change request — ${direction} of $${change_amount || 0} (Before: $${before_amount || 0} → After: $${after_amount || 0})`;

    const recipientIds = compactIds(
        admin_user_ids.length ? admin_user_ids : await getAdminUserIds()
    );

    return Promise.allSettled(
        recipientIds.map(user_id =>
            createNotification({
                user_id,
                type: 'quote_change_request',
                title,
                message,
                data: {
                    quote_id,
                    quote_number,
                    booking_id,
                    client_name,
                    change_type,
                    change_amount,
                    before_amount,
                    after_amount,
                    activity_id,
                    action: 'quote_change_request'
                }
            })
        )
    );
};

const notifyQuoteChangeApproved = async ({
    quote_id,
    quote_number,
    booking_id,
    client_name,
    after_amount,
    sales_rep_user_id
}) => {
    return createNotification({
        user_id: sales_rep_user_id,
        type: 'quote_change_approved',
        title: 'Quote Change Approved',
        message: `Quote ${quote_number || `#${quote_id}`} for ${client_name || 'Client'} has been approved. New total: $${after_amount || 0}`,
        data: {
            quote_id,
            quote_number,
            booking_id,
            client_name,
            after_amount,
            action: 'approved'
        }
    });
};




const notifyQuoteChangeRejected = async ({
    quote_id,
    quote_number,
    booking_id,
    client_name,
    sales_rep_user_id
}) => {
    return createNotification({
        user_id: sales_rep_user_id,
        type: 'quote_change_rejected',
        title: 'Quote Change Rejected',
        message: `Quote ${quote_number || `#${quote_id}`} for ${client_name || 'Client'} change request has been rejected`,
        data: {
            quote_id,
            quote_number,
            booking_id,
            client_name,
            action: 'rejected'
        }
    });
};

module.exports = {
    createNotification,
    notifyBookAShoot,
    notifyQuoteApproval,
    notifyQuoteRejected,
    notifyCPBookingRequest,
    notifyCPRequestApproved,
    notifyCPRequestRejected,
    notifyCPRequestReviewedForAdmins,
    notifyCPAccepted,
    notifyCPRejected,
    notifyQuoteChangeRequest,     
    notifyQuoteChangeApproved,    
    notifyQuoteChangeRejected
};
