const { notify } = require('../models');
const { Op } = require('sequelize');

const getRequestUserId = (req) => req.user?.userId || req.userId || null;

const parseNotification = (notification) => {
    const row = notification.toJSON ? notification.toJSON() : notification;
    if (typeof row.data === 'string') {
        try {
            row.data = JSON.parse(row.data);
        } catch (_) {}
    }
    return row;
};

exports.getNotifications = async (req, res) => {
    try {
        const user_id = getRequestUserId(req);
        const { page = 1, limit = 20, is_read, type } = req.query;

        if (!user_id) {
            return res.status(401).json({ error: true, message: 'Authentication required' });
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const where = { user_id };

        if (is_read !== undefined) where.is_read = is_read;
        if (type) where.type = type;

        const { count, rows } = await notify.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        return res.status(200).json({
            error: false,
            message: 'Notifications fetched successfully',
            data: rows.map(parseNotification),
            pagination: {
                total_records: count,
                current_page: parseInt(page),
                per_page: parseInt(limit),
                total_pages: Math.ceil(count / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get Notifications Error:', error);
        return res.status(500).json({ error: true, message: 'Internal server error' });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const user_id = getRequestUserId(req);

        if (!user_id) {
            return res.status(401).json({ error: true, message: 'Authentication required' });
        }

        const count = await notify.count({
            where: { user_id, is_read: 0 }
        });

        return res.status(200).json({
            error: false,
            unread_count: count
        });
    } catch (error) {
        console.error('Unread Count Error:', error);
        return res.status(500).json({ error: true, message: 'Internal server error' });
    }
};

exports.getPreferences = async (req, res) => {
    try {
        const user_id = getRequestUserId(req);

        if (!user_id) {
            return res.status(401).json({ error: true, message: 'Authentication required' });
        }

        return res.status(200).json({
            error: false,
            message: 'Notification preferences fetched successfully',
            data: {
                user_id,
                in_app_enabled: true,
                email_enabled: true,
                digest_enabled: false
            }
        });
    } catch (error) {
        console.error('Get Notification Preferences Error:', error);
        return res.status(500).json({ error: true, message: 'Internal server error' });
    }
};


exports.markAsRead = async (req, res) => {
    try {
        const user_id = getRequestUserId(req);
        const { notification_id } = req.params;

        if (!user_id) {
            return res.status(401).json({ error: true, message: 'Authentication required' });
        }

        await notify.update(
            { is_read: 1 },
            { where: { notification_id, user_id } }
        );

        return res.status(200).json({
            error: false,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark As Read Error:', error);
        return res.status(500).json({ error: true, message: 'Internal server error' });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const user_id = getRequestUserId(req);

        if (!user_id) {
            return res.status(401).json({ error: true, message: 'Authentication required' });
        }

        await notify.update(
            { is_read: 1 },
            { where: { user_id, is_read: 0 } }
        );

        return res.status(200).json({
            error: false,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Mark All As Read Error:', error);
        return res.status(500).json({ error: true, message: 'Internal server error' });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const user_id = getRequestUserId(req);
        const { notification_id } = req.params;

        if (!user_id) {
            return res.status(401).json({ error: true, message: 'Authentication required' });
        }

        await notify.destroy({
            where: { notification_id, user_id }
        });

        return res.status(200).json({
            error: false,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Delete Notification Error:', error);
        return res.status(500).json({ error: true, message: 'Internal server error' });
    }
};
