const db = require('../models');

const {
    studios,
    studio_media,
    studio_operating_hours,
    studio_availability,
    studio_reviews,
    studio_bookings,
    stream_project_booking,
    users,
    sequelize,
} = db;

const multer = require('multer');
const path = require('path');
const { S3UploadFiles } = require('../utils/common');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(process.cwd(), process.env.FILEPATH_MEDIA));
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    },
});

const upload = multer({ storage });

const getRequestUserId = (req) => req.user?.userId || req.userId || null;

const slugify = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const nullable = (value) => {
    if (value === undefined || value === '') return null;
    return value;
};

const numberOrNull = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const boolValue = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
};

const asArray = (value) => Array.isArray(value) ? value : [];

const buildStudioPayload = (body, userId) => {
    const address = body.address || {};
    const pricing = body.pricing || {};
    const dimensions = body.dimensions || {};
    const host = body.host || {};

    const studioName = body.studio_name || body.studioName || body.name;

    return {
        owner_user_id: numberOrNull(body.owner_user_id),
        host_name: nullable(body.host_name || host.name),
        host_email: nullable(body.host_email || host.email),

        studio_name: studioName,
        brand_name: nullable(body.brand_name || body.brandName),
        slug: nullable(body.slug || `${slugify(studioName)}-${Date.now()}`),

        status: body.status || 'active',
        verification_status: body.verification_status || 'unverified',
        space_type: nullable(body.space_type || body.spaceType),
        description: nullable(body.description),
        short_description: nullable(body.short_description || body.shortDescription),

        country: nullable(body.country || address.country),
        address_line1: nullable(body.address_line1 || address.address_line1 || address.line1),
        address_line2: nullable(body.address_line2 || address.address_line2 || address.line2),
        city: nullable(body.city || address.city),
        state: nullable(body.state || address.state),
        zip_code: nullable(body.zip_code || body.zipCode || address.zip_code || address.zipCode),
        latitude: numberOrNull(body.latitude || address.latitude),
        longitude: numberOrNull(body.longitude || address.longitude),
        timezone: nullable(body.timezone || address.timezone),

        hourly_rate: numberOrNull(body.hourly_rate || body.hourlyRate || pricing.hourly_rate || pricing.hourlyRate),
        overtime_rate: numberOrNull(body.overtime_rate || body.overtimeRate || pricing.overtime_rate || pricing.overtimeRate),
        minimum_booking_hours: numberOrNull(body.minimum_booking_hours || body.minimumBookingHours || pricing.minimum_booking_hours || pricing.minimumBookingHours),
        buffer_time_minutes: numberOrNull(body.buffer_time_minutes || body.bufferTimeMinutes || pricing.buffer_time_minutes || pricing.bufferTimeMinutes),

        capacity_min: numberOrNull(body.capacity_min || body.capacityMin),
        capacity_max: numberOrNull(body.capacity_max || body.capacityMax),
        square_feet: numberOrNull(body.square_feet || body.squareFeet || dimensions.square_feet || dimensions.squareFeet),
        height: nullable(body.height || dimensions.height),
        width: nullable(body.width || dimensions.width),
        length: nullable(body.length || dimensions.length),
        main_floor_number: nullable(body.main_floor_number || body.mainFloorNumber || dimensions.main_floor_number || dimensions.mainFloorNumber),

        overnight_stays_allowed: boolValue(body.overnight_stays_allowed || body.overnightStaysAllowed),
        security_recording_enabled: boolValue(body.security_recording_enabled || body.securityRecordingEnabled),
        security_recording_description: nullable(body.security_recording_description || body.securityRecordingDescription),

        wifi_name: nullable(body.wifi_name || body.wifiName),
        wifi_password: nullable(body.wifi_password || body.wifiPassword),
        preferred_age: nullable(body.preferred_age || body.preferredAge),

        parking_options: body.parking_options || body.parkingOptions || null,
        access_features: body.access_features || body.accessFeatures || null,
        facility_features: body.facility_features || body.facilityFeatures || null,
        supported_shoot_types: body.supported_shoot_types || body.supportedShootTypes || null,
        suggested_type: nullable(body.suggested_type || body.suggestedType),
        activities: body.activities || null,
        space_basics: body.space_basics || body.spaceBasics || null,
        amenities: body.amenities || null,
        description_tags: body.description_tags || body.descriptionTags || null,
        house_rules: body.house_rules || body.houseRules || null,
        policies: body.policies || null,
        pricing_settings: body.pricing_settings || body.pricingSettings || null,
        metadata: body.metadata || null,

        created_by_user_id: userId,
        updated_by_user_id: userId,
        is_active: body.is_active === undefined ? 1 : boolValue(body.is_active, true),
    };
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const getFirstPresent = (body, keys) => {
  for (const key of keys) {
    if (hasOwn(body, key)) return body[key];
  }
  return undefined;
};

const setIfPresent = (payload, key, value, transform = (entry) => entry) => {
  if (value !== undefined) {
    payload[key] = transform(value);
  }
};

const buildStudioUpdatePayload = (body = {}, userId = null) => {
  const payload = {};
  const address = body.address || {};
  const pricing = body.pricing || {};
  const dimensions = body.dimensions || {};
  const host = body.host || {};

  setIfPresent(payload, 'owner_user_id', getFirstPresent(body, ['owner_user_id']), numberOrNull);
  setIfPresent(payload, 'host_name', hasOwn(body, 'host_name') ? body.host_name : host.name, nullable);
  setIfPresent(payload, 'host_email', hasOwn(body, 'host_email') ? body.host_email : host.email, nullable);

  setIfPresent(payload, 'studio_name', getFirstPresent(body, ['studio_name', 'studioName', 'name']), nullable);
  setIfPresent(payload, 'brand_name', getFirstPresent(body, ['brand_name', 'brandName']), nullable);
  setIfPresent(payload, 'slug', getFirstPresent(body, ['slug']), nullable);

  setIfPresent(payload, 'status', getFirstPresent(body, ['status']));
  setIfPresent(payload, 'verification_status', getFirstPresent(body, ['verification_status']));
  setIfPresent(payload, 'space_type', getFirstPresent(body, ['space_type', 'spaceType']), nullable);
  setIfPresent(payload, 'description', getFirstPresent(body, ['description']), nullable);
  setIfPresent(payload, 'short_description', getFirstPresent(body, ['short_description', 'shortDescription']), nullable);

  setIfPresent(payload, 'country', hasOwn(body, 'country') ? body.country : address.country, nullable);
  setIfPresent(payload, 'address_line1', hasOwn(body, 'address_line1') ? body.address_line1 : (address.address_line1 ?? address.line1), nullable);
  setIfPresent(payload, 'address_line2', hasOwn(body, 'address_line2') ? body.address_line2 : (address.address_line2 ?? address.line2), nullable);
  setIfPresent(payload, 'city', hasOwn(body, 'city') ? body.city : address.city, nullable);
  setIfPresent(payload, 'state', hasOwn(body, 'state') ? body.state : address.state, nullable);
  setIfPresent(payload, 'zip_code', getFirstPresent(body, ['zip_code', 'zipCode']) ?? address.zip_code ?? address.zipCode, nullable);
  setIfPresent(payload, 'latitude', hasOwn(body, 'latitude') ? body.latitude : address.latitude, numberOrNull);
  setIfPresent(payload, 'longitude', hasOwn(body, 'longitude') ? body.longitude : address.longitude, numberOrNull);
  setIfPresent(payload, 'timezone', hasOwn(body, 'timezone') ? body.timezone : address.timezone, nullable);

  setIfPresent(payload, 'hourly_rate', getFirstPresent(body, ['hourly_rate', 'hourlyRate']) ?? pricing.hourly_rate ?? pricing.hourlyRate, numberOrNull);
  setIfPresent(payload, 'overtime_rate', getFirstPresent(body, ['overtime_rate', 'overtimeRate']) ?? pricing.overtime_rate ?? pricing.overtimeRate, numberOrNull);
  setIfPresent(payload, 'minimum_booking_hours', getFirstPresent(body, ['minimum_booking_hours', 'minimumBookingHours']) ?? pricing.minimum_booking_hours ?? pricing.minimumBookingHours, numberOrNull);
  setIfPresent(payload, 'buffer_time_minutes', getFirstPresent(body, ['buffer_time_minutes', 'bufferTimeMinutes']) ?? pricing.buffer_time_minutes ?? pricing.bufferTimeMinutes, numberOrNull);

  setIfPresent(payload, 'capacity_min', getFirstPresent(body, ['capacity_min', 'capacityMin']), numberOrNull);
  setIfPresent(payload, 'capacity_max', getFirstPresent(body, ['capacity_max', 'capacityMax']), numberOrNull);
  setIfPresent(payload, 'square_feet', getFirstPresent(body, ['square_feet', 'squareFeet']) ?? dimensions.square_feet ?? dimensions.squareFeet, numberOrNull);
  setIfPresent(payload, 'height', hasOwn(body, 'height') ? body.height : dimensions.height, nullable);
  setIfPresent(payload, 'width', hasOwn(body, 'width') ? body.width : dimensions.width, nullable);
  setIfPresent(payload, 'length', hasOwn(body, 'length') ? body.length : dimensions.length, nullable);
  setIfPresent(payload, 'main_floor_number', getFirstPresent(body, ['main_floor_number', 'mainFloorNumber']) ?? dimensions.main_floor_number ?? dimensions.mainFloorNumber, nullable);

  setIfPresent(payload, 'overnight_stays_allowed', getFirstPresent(body, ['overnight_stays_allowed', 'overnightStaysAllowed']), boolValue);
  setIfPresent(payload, 'security_recording_enabled', getFirstPresent(body, ['security_recording_enabled', 'securityRecordingEnabled']), boolValue);
  setIfPresent(payload, 'security_recording_description', getFirstPresent(body, ['security_recording_description', 'securityRecordingDescription']), nullable);

  setIfPresent(payload, 'wifi_name', getFirstPresent(body, ['wifi_name', 'wifiName']), nullable);
  setIfPresent(payload, 'wifi_password', getFirstPresent(body, ['wifi_password', 'wifiPassword']), nullable);
  setIfPresent(payload, 'preferred_age', getFirstPresent(body, ['preferred_age', 'preferredAge']), nullable);

  setIfPresent(payload, 'parking_options', getFirstPresent(body, ['parking_options', 'parkingOptions']));
  setIfPresent(payload, 'access_features', getFirstPresent(body, ['access_features', 'accessFeatures']));
  setIfPresent(payload, 'facility_features', getFirstPresent(body, ['facility_features', 'facilityFeatures']));
  setIfPresent(payload, 'supported_shoot_types', getFirstPresent(body, ['supported_shoot_types', 'supportedShootTypes']));
  setIfPresent(payload, 'activities', getFirstPresent(body, ['activities']));
  setIfPresent(payload, 'space_basics', getFirstPresent(body, ['space_basics', 'spaceBasics']));
  setIfPresent(payload, 'amenities', getFirstPresent(body, ['amenities']));
  setIfPresent(payload, 'description_tags', getFirstPresent(body, ['description_tags', 'descriptionTags']));
  setIfPresent(payload, 'house_rules', getFirstPresent(body, ['house_rules', 'houseRules']));
  setIfPresent(payload, 'policies', getFirstPresent(body, ['policies']));
  setIfPresent(payload, 'pricing_settings', getFirstPresent(body, ['pricing_settings', 'pricingSettings']));
  setIfPresent(payload, 'metadata', getFirstPresent(body, ['metadata']));

  if (hasOwn(body, 'is_active')) {
    payload.is_active = boolValue(body.is_active, true);
  }

  payload.updated_by_user_id = userId;

  return payload;
};

const STUDIO_REQUEST_STATUS_LABELS = {
  requested: 'Pending',
  confirmed: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

const normalizeStudioRequestStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  const statusMap = {
    pending: 'requested',
    requested: 'requested',
    approve: 'confirmed',
    approved: 'confirmed',
    confirmed: 'confirmed',
    complete: 'completed',
    completed: 'completed',
    cancel: 'cancelled',
    cancelled: 'cancelled',
    decline: 'rejected',
    declined: 'rejected',
    reject: 'rejected',
    rejected: 'rejected',
  };

  return statusMap[normalized] || null;
};

const formatStudioRequest = (request) => {
  const row = request.get ? request.get({ plain: true }) : request;
  const studio = row.studio || {};
  const booking = row.booking || {};
  const user = row.user || booking.user || {};

  const requestDate = row.booking_date || booking.event_date || null;
  const locationParts = [studio.city, studio.state].filter(Boolean);

  return {
    studio_booking_id: row.studio_booking_id,
    stream_project_booking_id: row.stream_project_booking_id,
    studio_id: row.studio_id,
    user_id: row.user_id,

    host_name: user.name || studio.host_name || null,
    host_email: user.email || studio.host_email || booking.guest_email || null,
    host_phone_number: user.phone_number || null,

    studio_host_name: studio.host_name || null,
    studio_host_email: studio.host_email || null,

    space_name: studio.studio_name || null,
    studio_name: studio.studio_name || null,
    space_type: studio.space_type || null,
    location: locationParts.length ? locationParts.join(', ') : booking.event_location || null,

    capacity_min: studio.capacity_min,
    capacity_max: studio.capacity_max,
    capacity_label: studio.capacity_min && studio.capacity_max
      ? `${studio.capacity_min} - ${studio.capacity_max} ppl`
      : null,

    request_date: requestDate,
    booking_date: row.booking_date,
    start_time: row.start_time || booking.start_time || null,
    end_time: row.end_time || booking.end_time || null,
    duration_hours: row.duration_hours || booking.duration_hours || null,

    status: row.status,
    status_label: STUDIO_REQUEST_STATUS_LABELS[row.status] || row.status,

    project: {
      project_name: booking.project_name || null,
      description: booking.description || null,
      event_type: booking.event_type || null,
      shoot_type: booking.shoot_type || null,
      content_type: booking.content_type || null,
      event_date: booking.event_date || null,
      event_location: booking.event_location || null,
      budget: booking.budget || null,
    },

    pricing: {
      base_amount: row.base_amount,
      overtime_amount: row.overtime_amount,
      platform_fee: row.platform_fee,
      net_amount: row.net_amount,
    },

    source: row.source,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

exports.createStudio = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const userId = getRequestUserId(req);
        const studioPayload = buildStudioPayload(req.body, userId);

        if (!studioPayload.studio_name) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'studio_name is required',
            });
        }

        const studio = await studios.create(studioPayload, { transaction });
        const studioId = studio.studio_id;

        const mediaRows = asArray(req.body.media).map((item, index) => ({
            studio_id: studioId,
            media_type: item.media_type || item.mediaType || 'image',
            url: item.url,
            thumbnail_url: item.thumbnail_url || item.thumbnailUrl || null,
            title: item.title || null,
            alt_text: item.alt_text || item.altText || null,
            sort_order: item.sort_order ?? item.sortOrder ?? index,
            is_cover: boolValue(item.is_cover ?? item.isCover, index === 0),
            metadata: item.metadata || null,
        })).filter((item) => item.url);

        if (mediaRows.length) {
            await studio_media.bulkCreate(mediaRows, { transaction });
        }

        const operatingHourRows = asArray(req.body.operating_hours || req.body.operatingHours).map((item) => ({
            studio_id: studioId,
            day_of_week: Number(item.day_of_week ?? item.dayOfWeek),
            is_open: boolValue(item.is_open ?? item.isOpen, true),
            opens_at: item.opens_at || item.opensAt || null,
            closes_at: item.closes_at || item.closesAt || null,
            metadata: item.metadata || null,
        })).filter((item) => Number.isInteger(item.day_of_week) && item.day_of_week >= 0 && item.day_of_week <= 6);

        if (operatingHourRows.length) {
            await studio_operating_hours.bulkCreate(operatingHourRows, { transaction });
        }

        const availabilityRows = asArray(req.body.availability).map((item) => ({
            studio_id: studioId,
            availability_date: item.availability_date || item.date,
            start_time: item.start_time || item.startTime || null,
            end_time: item.end_time || item.endTime || null,
            status: item.status || 'available',
            notes: item.notes || null,
            metadata: item.metadata || null,
            created_by_user_id: userId,
        })).filter((item) => item.availability_date);

        if (availabilityRows.length) {
            await studio_availability.bulkCreate(availabilityRows, { transaction });
        }

        await transaction.commit();

        const createdStudio = await studios.findByPk(studioId, {
            include: [
                { model: studio_media, as: 'media' },
                { model: studio_operating_hours, as: 'operating_hours' },
                { model: studio_availability, as: 'availability' },
            ],
        });

        return res.status(201).json({
            success: true,
            message: 'Studio created successfully',
            data: createdStudio,
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Create studio error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to create studio',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

exports.uploadStudioMedia = [
    upload.fields([{ name: 'studio_media', maxCount: 20 }]),

    async (req, res) => {
        try {
            const uploadedFiles = await S3UploadFiles(req.files);

            const media = (uploadedFiles || [])
                .filter((file) => file.file_type === 'studio_media')
                .map((file, index) => ({
                    media_type: /\.(mp4|mov|avi|webm)$/i.test(file.file_path) ? 'video' : 'image',
                    url: file.file_path,
                    thumbnail_url: null,
                    sort_order: index,
                    is_cover: index === 0,
                }));

            return res.status(200).json({
                success: true,
                message: 'Studio media uploaded successfully',
                data: media,
            });
        } catch (error) {
            console.error('Upload studio media error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to upload studio media',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            });
        }
    }
];

exports.getStudioById = async (req, res) => {
    try {
        const studioId = Number(req.params.studioId);

        if (!Number.isInteger(studioId) || studioId <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid studioId is required',
            });
        }

        const studio = await studios.findOne({
            where: {
                studio_id: studioId,
                is_active: 1,
            },
            include: [
                {
                    model: studio_media,
                    as: 'media',
                    required: false,
                    separate: true,
                    order: [['sort_order', 'ASC'], ['studio_media_id', 'ASC']],
                },
                {
                    model: studio_operating_hours,
                    as: 'operating_hours',
                    required: false,
                    separate: true,
                    order: [['day_of_week', 'ASC']],
                },
                {
                    model: studio_availability,
                    as: 'availability',
                    required: false,
                    separate: true,
                    order: [['availability_date', 'ASC'], ['start_time', 'ASC']],
                },
                {
                    model: studio_reviews,
                    as: 'reviews',
                    required: false,
                    where: { is_active: 1 },
                    separate: true,
                    order: [['reviewed_at', 'DESC'], ['studio_review_id', 'DESC']],
                }
            ],
        });

        const plainStudio = studio.get({ plain: true });
        const reviews = plainStudio.reviews || [];

        const avg = (field) => {
            const values = reviews
                .map((review) => Number(review[field]))
                .filter((value) => Number.isFinite(value));

            if (!values.length) return null;

            return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
        };

        plainStudio.review_summary = {
            total_reviews: reviews.length,
            average_rating: avg('rating'),
            cleanliness_rating: avg('cleanliness_rating'),
            communication_rating: avg('communication_rating'),
            check_in_rating: avg('check_in_rating'),
        };


        if (!studio) {
            return res.status(404).json({
                success: false,
                message: 'Studio not found',
            });
        }

        return res.status(200).json({
            success: true,
            data: plainStudio,
        });
    } catch (error) {
        console.error('Get studio by id error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch studio',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

exports.createStudioReview = async (req, res) => {
  try {
    const studioId = Number(req.params.studioId);

    if (!Number.isInteger(studioId) || studioId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid studioId is required',
      });
    }

    const studio = await studios.findOne({
      where: { studio_id: studioId, is_active: 1 },
    });

    if (!studio) {
      return res.status(404).json({
        success: false,
        message: 'Studio not found',
      });
    }

    const review = await studio_reviews.create({
      studio_id: studioId,
      reviewer_user_id: req.body.reviewer_user_id || null,
      reviewer_name: req.body.reviewer_name || null,
      reviewer_avatar_url: req.body.reviewer_avatar_url || null,
      rating: req.body.rating || 5,
      cleanliness_rating: req.body.cleanliness_rating || null,
      communication_rating: req.body.communication_rating || null,
      check_in_rating: req.body.check_in_rating || null,
      review_text: req.body.review_text || null,
      reviewed_at: req.body.reviewed_at || null,
      metadata: req.body.metadata || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Studio review created successfully',
      data: review,
    });
  } catch (error) {
    console.error('Create studio review error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create studio review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.getStudios = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();

    const where = { is_active: 1 };

    if (status && status !== 'all') {
      where.status = status;
    }

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
      attributes: [
        'studio_id',
        'studio_name',
        'status',
        'hourly_rate',
        'overtime_rate',
        'minimum_booking_hours',
        'buffer_time_minutes',
        'supported_shoot_types',
        'created_at',
      ],
      limit,
      offset,
      distinct: true,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: studio_media,
          as: 'media',
          required: false,
          separate: true,
          attributes: [
            'studio_media_id',
            'media_type',
            'url',
            'thumbnail_url',
            'sort_order',
            'is_cover',
          ],
          limit: 4,
          order: [
            ['is_cover', 'DESC'],
            ['sort_order', 'ASC'],
            ['studio_media_id', 'ASC'],
          ],
        },
      ],
    });

    const data = rows.map((row) => {
      const studio = row.get({ plain: true });
      const media = studio.media || [];
      const cover = media.find((item) => item.is_cover) || media[0] || null;

      return {
        studio_id: studio.studio_id,
        studio_name: studio.studio_name,
        status: studio.status,
        hourly_rate: studio.hourly_rate,
        overtime_rate: studio.overtime_rate,
        minimum_booking_hours: studio.minimum_booking_hours,
        buffer_time_minutes: studio.buffer_time_minutes,
        supported_shoot_types: studio.supported_shoot_types || [],
        cover_media: cover,
        gallery_preview: media,
      };
    });

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page * limit < count,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    console.error('Get studios error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch studios',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.updateStudio = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const studioId = Number(req.params.studioId);

    if (!Number.isInteger(studioId) || studioId <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Valid studioId is required',
      });
    }

    const existingStudio = await studios.findOne({
      where: {
        studio_id: studioId,
        is_active: 1,
      },
      transaction,
    });

    if (!existingStudio) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Studio not found',
      });
    }

    const userId = getRequestUserId(req);
    const studioPayload = buildStudioUpdatePayload(req.body || {}, userId);

    const hasStudioChanges = Object.keys(studioPayload).some(
    (key) => key !== 'updated_by_user_id'
    );

    if (hasStudioChanges) {
        await existingStudio.update(studioPayload, { transaction });
    }

    if (Array.isArray(req.body?.media)) {
      await studio_media.destroy({
        where: { studio_id: studioId },
        transaction,
      });

      const mediaRows = req.body.media
        .map((item, index) => ({
          studio_id: studioId,
          media_type: item.media_type || item.mediaType || 'image',
          url: item.url,
          thumbnail_url: item.thumbnail_url || item.thumbnailUrl || null,
          title: item.title || null,
          alt_text: item.alt_text || item.altText || null,
          sort_order: item.sort_order ?? item.sortOrder ?? index,
          is_cover: boolValue(item.is_cover ?? item.isCover, index === 0),
          metadata: item.metadata || null,
        }))
        .filter((item) => item.url);

      if (mediaRows.length) {
        await studio_media.bulkCreate(mediaRows, { transaction });
      }
    }

    if (Array.isArray(req.body?.operating_hours || req.body?.operatingHours)) {
      await studio_operating_hours.destroy({
        where: { studio_id: studioId },
        transaction,
      });

      const operatingHourRows = asArray(req.body.operating_hours || req.body.operatingHours)
        .map((item) => ({
          studio_id: studioId,
          day_of_week: Number(item.day_of_week ?? item.dayOfWeek),
          is_open: boolValue(item.is_open ?? item.isOpen, true),
          opens_at: item.opens_at || item.opensAt || null,
          closes_at: item.closes_at || item.closesAt || null,
          metadata: item.metadata || null,
        }))
        .filter((item) => Number.isInteger(item.day_of_week) && item.day_of_week >= 0 && item.day_of_week <= 6);

      if (operatingHourRows.length) {
        await studio_operating_hours.bulkCreate(operatingHourRows, { transaction });
      }
    }

    await transaction.commit();

    const updatedStudio = await studios.findByPk(studioId, {
      include: [
        { model: studio_media, as: 'media' },
        { model: studio_operating_hours, as: 'operating_hours' },
        { model: studio_availability, as: 'availability' },
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'Studio updated successfully',
      data: updatedStudio,
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Update studio error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update studio',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.getStudioDashboard = async (req, res) => {
  try {
    const studioId = req.query.studio_id ? Number(req.query.studio_id) : null;
    const month = String(req.query.month || '').trim(); // YYYY-MM

    const where = {};

    if (studioId) {
      where.studio_id = studioId;
    }

    if (month) {
      const [year, monthNumber] = month.split('-').map(Number);

      if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
        return res.status(400).json({
          success: false,
          message: 'month must be in YYYY-MM format',
        });
      }

      const startDate = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
      const end = new Date(year, monthNumber, 0);
      const endDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

      where.booking_date = {
        [db.Sequelize.Op.between]: [startDate, endDate],
      };
    }

    const bookings = await studio_bookings.findAll({
      where,
      order: [['booking_date', 'ASC'], ['start_time', 'ASC']],
      include: [
        {
          model: studios,
          as: 'studio',
          required: false,
          attributes: ['studio_id', 'studio_name', 'hourly_rate'],
        },
      ],
    });

    const plainBookings = bookings.map((booking) => booking.get({ plain: true }));

    const money = (value) => Number(value || 0);

    const totalBookings = plainBookings.length;
    const totalRevenue = plainBookings.reduce(
      (sum, booking) => sum + money(booking.base_amount) + money(booking.overtime_amount),
      0
    );
    const overtimeRevenue = plainBookings.reduce(
      (sum, booking) => sum + money(booking.overtime_amount),
      0
    );
    const netEarnings = plainBookings.reduce(
      (sum, booking) => sum + money(booking.net_amount),
      0
    );
    const platformFees = plainBookings.reduce(
      (sum, booking) => sum + money(booking.platform_fee),
      0
    );

    const averageBookingValue = totalBookings
      ? Number((totalRevenue / totalBookings).toFixed(2))
      : 0;

    const chartMap = {};

    for (const booking of plainBookings) {
      const key = booking.booking_date
        ? String(booking.booking_date).slice(0, 7)
        : 'unknown';

      if (!chartMap[key]) {
        chartMap[key] = {
          period: key,
          total_revenue: 0,
          net_earnings: 0,
          bookings: 0,
        };
      }

      chartMap[key].total_revenue += money(booking.base_amount) + money(booking.overtime_amount);
      chartMap[key].net_earnings += money(booking.net_amount);
      chartMap[key].bookings += 1;
    }

    const formatBooking = (booking) => ({
      studio_booking_id: booking.studio_booking_id,
      studio_id: booking.studio_id,
      studio_name: booking.studio?.studio_name || null,
      stream_project_booking_id: booking.stream_project_booking_id,
      user_id: booking.user_id,
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      duration_hours: booking.duration_hours,
      status: booking.status,
      base_amount: booking.base_amount,
      overtime_amount: booking.overtime_amount,
      platform_fee: booking.platform_fee,
      net_amount: booking.net_amount,
      source: booking.source,
      metadata: booking.metadata,
    });

    const upcoming = plainBookings
      .filter((booking) => ['requested', 'confirmed'].includes(booking.status))
      .map(formatBooking);

    const completed = plainBookings
      .filter((booking) => booking.status === 'completed')
      .map(formatBooking);

    const cancelled = plainBookings
      .filter((booking) => ['cancelled', 'rejected'].includes(booking.status))
      .map(formatBooking);

    const earningsLedger = plainBookings.map((booking) => ({
      studio_booking_id: booking.studio_booking_id,
      date: booking.booking_date,
      studio_name: booking.studio?.studio_name || null,
      hours: booking.duration_hours,
      base_revenue: booking.base_amount,
      overtime: booking.overtime_amount,
      platform_fee: booking.platform_fee,
      net_earnings: booking.net_amount,
      status: booking.status,
    }));

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          total_revenue: Number(totalRevenue.toFixed(2)),
          total_bookings: totalBookings,
          average_booking_value: averageBookingValue,
          overtime_revenue: Number(overtimeRevenue.toFixed(2)),
          platform_fees: Number(platformFees.toFixed(2)),
          net_earnings: Number(netEarnings.toFixed(2)),
        },
        chart: Object.values(chartMap),
        bookings: {
          upcoming,
          completed,
          cancelled,
        },
        earnings_ledger: earningsLedger,
      },
    });
  } catch (error) {
    console.error('Get studio dashboard error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch studio dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

exports.getStudioRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      studio_id,
      month,
      year,
      source = 'book_a_shoot',
      sort_by = 'created_at',
      sort_order = 'DESC',
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const offset = (pageNumber - 1) * pageSize;

    const where = {};

    if (source !== 'all') {
      where.source = source;
    }

    if (status && status !== 'all') {
      const normalizedStatus = normalizeStudioRequestStatus(status);
      if (normalizedStatus) {
        where.status = normalizedStatus;
      }
    }

    if (studio_id) {
      where.studio_id = Number(studio_id);
    }

    if (month && year) {
      const monthNumber = String(month).padStart(2, '0');
      const startDate = `${year}-${monthNumber}-01`;
      const endDate = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10);

      where[db.Sequelize.Op.or] = [
        {
          booking_date: {
            [db.Sequelize.Op.between]: [startDate, endDate],
          },
        },
        {
          '$booking.event_date$': {
            [db.Sequelize.Op.between]: [startDate, endDate],
          },
        },
      ];
    }

    if (search) {
      const like = `%${search}%`;

      where[db.Sequelize.Op.and] = [
        ...(where[db.Sequelize.Op.and] || []),
        {
          [db.Sequelize.Op.or]: [
            { '$studio.studio_name$': { [db.Sequelize.Op.like]: like } },
            { '$studio.city$': { [db.Sequelize.Op.like]: like } },
            { '$studio.state$': { [db.Sequelize.Op.like]: like } },
            { '$booking.project_name$': { [db.Sequelize.Op.like]: like } },
            { '$booking.event_location$': { [db.Sequelize.Op.like]: like } },
            { '$user.name$': { [db.Sequelize.Op.like]: like } },
            { '$user.email$': { [db.Sequelize.Op.like]: like } },
          ],
        },
      ];
    }

    const allowedSortColumns = {
      created_at: ['created_at'],
      updated_at: ['updated_at'],
      booking_date: ['booking_date'],
      status: ['status'],
    };

    const orderColumn = allowedSortColumns[sort_by] || allowedSortColumns.created_at;
    const orderDirection = String(sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows, count } = await studio_bookings.findAndCountAll({
      where,
      limit: pageSize,
      offset,
      distinct: true,
      subQuery: false,
      order: [[...orderColumn, orderDirection]],
      include: [
        {
          model: studios,
          as: 'studio',
          required: true,
          attributes: [
            'studio_id',
            'studio_name',
            'host_name',
            'host_email',
            'space_type',
            'city',
            'state',
            'capacity_min',
            'capacity_max',
            'hourly_rate',
          ],
        },
        {
          model: stream_project_booking,
          as: 'booking',
          required: false,
          attributes: [
            'stream_project_booking_id',
            'user_id',
            'guest_email',
            'project_name',
            'description',
            'event_type',
            'shoot_type',
            'content_type',
            'event_date',
            'duration_hours',
            'start_time',
            'end_time',
            'budget',
            'event_location',
            'status',
            'created_at',
          ],
        },
        {
          model: users,
          as: 'user',
          required: false,
          attributes: ['id', 'name', 'email', 'phone_number'],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'Studio requests fetched successfully',
      data: rows.map(formatStudioRequest),
      pagination: {
        total: count,
        page: pageNumber,
        limit: pageSize,
        total_pages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    console.error('Get studio requests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch studio requests',
      error: error.message,
    });
  }
};

exports.getStudioRequestById = async (req, res) => {
  try {
    const studioBookingId = Number(req.params.studioBookingId);

    if (!Number.isInteger(studioBookingId) || studioBookingId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid studioBookingId is required',
      });
    }

    const request = await studio_bookings.findByPk(studioBookingId, {
      include: [
        { model: studios, as: 'studio' },
        { model: stream_project_booking, as: 'booking' },
        {
          model: users,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone_number'],
        },
      ],
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Studio request not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Studio request fetched successfully',
      data: formatStudioRequest(request),
    });
  } catch (error) {
    console.error('Get studio request by id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch studio request',
      error: error.message,
    });
  }
};

