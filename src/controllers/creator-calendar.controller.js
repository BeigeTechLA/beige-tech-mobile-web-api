const calendarService = require('../services/creator-calendar.service');

const getCrewMemberId = async (req) =>
  calendarService.normalizeCrewMemberId({
    crew_member_id: req.body?.crew_member_id || req.query?.crew_member_id,
    user_id: req.userId,
  });

const handleError = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, error);
  const statusCode = Number(error.statusCode);
  const responseStatus = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;

  return res.status(responseStatus).json({
    error: true,
    message: responseStatus !== 500 ? error.message : fallbackMessage,
  });
};

exports.getAvailabilityRules = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const rules = await calendarService.listRules(crewMemberId);
    return res.status(200).json({
      error: false,
      message: 'Creator availability rules fetched successfully',
      data: { crew_member_id: crewMemberId, rules },
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while fetching availability rules');
  }
};

exports.replaceAvailabilityRules = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const rules = await calendarService.replaceRules(crewMemberId, req.body?.rules || []);
    return res.status(200).json({
      error: false,
      message: 'Creator availability rules saved successfully',
      data: { crew_member_id: crewMemberId, rules },
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while saving availability rules');
  }
};

exports.getAvailabilityBlocks = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const blocks = await calendarService.listBlocks(crewMemberId, {
      start_at: req.query?.start_at || req.body?.start_at,
      end_at: req.query?.end_at || req.body?.end_at,
    });

    return res.status(200).json({
      error: false,
      message: 'Creator availability blocks fetched successfully',
      data: { crew_member_id: crewMemberId, blocks },
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while fetching availability blocks');
  }
};

exports.createManualBlock = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const block = await calendarService.createManualBlock(crewMemberId, req.body || {});
    return res.status(201).json({
      error: false,
      message: 'Manual unavailable block saved successfully',
      data: block,
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while saving manual unavailable block');
  }
};

exports.deleteManualBlock = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    await calendarService.deleteManualBlock(crewMemberId, req.params.id);
    return res.status(200).json({
      error: false,
      message: 'Manual unavailable block removed successfully',
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while removing manual unavailable block');
  }
};

exports.getCalculatedAvailability = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    try {
      await calendarService.syncStaleGoogleBusyBlocks(crewMemberId);
    } catch (syncError) {
      console.error('Google Calendar auto-sync skipped calculated availability refresh:', syncError.message);
    }

    const data = await calendarService.calculateAvailability(crewMemberId, {
      start_at: req.query?.start_at || req.body?.start_at,
      end_at: req.query?.end_at || req.body?.end_at,
    });

    return res.status(200).json({
      error: false,
      message: 'Creator calculated availability fetched successfully',
      data,
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while calculating creator availability');
  }
};

exports.getGoogleStatus = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const status = await calendarService.getConnectionStatus(crewMemberId);
    return res.status(200).json({
      error: false,
      message: 'Google Calendar connection status fetched successfully',
      data: { crew_member_id: crewMemberId, ...status },
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while fetching Google Calendar status');
  }
};

exports.startGoogleConnect = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const auth_url = calendarService.buildGoogleAuthUrl({
      crewMemberId,
      userId: req.userId,
    });

    return res.status(200).json({
      error: false,
      message: 'Google Calendar authorization URL generated successfully',
      data: { auth_url },
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while starting Google Calendar connect');
  }
};

exports.handleGoogleCallback = async (req, res) => {
  const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const successUrl = `${frontendBase}/creator/dashboard/availability?calendar=google&status=connected`;
  const failedUrl = `${frontendBase}/creator/dashboard/availability?calendar=google&status=failed`;

  try {
    const { code, state, error } = req.query || {};
    if (error) return res.redirect(`${failedUrl}&reason=${encodeURIComponent(String(error))}`);
    if (!code || !state) return res.redirect(`${failedUrl}&reason=missing_code`);

    await calendarService.connectGoogle({ code, state });
    return res.redirect(successUrl);
  } catch (error) {
    console.error('Google Calendar callback error:', error);
    return res.redirect(`${failedUrl}&reason=${encodeURIComponent(error.message || 'callback_failed')}`);
  }
};

exports.syncGoogle = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    const result = await calendarService.syncGoogleBusyBlocks(crewMemberId);
    return res.status(200).json({
      error: false,
      message: 'Google Calendar synced successfully',
      data: result,
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while syncing Google Calendar');
  }
};

exports.disconnectGoogle = async (req, res) => {
  try {
    const crewMemberId = await getCrewMemberId(req);
    if (!crewMemberId) {
      return res.status(400).json({ error: true, message: 'crew_member_id is required' });
    }

    await calendarService.disconnectGoogle(crewMemberId);
    return res.status(200).json({
      error: false,
      message: 'Google Calendar disconnected successfully',
    });
  } catch (error) {
    return handleError(res, error, 'Something went wrong while disconnecting Google Calendar');
  }
};
