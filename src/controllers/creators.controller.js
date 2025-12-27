const { crew_members, crew_member_files, crew_roles } = require('../models');
const { Op } = require('sequelize');
const { parseLocation, filterByProximity, formatLocationResponse } = require('../utils/locationHelpers');

// Radius expansion steps in miles (progressive expansion)
const RADIUS_STEPS = [25, 50, 100, 200, 500, 1000, 2000, 5000];

/**
 * Helper function to parse skills from various formats
 * Handles: JSON arrays, comma-separated strings, plain strings
 * Returns normalized array of skill strings
 */
const parseSkills = (skillsValue) => {
  if (!skillsValue) return [];

  // Already an array
  if (Array.isArray(skillsValue)) {
    return skillsValue.map(s => String(s).trim()).filter(s => s);
  }

  // String - try JSON parse first, then CSV fallback
  if (typeof skillsValue === 'string') {
    try {
      const parsed = JSON.parse(skillsValue);
      if (Array.isArray(parsed)) {
        return parsed.map(s => String(s).trim()).filter(s => s);
      }
      // Single string in JSON
      return [String(parsed).trim()].filter(s => s);
    } catch {
      // Not JSON - treat as comma-separated or single value
      return skillsValue.split(',').map(s => s.trim()).filter(s => s);
    }
  }

  return [];
};

/**
 * Helper function to generate realistic review count based on rating
 * Until reviews table is implemented, this provides consistent placeholder counts
 * Based on the pattern from scripts/update-creator-profiles.js
 */
const generateReviewCount = (rating) => {
  const ratingFloat = parseFloat(rating || 0);

  if (ratingFloat >= 4.7) {
    // Top performers: 15-50 reviews
    return Math.floor(Math.random() * 36) + 15;
  } else if (ratingFloat >= 4.3) {
    // High performers: 10-30 reviews
    return Math.floor(Math.random() * 21) + 10;
  } else if (ratingFloat >= 3.8) {
    // Good performers: 5-20 reviews
    return Math.floor(Math.random() * 16) + 5;
  } else if (ratingFloat > 0) {
    // Average performers: 3-12 reviews
    return Math.floor(Math.random() * 10) + 3;
  } else {
    // No rating yet
    return 0;
  }
};

/**
 * Helper function to find the starting index in RADIUS_STEPS
 * Returns the index of the smallest step >= the given distance
 */
const findRadiusStepIndex = (distance) => {
  if (!distance || isNaN(distance)) return 0;
  const dist = parseFloat(distance);
  for (let i = 0; i < RADIUS_STEPS.length; i++) {
    if (RADIUS_STEPS[i] >= dist) return i;
  }
  return RADIUS_STEPS.length - 1;
};

/**
 * Search creators with filters
 * GET /api/creators/search
 * Query params:
 * - budget: Max hourly rate (backward compatibility) OR use min_budget/max_budget for range
 * - min_budget: Minimum hourly rate
 * - max_budget: Maximum hourly rate
 * - location: Plain string or Mapbox JSON {"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}
 * - skills: Skills to match (comma-separated or JSON array)
 * - content_type: Single role ID (backward compatibility)
 * - content_types: Array of role IDs for multiple roles
 * - maxDistance: Distance in miles for proximity search (requires lat/lng in location)
 * - required_count: Minimum number of creators to return (enables auto radius expansion)
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20)
 *
 * Features:
 * - Skill overlap scoring: Ranks creators by number of matching skills
 * - Budget range filtering: Filter by min/max hourly rate
 * - Multiple roles: Search across multiple role types
 * - Proximity search: Filter by geographic distance
 * - Auto radius expansion: If results < required_count, expand radius until enough found
 * - Hybrid approach: DB filtering + in-memory scoring for best performance
 */
