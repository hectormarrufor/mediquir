// Recibo: constancia de un pago hecho a una persona («Hemos pagado a») o de un cobro («He recibido de»), con su correlativo propio.
// No es un documento fiscal ni mueve inventario; sirve para dejar establecido a quién se le pagó, cuánto, por qué y cómo.
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Recibo = sequelize.define('Recibo', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    numero: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    tipo: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PAGADO_A', validate: { isIn: [['PAGADO_A', 'RECIBIDO_DE']] } },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    lugar: { type: DataTypes.STRING(80), allowNull: true },
    personaNombre: { type: DataTypes.STRING(200), allowNull: false },
    personaIdentificacion: { type: DataTypes.STRING(40), allowNull: true },
    moneda: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BS', validate: { isIn: [['BS', 'USD']] } },
    monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    montoLetras: { type: DataTypes.TEXT, allowNull: true },
    concepto: { type: DataTypes.TEXT, allowNull: true },
    formaPago: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'EFECTIVO' }, // EFECTIVO | CHEQUE | TRANSFERENCIA | OTRO
    referencia: { type: DataTypes.STRING(100), allowNull: true }, // N° de cheque o de transferencia
    banco: { type: DataTypes.STRING(120), allowNull: true },
    anulado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    creadoPorId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'Recibos', timestamps: true });

module.exports = Recibo;
