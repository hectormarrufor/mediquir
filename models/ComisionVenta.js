// Una línea de la hoja de un vendedor a comisión: una factura (o un abono / nota de crédito de esa factura) con su comisión.
//   montoUsd: lo facturado (o el abono, en negativo) · baseUsd: monto a comisionar SIN IVA · porcentaje · comisionUsd
//   estatusCliente: cómo va el cobro al cliente (texto libre: "PAGADO", "RET RECIBIDA"...) · estatusComision: PENDIENTE | PAGADA (con su fecha)
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ComisionVenta = sequelize.define('ComisionVenta', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    vendedorId: { type: DataTypes.INTEGER, allowNull: false },
    ventaId: { type: DataTypes.UUID, allowNull: true },
    concepto: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'FACTURA' }, // FACTURA | ABONO | NOTA
    fecha: { type: DataTypes.DATEONLY, allowNull: true },
    vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
    documentoTexto: { type: DataTypes.STRING(60), allowNull: true },
    clienteTexto: { type: DataTypes.STRING(200), allowNull: true },
    montoUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    baseUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    porcentaje: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    comisionUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    estatusCliente: { type: DataTypes.STRING(120), allowNull: true },
    estatusComision: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDIENTE' },
    fechaPagoComision: { type: DataTypes.DATEONLY, allowNull: true },
    observacion: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'ComisionesVenta', timestamps: true });

ComisionVenta.associate = (models) => {
    ComisionVenta.belongsTo(models.VendedorComision, { foreignKey: 'vendedorId', as: 'vendedor' });
    ComisionVenta.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
};

module.exports = ComisionVenta;
