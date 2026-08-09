// models/finanzas/MovimientoFinanciero.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const MovimientoFinanciero = sequelize.define('MovimientoFinanciero', {
    tipo: {
        type: DataTypes.ENUM('INGRESO', 'GASTO'),
        allowNull: false
    },
    fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    metodoPago: {
        type: DataTypes.STRING, // Efectivo, Transferencia, Pago Móvil, etc.
        allowNull: false
    },
    referencia: {
        type: DataTypes.STRING,
        allowNull: true
    },
    montoUsd: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    tasaBcvAplicada: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    montoVes: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    descripcion: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, { tableName: 'MovimientosFinancieros', timestamps: true });

MovimientoFinanciero.associate = (models) => {
    MovimientoFinanciero.belongsTo(models.CategoriaFinanciera, { foreignKey: 'categoriaId', as: 'categoria' });
    
    // Enlaces opcionales (Permiten saber de dónde vino el dinero exactamente)
    // Un ingreso puede venir de un pedido específico o de un abono específico
    MovimientoFinanciero.belongsTo(models.Pedido, { foreignKey: 'pedidoId', as: 'pedido', allowNull: true });
    MovimientoFinanciero.belongsTo(models.Abono, { foreignKey: 'abonoId', as: 'abono', allowNull: true });
};

module.exports = MovimientoFinanciero;