exports.updateStudioRequestStatus = async (req, res) => {
  try {
    const studioBookingId = Number(req.params.studioBookingId);
    const nextStatus = normalizeStudioRequestStatus(req.body.status || req.body.action);

    if (!Number.isInteger(studioBookingId) || studioBookingId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid studioBookingId is required',
      });
    }

    if (!nextStatus) {
      return res.status(400).json({
        success: false,
        message: 'Valid status/action is required. Use approve, decline, requested, confirmed, completed, cancelled, or rejected.',
      });
    }

    const request = await studio_bookings.findByPk(studioBookingId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Studio request not found',
      });
    }

    await request.update({
      status: nextStatus,
      metadata: {
        ...(request.metadata || {}),
        status_note: req.body.note || null,
        status_updated_at: new Date(),
        status_updated_by_user_id: getRequestUserId(req),
      },
    });

    const updatedRequest = await studio_bookings.findByPk(studioBookingId, {
      include: [
        { model: studios, as: 'studio' },
        { model: stream_project_booking, as: 'booking' },
        {
          model: users,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone_number'],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      message: 'Studio request status updated successfully',
      data: formatStudioRequest(updatedRequest),
    });
  } catch (error) {
    console.error('Update studio request status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update studio request status',
      error: error.message,
    });
  }
};
