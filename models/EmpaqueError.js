// models/EmpaqueError.js
// Cada vez que un empacador toma un producto o una presentación equivocada (el sistema lo frenó o lo avisó).
// Sirve para saber quién se equivoca más al buscar productos.
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const EmpaqueError = sequelize.define('EmpaqueError', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventaId: { type: DataTypes.UUID, allowNull: false },
    ventaDetalleId: { type: DataTypes.UUID, allowNull: true },
    empacadorId: { type: DataTypes.INTEGER, allowNull: false },
    productoId: { type: DataTypes.INTEGER, allowNull: true },
    // PRODUCTO: otro producto · PRESENTACION: unidad/caja/bulto equivocado · MARCA: eligió otra marca
    tipo: { type: DataTypes.STRING(12), allowNull: false },
    nivelPedido: { type: DataTypes.STRING(10), allowNull: true },
    nivelEscaneado: { type: DataTypes.STRING(10), allowNull: true },
    codigo: { type: DataTypes.STRING(64), allowNull: true },
}, {
    tableName: 'EmpaqueErrores',
    timestamps: true,
    updatedAt: false,
});

module.exports = EmpaqueError;
