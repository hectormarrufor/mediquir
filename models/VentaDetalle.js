// models/VentaDetalle.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize'); // Ajusta la ruta a tu config de DB

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
    // 🔥 Permite nulos para que los productos FICTICIOS (1010) no rompan la DB al no tener ID de inventario
    productoId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // 🔥 NUEVOS CAMPOS PARA SOPORTAR EL PRODUCTO 1010 (Ficticio) 🔥
    isFicticio: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    nombreFicticio: {
        type: DataTypes.STRING,
        allowNull: true // Se llena solo cuando isFicticio es true
    },
    cantidad: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    precioUnitario: {
        type: DataTypes.DECIMAL(10, 3), // Alta precisión para cálculos en dólares o BS
        allowNull: false
    },
    // 🔥 Control granular del IVA (Determina si este renglón en específico aportó o no a la base imponible)
    aplicaIva: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    subtotal: {
        type: DataTypes.DECIMAL(12, 3),
        allowNull: false
    },
    afectaInventario: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'VentaDetalles',
    timestamps: false
});

VentaDetalle.associate = (models) => {
    VentaDetalle.belongsTo(models.Venta, {
        foreignKey: 'ventaId',
        as: 'venta'
    });
    VentaDetalle.belongsTo(models.Producto, {
        foreignKey: 'productoId',
        as: 'producto'
    });
}

module.exports = VentaDetalle;