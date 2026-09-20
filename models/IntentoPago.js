// models/IntentoPago.js
// Cada intento de pago móvil en el checkout de la tienda: quién (IP, cédula), qué referencia y monto, y cómo terminó.
// Sirve para limitar intentos falsos y para que administración vea quién escribió referencias que no existen.
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const IntentoPago = sequelize.define('IntentoPago', {
    ip: { type: DataTypes.STRING(64), allowNull: true },
    identificacion: { type: DataTypes.STRING(40), allowNull: true },
    idIntento: { type: DataTypes.STRING(64), allowNull: true }, // el navegador reintenta con el mismo id mientras espera el SMS
    referencia: { type: DataTypes.STRING(20), allowNull: true },
    montoBs: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    // NO_ENCONTRADO | MONTO | OK | REGISTRADO_MANUAL | BLOQUEADO
    resultado: { type: DataTypes.STRING(24), allowNull: false },
    detalle: { type: DataTypes.TEXT, allowNull: true },
    ventaId: { type: DataTypes.UUID, allowNull: true },
}, { tableName: 'IntentosPago', timestamps: true });

module.exports = IntentoPago;
