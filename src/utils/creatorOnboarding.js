const db = require('../models');

const REQUIRED_TOTAL = 11;

const safeJsonParse = (value, fallback = []) => {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return fallback;

  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== 'string') return current || fallback;

    const trimmed = current.trim();
    if (!trimmed) return fallback;

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === current) return parsed || fallback;
      current = parsed;
    } catch {
      return fallback;
    }
  }

  return current || fallback;
};

const hasMeaningfulValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
};

const buildEmptyOnboardingSummary = () => ({
  onboardingMissingDetail: true,
  is_registration_complete: 0,
  completed_count: 0,
  total_required: REQUIRED_TOTAL,
  missing_count: REQUIRED_TOTAL,
  progress_percent: 0,
  missing_fields: [
    'Phone number',
    'Location',
    'Working distance',
    'Profile photo',
    'Primary role',
    'Years of experience',
    'Hourly rate',
    'Skills',
    'Equipment',
    'Social links',
    'Featured work',
  ],
  required_groups: [
    { key: 'basics', label: 'Basics', total: 4, completed: 0 },
    { key: 'professional', label: 'Professional', total: 5, completed: 0 },
    { key: 'portfolio', label: 'Portfolio', total: 2, completed: 0 },
  ],
});

const getFiles = (member) => member?.crew_member_files || [];

const getFileType = (file) => String(file?.file_type || '').trim().toLowerCase();

const countActiveFilesByTypes = (files, types) =>
  files.filter((file) => {
    const fileType = getFileType(file);
    return types.includes(fileType) && hasMeaningfulValue(file?.file_path);
  }).length;

const buildCreatorOnboardingSummary = (member) => {
  if (!member) return buildEmptyOnboardingSummary();

  const files = getFiles(member);
  const roles = safeJsonParse(member.primary_role, []);
  const skills = safeJsonParse(member.skills, []);
  const equipment = safeJsonParse(member.equipment_ownership || member.equipment, []);
  const socialLinks = safeJsonParse(member.social_media_links, {});
  const featuredWorkFiles = files.filter((file) =>
    ['recent_work', 'work_sample'].includes(String(file?.file_type || '')) &&
    hasMeaningfulValue(file?.file_path)
  );

  const featuredWorkGroups = Object.values(
    featuredWorkFiles.reduce((groups, file) => {
      const title = String(file?.title || '').trim();
      const tag = String(file?.tag || '').trim().toLowerCase();
      const key = `${title.toLowerCase()}::${tag || 'untagged'}`;

      if (!hasMeaningfulValue(title)) return groups;
      if (!groups[key]) groups[key] = [];
      groups[key].push(file);
      return groups;
    }, {})
  );

  const featuredWorkFileCount = featuredWorkFiles.length;
  const hasValidFeaturedWork = featuredWorkGroups.some((group) => group.length >= 5) || featuredWorkFileCount >= 5;
  const fieldChecks = [
    { label: 'Phone number', complete: hasMeaningfulValue(member.phone_number) },
    { label: 'Location', complete: hasMeaningfulValue(member.location) },
    { label: 'Working distance', complete: hasMeaningfulValue(member.working_distance) },
    {
      label: 'Profile photo',
      complete: files.some((file) => ['profile_photo', 'profile_image'].includes(getFileType(file)) && hasMeaningfulValue(file?.file_path)),
    },
    { label: 'Primary role', complete: Array.isArray(roles) && roles.length > 0 },
    { label: 'Years of experience', complete: hasMeaningfulValue(member.years_of_experience) && Number(member.years_of_experience) > 0 },
    { label: 'Hourly rate', complete: hasMeaningfulValue(member.hourly_rate) && Number(member.hourly_rate) > 0 },
    { label: 'Skills', complete: Array.isArray(skills) && skills.length > 0 },
    {
      label: 'Equipment',
      complete: Array.isArray(equipment) && equipment.length > 0,
    },
    {
      label: 'Social links',
      complete: Object.values(socialLinks || {}).some((value) => hasMeaningfulValue(value)),
    },
    {
      label: 'Featured work',
      complete: hasValidFeaturedWork,
    },
  ];

  const completedCount = fieldChecks.filter((field) => field.complete).length;
  const totalCount = fieldChecks.length;
  const missingCount = totalCount - completedCount;
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const isRegistrationComplete = missingCount === 0 ? 1 : 0;

  return {
    onboardingMissingDetail: missingCount > 0,
    is_registration_complete: isRegistrationComplete,
    completed_count: completedCount,
    total_required: totalCount,
    missing_count: missingCount,
    progress_percent: progressPercent,
    missing_fields: fieldChecks.filter((field) => !field.complete).map((field) => field.label),
    required_groups: [
      { key: 'basics', label: 'Basics', total: 4, completed: fieldChecks.slice(0, 4).filter((field) => field.complete).length },
      { key: 'professional', label: 'Professional', total: 5, completed: fieldChecks.slice(4, 9).filter((field) => field.complete).length },
      { key: 'portfolio', label: 'Portfolio', total: 2, completed: fieldChecks.slice(9, 11).filter((field) => field.complete).length },
    ],
  };
};

const getCrewMemberWithOnboardingFiles = (where, options = {}) =>
  db.crew_members.findOne({
    ...options,
    where,
    include: [{
      model: db.crew_member_files,
      as: 'crew_member_files',
      required: false,
      where: { is_active: 1 },
    }],
  });

const syncCreatorRegistrationComplete = async (member, transaction = null) => {
  const summary = buildCreatorOnboardingSummary(member);
  if (!member || Number(member.is_registration_complete) === summary.is_registration_complete) {
    return summary;
  }

  await member.update(
    { is_registration_complete: summary.is_registration_complete },
    { transaction }
  );

  member.is_registration_complete = summary.is_registration_complete;
  return summary;
};

module.exports = {
  buildCreatorOnboardingSummary,
  buildEmptyOnboardingSummary,
  getCrewMemberWithOnboardingFiles,
  syncCreatorRegistrationComplete,
};
