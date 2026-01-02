module.exports = {
    OK: {
        code: 200,
        message: "OK",
        custom_message: {
            code_2001: "Success"
        }
    },
    CREATED: {
        code: 201,
        message: "CREATED",
        custom_message: {
            code_2011: "Created Successfully.",
            code_2012: "User Created Successfully.",
            code_2013: "User Created Successfully."
        }
    },
    ACCEPTED: {
        code: 202,
        message: "ACCEPTED"
    },
    NON_AUTHORITATIVE_INFORMATION: {
        code: 203,
        message: "NON_AUTHORITATIVE_INFORMATION "
    },
    NO_CONTENT: {
        code: 204,
        message: "NO_CONTENT"
    },
    RESET_CONTENT: {
        code: 205,
        message: "RESET_CONTENT"
    },
    PARTIAL_CONTENT: {
        code: 206,
        message: "PARTIAL_CONTENT"
    },
    MULTI_STATUS: {
        code: 207,
        message: "MULTI_STATUS"
    },
    ALREADY_REPORTED: {
        code: 208,
        message: "ALREADY_REPORTED "
    },
    IM_USED: {
        code: 226,
        message: "IM_USED"
    },
    BAD_REQUEST: {
        code: 400,
        message: "BAD_REQUEST"
    },
    UNAUTHORIZED: {
        code: 401,
        message: "UNAUTHORIZED"
    },
    PAYMENT_REQUIRED: {
        code: 402,
        message: "PAYMENT_REQUIRED"
    },
    FORBIDDEN: {
        code: 403,
        message: "FORBIDDEN"
    },
    NOT_FOUND: {
        code: 404,
        message: "NOT_FOUND"
    },
    INTERNAL_SERVER_ERROR: {
        code: 500,
        message: "INTERNAL_SERVER_ERROR"
    },
    TABLES: {
        USERS: 'users',
        // VOUCHERS: 'vouchers',
        // LEDGERS: 'ledgers',
        // TRANSACTIONS: 'transactions',
        // COMPANIES: 'companies',
        STREAM_PROJECTS: 'stream_project_booking',
        CREW_MEMBERS: 'crew_members',
        CREW_MEMBER_FILES: 'crew_member_files',
        TASKS: 'tasks',
        EQUIPMENT: 'equipment',
        EQUIPMENT_ACCESSORIES: 'equipment_accessories',
        EQUIPMENT_CATEGORY: 'equipment_category',
        EQUIPMENT_DOCUMENTS: 'equipment_documents',
        EQUIPMENT_PHOTOS: 'equipment_photos',
        EQUIPMENT_SPECS: 'equipment_specs',
        EQUIPMENT_ASSIGNMENTS: 'equipment_assignments',
        CHECKLIST_MASTER: 'checklist_master',
        ASSIGNMENT_CHECKLIST: 'assignment_checklist',
        EQUIPMENT_RETURNS: 'equipment_returns',
        EQUIPMENT_RETURN_CHECKLIST: 'equipment_return_checklist',
        EQUIPMENT_RETURN_ISSUES: 'equipment_return_issues',
        SKILLS_MASTER: 'skills_master',
        CERTIFICATIONS_MASTER: 'certifications_master',
        CREW_ROLES: 'crew_roles',
        ASSIGNED_CREW: 'assigned_crew',
        ASSIGNED_EQUIPMENT: 'assigned_equipment',
        PROJECT_BRIEF: 'project_brief',
        EVENT_TYPE_MASTER: 'event_type_master',
        USER_TYPE: 'user_type',
        AFFILIATES: 'affiliates'

    },
    ASSOCIATION_TABLE_WISE: {
        orders: [
            // { table: "users", as: "customer" },
        ]
    },
    ACTIVE_RECORDS_TABLES: []
};
