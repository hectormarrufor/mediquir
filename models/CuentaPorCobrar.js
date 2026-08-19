const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CuentaPorCobrar = sequelize.define('CuentaPorCobrar', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    clienteId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Clientes', key: 'id' }
    },
    ventaId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'Ventas', key: 'id' }
    },
    montoTotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    saldoPendiente: {
        type: DataTypes.DECIMAL(12, 2),
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
    fechaVencimiento: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    estado: {
        type: DataTypes.ENUM('Pendiente', 'Pagado', 'Vencido'),
        defaultValue: 'Pendiente'
    }
}, {
    tableName: 'CuentasPorCobrar',
    timestamps: true
});

CuentaPorCobrar.associate = (models) => {
    CuentaPorCobrar.belongsTo(models.Cliente, { foreignKey: 'clienteId', as: 'cliente' });
    CuentaPorCobrar.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
};

module.exports = CuentaPorCobrar;