// models/Venta.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Venta = sequelize.define('Venta', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    clienteId: {
        type: DataTypes.INTEGER,
        allowNull: true // Null = Venta Rápida al Detal sin cliente registrado
    },
    
    // --- TIPOLOGÍA Y CORRELATIVOS ---
    tipoVenta: {
        type: DataTypes.ENUM('MAYOR', 'DETAL'),
        allowNull: false
    },
    tipoDocumento: {
        type: DataTypes.ENUM('FACTURA', 'NOTA_ENTREGA', 'VENTA_RAPIDA'),
        allowNull: false
    },
    numeroDocumento: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // Ej: 'F-015420'
    },

    // --- LOGÍSTICA (Viene de tu antiguo modelo Pedido) ---
    costoFlete: { 
        type: DataTypes.DECIMAL(10, 2), 
        defaultValue: 0.00 
    },
    quienRetira: { 
        type: DataTypes.STRING, 
        allowNull: true // Nombre y Cédula del chofer
    },
    fechaHoraRetiro: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    statusDespacho: {
        type: DataTypes.ENUM('Pendiente', 'Parcial', 'Completado', 'Cancelado'),
        defaultValue: 'Pendiente'
    },

    // --- COBRANZA Y PAGOS (Viene de tu antiguo modelo Pedido) ---
    condicionPago: {
        type: DataTypes.ENUM('Contado', 'Credito'),
        defaultValue: 'Contado'
    },
    statusPago: {
        type: DataTypes.ENUM('Pendiente', 'Pagado', 'Vencido'),
        defaultValue: 'Pendiente'
    },
    fechaVencimiento: {
        type: DataTypes.DATE,
        allowNull: true
    },

    // --- FINANZAS CONGELADAS ---
    moneda: {
        type: DataTypes.ENUM('USD', 'BS'),
        allowNull: false,
        defaultValue: 'USD'
    },
    tasaCambio: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 1.00 // 1 para USD, tasa BCV para BS
    },
    subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
    montoIva: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
    totalDescuento: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
    totalFinal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 }
}, { 
    tableName: 'Ventas', 
    timestamps: true 
});

Venta.associate = (models) => {
    Venta.belongsTo(models.Cliente, { foreignKey: 'clienteId', as: 'cliente' });
    Venta.belongsTo(models.User, { foreignKey: 'vendedorId', as: 'vendedor' }); // 🔥 ESTA ES LA MAGIA
    Venta.hasMany(models.VentaDetalle, { foreignKey: 'ventaId', as: 'detalles', onDelete: 'CASCADE' });
    Venta.hasMany(models.Abono, { foreignKey: 'ventaId', as: 'abonos', onDelete: 'CASCADE' });
    Venta.hasMany(models.MovimientoFinanciero, { foreignKey: 'ventaId', as: 'movimientos' });
};

module.exports = Venta;