const { crew_members, equipment, stream_project_booking } = require('../models');
const constants = require('../utils/constants');

/**
 * Calculate pricing breakdown for a booking
 * POST /api/pricing/calculate
 * Body: { creatorIds: [], equipmentIds: [], hours: number, days: number }
 */
exports.calculatePricing = async (req, res) => {
  try {
    const {
      creatorIds = [],
      equipmentIds = [],
      hours = 0,
      days = 0,
      beigeMarginPercent = 25 // Default 25% margin
    } = req.body;

    // Validate input
    if (hours < 0 || days < 0) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'Hours and days must be non-negative'
      });
    }

    // Fetch creators
    let creatorCosts = [];
    let totalCreatorCost = 0;

    if (creatorIds.length > 0) {
      const creators = await crew_members.findAll({
        where: {
          crew_member_id: creatorIds,
          is_active: 1
        },
        attributes: ['crew_member_id', 'first_name', 'last_name', 'hourly_rate']
      });

      creatorCosts = creators.map(creator => {
        const hourlyRate = parseFloat(creator.hourly_rate || 0);
        const cost = hourlyRate * hours;
        totalCreatorCost += cost;

        return {
          id: creator.crew_member_id,
          name: `${creator.first_name} ${creator.last_name}`,
          hourlyRate: hourlyRate,
          hours: hours,
          subtotal: cost
        };
      });
    }

    // Fetch equipment
    let equipmentCosts = [];
    let totalEquipmentCost = 0;

    if (equipmentIds.length > 0) {
      const equipmentList = await equipment.findAll({
        where: {
          equipment_id: equipmentIds,
          is_active: 1
        },
        attributes: ['equipment_id', 'equipment_name', 'rental_price_per_day', 'rental_price_per_hour']
      });

      equipmentCosts = equipmentList.map(eq => {
        const perHour = parseFloat(eq.rental_price_per_hour || 0);
        const perDay = parseFloat(eq.rental_price_per_day || 0);

        // Calculate cost based on hours or days (whichever is specified)
        let cost = 0;
        let rateType = '';

        if (days > 0) {
          cost = perDay * days;
          rateType = 'daily';
        } else if (hours > 0) {
          cost = perHour * hours;
          rateType = 'hourly';
        }

        totalEquipmentCost += cost;

        return {
          id: eq.equipment_id,
          name: eq.equipment_name,
          ratePerHour: perHour,
          ratePerDay: perDay,
          rateType: rateType,
          quantity: days > 0 ? days : hours,
          subtotal: cost
        };
      });
    }

    // Calculate totals
    const subtotal = totalCreatorCost + totalEquipmentCost;
    const beigeMargin = (subtotal * beigeMarginPercent) / 100;
    const total = subtotal + beigeMargin;

    // Build pricing breakdown
    const breakdown = {
      creators: {
        items: creatorCosts,
        subtotal: totalCreatorCost
      },
      equipment: {
        items: equipmentCosts,
        subtotal: totalEquipmentCost
      },
      summary: {
        subtotal: subtotal,
        beigeMargin: beigeMargin,
        beigeMarginPercent: beigeMarginPercent,
        total: total
      },
      params: {
        hours: hours,
        days: days,
        creatorCount: creatorIds.length,
        equipmentCount: equipmentIds.length
      }
    };

    res.json({
      success: true,
      data: breakdown
    });

  } catch (error) {
    console.error('Error calculating pricing:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to calculate pricing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get pricing estimate for booking
 * GET /api/pricing/estimate/:bookingId
 */
exports.getBookingEstimate = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await stream_project_booking.findOne({
      where: {
        stream_project_booking_id: bookingId,
        is_active: 1
      }
    });

    if (!booking) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const bookingData = booking.toJSON();

    // Extract duration
    const durationHours = bookingData.duration_hours || 0;

    // Budget from booking
    const budget = parseFloat(bookingData.budget || 0);

    // Calculate suggested breakdown (example: 70% crew, 30% equipment)
    const suggestedCrewBudget = budget * 0.70;
    const suggestedEquipmentBudget = budget * 0.30;

    res.json({
      success: true,
      data: {
        bookingId: bookingData.stream_project_booking_id,
        projectName: bookingData.project_name,
        totalBudget: budget,
        duration: {
          hours: durationHours,
          days: durationHours > 0 ? Math.ceil(durationHours / 8) : 0
        },
        suggestedBreakdown: {
          creators: suggestedCrewBudget,
          equipment: suggestedEquipmentBudget,
          beigeMargin: budget * 0.25 // Example 25% margin
        },
        crewSizeNeeded: bookingData.crew_size_needed,
        location: bookingData.event_location
      }
    });

  } catch (error) {
    console.error('Error fetching booking estimate:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch booking estimate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get pricing example
 * GET /api/pricing/example
 * Shows example pricing breakdown
 */
exports.getPricingExample = async (req, res) => {
  try {
    const {
      creatorHourlyRate = 100,
      equipmentDailyRate = 50,
      hours = 3,
      beigeMarginPercent = 25
    } = req.query;

    const creatorCost = parseFloat(creatorHourlyRate) * parseFloat(hours);
    const equipmentCost = parseFloat(equipmentDailyRate);
    const subtotal = creatorCost + equipmentCost;
    const beigeMargin = (subtotal * parseFloat(beigeMarginPercent)) / 100;
    const total = subtotal + beigeMargin;

    res.json({
      success: true,
      data: {
        example: {
          description: `${hours} hours of crew + equipment cost + ${beigeMarginPercent}% Beige margin`,
          breakdown: {
            creator: {
              hourlyRate: parseFloat(creatorHourlyRate),
              hours: parseFloat(hours),
              subtotal: creatorCost
            },
            equipment: {
              dailyRate: parseFloat(equipmentDailyRate),
              days: 1,
              subtotal: equipmentCost
            },
            beigeMargin: {
              percent: parseFloat(beigeMarginPercent),
              amount: beigeMargin
            }
          },
          summary: {
            subtotal: subtotal,
            margin: beigeMargin,
            total: total
          }
        }
      }
    });

  } catch (error) {
    console.error('Error generating pricing example:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to generate pricing example',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = exports;
