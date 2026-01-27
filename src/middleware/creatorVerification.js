const { crew_members } = require('../models');

/* Middleware to check if creator is verified (is_crew_verified = 1) */
const checkCreatorVerification = async (req, res, next) => {
  try {
    const { crew_member_id } = req.body || req.query;

    if (!crew_member_id) {
      return res.status(400).json({
        error: true,
        message: 'crew_member_id is required'
      });
    }

    const crewMember = await crew_members.findOne({
      where: {
        crew_member_id: crew_member_id,
        is_active: 1
      },
      attributes: ['crew_member_id', 'is_crew_verified', 'first_name', 'last_name']
    });

    if (!crewMember) {
      return res.status(404).json({
        error: true,
        message: 'Crew member not found'
      });
    }

    if (crewMember.is_crew_verified !== 1) {
      return res.status(403).json({
        error: true,
        message: 'Access denied. Your account is not verified yet. Please contact support for verification.'
      });
    }

    req.crewMember = crewMember;

    next();
  } catch (error) {
    console.error('Creator verification middleware error:', error);
    return res.status(500).json({
      error: true,
      message: 'Internal server error during verification check'
    });
  }
};

module.exports = {
  checkCreatorVerification
};
