// models/FacturaCompra.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const FacturaCompra = sequelize.define('FacturaCompra', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    proveedorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Proveedores', key: 'id' }
    },
    tipoDocumento: {
        type: DataTypes.ENUM('FACTURA', 'NOTA_ENTREGA'),
        allowNull: false,
        defaultValue: 'FACTURA'
    },
    numeroDocumento: { // El número de la factura o recibo del proveedor
        type: DataTypes.STRING,
        allowNull: false
    },
    moneda: {
        type: DataTypes.ENUM('USD', 'BS'),
        allowNull: false,
        defaultValue: 'USD'
    },
    tasaCambio: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 1.00
    },
    subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
    },
    montoIva: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
    },
    fechaFactura: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    montoRetencion: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
    },
    totalFinal: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00
    },
    registradoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Usuarios', key: 'id' }
    },
    condicionPago: { type: DataTypes.ENUM('Contado', 'Credito'), defaultValue: 'Contado' },
    diasCredito: { type: DataTypes.INTEGER, defaultValue: 0 },
    fechaVencimiento: { type: DataTypes.DATE, allowNull: true },
    statusPago: { type: DataTypes.ENUM('Pendiente', 'Pagado', 'Vencido'), defaultValue: 'Pendiente' },
}, {
    tableName: 'FacturasCompras',
    timestamps: true
});

FacturaCompra.associate = (models) => {
    FacturaCompra.belongsTo(models.Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
    FacturaCompra.belongsTo(models.User, { foreignKey: 'registradoPorId', as: 'registrador' });

    // Una factura de compra tiene muchas entradas de inventario (renglones)
    FacturaCompra.hasMany(models.EntradaInventario, { foreignKey: 'facturaCompraId', as: 'entradas', onDelete: 'CASCADE' });

    // Una factura de compra genera un movimiento financiero (Gasto)
    FacturaCompra.hasMany(models.MovimientoFinanciero, { foreignKey: 'facturaCompraId', as: 'movimientos' });
};

module.exports = FacturaCompra;