exports.searchCreators = async (req, res) => {
  try {
    const {
      budget,
      min_budget,
      max_budget,
      location,
      skills,
      content_type,
      content_types,
      maxDistance,
      required_count,
      page = 1,
      limit = 20
    } = req.query;

    // Parse required_count (minimum creators needed - enables auto radius expansion)
    const requiredCount = parseInt(required_count) || 1;

    // DEBUG: Log incoming search parameters
    console.log('🔍 DEBUG: Creator search params received:', {
      budget,
      min_budget,
      max_budget,
      location,
      skills,
      content_type,
      content_types,
      maxDistance,
      required_count: requiredCount,
      page,
      limit
    });

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Parse location to determine if we have coordinates for proximity search
    let parsedLocation = null;
    let useProximitySearch = false;
    let initialRadius = maxDistance ? parseFloat(maxDistance) : 50; // Default 50 miles

    if (location) {
      parsedLocation = parseLocation(location);
      // Enable proximity search if we have coordinates (with or without maxDistance)
      useProximitySearch = Boolean(
        parsedLocation &&
        parsedLocation.lat &&
        parsedLocation.lng
      );
    }

    // Build dynamic where clause
    const whereClause = {
      is_active: 1,
      is_draft: 0
    };

    // Budget filter - support range (min_budget/max_budget) or legacy max (budget)
    if (min_budget || max_budget || budget) {
      whereClause.hourly_rate = {};

      // Use min_budget/max_budget if provided
      if (min_budget) {
        whereClause.hourly_rate[Op.gte] = parseFloat(min_budget);
      }
      if (max_budget) {
        whereClause.hourly_rate[Op.lte] = parseFloat(max_budget);
      }

      // Backward compatibility: budget param means max rate
      if (budget && !max_budget) {
        whereClause.hourly_rate[Op.lte] = parseFloat(budget);
      }
    }

    // Location filter - use text search if no coordinates for proximity search
    // Extract city/region from full address for better matching
    if (location && !useProximitySearch && parsedLocation) {
      const address = parsedLocation.address || location;

      // Extract city from full address (e.g., "123 Street, Los Angeles, CA, USA" -> "Los Angeles")
      // Split by comma and find the city part (usually 2nd element or contains recognizable city names)
      const addressParts = address.split(',').map(p => p.trim());

      // Common patterns:
      // - "Street Address, City, State ZIP, Country" -> use 2nd part (City)
      // - "City, State" -> use 1st part (City)
      let cityToSearch = address; // Default to full address

      if (addressParts.length >= 2) {
        // If we have at least 2 parts, use the 2nd one (usually the city)
        // Unless the first part looks like a city name (no numbers/street indicators)
        const firstPart = addressParts[0];
        const secondPart = addressParts[1];

        // If first part has numbers or street/road keywords, second part is likely the city
        // Include: freeway, highway, hwy, expressway, turnpike, pike, parkway, pkwy, circle, cir, court, ct, place, pl, way, terrace, ter, trail, trl
        const streetPattern = /\d|street|st\b|avenue|ave\b|road|rd\b|boulevard|blvd|drive|dr\b|lane|ln\b|freeway|fwy|highway|hwy|expressway|expy|turnpike|tpke|pike|parkway|pkwy|circle|cir\b|court|ct\b|place|pl\b|way\b|terrace|ter\b|trail|trl\b/i;
        
        if (streetPattern.test(firstPart)) {
          cityToSearch = secondPart;
        } else {
          // First part might be the city
          cityToSearch = firstPart;
        }
      }

      console.log('🔍 DEBUG: Location search -', {
        original: address,
        extracted_city: cityToSearch,
        all_parts: addressParts
      });

      whereClause.location = {
        [Op.like]: `%${cityToSearch}%`
      };
    }

    // Skills filter (TEXT field stored as JSON or comma-separated)
    if (skills) {
      whereClause.skills = {
        [Op.like]: `%${skills}%`
      };
    }

    // Content type filter via primary_role - support multiple roles
    // FIX: Accept both role IDs (numbers) and role names (strings)
    if (content_types) {
      // Parse content_types (can be array or comma-separated string)
      let rolesArray = Array.isArray(content_types) ? content_types : content_types.split(',');
      rolesArray = rolesArray.map(r => r.trim()).filter(r => r);

      // Map role names to IDs if needed
      // videographer -> 1, photographer/photographers -> 2
      const roleNameToId = {
        'videographer': [1, 3], // Multiple IDs for videographer
        'photographer': [2, 4], // Multiple IDs for photographer/photographers
        'photographers': [2, 4],
        'cinematographer': [1, 3], // Map to videographer IDs
      };

      let roleIds = [];
      rolesArray.forEach(role => {
        const roleLower = role.toLowerCase();
        // Check if it's a number (role ID)
        if (!isNaN(role)) {
          roleIds.push(parseInt(role));
        }
        // Check if it's a known role name
        else if (roleNameToId[roleLower]) {
          roleIds.push(...roleNameToId[roleLower]);
        }
      });

      // Remove duplicates
      roleIds = [...new Set(roleIds)];

      console.log('🔍 DEBUG: Role mapping -', {
        input: rolesArray,
        mapped_ids: roleIds
      });

      if (roleIds.length > 0) {
        whereClause.primary_role = {
          [Op.in]: roleIds
        };
      }
    } else if (content_type) {
      // Backward compatibility: single content_type
      if (!isNaN(content_type)) {
        whereClause.primary_role = parseInt(content_type);
      }
    }

    // Execute search query
    // Always fetch all matching records first for post-processing
    const useSkillScoring = Boolean(skills);
    const needsPostProcessing = useProximitySearch || useSkillScoring;

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

    // Only apply limit/offset if NOT using post-processing (we'll paginate after filtering/scoring)
    if (!needsPostProcessing) {
      queryOptions.limit = parseInt(limit);
      queryOptions.offset = offset;
    }

    console.log('🔍 DEBUG: Final where clause:', JSON.stringify(whereClause, null, 2));
    console.log('🔍 DEBUG: Query options:', {
      useProximitySearch,
      useSkillScoring,
      needsPostProcessing,
      requiredCount,
      limit: queryOptions.limit,
      offset: queryOptions.offset
    });

    const { count: totalCount, rows: creators } = await crew_members.findAndCountAll(queryOptions);

    console.log('🔍 DEBUG: Query results:', {
      totalCount,
      creatorsFound: creators.length,
      firstCreatorId: creators[0]?.crew_member_id || null
    });

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

      const rating = parseFloat(creatorData.rating || 0);

      return {
        crew_member_id: creatorData.crew_member_id,
        name: `${creatorData.first_name} ${creatorData.last_name}`,
        role_id: creatorData.primary_role,
        role_name: roleMap[creatorData.primary_role] || 'Creative Professional',
        hourly_rate: parseFloat(creatorData.hourly_rate || 0),
        rating: rating,
        total_reviews: generateReviewCount(rating), // Generate realistic count based on rating
        profile_image: profileImage ? profileImage.file_path : null,
        location: creatorData.location,
        experience_years: creatorData.years_of_experience,
        bio: creatorData.bio,
        skills: creatorData.skills,
        is_available: creatorData.is_available === 1
      };
    });

    // Apply proximity filtering with auto-expansion if coordinates provided
    let finalCount = totalCount;
    let actualRadius = null; // Will be set if proximity search is used
    let radiusExpanded = false;

    if (useProximitySearch) {
      // Start with initial radius and expand if needed to meet required_count
      let currentStepIndex = findRadiusStepIndex(initialRadius);
      let proximityResults = [];
      
      // First try with initial radius
      proximityResults = filterByProximity(
        transformedCreators,
        parsedLocation,
        initialRadius,
        'location'
      );
      actualRadius = initialRadius;

      console.log('🔍 DEBUG: Initial proximity filter:', {
        initialRadius,
        resultsFound: proximityResults.length,
        requiredCount
      });

      // Auto-expand radius if we don't have enough results
      while (proximityResults.length < requiredCount && currentStepIndex < RADIUS_STEPS.length) {
        currentStepIndex++;
        const newRadius = RADIUS_STEPS[currentStepIndex];
        
        if (newRadius) {
          proximityResults = filterByProximity(
            transformedCreators,
            parsedLocation,
            newRadius,
            'location'
          );
          actualRadius = newRadius;
          radiusExpanded = true;

          console.log('🔍 DEBUG: Expanded radius:', {
            newRadius,
            resultsFound: proximityResults.length,
            requiredCount
          });
        }
      }

      // If still not enough after all radius steps, include all creators (no distance limit)
      if (proximityResults.length < requiredCount) {
        // Get all creators sorted by distance (no max distance filter)
        proximityResults = filterByProximity(
          transformedCreators,
          parsedLocation,
          null, // No limit - include all
          'location'
        );
        actualRadius = null; // Indicates unlimited
        radiusExpanded = true;

        console.log('🔍 DEBUG: Removed radius limit (unlimited):', {
          resultsFound: proximityResults.length,
          requiredCount
        });
      }

      transformedCreators = proximityResults;
      finalCount = transformedCreators.length;
    }

    // Apply skill-based scoring if skills provided
    if (useSkillScoring) {
      const requestedSkills = parseSkills(skills);

      transformedCreators = transformedCreators.map(creator => {
        const creatorSkills = parseSkills(creator.skills);

        // Find matching skills (case-insensitive partial matching)
        const matchingSkills = creatorSkills.filter(creatorSkill =>
          requestedSkills.some(requestedSkill =>
            creatorSkill.toLowerCase().includes(requestedSkill.toLowerCase()) ||
            requestedSkill.toLowerCase().includes(creatorSkill.toLowerCase())
          )
        );

        return {
          ...creator,
          matchScore: matchingSkills.length,
          matchingSkills: matchingSkills  // Optional: for debugging/display
        };
      });

      // Sort by matchScore (DESC), then rating (DESC)
      transformedCreators.sort((a, b) => {
        const scoreDiff = (b.matchScore || 0) - (a.matchScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return b.rating - a.rating;
      });

      // Update count after scoring (all results passed scoring, but sorted differently)
      finalCount = transformedCreators.length;
    }

    // Manual pagination after all filtering and scoring
    if (needsPostProcessing) {
      transformedCreators = transformedCreators.slice(offset, offset + parseInt(limit));
    }

    // Build response with search metadata
    const response = {
      success: true,
      data: {
        data: transformedCreators, // Array of creators
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: finalCount,
          totalPages: Math.ceil(finalCount / parseInt(limit)),
          hasMore: parseInt(page) < Math.ceil(finalCount / parseInt(limit))
        },
        searchMeta: {
          requestedCount: requiredCount,
          foundCount: finalCount,
          initialRadius: useProximitySearch ? initialRadius : null,
          actualRadius: actualRadius,
          radiusExpanded: radiusExpanded,
          radiusUnlimited: actualRadius === null && useProximitySearch
        }
      }
    };

    res.json(response);

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
