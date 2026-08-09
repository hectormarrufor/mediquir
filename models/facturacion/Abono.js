const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Abono = sequelize.define('Abono', {
    fechaPago: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    metodoPago: {
        type: DataTypes.STRING, // Ej: 'Transferencia', 'Pago Móvil', 'Zelle', 'Efectivo'
        allowNull: false
    },
    referencia: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // El monto real en dólares que se resta a la deuda del pedido
    montoUsd: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    // La foto de la tasa BCV en ese momento exacto
    tasaBcvAplicada: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    // El monto en Bolívares que el cliente transfirió (calculado: montoUsd * tasaBcvAplicada)
    montoVes: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    notas: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'Abonos',
    timestamps: true
});

Abono.associate = (models) => {
    Abono.belongsTo(models.Pedido, { foreignKey: 'pedidoId', as: 'pedido' });
};

module.exports = Abono;