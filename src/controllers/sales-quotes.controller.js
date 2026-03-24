const constants = require('../utils/constants');
const quoteService = require('../services/sales-quote.service');
const db = require('../models');
const { Op } = require('sequelize');

function getUserContext(req) {
  return {
    userId: req.userId,
    role: req.userRole
  };
}

function sendError(res, error, fallbackMessage, statusCode = constants.BAD_REQUEST.code) {
  return res.status(statusCode).json({
    success: false,
    message: fallbackMessage,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}

exports.getCatalog = async (req, res) => {
  try {
    const data = await quoteService.getCatalog(req.query.pricing_mode || null);
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching quote catalog:', error);
    return sendError(res, error, 'Failed to fetch quote catalog', constants.INTERNAL_SERVER_ERROR.code);
  }
};

exports.createCatalogItem = async (req, res) => {
  try {
    const item = await quoteService.createCatalogItem(req.body, req.userId);
    return res.status(constants.CREATED.code).json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('Error creating quote catalog item:', error);
    return sendError(res, error, error.message || 'Failed to create quote catalog item');
  }
};

exports.updateCatalogItem = async (req, res) => {
  try {
    const item = await quoteService.updateCatalogItem(Number(req.params.catalogItemId), req.body, req.userId);
    return res.json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('Error updating quote catalog item:', error);
    const statusCode = error.message === 'Catalog item not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to update quote catalog item', statusCode);
  }
};

exports.createQuote = async (req, res) => {
  try {
    if (!req.body.client_name) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'client_name is required'
      });
    }

    const quote = await quoteService.createQuote(req.body, getUserContext(req));
    return res.status(constants.CREATED.code).json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error creating sales quote:', error);
    return sendError(res, error, error.message || 'Failed to create quote');
  }
};

exports.updateQuote = async (req, res) => {
  try {
    const quote = await quoteService.updateQuote(Number(req.params.quoteId), req.body, getUserContext(req));
    return res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error updating sales quote:', error);
    const statusCode = error.message === 'Quote not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to update quote', statusCode);
  }
};

exports.listQuotes = async (req, res) => {
  try {
    const data = await quoteService.listQuotes(req.query, getUserContext(req));
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error listing sales quotes:', error);
    return sendError(res, error, 'Failed to fetch quotes', constants.INTERNAL_SERVER_ERROR.code);
  }
};

exports.getQuoteDashboard = async (req, res) => {
  try {
    const data = await quoteService.getQuoteDashboard(req.query, getUserContext(req));
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching sales quote dashboard:', error);
    return sendError(res, error, 'Failed to fetch quote dashboard', constants.INTERNAL_SERVER_ERROR.code);
  }
};

exports.getQuoteById = async (req, res) => {
  try {
    const quote = await quoteService.getQuoteById(Number(req.params.quoteId), getUserContext(req));
    if (!quote) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Quote not found'
      });
    }

    return res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error fetching sales quote:', error);
    return sendError(res, error, 'Failed to fetch quote', constants.INTERNAL_SERVER_ERROR.code);
  }
};

exports.updateQuoteStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const quote = await quoteService.updateQuoteStatus(Number(req.params.quoteId), status, getUserContext(req));
    return res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error updating sales quote status:', error);
    const statusCode = error.message === 'Quote not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to update quote status', statusCode);
  }
};

exports.getShootTypes = async (req, res) => {
  try {
    let content_type = req.params.content_type;
    const where = { is_active: 1 };

    if (content_type) {
      where.content_type = content_type;
    }

    const data = await db.shoot_types.findAll({
      where,
      order: [['display_order', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: constants.OK.message,
      data
    });
  } catch (err) {
    console.error('getShootTypes Error:', err);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      code: constants.INTERNAL_SERVER_ERROR.code,
      message: constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.getClientDropdown = async (req, res) => {
  try {
    const { search } = req.query;
    const whereConditions = { is_active: 1 };

    if (search?.trim()) {
      whereConditions.name = {
        [Op.like]: `%${search.trim()}%`
      };
    }

    const clientList = await db.clients.findAll({
      where: whereConditions,
      attributes: ['client_id', 'name', 'user_id'],
      order: [['name', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      message: 'Client dropdown fetched successfully',
      data: clientList
    });
  } catch (error) {
    console.error('Get Client Dropdown Error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      message: 'Internal server error'
    });
  }
};
