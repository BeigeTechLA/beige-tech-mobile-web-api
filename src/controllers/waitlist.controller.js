const db = require('../models');

/**
 * Join waitlist
 * POST /api/waitlist/join
 */
exports.joinWaitlist = async (req, res) => {
  try {
    const { name, email, phone, company, city } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if email already exists
    const existingEntry = await db.waitlist.findOne({
      where: { email }
    });

    if (existingEntry) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered on waitlist'
      });
    }

    // Create waitlist entry
    const waitlistEntry = await db.waitlist.create({
      name,
      email,
      phone: phone || null,
      company: company || null,
      city: city || null,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'Successfully joined waitlist',
      data: {
        id: waitlistEntry.id,
        name: waitlistEntry.name,
        email: waitlistEntry.email,
        status: waitlistEntry.status
      }
    });

  } catch (error) {
    console.error('Join Waitlist Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to join waitlist',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get all waitlist entries (admin only)
 * GET /api/waitlist
 */
exports.getWaitlist = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.waitlist.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: {
        entries: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Waitlist Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve waitlist',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update waitlist entry status (admin only)
 * PATCH /api/waitlist/:id/status
 */
exports.updateWaitlistStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'contacted', 'converted', 'inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, contacted, converted, inactive'
      });
    }

    const entry = await db.waitlist.findByPk(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Waitlist entry not found'
      });
    }

    entry.status = status;
    await entry.save();

    return res.status(200).json({
      success: true,
      message: 'Status updated successfully',
      data: {
        id: entry.id,
        email: entry.email,
        status: entry.status
      }
    });

  } catch (error) {
    console.error('Update Waitlist Status Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
