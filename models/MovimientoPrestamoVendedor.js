// Préstamo a un vendedor a comisión: PRESTAMO suma a lo que debe, ABONO resta (se descuenta al pagarle su comisión).
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const MovimientoPrestamoVendedor = sequelize.define('MovimientoPrestamoVendedor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vendedorId: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(10), allowNull: false }, // PRESTAMO | ABONO
    montoUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    nota: { type: DataTypes.TEXT, allowNull: true },
    pagoComisionId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'MovimientosPrestamoVendedor', timestamps: true });

module.exports = MovimientoPrestamoVendedor;
