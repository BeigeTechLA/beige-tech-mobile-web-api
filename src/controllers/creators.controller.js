const { crew_members, crew_member_files, crew_roles } = require('../models');
const { Op } = require('sequelize');
const { parseLocation, filterByProximity, formatLocationResponse } = require('../utils/locationHelpers');

/**
 * Search creators with filters
 * GET /api/creators/search
 * Query params: budget, location, skills, content_type, maxDistance, page, limit
 * Location can be:
 * - Plain string: "Los Angeles, CA"
 * - Mapbox JSON: {"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}
 * maxDistance: Optional distance in miles for proximity search (requires lat/lng in location)
 */
exports.searchCreators = async (req, res) => {
  try {
    const {
      budget,
      location,
      skills,
      content_type,
      maxDistance,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Parse location to determine if we have coordinates for proximity search
    let parsedLocation = null;
    let useProximitySearch = false;

    if (location) {
      parsedLocation = parseLocation(location);
      useProximitySearch = Boolean(
        parsedLocation &&
        parsedLocation.lat &&
        parsedLocation.lng &&
        maxDistance
      );
    }

    // Build dynamic where clause
    const whereClause = {
      is_active: 1,
      is_draft: 0
    };

    // Budget filter (hourly_rate)
    if (budget) {
      const budgetValue = parseFloat(budget);
      whereClause.hourly_rate = {
        [Op.lte]: budgetValue
      };
    }

    // Location filter - use text search if no coordinates or no maxDistance
    if (location && !useProximitySearch && parsedLocation) {
      whereClause.location = {
        [Op.like]: `%${parsedLocation.address || location}%`
      };
    }

    // Skills filter (TEXT field stored as JSON or comma-separated)
    if (skills) {
      whereClause.skills = {
        [Op.like]: `%${skills}%`
      };
    }

    // Content type filter via primary_role
    if (content_type) {
      // If content_type is passed as role_id, use it directly
      if (!isNaN(content_type)) {
        whereClause.primary_role = parseInt(content_type);
      }
    }

    // Execute search query
    // If using proximity search, fetch without pagination first, then filter by distance
    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_files_id', 'file_type', 'file_path'],
          required: false
        }
      ],
      attributes: [
        'crew_member_id',
        'first_name',
        'last_name',
        'primary_role',
        'hourly_rate',
        'rating',
        'location',
        'years_of_experience',
        'bio',
        'skills',
        'is_available',
        'created_at'  // Required for ORDER BY in subquery
      ],
      order: [
        ['rating', 'DESC'],
        ['created_at', 'DESC']
      ]
    };

    // Only apply limit/offset if NOT using proximity search (we'll paginate after filtering)
    if (!useProximitySearch) {
      queryOptions.limit = parseInt(limit);
      queryOptions.offset = offset;
    }

    const { count: totalCount, rows: creators } = await crew_members.findAndCountAll(queryOptions);

    // Transform data to match expected creator structure
    let transformedCreators = creators.map(creator => {
      const creatorData = creator.toJSON();

      // Get profile image (prefer 'profile_image' type, fallback to first image)
      const profileImage = creatorData.crew_member_files?.find(f => f.file_type === 'profile_image')
        || creatorData.crew_member_files?.find(f => f.file_type.includes('image'))
        || null;

      // Map role ID to role name
      const roleMap = {
        1: 'Videographer',
        2: 'Photographer',
        3: 'Editor',
        4: 'Producer',
        5: 'Director'
      };

      return {
        crew_member_id: creatorData.crew_member_id,
        name: `${creatorData.first_name} ${creatorData.last_name}`,
        role_id: creatorData.primary_role,
        role_name: roleMap[creatorData.primary_role] || 'Creative Professional',
        hourly_rate: parseFloat(creatorData.hourly_rate || 0),
        rating: parseFloat(creatorData.rating || 0),
        total_reviews: 0, // TODO: Calculate from reviews table when implemented
        profile_image: profileImage ? profileImage.file_path : null,
        location: creatorData.location,
        experience_years: creatorData.years_of_experience,
        bio: creatorData.bio,
        skills: creatorData.skills,
        is_available: creatorData.is_available === 1
      };
    });

    // Apply proximity filtering if coordinates provided
    let finalCount = totalCount;
    if (useProximitySearch) {
      transformedCreators = filterByProximity(
        transformedCreators,
        parsedLocation,
        parseFloat(maxDistance),
        'location'
      );

      finalCount = transformedCreators.length;

      // Manual pagination after filtering
      transformedCreators = transformedCreators.slice(offset, offset + parseInt(limit));
    }

    res.json({
      success: true,
      data: {
        data: transformedCreators, // Array of creators
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: finalCount,
          totalPages: Math.ceil(finalCount / parseInt(limit)),
          hasMore: parseInt(page) < Math.ceil(finalCount / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error searching creators:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search creators',
      error: error.message
    });
  }
};

/**
 * Get full creator profile
 * GET /api/creators/:id
 */
