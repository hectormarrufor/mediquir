const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const CuentaPorPagar = sequelize.define('CuentaPorPagar', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    proveedorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Proveedores', key: 'id' }
    },
    facturaCompraId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'FacturasCompras', key: 'id' }
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
    tableName: 'CuentasPorPagar',
    timestamps: true
});

CuentaPorPagar.associate = (models) => {
    CuentaPorPagar.belongsTo(models.Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
    CuentaPorPagar.belongsTo(models.FacturaCompra, { foreignKey: 'facturaCompraId', as: 'facturaCompra' });
};

module.exports = CuentaPorPagar;