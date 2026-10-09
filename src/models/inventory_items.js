module.exports = function(sequelize, DataTypes) {
return sequelize.define('inventory_items', {
id: {
type: DataTypes.INTEGER,
autoIncrement: true,
allowNull: false,
primaryKey: true
},
name: {
type: DataTypes.STRING(255),
allowNull: false
},
description: {
type: DataTypes.TEXT,
allowNull: true
},
image_url: {
type: DataTypes.STRING(500),
allowNull: true
},
price: {
type: DataTypes.DECIMAL(10, 2),
allowNull: false,
defaultValue: 0.00
},
total_quantity: {
type: DataTypes.INTEGER,
allowNull: false,
defaultValue: 0
},
is_active: {
type: DataTypes.TINYINT,
allowNull: false,
defaultValue: 1
},
created_at: {
type: DataTypes.DATE,
allowNull: false,
defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
},
updated_at: {
type: DataTypes.DATE,
allowNull: false,
defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
}
}, {
sequelize,
tableName: 'inventory_items',
timestamps: false
});
};
