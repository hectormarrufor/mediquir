// models/VentaDetalle.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const VentaDetalle = sequelize.define('VentaDetalle', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    ventaId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    productoId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cantidad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    precioUnitario: {
        type: DataTypes.DECIMAL(10, 3), // Con 3 decimales precisos
        allowNull: false
    },
    porcentajeIva: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    subtotal: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false
    }
}, {
    tableName: 'VentaDetalles',
    timestamps: false
});

VentaDetalle.associate = (models) => {
    VentaDetalle.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
    VentaDetalle.belongsTo(models.Producto, { foreignKey: 'productoId', as: 'producto' });
};

module.exports = VentaDetalle;