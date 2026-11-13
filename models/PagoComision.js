// Un pago hecho a un vendedor a comisión de lo que tiene acumulado por pagar (no se paga factura por factura).
// totalComisionUsd = lo que se liquida · abonoPrestamoUsd = la parte que se descontó para su préstamo · pagadoUsd = lo que se le pagó (total - abono).
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const PagoComision = sequelize.define('PagoComision', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vendedorId: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    totalComisionUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    abonoPrestamoUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    pagadoUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    tasaBcv: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    lineas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // [{ id, documento, cliente, concepto, comisionUsd }]
    prestamoAntesUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    prestamoDespuesUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    observacion: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'PagosComision', timestamps: true });

module.exports = PagoComision;
