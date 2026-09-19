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
        type: DataTypes.DECIMAL(14, 5), // precio (3 decimales) x cantidad (2 decimales), exacto
        allowNull: false
    },
    afectaInventario: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    // Presentación que pidió el cliente en el portal B2B: 'UNIDAD' | 'CAJA' | 'BULTO'. `cantidad` sigue en unidades base (stock y precio
    // no cambian); estos campos dicen que pidió, p. ej., 2 cajas de 100 (cantidad = 200). NULL = sin presentación (punto de venta,
    // pedidos anteriores): el empaque arma bultos, cajas cerradas y sueltas con la regla de siempre.
    presentacionPedida: { type: DataTypes.STRING(10), allowNull: true },
    cantidadPresentacion: { type: DataTypes.INTEGER, allowNull: true },
    unidadesPorPresentacion: { type: DataTypes.INTEGER, allowNull: true } // unidades de cada caja/bulto EN ESE MOMENTO
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