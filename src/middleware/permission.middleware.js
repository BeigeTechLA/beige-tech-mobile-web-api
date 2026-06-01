const db = require('../models');
const { Op } = db.Sequelize;

const ADMIN_ROLES = new Set(['admin']);
const BASE_ROLES = new Set([
  'admin',
  'client',
  'creator',
  'creative_partner',
  'crew_member',
  'sales_rep',
  'sales_admin'
]);

const normalizeRole = (role) => String(role || '').trim().toLowerCase().replace(/\s+/g, '_');

const normalizePermission = (permission) => {
  if (typeof permission === 'string') {
    const [module, action] = permission.split('.');
    return module && action ? `${module}.${action}` : null;
  }

  if (Array.isArray(permission) && permission.length >= 2) {
    return `${permission[0]}.${permission[1]}`;
  }

  if (permission && permission.module && permission.action) {
    return `${permission.module}.${permission.action}`;
  }

  return null;
};

const getRequestUser = (req) => ({
  userId: req.user?.userId || req.user?.id || req.userId,
  roleId: req.user?.userTypeId || req.userTypeId,
  role: req.user?.userRole || req.userRole
});

const getUserAccessContext = async (req) => {
  const requestUser = getRequestUser(req);
  const userId = Number(requestUser.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  let roleId = Number(requestUser.roleId);
  let role = requestUser.role;

  if (!Number.isInteger(roleId) || roleId <= 0 || !role) {
    const user = await db.users.findOne({
      where: {
        id: userId,
        is_active: 1
      },
      attributes: ['id', 'user_type', 'role']
    });

    if (!user) return null;

    roleId = Number(user.user_type);
    role = role || user.role;
  }

  if (!role && Number.isInteger(roleId) && roleId > 0) {
    const userType = await db.user_type.findOne({
      where: {
        user_type_id: roleId,
        is_active: 1
      },
      attributes: ['user_role']
    });

    role = userType?.user_role;
  }

  return {
    userId,
    roleId,
    role: normalizeRole(role)
  };
};

const hasAnyPermission = async ({ userId, roleId }, permissionKeys) => {
  const permissions = await db.permissions.findAll({
    where: {
      permission_key: {
        [Op.in]: permissionKeys
      },
      is_active: 1
    },
    attributes: ['permission_id', 'permission_key']
  });

  if (!permissions.length) return false;

  const permissionIds = permissions.map((permission) => permission.permission_id);

  const [rolePermissions, userPermissions] = await Promise.all([
    db.role_permissions.findAll({
      where: {
        role_id: roleId,
        permission_id: permissionIds,
        is_active: 1
      },
      attributes: ['permission_id']
    }),
    db.user_permissions.findAll({
      where: {
        user_id: userId,
        permission_id: permissionIds,
        is_active: 1
      },
      attributes: ['permission_id', 'is_allowed']
    })
  ]);

  const allowedPermissionIds = new Set(rolePermissions.map((item) => Number(item.permission_id)));

  userPermissions.forEach((item) => {
    const permissionId = Number(item.permission_id);
    if (Number(item.is_allowed) === 1) {
      allowedPermissionIds.add(permissionId);
    } else {
      allowedPermissionIds.delete(permissionId);
    }
  });

  return permissions.some((permission) => allowedPermissionIds.has(Number(permission.permission_id)));
};

const requireAnyPermission = (permissions, options = {}) => {
  const permissionKeys = permissions
    .map(normalizePermission)
    .filter(Boolean);

  const allowRoles = new Set((options.allowRoles || []).map(normalizeRole));
  const allowBaseRoles = options.allowBaseRoles === true;

  return async (req, res, next) => {
    try {
      const context = await getUserAccessContext(req);

      if (!context) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (ADMIN_ROLES.has(context.role)) {
        return next();
      }

      if (allowBaseRoles && BASE_ROLES.has(context.role)) {
        return next();
      }

      if (allowRoles.has(context.role)) {
        return next();
      }

      const isAllowed = permissionKeys.length
        ? await hasAnyPermission(context, permissionKeys)
        : false;

      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      return next();
    } catch (error) {
      console.error('Permission authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization error'
      });
    }
  };
};

const requirePermission = (module, action, options = {}) => (
  requireAnyPermission([`${module}.${action}`], options)
);

module.exports = {
  requirePermission,
  requireAnyPermission
};
