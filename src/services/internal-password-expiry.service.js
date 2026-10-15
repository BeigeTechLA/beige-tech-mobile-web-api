const db = require('../models');

const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;

const getSettings = async () => {
  const [settings] = await db.internal_password_expiry_settings.findOrCreate({
    where: { internal_password_expiry_setting_id: 1 },
    defaults: { internal_password_expiry_setting_id: 1, is_enabled: false, expiry_days: DEFAULT_DAYS }
  });
  return settings;
};

const getPublicSettings = async () => {
  const setting = await getSettings();
  return {
    is_enabled: Boolean(setting.is_enabled),
    expiry_days: Number(setting.expiry_days),
    enabled_at: setting.enabled_at || null,
    updated_at: setting.updated_at || null
  };
};

const updateSettings = async ({ is_enabled, expiry_days }, updatedByUserId) => {
  const setting = await getSettings();
  if (typeof is_enabled !== 'boolean' && !['0', '1', 0, 1].includes(is_enabled)) {
    const error = new Error('is_enabled must be true or false');
    error.statusCode = 400;
    throw error;
  }
  const nextEnabled = typeof is_enabled === 'boolean' ? is_enabled : Number(is_enabled) === 1;
  const nextDays = Number(expiry_days);
  if (!Number.isInteger(nextDays) || nextDays < 1 || nextDays > MAX_DAYS) {
    const error = new Error(`Expiry days must be a whole number between 1 and ${MAX_DAYS}`);
    error.statusCode = 400;
    throw error;
  }

  await setting.update({
    is_enabled: nextEnabled,
    expiry_days: nextDays,
    enabled_at: nextEnabled && !setting.is_enabled ? new Date() : setting.enabled_at,
    updated_by_user_id: updatedByUserId || null,
    updated_at: new Date()
  });
  return getPublicSettings();
};

const getExpiryStatus = async (user, isInternalMember) => {
  if (!isInternalMember) return { applies: false, expired: false };
  const settings = await getSettings();
  if (!settings.is_enabled) return { applies: false, expired: false };

  const baseline = new Date(Math.max(
    new Date(user.password_changed_at || user.created_at || 0).getTime(),
    new Date(settings.enabled_at || 0).getTime()
  ));
  const expiresAt = new Date(baseline.getTime() + Number(settings.expiry_days) * 24 * 60 * 60 * 1000);
  return { applies: true, expired: Date.now() >= expiresAt.getTime(), expires_at: expiresAt };
};

module.exports = { getPublicSettings, updateSettings, getExpiryStatus };
