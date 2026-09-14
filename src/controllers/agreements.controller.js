const db = require('../models');
const { Op } = require('sequelize');

const AGREEMENT_TYPES = new Set([1, 2]);
const AGREEMENT_STATUSES = new Set(['pending', 'accepted', 'rejected', 'cancelled']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isValidDateOnly = (value) => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const normalizeText = (value) => typeof value === 'string' ? value.trim() : '';

exports.getAgreements = async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.query.agreementType !== undefined) {
      const agreementType = Number(req.query.agreementType);
      if (!AGREEMENT_TYPES.has(agreementType)) {
        return res.status(400).json({
          success: false,
          message: 'Agreement type must be 1 (Shoot Agreement) or 2 (General Agreement).'
        });
      }
      where.agreement_type = agreementType;
    }

    if (req.query.status !== undefined) {
      const status = normalizeText(req.query.status).toLowerCase();
      if (!AGREEMENT_STATUSES.has(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be pending, accepted, rejected, or cancelled.'
        });
      }
      where.status = status;
    }

    const search = normalizeText(req.query.search);
    if (search) {
      where[Op.or] = [
        { agreement_name: { [Op.like]: `%${search}%` } },
        { agreement_title: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await db.agreements.findAndCountAll({
      where,
      include: [
        {
          model: db.users,
          as: 'created_by',
          attributes: ['id', 'name'],
          required: false
        }
      ],
      order: [['created_at', 'DESC'], ['agreement_id', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    const agreements = rows.map((agreement) => ({
      agreementId: agreement.agreement_id,
      agreementType: agreement.agreement_type,
      agreementTypeLabel: agreement.agreement_type === 1 ? 'Shoot Agreement' : 'General Agreement',
      agreementName: agreement.agreement_name,
      agreementTitle: agreement.agreement_title,
      description: agreement.description,
      effectiveDate: agreement.effective_date,
      sections: agreement.sections,
      versionNo: agreement.version_no,
      status: agreement.status,
      createdBy: agreement.created_by
        ? { id: agreement.created_by.id, name: agreement.created_by.name }
        : null,
      createdAt: agreement.created_at,
      updatedAt: agreement.updated_at
    }));

    return res.status(200).json({
      success: true,
      message: 'Agreements fetched successfully.',
      data: {
        agreements,
        pagination: {
          page,
          limit,
          totalRecords: count,
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get agreements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch agreements.'
    });
  }
};

exports.createAgreement = async (req, res) => {
  try {
    const agreementType = Number(req.body.agreementType);
    const agreementName = normalizeText(req.body.agreementName);
    const agreementTitle = normalizeText(req.body.agreementTitle);
    const description = normalizeText(req.body.description);
    const effectiveDate = req.body.effectiveDate;
    const sections = req.body.sections;
    const createdByUserId = Number(req.user?.userId || req.userId || 0);

    if (!AGREEMENT_TYPES.has(agreementType)) {
      return res.status(400).json({
        success: false,
        message: 'Agreement type must be 1 (Shoot Agreement) or 2 (General Agreement).'
      });
    }

    if (!agreementName) {
      return res.status(400).json({ success: false, message: 'Agreement name is required.' });
    }

    if (!agreementTitle) {
      return res.status(400).json({ success: false, message: 'Agreement title is required.' });
    }

    if (!isValidDateOnly(effectiveDate)) {
      return res.status(400).json({
        success: false,
        message: 'Effective date is required in YYYY-MM-DD format.'
      });
    }

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one agreement section is required.'
      });
    }

    const normalizedSections = [];
    for (let index = 0; index < sections.length; index += 1) {
      const title = normalizeText(sections[index]?.title);
      const content = normalizeText(sections[index]?.content);

      if (!title || !content) {
        return res.status(400).json({
          success: false,
          message: `Section ${index + 1} must include both title and content.`
        });
      }

      normalizedSections.push({
        title,
        content,
        displayOrder: index + 1
      });
    }

    if (!createdByUserId) {
      return res.status(401).json({ success: false, message: 'Authenticated user is required.' });
    }

    const agreement = await db.agreements.create({
      agreement_type: agreementType,
      agreement_name: agreementName,
      agreement_title: agreementTitle,
      description: description || null,
      effective_date: effectiveDate,
      sections: normalizedSections,
      version_no: 1,
      status: 'pending',
      created_by_user_id: createdByUserId
    });

    return res.status(201).json({
      success: true,
      message: 'Agreement created successfully.',
      data: {
        agreementId: agreement.agreement_id,
        agreementType: agreement.agreement_type,
        status: agreement.status
      }
    });
  } catch (error) {
    console.error('Create agreement error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create agreement.'
    });
  }
};
