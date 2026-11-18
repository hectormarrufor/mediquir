// models/CambioPrecio.js
// Cada cambio de precio hecho desde el Consultor de precios (solo lo hacen las administradoras autorizadas). Guarda el precio anterior y el nuevo para
// poder revertirlo si fue un error: una reversión devuelve el precio anterior y queda anotada como un cambio más.
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CambioPrecio = sequelize.define('CambioPrecio', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productoId: { type: DataTypes.INTEGER, allowNull: false },
    campo: { type: DataTypes.STRING(10), allowNull: false }, // precio7 | precio6
    precioAnterior: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    precioNuevo: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false },
    motivo: { type: DataTypes.STRING(200), allowNull: true },
    revierteId: { type: DataTypes.INTEGER, allowNull: true }, // si este cambio es una reversión, cuál deshace
    revertidoAt: { type: DataTypes.DATE, allowNull: true }, // cuándo se deshizo este cambio
    revertidoPorId: { type: DataTypes.INTEGER, allowNull: true },
}, {
    tableName: 'CambiosPrecio',
    timestamps: true,
    updatedAt: false,
});

module.exports = CambioPrecio;
