const db = require('../models');

/**
 * Submit investor interest
 * POST /api/investors
 */
exports.submitInvestorInterest = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phoneNumber, 
      country, 
      investmentRounds, 
      investmentTiming, 
      investmentAmount 
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
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

    // Check if email already submitted
    const existingEntry = await db.investors.findOne({
      where: { email }
    });

    if (existingEntry) {
      return res.status(409).json({
        success: false,
        message: 'This email has already submitted an investor interest form'
      });
    }

    // Create investor entry
    const investorEntry = await db.investors.create({
      first_name: firstName,
      last_name: lastName,
      email,
      phone_number: phoneNumber || null,
      country: country || null,
      investment_rounds: investmentRounds || null,
      investment_timing: investmentTiming || null,
      investment_amount: investmentAmount || null,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you for your interest! Our team will contact you soon.',
      data: {
        id: investorEntry.id,
        firstName: investorEntry.first_name,
        lastName: investorEntry.last_name,
        email: investorEntry.email,
        status: investorEntry.status
      }
    });

  } catch (error) {
    console.error('Submit Investor Interest Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit investor interest',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get all investor submissions (admin only)
 * GET /api/investors
 */
exports.getInvestors = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await db.investors.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: {
        entries: rows.map(row => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          phoneNumber: row.phone_number,
          country: row.country,
          investmentRounds: row.investment_rounds,
          investmentTiming: row.investment_timing,
          investmentAmount: row.investment_amount,
          status: row.status,
          notes: row.notes,
          createdAt: row.created_at
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Investors Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve investor submissions',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update investor status (admin only)
 * PATCH /api/investors/:id/status
 */
exports.updateInvestorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'contacted', 'converted', 'declined'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, contacted, converted, declined'
      });
    }

    const entry = await db.investors.findByPk(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Investor submission not found'
      });
    }

    entry.status = status;
    if (notes !== undefined) {
      entry.notes = notes;
    }
    await entry.save();

    return res.status(200).json({
      success: true,
      message: 'Investor status updated successfully',
      data: {
        id: entry.id,
        email: entry.email,
        status: entry.status,
        notes: entry.notes
      }
    });

  } catch (error) {
    console.error('Update Investor Status Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update investor status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get single investor by ID (admin only)
 * GET /api/investors/:id
 */
exports.getInvestorById = async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await db.investors.findByPk(id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Investor submission not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: entry.id,
        firstName: entry.first_name,
        lastName: entry.last_name,
        email: entry.email,
        phoneNumber: entry.phone_number,
        country: entry.country,
        investmentRounds: entry.investment_rounds,
        investmentTiming: entry.investment_timing,
        investmentAmount: entry.investment_amount,
        status: entry.status,
        notes: entry.notes,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at
      }
    });

  } catch (error) {
    console.error('Get Investor By ID Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve investor submission',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};


