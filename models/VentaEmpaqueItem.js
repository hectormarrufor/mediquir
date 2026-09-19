// models/VentaEmpaqueItem.js
// Evidencia de empaque por renglón: qué se pidió, cuánto dijo haber metido el empacador y cómo se comprobó el producto.
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const VentaEmpaqueItem = sequelize.define('VentaEmpaqueItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventaId: { type: DataTypes.UUID, allowNull: false },
    ventaDetalleId: { type: DataTypes.UUID, allowNull: false, unique: true },
    // PENDIENTE: intentado pero sin cerrar · OK: verificado · NOVEDAD: la cantidad no coincidió y espera a administración
    estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDIENTE' },
    cantidadPedida: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    cantidadEmpacada: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    // escaneo: cámara · codigo: lo tecleó · manual: el producto no tiene código, se confirmó contra la foto
    metodo: { type: DataTypes.STRING(10), allowNull: true },
    // Veces que intentó con un código que no era el del producto (errores que el sistema evitó)
    intentosFallidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    observacion: { type: DataTypes.TEXT, allowNull: true },
    verificadoAt: { type: DataTypes.DATE, allowNull: true },
}, {
    tableName: 'VentaEmpaqueItems',
    timestamps: false,
});

VentaEmpaqueItem.associate = (models) => {
    VentaEmpaqueItem.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
    VentaEmpaqueItem.belongsTo(models.VentaDetalle, { foreignKey: 'ventaDetalleId', as: 'detalle' });
};

module.exports = VentaEmpaqueItem;
