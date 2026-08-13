// models/PushSubscription.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');


const PushSubscription = sequelize.define('PushSubscription', {
    endpoint: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    keys: {
        type: DataTypes.JSONB, // contiene auth y p256dh
        allowNull: false,
    },
    usuarioId: {
        type: DataTypes.INTEGER, // o INTEGER si usas IDs numéricos
        allowNull: false,
    },
    rol: {
        type: DataTypes.STRING, // 'admin', 'chofer', 'mecanico'
        allowNull: false,
    },
    navegador: {
        type: DataTypes.STRING, // opcional: Chrome, Firefox, etc.
    },
    activo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },
    environment: {
        type: DataTypes.STRING, // 'development' o 'production'
    },
}, {
    tableName: 'PushSubscriptions', // 🔥 Obligamos a que use el plural siempre
    timestamps: true,
});
module.exports = PushSubscription;