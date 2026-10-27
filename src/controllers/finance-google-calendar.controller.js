const financeGoogleCalendar = require('../services/finance-google-calendar.service');

const getUserId = (req) => req.userId || req.user?.userId || req.user?.id || null;

function sendError(res, error, fallback) {
  return res.status(error.statusCode || 500).json({ success: false, message: error.message || fallback });
}

exports.status = async (_req, res) => {
  try {
    return res.json({ success: true, data: await financeGoogleCalendar.getConnectionStatus() });
  } catch (error) {
    return sendError(res, error, 'Failed to get finance Google Calendar status');
  }
};

exports.connect = async (req, res) => {
  try {
    return res.json({ success: true, data: { auth_url: financeGoogleCalendar.buildGoogleAuthUrl({ userId: getUserId(req) }) } });
  } catch (error) {
    return sendError(res, error, 'Failed to start finance Google Calendar connection');
  }
};

exports.callback = async (req, res) => {
  const frontendBase = financeGoogleCalendar.getFrontendBaseUrl();
  const successUrl = `${frontendBase}/admin/finances/cpCompensation?calendar=google&status=connected`;
  const failedUrl = `${frontendBase}/admin/finances/cpCompensation?calendar=google&status=failed`;
  try {
    if (req.query.error) return res.redirect(`${failedUrl}&reason=${encodeURIComponent(String(req.query.error))}`);
    if (!req.query.code || !req.query.state) return res.redirect(`${failedUrl}&reason=missing_code`);
    await financeGoogleCalendar.connectGoogle({ code: req.query.code, state: req.query.state });
    return res.redirect(successUrl);
  } catch (error) {
    console.error('Finance Google Calendar callback failed:', error.message);
    return res.redirect(`${failedUrl}&reason=${encodeURIComponent(error.message || 'connection_failed')}`);
  }
};

exports.calendars = async (_req, res) => {
  try {
    return res.json({ success: true, data: { calendars: await financeGoogleCalendar.listGoogleCalendars() } });
  } catch (error) {
    return sendError(res, error, 'Failed to list Google calendars');
  }
};

exports.selectCalendar = async (req, res) => {
  try {
    const status = await financeGoogleCalendar.selectGoogleCalendar(req.body?.calendar_id || req.body?.calendarId);
    const syncResults = await financeGoogleCalendar.syncAllOpenEarnings();
    return res.json({
      success: true,
      data: {
        ...status,
        initial_sync: {
          total: syncResults.length,
          synced: syncResults.filter((result) => result.status === 'fulfilled' && !result.value?.skipped).length,
          failed: syncResults.filter((result) => result.status === 'rejected').length
        }
      }
    });
  } catch (error) {
    return sendError(res, error, 'Failed to select Google calendar');
  }
};

exports.sync = async (_req, res) => {
  try {
    const results = await financeGoogleCalendar.syncAllOpenEarnings();
    return res.json({
      success: true,
      data: {
        total: results.length,
        synced: results.filter((result) => result.status === 'fulfilled' && !result.value?.skipped).length,
        skipped: results.filter((result) => result.status === 'fulfilled' && result.value?.skipped).length,
        failed: results.filter((result) => result.status === 'rejected').length
      }
    });
  } catch (error) {
    return sendError(res, error, 'Failed to sync CP compensation calendar');
  }
};

exports.disconnect = async (_req, res) => {
  try {
    return res.json({ success: true, data: await financeGoogleCalendar.disconnectGoogle() });
  } catch (error) {
    return sendError(res, error, 'Failed to disconnect finance Google Calendar');
  }
};
