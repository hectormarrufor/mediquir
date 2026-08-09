// models/facturacion/Pedido.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Pedido = sequelize.define('Pedido', {
    esFacturado: { type: DataTypes.BOOLEAN, defaultValue: false },
    costoFlete: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
    quienRetira: { type: DataTypes.STRING, allowNull: true }, // Nombre y Cédula del chofer/persona
    fechaHoraRetiro: { type: DataTypes.DATE, allowNull: true },

    // Status del despacho para manejar entregas parciales
    statusDespacho: {
        type: DataTypes.ENUM('Pendiente', 'Parcial', 'Completado', 'Cancelado'),
        defaultValue: 'Pendiente'
    },
    condicionPago: {
        type: DataTypes.ENUM('Contado', 'Credito'),
        defaultValue: 'Contado'
    },
    statusPago: {
        type: DataTypes.ENUM('Pendiente', 'Pagado', 'Vencido'),
        defaultValue: 'Pendiente'
    },
    // La fecha tope para pagar (se calcula sumando 15 días a la fecha de creación)
    fechaVencimiento: {
        type: DataTypes.DATE,
        allowNull: true
    },

    // Totales cacheados (Opcional pero recomendado para no calcular en cada consulta)
    subtotal: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
    montoIva: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
    total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0.00 },
}, { tableName: 'Pedidos', timestamps: true });

Pedido.associate = (models) => {
    Pedido.belongsTo(models.Cliente, { foreignKey: 'clienteId', as: 'cliente' });
    Pedido.hasMany(models.PedidoRenglon, { foreignKey: 'pedidoId', as: 'renglones', onDelete: 'CASCADE' });
    Pedido.hasMany(models.Abono, { foreignKey: 'pedidoId', as: 'abonos', onDelete: 'CASCADE' });
};

module.exports = Pedido;