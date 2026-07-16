const db = require('../models');

const {
  studios,
  studio_media,
  studio_operating_hours,
  studio_reviews,
} = db;

const parseJsonValue = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildStudioLocation = (studio) => {
  const address = [
    studio.address_line1,
    studio.address_line2,
    studio.city,
    studio.state,
    studio.zip_code,
  ].filter(Boolean);

  return address.join(', ') || [studio.city, studio.state].filter(Boolean).join(', ') || null;
};

const getCoverMedia = (media = []) =>
  media.find((item) => item.is_cover) || media[0] || null;

const normalizePricingOptions = (studio) => {
  const pricingSettings = parseJsonValue(studio.pricing_settings, null);
  const rawOptions = Array.isArray(pricingSettings?.options)
    ? pricingSettings.options
    : Array.isArray(pricingSettings)
      ? pricingSettings
      : [];

  if (rawOptions.length > 0) {
    return rawOptions.map((option) => ({
      key: String(option.key || option.slug || option.label || 'productions')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
      label: option.label || option.name || 'Productions',
      hourlyRate: numberOrNull(option.hourlyRate ?? option.hourly_rate ?? option.rate) || 0,
      minimumHours: numberOrNull(option.minimumHours ?? option.minimum_hours) || numberOrNull(studio.minimum_booking_hours) || 1,
      cleaningFee: numberOrNull(option.cleaningFee ?? option.cleaning_fee) || 0,
      startingAt: numberOrNull(option.startingAt ?? option.starting_at),
      idealFor: parseJsonValue(option.idealFor ?? option.ideal_for, []),
      includes: parseJsonValue(option.includes, []),
    }));
  }

  const hourlyRate = numberOrNull(studio.hourly_rate) || 0;

  return hourlyRate > 0
    ? [{
        key: 'productions',
        label: 'Productions',
        hourlyRate,
        minimumHours: numberOrNull(studio.minimum_booking_hours) || 1,
        cleaningFee: 0,
        startingAt: hourlyRate,
        idealFor: parseJsonValue(studio.supported_shoot_types, []),
        includes: [],
      }]
    : [];
};

const formatStudioCatalogItem = (row) => {
  const studio = row.get ? row.get({ plain: true }) : row;
  const media = studio.media || [];
  const cover = getCoverMedia(media);
  const images = media
    .filter((item) => item.media_type === 'image')
    .sort((a, b) => {
      if (Number(b.is_cover || 0) !== Number(a.is_cover || 0)) {
        return Number(b.is_cover || 0) - Number(a.is_cover || 0);
      }
      return Number(a.sort_order || 0) - Number(b.sort_order || 0);
    })
    .map((item) => item.url);
  const pricingOptions = normalizePricingOptions(studio);
  const startingRate = pricingOptions.reduce((lowest, option) => {
    if (!option.hourlyRate) return lowest;
    return lowest === null ? option.hourlyRate : Math.min(lowest, option.hourlyRate);
  }, null);
  const ratingStats = (studio.reviews || []).reduce((stats, review) => {
    const rating = numberOrNull(review.rating);
    if (rating === null) return stats;
    return {
      count: stats.count + 1,
      total: stats.total + rating,
    };
  }, { count: 0, total: 0 });
  const metadata = parseJsonValue(studio.metadata, {});
  const metadataNumber = (key) => numberOrNull(metadata[key]);

  return {
    studio_id: studio.studio_id,
    id: studio.slug || String(studio.studio_id),
    slug: studio.slug || null,
    name: studio.studio_name,
    brandName: studio.brand_name || null,
    hostName: studio.host_name || null,
    status: studio.status,
    verificationStatus: studio.verification_status,
    spaceType: studio.space_type || null,

    location: buildStudioLocation(studio),
    address: {
      country: studio.country || null,
      addressLine1: studio.address_line1 || null,
      addressLine2: studio.address_line2 || null,
      city: studio.city || null,
      state: studio.state || null,
      zipCode: studio.zip_code || null,
      latitude: numberOrNull(studio.latitude),
      longitude: numberOrNull(studio.longitude),
      timezone: studio.timezone || null,
    },
    lat: numberOrNull(studio.latitude),
    lng: numberOrNull(studio.longitude),
    timezone: studio.timezone || null,

    description: studio.description || null,
    shortDescription: studio.short_description || null,
    beds: metadataNumber('beds') || 0,
    baths: metadataNumber('baths') || 0,
    poolType: studio.suggested_type || studio.space_type || metadata.poolType || null,
    size: metadata.size || (studio.square_feet ? `${studio.square_feet}+ Square Feet` : null),
    highlights: parseJsonValue(studio.description_tags, []),
    bestFor: parseJsonValue(studio.activities, []),
    amenities: parseJsonValue(studio.amenities, []),
    rules: parseJsonValue(studio.house_rules, []),
    policies: parseJsonValue(studio.policies, {}),
    supportedShootTypes: parseJsonValue(studio.supported_shoot_types, []),
    suggestedType: studio.suggested_type || null,
    spaceBasics: parseJsonValue(studio.space_basics, {}),
    accessFeatures: parseJsonValue(studio.access_features, []),
    facilityFeatures: parseJsonValue(studio.facility_features, []),
    parkingOptions: parseJsonValue(studio.parking_options, []),

    capacityMin: numberOrNull(studio.capacity_min),
    capacityMax: numberOrNull(studio.capacity_max),
    squareFeet: numberOrNull(studio.square_feet),
    dimensions: {
      height: studio.height || null,
      width: studio.width || null,
      length: studio.length || null,
      mainFloorNumber: studio.main_floor_number || null,
    },

    hourlyRate: numberOrNull(studio.hourly_rate),
    overtimeRate: numberOrNull(studio.overtime_rate),
    minimumBookingHours: numberOrNull(studio.minimum_booking_hours),
    bufferTimeMinutes: numberOrNull(studio.buffer_time_minutes),
    pricingMode: metadata.pricingMode || metadata.pricing_mode || 'hourly',
    pricingOptions,
    priceValue: startingRate,
    priceLabel: metadata.priceLabel || (startingRate ? `From $${startingRate}/Hr` : null),

    image: cover?.url || images[0] || null,
    images,
    media,
    operatingHours: metadata.operatingHours || null,
    operatingHoursRows: studio.operating_hours || [],
    weeklySchedule: metadata.weeklySchedule || null,
    rating: ratingStats.count > 0
      ? Number((ratingStats.total / ratingStats.count).toFixed(1))
      : numberOrNull(metadata.rating),
    reviews: Math.max(ratingStats.count, numberOrNull(metadata.reviews) || 0),
    reviewItems: (studio.reviews || []).map((review) => ({
      studio_review_id: review.studio_review_id,
      reviewerName: review.reviewer_name || null,
      reviewerAvatarUrl: review.reviewer_avatar_url || null,
      rating: numberOrNull(review.rating),
      cleanlinessRating: numberOrNull(review.cleanliness_rating),
      communicationRating: numberOrNull(review.communication_rating),
      checkInRating: numberOrNull(review.check_in_rating),
      reviewText: review.review_text || null,
      reviewedAt: review.reviewed_at || null,
      metadata: parseJsonValue(review.metadata, {}),
    })),

    metadata,
    created_at: studio.created_at,
    updated_at: studio.updated_at,
  };
};

