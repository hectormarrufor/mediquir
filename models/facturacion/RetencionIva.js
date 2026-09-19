const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

// Comprobante de retención de IVA. Montos en bolívares.
//  · COMPRA: la empresa (agente de retención) le retiene IVA al proveedor en una factura de compra.
//  · VENTA : un cliente contribuyente especial le retiene IVA a la empresa en una factura de venta.
const RetencionIva = sequelize.define('RetencionIva', {
    tipo: { type: DataTypes.STRING(6), allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    periodo: { type: DataTypes.STRING(7), allowNull: false },
    // Puede faltar mientras el cliente no entregue su comprobante (estado PENDIENTE)
    comprobante: { type: DataTypes.STRING(30), allowNull: true },
    // PENDIENTE: calculada al facturar, falta el comprobante · POR_REVISAR: el cliente subió su comprobante y administración lo debe confirmar
    // REGISTRADA: confirmada (es la que entra al libro)
    estado: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'REGISTRADA' },
    // Archivo del comprobante (PDF o imagen) subido por el cliente y el IVA retenido que declara (Bs)
    comprobanteUrl: { type: DataTypes.TEXT, allowNull: true },
    montoDeclarado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    facturaAfectada: { type: DataTypes.STRING(50), allowNull: false },
    numeroControlFactura: { type: DataTypes.STRING(30), allowNull: true },
    contraparteRif: { type: DataTypes.STRING(30), allowNull: true },
    contraparteNombre: { type: DataTypes.STRING(200), allowNull: true },
    baseImponible: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    alicuota: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 16 },
    montoIva: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    porcentajeRetencion: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 75 },
    ivaRetenido: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    tasaCambio: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
    ventaId: { type: DataTypes.UUID, allowNull: true },
    facturaCompraId: { type: DataTypes.UUID, allowNull: true },
    abonoId: { type: DataTypes.INTEGER, allowNull: true },
    registradoPorId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'RetencionesIva', timestamps: true });

RetencionIva.associate = (models) => {
    RetencionIva.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
    RetencionIva.belongsTo(models.FacturaCompra, { foreignKey: 'facturaCompraId', as: 'facturaCompra' });
};

module.exports = RetencionIva;
