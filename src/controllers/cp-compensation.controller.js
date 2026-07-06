const cpCompensationService = require('../services/cp-compensation.service');
const constants = require('../utils/constants');
const { S3UploadFiles, toAbsoluteBeigeAssetUrl } = require('../utils/common');

function getRequestUserId(req) {
  return req.userId || req.user?.userId || req.user?.id || null;
}

function buildPayload(req, bookingId = null) {
  return {
    ...req.body,
    booking_id: req.body.booking_id || req.body.bookingId || bookingId
  };
}

const sanitizeFolderId = (value, fallback) => {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').trim();
  return normalized || fallback;
};

exports.uploadPaymentProof = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Proof file is required'
      });
    }

    const bookingId = sanitizeFolderId(req.body.booking_id || req.body.bookingId, 'unknown-booking');
    const earningId = sanitizeFolderId(req.body.creator_earning_id || req.body.earningId, 'unknown-earning');
    const folder = `cp-compensation/receipts/booking-${bookingId}/earning-${earningId}`;
    const uploaded = await S3UploadFiles({ cp_receipt: [file] }, { prefix: folder });
    const uploadedFilePath = uploaded?.[0]?.file_path || null;

    if (!uploadedFilePath) {
      return res.status(constants.INTERNAL_SERVER_ERROR.code).json({
        success: false,
        message: 'Failed to upload proof file'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'CP compensation proof uploaded successfully',
      data: {
        file_path: uploadedFilePath,
        proof_url: toAbsoluteBeigeAssetUrl(uploadedFilePath),
        folder
      }
    });
  } catch (error) {
    console.error('Upload CP compensation proof error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to upload proof file'
    });
  }
};

exports.submitFromSalesAdmin = async (req, res) => {
  try {
    const bookingId = parseInt(req.body.booking_id || req.body.bookingId || req.params.bookingId || req.params.id, 10);
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Valid booking ID is required'
      });
    }

    const data = await cpCompensationService.submitSalesAdminCompensation(
      buildPayload(req, bookingId),
      { userId: getRequestUserId(req) }
    );

    return res.status(201).json({
      success: true,
      message: 'CP compensation submitted for approval',
      data
    });
  } catch (error) {
    console.error('Submit CP compensation from sales admin error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to submit CP compensation'
    });
  }
};

exports.addFromAdmin = async (req, res) => {
  try {
    const data = await cpCompensationService.addAdminCompensation(
      buildPayload(req),
      { userId: getRequestUserId(req) }
    );

    return res.status(201).json({
      success: true,
      message: 'CP compensation added and approved',
      data
    });
  } catch (error) {
    console.error('Add CP compensation from admin error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add CP compensation'
    });
  }
};

exports.list = async (req, res) => {
  try {
    const data = await cpCompensationService.listCpCompensations(req.query);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List CP compensation error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch CP compensation'
    });
  }
};

exports.listPendingShoots = async (req, res) => {
  try {
    const data = await cpCompensationService.listPendingCompensationShoots(req.query);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('List pending CP compensation shoots error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch pending compensation shoots'
    });
  }
};

exports.getDetails = async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Valid booking ID is required'
      });
    }

    const data = await cpCompensationService.getCpCompensationDetails(bookingId);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get CP compensation details error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch CP compensation details'
    });
  }
};

exports.approve = async (req, res) => {
  try {
    const creatorEarningId = parseInt(req.params.earningId, 10);
    if (!creatorEarningId) {
      return res.status(400).json({
        success: false,
        message: 'Valid creator earning ID is required'
      });
    }

    const data = await cpCompensationService.approveCompensation(
      creatorEarningId,
      req.body,
      { userId: getRequestUserId(req) }
    );

    return res.status(200).json({
      success: true,
      message: 'CP compensation approved successfully',
      data
    });
  } catch (error) {
    console.error('Approve CP compensation error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to approve CP compensation'
    });
  }
};

exports.reject = async (req, res) => {
  try {
    const creatorEarningId = parseInt(req.params.earningId, 10);
    if (!creatorEarningId) {
      return res.status(400).json({
        success: false,
        message: 'Valid creator earning ID is required'
      });
    }

    const data = await cpCompensationService.rejectCompensation(
      creatorEarningId,
      req.body,
      { userId: getRequestUserId(req) }
    );

    return res.status(200).json({
      success: true,
      message: 'CP compensation rejected successfully',
      data
    });
  } catch (error) {
    console.error('Reject CP compensation error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to reject CP compensation'
    });
  }
};

exports.modify = async (req, res) => {
  try {
    const creatorEarningId = parseInt(req.params.earningId, 10);
    if (!creatorEarningId) {
      return res.status(400).json({
        success: false,
        message: 'Valid creator earning ID is required'
      });
    }

    const data = await cpCompensationService.modifyCompensation(
      creatorEarningId,
      req.body,
      { userId: getRequestUserId(req) }
    );

    return res.status(200).json({
      success: true,
      message: 'CP compensation modified successfully',
      data
    });
  } catch (error) {
    console.error('Modify CP compensation error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to modify CP compensation'
    });
  }
};

exports.addAdvance = async (req, res) => {
  try {
    const creatorEarningId = parseInt(req.params.earningId, 10);
    if (!creatorEarningId) {
      return res.status(400).json({
        success: false,
        message: 'Valid creator earning ID is required'
      });
    }

    const data = await cpCompensationService.addAdvancePayment(
      creatorEarningId,
      req.body,
      { userId: getRequestUserId(req) }
    );

    return res.status(201).json({
      success: true,
      message: 'Advance payment added successfully',
      data
    });
  } catch (error) {
    console.error('Add CP compensation advance error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add advance payment'
    });
  }
};

exports.processPayment = async (req, res) => {
  try {
    const creatorEarningId = parseInt(req.params.earningId, 10);
    if (!creatorEarningId) {
      return res.status(400).json({
        success: false,
        message: 'Valid creator earning ID is required'
      });
    }

    const data = await cpCompensationService.processCompensationPayment(
      creatorEarningId,
      req.body,
      { userId: getRequestUserId(req) }
    );

    return res.status(200).json({
      success: true,
      message: 'CP compensation payment processed successfully',
      data
    });
  } catch (error) {
    console.error('Process CP compensation payment error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to process CP compensation payment'
    });
  }
};