const formatStudioCatalogListItem = (studio) => ({
  studio_id: studio.studio_id,
  id: studio.id,
  slug: studio.slug,
  name: studio.name,
  status: 'Available',
  location: studio.address?.city && studio.address?.state
    ? [studio.address.city, studio.address.state, studio.address.country || 'USA'].filter(Boolean).join(', ')
    : studio.location,
  image: studio.image,
  priceLabel: studio.priceLabel,
  priceValue: studio.priceValue,
  rating: studio.rating,
  reviews: studio.reviews,
  propertyType: studio.poolType || studio.suggestedType || studio.spaceType,
  tags: (studio.bestFor || []).slice(0, 2),
  pricingMode: studio.pricingMode,
});

const buildStudioIncludes = () => [
  {
    model: studio_media,
    as: 'media',
    required: false,
    attributes: [
      'studio_media_id',
      'studio_id',
      'media_type',
      'url',
      'thumbnail_url',
      'title',
      'alt_text',
      'sort_order',
      'is_cover',
      'metadata',
    ],
  },
  {
    model: studio_operating_hours,
    as: 'operating_hours',
    required: false,
    attributes: [
      'studio_operating_hour_id',
      'studio_id',
      'day_of_week',
      'is_open',
      'opens_at',
      'closes_at',
      'metadata',
    ],
  },
  {
    model: studio_reviews,
    as: 'reviews',
    required: false,
    where: { is_active: 1 },
    attributes: [
      'studio_review_id',
      'studio_id',
      'reviewer_name',
      'reviewer_avatar_url',
      'rating',
      'cleanliness_rating',
      'communication_rating',
      'check_in_rating',
      'review_text',
      'reviewed_at',
      'metadata',
    ],
  },
];

exports.getPublicStudioCatalog = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '50', 10)));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const bookingFor = String(req.query.booking_for || req.query.bookingFor || '').trim().toLowerCase();

    const where = {
      is_active: 1,
      status: 'active',
    };

    if (search) {
      where[db.Sequelize.Op.or] = [
        { studio_name: { [db.Sequelize.Op.like]: `%${search}%` } },
        { brand_name: { [db.Sequelize.Op.like]: `%${search}%` } },
        { city: { [db.Sequelize.Op.like]: `%${search}%` } },
        { state: { [db.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await studios.findAndCountAll({
      where,
      include: buildStudioIncludes(),
      distinct: true,
      limit,
      offset,
      order: [
        ['created_at', 'DESC'],
        [{ model: studio_media, as: 'media' }, 'is_cover', 'DESC'],
        [{ model: studio_media, as: 'media' }, 'sort_order', 'ASC'],
      ],
    });

    let detailedData = rows.map(formatStudioCatalogItem);

    if (bookingFor) {
      detailedData = detailedData.filter((studio) => {
        const options = studio.pricingOptions || [];
        return options.some((option) =>
          String(option.key || '').toLowerCase() === bookingFor ||
          String(option.label || '').toLowerCase() === bookingFor
        );
      });
    }

    const data = detailedData.map(formatStudioCatalogListItem);

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasMore: page * limit < count,
      },
    });
  } catch (error) {
    console.error('Get public studio catalog error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch studio catalog',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.getPublicStudioBySlugOrId = async (req, res) => {
  try {
    const slugOrId = String(req.params.slugOrId || '').trim();
    const numericId = Number.parseInt(slugOrId, 10);
    const where = {
      is_active: 1,
      status: 'active',
      [db.Sequelize.Op.or]: [
        { slug: slugOrId },
      ],
    };

    if (Number.isInteger(numericId) && String(numericId) === slugOrId) {
      where[db.Sequelize.Op.or].push({ studio_id: numericId });
    }

    const studio = await studios.findOne({
      where,
      include: buildStudioIncludes(),
      order: [
        [{ model: studio_media, as: 'media' }, 'is_cover', 'DESC'],
        [{ model: studio_media, as: 'media' }, 'sort_order', 'ASC'],
      ],
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: 'Studio not found',
      });
    }

    return res.json({
      success: true,
      data: formatStudioCatalogItem(studio),
    });
  } catch (error) {
    console.error('Get public studio detail error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch studio details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
