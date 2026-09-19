// models/facturacion/NotaFiscal.js
// Nota de crédito o de débito.
//  · origen VENTA : la EMITE la empresa a un cliente y afecta una factura de venta (numeración propia NC-00001 / ND-00001).
//  · origen COMPRA: la RECIBE la empresa de un proveedor y afecta una factura de compra (el número es el del proveedor).
//  · CREDITO: baja lo que se debe de la factura (devolución, descuento, corrección a la baja). En el libro va en negativo.
//  · DEBITO : lo sube (cargos adicionales, intereses, corrección al alza). En el libro suma.
// Los montos están en la moneda de la factura afectada y con la tasa de esa factura (los libros se llevan en Bs con esa tasa).
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const NotaFiscal = sequelize.define('NotaFiscal', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tipo: { type: DataTypes.STRING(8), allowNull: false },
    origen: { type: DataTypes.STRING(6), allowNull: false },
    numeroDocumento: { type: DataTypes.STRING(50), allowNull: false },
    numeroControl: { type: DataTypes.STRING(30), allowNull: true },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    estado: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'EMITIDA' },
    ventaId: { type: DataTypes.UUID, allowNull: true },
    facturaCompraId: { type: DataTypes.UUID, allowNull: true },
    clienteId: { type: DataTypes.INTEGER, allowNull: true },
    proveedorId: { type: DataTypes.INTEGER, allowNull: true },
    moneda: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    tasaCambio: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    baseImponible: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montoExento: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montoIva: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    alicuotaIva: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 16 },
    totalFinal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    motivo: { type: DataTypes.TEXT, allowNull: false },
    devuelveInventario: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Nota de crédito que supera lo que el cliente debía (la factura ya estaba pagada): dinero a devolverle, y cuánto ya se le devolvió
    saldoAFavorUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    reintegradoUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    abonoId: { type: DataTypes.INTEGER, allowNull: true },
    anuladaAt: { type: DataTypes.DATE, allowNull: true },
    registradoPorId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'NotasFiscales', timestamps: true });

NotaFiscal.associate = (models) => {
    NotaFiscal.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
    NotaFiscal.belongsTo(models.FacturaCompra, { foreignKey: 'facturaCompraId', as: 'facturaCompra' });
    NotaFiscal.belongsTo(models.Cliente, { foreignKey: 'clienteId', as: 'cliente' });
    NotaFiscal.belongsTo(models.Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
    NotaFiscal.hasMany(models.NotaFiscalDetalle, { foreignKey: 'notaId', as: 'detalles', onDelete: 'CASCADE' });
};

module.exports = NotaFiscal;
