// const db = require('../models');
const db = require('../models');
const constants = require('./constants');
// const logger = require("../utils/logger");

const getTableNameDirect = exports.getTableNameDirect = (table) => {
  const model = db[table];

  if (!model) {
    console.error(`❌ Model not found for table: ${table}`);
    return null;
  }

  return model;
};

const getActiveRecordsWithTable = exports.getActiveRecordsWithTable = (req, table, where) => {
    if(constants.ACTIVE_RECORDS_TABLES.indexOf(table) >= 0) {
        where.is_active = 1;
    }
    return where;
}

const includeAssociation = exports.includeAssociation = (tableName, include, req = null, where = null, attributes = null, is_public = false) => {
    if (constants.ASSOCIATION_TABLE_WISE[tableName]) {
        for (let eachTableName of constants.ASSOCIATION_TABLE_WISE[tableName]) {
            include.push(pushInclude(eachTableName, where, req, attributes, is_public));
        }
    }
    return include;
}

const pushInclude = exports.pushInclude = (eachTableName, whereMain = {}, req = null, attributes = null, is_public = false) => {
    let where = {};
    if (whereMain && whereMain[constants.TABLES[eachTableName.table]]) {
        where = whereMain[constants.TABLES[eachTableName.table]];
    }
    where = getActiveRecordsWithTable(req, eachTableName.table, where);
    let data = {
        model: getTableNameDirect(eachTableName.table),
        as: eachTableName.as,
        where
    };
    if (attributes && attributes[constants.TABLES[eachTableName.table]]) {
        data.attributes = attributes[constants.TABLES[eachTableName.table]];
    }
    if (typeof eachTableName.attributes != "undefined") {
        data.attributes = eachTableName.attributes;
    }
    if (typeof eachTableName.required != "undefined") {
        data.required = eachTableName.required;
    }
    if (typeof eachTableName.separate != "undefined") {
        data.separate = eachTableName.separate;
    }

    if (constants.ACTIVE_RECORDS_TABLES.indexOf(constants.TABLES[eachTableName.table]) >= 0) {
        data.where.is_active = 1;
    }
    if (eachTableName.alias) {
        let tableName = eachTableName.alias;
        if (constants.ASSOCIATION_TABLE_WISE[tableName]) {
            data.include = includeAssociation(tableName, [], req, whereMain);
        }
    }
    return data;
}