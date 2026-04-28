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
    data: error?.details || null,
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}

function renderQuoteAcceptPage({
  title,
  badge,
  description,
  quoteNumber = '',
  tone = 'success',
  statusCode = constants.OK.code
}) {
  const palette = tone === 'error'
    ? {
      accent: '#8F2D2D',
      accentSoft: '#F8E3DF',
      border: 'rgba(173, 97, 80, 0.28)',
      badgeBg: '#FFF1EE',
      badgeText: '#8F2D2D'
    }
    : tone === 'warning'
      ? {
        accent: '#73510D',
        accentSoft: '#FBF0D8',
        border: 'rgba(214, 182, 112, 0.35)',
        badgeBg: '#FFF7E7',
        badgeText: '#73510D'
      }
      : {
        accent: '#1E4D3A',
        accentSoft: '#EAF5EF',
        border: 'rgba(93, 149, 120, 0.30)',
        badgeBg: '#F3FBF6',
        badgeText: '#1E4D3A'
      };

  return {
    statusCode,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta name="x-apple-disable-message-reformatting" />
          <title>${title}</title>
        </head>
        <body style="margin:0;padding:0;background:#f6f5f2;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:linear-gradient(145deg,#fffdf8 18%,#f5e4c3 190%);border:1px solid rgba(232,209,171,0.35);border-radius:28px;overflow:hidden;box-shadow:0 14px 40px rgba(0,0,0,0.05);">
                  <tr>
                    <td align="center" style="padding:42px 40px 26px;">
                      <div style="display:inline-block;border:1px solid rgba(232,209,171,0.4);padding:12px 32px;border-radius:100px;background:#ffffff;box-shadow:0 8px 24px rgba(149,157,165,0.18);">
                        <img src="https://beige-web-prod.s3.us-east-1.amazonaws.com/beige/assets/logos/beige_logo_vb.png" alt="Beige" width="110" style="display:block;border:0;">
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px 22px;">
                      <div style="background:${palette.accentSoft};border:1px solid ${palette.border};border-radius:24px;padding:28px 28px 30px;text-align:center;">
                        <span style="display:inline-block;background:${palette.badgeBg};color:${palette.badgeText};border-radius:999px;padding:8px 16px;font-size:13px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">
                          ${badge}
                        </span>
                        <h1 style="margin:20px 0 12px;font-size:48px;line-height:1.05;font-weight:700;color:#111111;">
                          ${title}
                        </h1>
                        <p style="margin:0 auto;max-width:480px;font-size:22px;line-height:1.55;color:#4c4a46;">
                          ${description}
                        </p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 40px 24px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;box-shadow:0 10px 24px rgba(0,0,0,0.04);">
                        <tr>
                          <td style="padding:28px;">
                            <div style="font-size:15px;line-height:1.7;color:#6a665f;text-transform:uppercase;letter-spacing:1px;padding-bottom:6px;">
                              Quote Reference
                            </div>
                            <div style="font-size:26px;line-height:1.3;font-weight:700;color:#111111;padding-bottom:18px;">
                              ${quoteNumber || 'Unavailable'}
                            </div>
                            <div style="font-size:17px;line-height:1.8;color:#5a5751;">
                              Our team will continue from here. If you need help, contact
                              <a href="mailto:sales@beigecorporation.io" style="color:#111111;font-weight:600;text-decoration:underline;">sales@beigecorporation.io</a>.
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:0 40px 40px;">
                      <div style="border-top:1px solid rgba(0,0,0,0.12);padding-top:26px;font-size:14px;line-height:1.7;color:#6f6b64;">
                        This is an automated Beige confirmation page.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `
  };
}

function normalizeShootTypePayload(payload = {}, { partial = false } = {}) {
  const data = {};

  if (payload.name !== undefined) {
    data.name = String(payload.name).trim();
    if (!data.name) {
      throw new Error('name is required');
    }
  } else if (!partial) {
    throw new Error('name is required');
  }

  if (payload.content_type !== undefined) {
    const contentType = Number(payload.content_type);
    if (!Number.isInteger(contentType) || contentType <= 0) {
      throw new Error('content_type is invalid');
    }
    data.content_type = contentType;
  } else if (!partial) {
    throw new Error('content_type is required');
  }

  if (payload.display_order !== undefined) {
    const displayOrder = Number(payload.display_order);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new Error('display_order must be a non-negative integer');
    }
    data.display_order = displayOrder;
  }

  if (payload.image_url !== undefined) data.image_url = payload.image_url ? String(payload.image_url).trim() : null;
  if (payload.description !== undefined) data.description = payload.description ? String(payload.description).trim() : null;
  if (payload.tags !== undefined) data.tags = payload.tags === null ? null : (typeof payload.tags === 'string' ? payload.tags : JSON.stringify(payload.tags));
  if (payload.edited_photos_note !== undefined) data.edited_photos_note = payload.edited_photos_note ? String(payload.edited_photos_note).trim() : null;
  if (payload.is_active !== undefined) data.is_active = Number(payload.is_active) ? 1 : 0;

  return data;
}

function normalizeAiEditingTypePayload(payload = {}, { partial = false } = {}) {
  const data = {};
  const category = payload.category;

  if (category !== undefined) {
    const normalizedCategory = String(category).trim().toLowerCase();
    if (!['video', 'photo'].includes(normalizedCategory)) {
      throw new Error('category must be either video or photo');
    }
    data.category = normalizedCategory;
  } else if (!partial) {
    throw new Error('category is required');
  }

  if (payload.label !== undefined || payload.value !== undefined || payload.name !== undefined) {
    data.label = String(payload.label ?? payload.value ?? payload.name).trim();
    if (!data.label) {
      throw new Error('label is required');
    }
  } else if (!partial) {
    throw new Error('label is required');
  }

  if (payload.type_key !== undefined) {
    data.type_key = String(payload.type_key).trim();
    if (!data.type_key) {
      throw new Error('type_key is invalid');
    }
  }

  if (payload.note !== undefined) data.note = payload.note ? String(payload.note).trim() : null;

  if (payload.display_order !== undefined) {
    const displayOrder = Number(payload.display_order);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new Error('display_order must be a non-negative integer');
    }
    data.display_order = displayOrder;
  }

  if (payload.is_active !== undefined) data.is_active = Number(payload.is_active) ? 1 : 0;

  return data;
}

async function resolveShootTypeContentType(rawValue) {
  const contentType = Number(rawValue);

  if (!Number.isInteger(contentType) || contentType <= 0) {
    throw new Error('content_type must be an active service catalog_item_id');
  }

  const catalogItem = await db.quote_catalog_items.findByPk(contentType);
  if (!catalogItem || Number(catalogItem.is_active) !== 1 || catalogItem.section_type !== 'service') {
    throw new Error('content_type must be an active service catalog_item_id');
  }

  return contentType;
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

exports.getAiEditingTypes = async (req, res) => {
  try {
    const data = await quoteService.getAiEditingTypes();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching AI editing types:', error);
    return sendError(res, error, error.message || 'Failed to fetch AI editing types', constants.BAD_REQUEST.code);
  }
};

exports.createAiEditingType = async (req, res) => {
  try {
    const payload = normalizeAiEditingTypePayload(req.body);
    const data = await quoteService.createAiEditingType(payload, req.userId);
    return res.status(constants.CREATED.code).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error creating AI editing type:', error);
    return sendError(res, error, error.message || 'Failed to create AI editing type');
  }
};

exports.updateAiEditingType = async (req, res) => {
  try {
    const aiEditingTypeId = Number(req.params.aiEditingTypeId);
    if (!Number.isInteger(aiEditingTypeId) || aiEditingTypeId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid aiEditingTypeId'
      });
    }

    const payload = normalizeAiEditingTypePayload(req.body, { partial: true });
    const data = await quoteService.updateAiEditingType(aiEditingTypeId, payload, req.userId);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error updating AI editing type:', error);
    const statusCode = error.message === 'AI editing type not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to update AI editing type', statusCode);
  }
};

exports.deleteAiEditingType = async (req, res) => {
  try {
    const aiEditingTypeId = Number(req.params.aiEditingTypeId);
    if (!Number.isInteger(aiEditingTypeId) || aiEditingTypeId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Invalid aiEditingTypeId'
      });
    }

    const data = await quoteService.deleteAiEditingType(aiEditingTypeId);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error deleting AI editing type:', error);
    const statusCode = error.message === 'AI editing type not found'
      ? constants.NOT_FOUND.code
      : error.message === 'Default AI editing types cannot be deleted'
        ? constants.FORBIDDEN.code
        : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to delete AI editing type', statusCode);
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

exports.deleteCatalogItem = async (req, res) => {
  try {
    const data = await quoteService.deleteCatalogItem(Number(req.params.catalogItemId));
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error deleting quote catalog item:', error);
    const statusCode = error.message === 'Catalog item not found'
      ? constants.NOT_FOUND.code
      : error.message === 'Default service catalog items cannot be deleted'
        ? constants.FORBIDDEN.code
        : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to delete quote catalog item', statusCode);
  }
};

exports.createQuote = async (req, res) => {
  try {
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
    const statusCode = error.statusCode || (error.message === 'Quote not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code);
    return sendError(res, error, error.message || 'Failed to update quote', statusCode);
  }
};

exports.duplicateQuote = async (req, res) => {
  try {
    const quote = await quoteService.duplicateQuote(Number(req.params.quoteId), getUserContext(req));
    return res.status(constants.CREATED.code).json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error duplicating sales quote:', error);
    const statusCode = error.message === 'Quote not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to duplicate quote', statusCode);
  }
};

exports.convertQuoteToBooking = async (req, res) => {
  try {
    const data = await quoteService.convertQuoteToBooking(Number(req.params.quoteId), req.body || {}, getUserContext(req));
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error converting quote to booking:', error);
    const statusCode = error.message === 'Quote not found'
      ? constants.NOT_FOUND.code
      : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to convert quote to booking', statusCode);
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

exports.getPublicQuoteById = async (req, res) => {
  try {
    const quote = await quoteService.getPublicQuoteById(Number(req.params.quoteId));
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
    console.error('Error fetching public sales quote:', error);
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

exports.sendQuoteProposal = async (req, res) => {
  try {
    const quote = await quoteService.sendQuoteProposal(Number(req.params.quoteId), req.body, getUserContext(req));
    return res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error sending quote proposal email:', error);
    const statusCode = error.message === 'Quote not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to send quote proposal email', statusCode);
  }
};

exports.rejectQuoteProposal = async (req, res) => {
  try {
    const status  = 'rejected';
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

exports.acceptQuoteProposal = async (req, res) => {
  try {
    const token = String(req.query.token || req.body?.token || '').trim();
    if (!token) {
      if (req.method === 'GET' && req.accepts('html')) {
        const page = renderQuoteAcceptPage({
          title: 'Link Invalid',
          badge: 'Unable To Process',
          description: 'This quote confirmation link is missing required information. Please contact the Beige team for help.',
          quoteNumber: '',
          tone: 'error',
          statusCode: constants.BAD_REQUEST.code
        });
        return res.status(page.statusCode).send(page.html);
      }
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Accept token is required'
      });
    }

    const result = await quoteService.acceptQuoteProposal(token);

    if (req.method === 'GET' && req.accepts('html')) {
      const quoteNumber = result?.quote?.quote_number || 'your quote';
      const title = result.already_accepted ? 'Quote Already Confirmed' : 'Quote Accepted';
      const description = result.already_accepted
        ? `${quoteNumber} was already confirmed earlier. No further action is needed from you right now.`
        : `${quoteNumber} has been accepted successfully. Our sales team will send the invoice shortly.`;
      const page = renderQuoteAcceptPage({
        title,
        badge: result.already_accepted ? 'Already Confirmed' : 'Approval Received',
        description,
        quoteNumber,
        tone: result.already_accepted ? 'warning' : 'success',
        statusCode: constants.OK.code
      });
      return res.status(page.statusCode).send(page.html);
    }

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error accepting quote proposal:', error);
    const statusCode = error.message === 'Quote not found'
      ? constants.NOT_FOUND.code
      : constants.BAD_REQUEST.code;
    if (req.method === 'GET' && req.accepts('html')) {
      const isMissing = error.message === 'Quote not found';
      const page = renderQuoteAcceptPage({
        title: isMissing ? 'Quote Not Found' : 'Unable To Confirm Quote',
        badge: isMissing ? 'Not Found' : 'Action Needed',
        description: isMissing
          ? 'We could not find this quote anymore. Please contact the Beige team for assistance.'
          : 'This confirmation link is invalid or has expired. Please contact the Beige team and we will help you right away.',
        quoteNumber: '',
        tone: 'error',
        statusCode
      });
      return res.status(page.statusCode).send(page.html);
    }
    return sendError(res, error, error.message || 'Failed to accept quote proposal', statusCode);
  }
};

exports.downloadQuotePdf = async (req, res) => {
  try {
    const { buffer, filename } = await quoteService.downloadQuotePdf(Number(req.params.quoteId), getUserContext(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Error downloading sales quote PDF:', error);
    const statusCode = error.message === 'Quote not found' ? constants.NOT_FOUND.code : constants.BAD_REQUEST.code;
    return sendError(res, error, error.message || 'Failed to download quote PDF', statusCode);
  }
};

exports.getShootTypes = async (req, res) => {
  try {
    const content_type = await resolveShootTypeContentType(req.params.content_type);

    const where = { is_active: 1 };

    where.content_type = content_type;

    const data = await db.sales_shoot_types.findAll({
      where,
      order: [['display_order', 'ASC'], ['sales_shoot_type_id', 'ASC']]
    });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: constants.OK.message,
      data
    });
  } catch (err) {
    console.error('getShootTypes Error:', err);
    const statusCode = err.message === 'content_type must be an active service catalog_item_id'
      ? constants.BAD_REQUEST.code
      : constants.INTERNAL_SERVER_ERROR.code;
    return res.status(statusCode).json({
      error: true,
      code: statusCode,
      message: statusCode === constants.BAD_REQUEST.code ? err.message : constants.INTERNAL_SERVER_ERROR.message,
      data: null
    });
  }
};

exports.createShootType = async (req, res) => {
  try {
    const payload = normalizeShootTypePayload(req.body);
    payload.content_type = await resolveShootTypeContentType(payload.content_type);
    const data = await db.sales_shoot_types.create({
      ...payload,
      is_system_default: 0
    });

    return res.status(constants.CREATED.code).json({
      error: false,
      code: constants.CREATED.code,
      message: 'Shoot type created successfully',
      data
    });
  } catch (err) {
    console.error('createShootType Error:', err);
    const message = err.name === 'SequelizeUniqueConstraintError'
      ? 'Shoot type with the same name already exists for this content type'
      : err.errors?.[0]?.message || err.message || constants.BAD_REQUEST.message;
    return res.status(constants.BAD_REQUEST.code).json({
      error: true,
      code: constants.BAD_REQUEST.code,
      message,
      data: null
    });
  }
};

exports.updateShootType = async (req, res) => {
  try {
    const shootTypeId = Number(req.params.shootTypeId);
    if (!Number.isInteger(shootTypeId) || shootTypeId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid shootTypeId',
        data: null
      });
    }

    const payload = normalizeShootTypePayload(req.body, { partial: true });
    if (!Object.keys(payload).length) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'At least one field is required to update',
        data: null
      });
    }

    if (payload.content_type !== undefined) {
      payload.content_type = await resolveShootTypeContentType(payload.content_type);
    }

    const record = await db.sales_shoot_types.findByPk(shootTypeId);
    if (!record) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: 'Shoot type not found',
        data: null
      });
    }

    await record.update(payload);

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Shoot type updated successfully',
      data: record
    });
  } catch (err) {
    console.error('updateShootType Error:', err);
    return res.status(constants.BAD_REQUEST.code).json({
      error: true,
      code: constants.BAD_REQUEST.code,
      message: err.message || constants.BAD_REQUEST.message,
      data: null
    });
  }
};

exports.deleteShootType = async (req, res) => {
  try {
    const shootTypeId = Number(req.params.shootTypeId);
    if (!Number.isInteger(shootTypeId) || shootTypeId <= 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        code: constants.BAD_REQUEST.code,
        message: 'Invalid shootTypeId',
        data: null
      });
    }

    const record = await db.sales_shoot_types.findByPk(shootTypeId);
    if (!record) {
      return res.status(constants.NOT_FOUND.code).json({
        error: true,
        code: constants.NOT_FOUND.code,
        message: 'Shoot type not found',
        data: null
      });
    }

    if (Number(record.is_system_default) === 1) {
      return res.status(constants.FORBIDDEN.code).json({
        error: true,
        code: constants.FORBIDDEN.code,
        message: 'Default shoot types cannot be deleted',
        data: null
      });
    }

    await record.update({ is_active: 0 });

    return res.status(constants.OK.code).json({
      error: false,
      code: constants.OK.code,
      message: 'Shoot type deleted successfully',
      data: {
        sales_shoot_type_id: record.sales_shoot_type_id,
        deleted: true
      }
    });
  } catch (err) {
    console.error('deleteShootType Error:', err);
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
    const allowedUsers = await db.users.findAll({
      where: { user_type: 3 },
      attributes: ['id'],
      raw: true
    });

    const allowedUserIds = allowedUsers.map((user) => user.id);

    if (!allowedUserIds.length) {
      return res.status(constants.OK.code).json({
        error: false,
        message: 'Client dropdown fetched successfully',
        data: []
      });
    }

    const whereConditions = {
      is_active: 1,
      [Op.or]: [
        {
          user_id: {
            [Op.in]: allowedUserIds
          }
        },
        {
          user_id: null
        }
      ]
    };

    if (search?.trim()) {
      whereConditions.name = {
        [Op.like]: `%${search.trim()}%`
      };
    }

    const clientList = await db.clients.findAll({
      where: whereConditions,
      attributes: ['client_id', 'name', 'user_id', 'email', 'phone_number'],
      order: [['name', 'ASC']],
      raw: true
    });

    const formattedList = clientList.map(client => ({
      ...client,
      client_type: client.user_id ? 'registered' : 'guest'
    }));

    return res.status(constants.OK.code).json({
      error: false,
      message: 'Client dropdown fetched successfully',
      data: formattedList
    });
  } catch (error) {
    console.error('Get Client Dropdown Error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      message: 'Internal server error'
    });
  }
};

exports.createClient = async (req, res) => {
  try {
    const { name, email, phone_number } = req.body;

    const existingUser = await db.users.findOne({
      where: {
        [db.Sequelize.Op.or]: [
          email ? { email } : null,
          phone_number ? { phone_number } : null
        ].filter(Boolean)
      }
    });

    if (existingUser) {
      return res.status(constants.BAD_REQUEST.code).json({
        error: true,
        message: 'Client already exists with same email or phone number'
      });
    }

    const createdClient = await db.clients.create({ name, email, phone_number });

    return res.status(constants.OK.code).json({
      error: false,
      message: 'Client created successfully',
      data: {
        client_id: createdClient.client_id,
        user_id: createdClient.user_id || null,
        name: createdClient.name,
        email: createdClient.email,
        phone_number: createdClient.phone_number,
        client_type: createdClient.user_id ? 'registered' : 'guest'
      }
    });
  } catch (error) {
    console.error('Client Create Error:', error);
    return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      error: true,
      message: 'Internal server error'
    });
  }
};
