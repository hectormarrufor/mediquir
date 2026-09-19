// models/facturacion/NotaFiscalDetalle.js
// Renglón de una nota de crédito o de débito de venta. Si viene de un renglón de la factura, guarda su id (ventaDetalleId)
// para saber cuánto de cada producto ya se acreditó.
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const NotaFiscalDetalle = sequelize.define('NotaFiscalDetalle', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    notaId: { type: DataTypes.UUID, allowNull: false },
    ventaDetalleId: { type: DataTypes.UUID, allowNull: true },
    productoId: { type: DataTypes.INTEGER, allowNull: true },
    descripcion: { type: DataTypes.STRING(200), allowNull: false },
    cantidad: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    precioUnitario: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    aplicaIva: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    porcentajeIva: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 16 },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
}, { tableName: 'NotaFiscalDetalles', timestamps: false });

NotaFiscalDetalle.associate = (models) => {
    NotaFiscalDetalle.belongsTo(models.NotaFiscal, { foreignKey: 'notaId', as: 'nota' });
};

module.exports = NotaFiscalDetalle;
