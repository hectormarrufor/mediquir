// models/MenuPermission.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MenuPermission = sequelize.define('MenuPermission', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    href: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    allowedDepartments: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: []
    },
    allowedPositions: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: []
    },
    // Nueva columna para almacenar los IDs de los usuarios autorizados
    allowedUsers: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: false,
        defaultValue: []
    }
}, {
    tableName: 'menu_permissions',
    timestamps: true
});

module.exports = MenuPermission;