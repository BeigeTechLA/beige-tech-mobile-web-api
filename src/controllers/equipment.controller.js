const { equipment, equipment_category, equipment_assignments } = require('../models');
const { Op } = require('sequelize');
const constants = require('../utils/constants');
const { parseLocation, filterByProximity, formatLocationResponse } = require('../utils/locationHelpers');

/**
 * Search equipment with pricing and location
 * GET /api/equipment/search
 * Query params: category, minPrice, maxPrice, location, maxDistance, available, page, limit
 * Location can be:
 * - Plain string: "Los Angeles, CA"
 * - Mapbox JSON: {"lat":34.0522,"lng":-118.2437,"address":"Los Angeles, CA"}
 * maxDistance: Optional distance in miles for proximity search (requires lat/lng in location)
 */
exports.searchEquipment = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      location,
      maxDistance,
      available = true,
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

    // Build where clause
    const whereClause = {
      is_active: 1
    };

    // Filter by availability
    if (available === 'true' || available === true) {
      whereClause.availability_status = 'available';
    }

    // Price range filter
    if (minPrice || maxPrice) {
      whereClause.rental_price_per_day = {};
      if (minPrice) whereClause.rental_price_per_day[Op.gte] = parseFloat(minPrice);
      if (maxPrice) whereClause.rental_price_per_day[Op.lte] = parseFloat(maxPrice);
    }

    // Location filter - use text search if no coordinates or no maxDistance
    if (location && !useProximitySearch && parsedLocation) {
      whereClause.storage_location = {
        [Op.like]: `%${parsedLocation.address || location}%`
      };
    }

    // Category filter
    if (category) {
      whereClause.category_id = parseInt(category);
    }

    // Fetch equipment
    // If using proximity search, fetch without pagination first, then filter by distance
    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: equipment_category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'description'],
          required: false
        }
      ],
      attributes: [
        'equipment_id',
        'equipment_name',
        'category_id',
        'brand',
        'model_number',
        'rental_price_per_day',
        'rental_price_per_hour',
        'purchase_price',
        'storage_location',
        'availability_status',
        'condition_status',
        'description'
      ],
      order: [['rental_price_per_day', 'ASC']]
    };

    // Only apply limit/offset if NOT using proximity search (we'll paginate after filtering)
    if (!useProximitySearch) {
      queryOptions.limit = parseInt(limit);
      queryOptions.offset = offset;
    }

    const { count: totalCount, rows: equipmentList } = await equipment.findAndCountAll(queryOptions);

    // Transform data
    let transformedEquipment = equipmentList.map(eq => {
      const eqData = eq.toJSON();

      return {
        id: eqData.equipment_id,
        name: eqData.equipment_name,
        category: eqData.category ? eqData.category.category_name : null,
        categoryId: eqData.category_id,
        brand: eqData.brand,
        model: eqData.model_number,
        pricing: {
          perDay: parseFloat(eqData.rental_price_per_day || 0),
          perHour: parseFloat(eqData.rental_price_per_hour || 0),
          purchasePrice: parseFloat(eqData.purchase_price || 0)
        },
        location: eqData.storage_location,
        availability: eqData.availability_status,
        condition: eqData.condition_status,
        description: eqData.description
      };
    });

    // Apply proximity filtering if coordinates provided
    let finalCount = totalCount;
    if (useProximitySearch) {
      transformedEquipment = filterByProximity(
        transformedEquipment,
        parsedLocation,
        parseFloat(maxDistance),
        'location'
      );

      finalCount = transformedEquipment.length;

      // Manual pagination after filtering
      transformedEquipment = transformedEquipment.slice(offset, offset + parseInt(limit));
    }

    res.json({
      success: true,
      data: {
        equipment: transformedEquipment,
        pagination: {
          total: finalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(finalCount / parseInt(limit))
        },
        searchParams: {
          useProximitySearch: useProximitySearch,
          maxDistance: useProximitySearch ? parseFloat(maxDistance) : null,
          searchLocation: parsedLocation ? {
            address: parsedLocation.address,
            coordinates: (parsedLocation.lat && parsedLocation.lng) ? {
              lat: parsedLocation.lat,
              lng: parsedLocation.lng
            } : null
          } : null
        }
      }
    });

  } catch (error) {
    console.error('Error searching equipment:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to search equipment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get equipment by ID with full details
 * GET /api/equipment/:id
 */
exports.getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const equipmentItem = await equipment.findOne({
      where: {
        equipment_id: id,
        is_active: 1
      },
      include: [
        {
          model: equipment_category,
          as: 'category',
          attributes: ['category_id', 'category_name', 'description'],
          required: false
        }
      ]
    });

    if (!equipmentItem) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    const eqData = equipmentItem.toJSON();

    res.json({
      success: true,
      data: {
        id: eqData.equipment_id,
        name: eqData.equipment_name,
        category: eqData.category ? eqData.category.category_name : null,
        categoryId: eqData.category_id,
        brand: eqData.brand,
        model: eqData.model_number,
        serialNumber: eqData.serial_number,
        pricing: {
          perDay: parseFloat(eqData.rental_price_per_day || 0),
          perHour: parseFloat(eqData.rental_price_per_hour || 0),
          purchasePrice: parseFloat(eqData.purchase_price || 0),
          replacementCost: parseFloat(eqData.replacement_cost || 0)
        },
        location: formatLocationResponse(eqData.storage_location),
        availability: eqData.availability_status,
        condition: eqData.condition_status,
        description: eqData.description,
        specifications: eqData.specifications,
        purchaseDate: eqData.purchase_date,
        warrantyExpiration: eqData.warranty_expiration_date,
        lastMaintenanceDate: eqData.last_maintenance_date,
        nextMaintenanceDate: eqData.next_maintenance_date
      }
    });

  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch equipment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get equipment categories
 * GET /api/equipment/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await equipment_category.findAll({
      where: { is_active: 1 },
      attributes: ['category_id', 'category_name', 'description'],
      order: [['category_name', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        categories: categories.map(cat => ({
          id: cat.category_id,
          name: cat.category_name,
          description: cat.description
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch categories',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get equipment by creator/owner
 * GET /api/equipment/by-creator/:creatorId
 */
exports.getByCreator = async (req, res) => {
  try {
    const { creatorId } = req.params;

    const equipmentList = await equipment.findAll({
      where: {
        owner_id: parseInt(creatorId),
        is_active: 1
      },
      include: [
        {
          model: equipment_category,
          as: 'category',
          attributes: ['category_id', 'category_name'],
          required: false
        }
      ],
      attributes: [
        'equipment_id',
        'equipment_name',
        'description',
        'rental_price_per_day',
        'storage_location',
        'category_id'
      ],
      order: [['equipment_name', 'ASC']]
    });

    const transformedEquipment = equipmentList.map(eq => {
      const eqData = eq.toJSON();
      return {
        equipment_id: eqData.equipment_id,
        name: eqData.equipment_name,
        description: eqData.description,
        rental_price_per_day: parseFloat(eqData.rental_price_per_day || 0),
        location: eqData.storage_location,
        category: eqData.category ? eqData.category.category_name : null,
        category_id: eqData.category_id
      };
    });

    res.json({
      success: true,
      data: transformedEquipment
    });

  } catch (error) {
    console.error('Error fetching equipment by creator:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch equipment by creator',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