exports.getCreatorProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const creator = await crew_members.findOne({
      where: {
        crew_member_id: id,
        is_active: 1
      },
      include: [
        {
          model: crew_member_files,
          as: 'crew_member_files',
          attributes: ['crew_files_id', 'file_type', 'file_path', 'created_at'],
          required: false
        }
      ]
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    const creatorData = creator.toJSON();

    // Get profile image
    const profileImage = creatorData.crew_member_files?.find(f => f.file_type === 'profile_image')
      || creatorData.crew_member_files?.find(f => f.file_type.includes('image'))
      || null;

    // Parse skills and certifications if stored as JSON strings
    let parsedSkills = creatorData.skills;
    let parsedCertifications = creatorData.certifications;
    let parsedEquipment = creatorData.equipment_ownership;
    let parsedSocialMedia = creatorData.social_media_links;

    try {
      if (creatorData.skills && typeof creatorData.skills === 'string') {
        parsedSkills = JSON.parse(creatorData.skills);
      }
    } catch (e) {
      parsedSkills = creatorData.skills;
    }

    try {
      if (creatorData.certifications && typeof creatorData.certifications === 'string') {
        parsedCertifications = JSON.parse(creatorData.certifications);
      }
    } catch (e) {
      parsedCertifications = creatorData.certifications;
    }

    try {
      if (creatorData.equipment_ownership && typeof creatorData.equipment_ownership === 'string') {
        parsedEquipment = JSON.parse(creatorData.equipment_ownership);
      }
    } catch (e) {
      parsedEquipment = creatorData.equipment_ownership;
    }

    try {
      if (creatorData.social_media_links && typeof creatorData.social_media_links === 'string') {
        parsedSocialMedia = JSON.parse(creatorData.social_media_links);
      }
    } catch (e) {
      parsedSocialMedia = creatorData.social_media_links;
    }

    const profile = {
      id: creatorData.crew_member_id,
      name: `${creatorData.first_name} ${creatorData.last_name}`,
      firstName: creatorData.first_name,
      lastName: creatorData.last_name,
      email: creatorData.email,
      phone: creatorData.phone_number,
      role: creatorData.primary_role,
      price: parseFloat(creatorData.hourly_rate || 0),
      rating: parseFloat(creatorData.rating || 0),
      image: profileImage ? profileImage.file_path : null,
      location: formatLocationResponse(creatorData.location),
      workingDistance: creatorData.working_distance,
      experience: creatorData.years_of_experience,
      bio: creatorData.bio,
      availability: creatorData.availability,
      skills: parsedSkills,
      certifications: parsedCertifications,
      equipment: parsedEquipment,
      socialMedia: parsedSocialMedia,
      isBeigeMember: creatorData.is_beige_member === 1,
      isAvailable: creatorData.is_available === 1
    };

    res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    console.error('Error fetching creator profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch creator profile',
      error: error.message
    });
  }
};

/**
 * Get creator portfolio
 * GET /api/creators/:id/portfolio
 */
exports.getCreatorPortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Verify creator exists
    const creator = await crew_members.findOne({
      where: {
        crew_member_id: id,
        is_active: 1
      },
      attributes: ['crew_member_id', 'first_name', 'last_name']
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // Fetch portfolio files
    const { count, rows: portfolioFiles } = await crew_member_files.findAndCountAll({
      where: {
        crew_member_id: id,
        file_type: {
          [Op.in]: ['portfolio', 'recent_work', 'work_sample']
        }
      },
      attributes: ['crew_files_id', 'file_type', 'file_path', 'created_at'],
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    const portfolio = portfolioFiles.map(file => ({
      id: file.crew_files_id,
      type: file.file_type,
      url: file.file_path,
      createdAt: file.created_at
    }));

    res.json({
      success: true,
      data: {
        creatorId: id,
        creatorName: `${creator.first_name} ${creator.last_name}`,
        portfolio: portfolio,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error fetching creator portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch creator portfolio',
      error: error.message
    });
  }
};

/**
 * Get creator reviews and ratings
 * GET /api/creators/:id/reviews
 * Note: Reviews system to be implemented with separate reviews table
 * For now, returns rating from crew_members table
 */
exports.getCreatorReviews = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Verify creator exists and get rating
    const creator = await crew_members.findOne({
      where: {
        crew_member_id: id,
        is_active: 1
      },
      attributes: ['crew_member_id', 'first_name', 'last_name', 'rating']
    });

    if (!creator) {
      return res.status(404).json({
        success: false,
        message: 'Creator not found'
      });
    }

    // TODO: When reviews table is implemented, fetch actual reviews
    // For now, return placeholder structure with rating from crew_members
    const averageRating = parseFloat(creator.rating || 0);

    res.json({
      success: true,
      data: {
        creatorId: id,
        creatorName: `${creator.first_name} ${creator.last_name}`,
        averageRating: averageRating,
        totalReviews: 0,
        reviews: [],
        ratingDistribution: {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0
        },
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0
        },
        message: 'Reviews system pending implementation - showing rating from profile'
      }
    });

  } catch (error) {
    console.error('Error fetching creator reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch creator reviews',
      error: error.message
    });
  }
};
