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
        type: DataTypes.ENUM('MAYOR', 'DETAL', 'ONLINE'),
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
    // Lo que cobró de verdad la empresa de delivery (costoFlete es lo que se le cobró al cliente): para saber si el cálculo fue acertado
    costoFleteReal: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    // Recibo V- convertido en factura: fecha de emisión de la factura (manda sobre createdAt en libros e IVA) y el número que tenía
    fechaEmision: { type: DataTypes.DATE, allowNull: true },
    // Compra de la tienda cuyo pago móvil no se encontró: POR_VERIFICAR hasta que llegue el SMS o administración lo confirme en el banco
    verificacionPago: { type: DataTypes.STRING(15), allowNull: true },
    referenciaDeclarada: { type: DataTypes.STRING(20), allowNull: true },
    verificacionNota: { type: DataTypes.TEXT, allowNull: true },
    verificacionAt: { type: DataTypes.DATE, allowNull: true },
    // Destino marcado por el cliente en el mapa de la tienda: dirección que entendió Google + "(GPS: lat, lng)"
    direccionEntrega: { type: DataTypes.TEXT, allowNull: true },
    numeroDocumentoAnterior: { type: DataTypes.STRING, allowNull: true },
    quienRetira: {
        type: DataTypes.STRING, 
        allowNull: true // Nombre y Cédula del chofer
    },
    fechaHoraRetiro: { 
        type: DataTypes.DATE, 
        allowNull: true 
    },
    statusDespacho: {
        type: DataTypes.ENUM('Pendiente', 'Empacado', 'Parcial', 'Completado', 'Cancelado'),
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
    vendedorId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    empacadorId: { // 🔥 AGREGADO
        type: DataTypes.INTEGER,
        allowNull: true
    },
    etiquetadorId: { // 🔥 AGREGADO
        type: DataTypes.INTEGER,
        allowNull: true
    },
    // Firmas de logística: cuándo el empacador / etiquetador asignado confirmó que terminó su parte
    // Datos fiscales de la factura
    numeroControl: { type: DataTypes.STRING(30), allowNull: true },
    // Pedido B2B que pidió más de lo que hay en almacén: PENDIENTE hasta que administración lo confirme o ajuste (sin cuenta por cobrar ni retención aún)
    revisionStock: { type: DataTypes.STRING(10), allowNull: true },
    revisionNota: { type: DataTypes.TEXT, allowNull: true },
    revisionResueltaAt: { type: DataTypes.DATE, allowNull: true },
    tipoTransaccion: { type: DataTypes.STRING(2), allowNull: false, defaultValue: '01' }, // 01 = registro
    asignadoAt: { type: DataTypes.DATE, allowNull: true },
    empacadoAt: { type: DataTypes.DATE, allowNull: true },
    etiquetadoAt: { type: DataTypes.DATE, allowNull: true },
    // Evidencia del empaque verificado (wizard): fotos de la caja y si el empaque pasó por la verificación renglón a renglón
    fotoCajaAbiertaUrl: { type: DataTypes.TEXT, allowNull: true },
    fotoCajaSelladaUrl: { type: DataTypes.TEXT, allowNull: true },
    empaqueIniciadoAt: { type: DataTypes.DATE, allowNull: true },
    empaqueVerificado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Cuándo se borraron las fotos definitivas por vencer el plazo de retención (queda la nota en la evidencia)
    fotosVencidasAt: { type: DataTypes.DATE, allowNull: true },
    tipoEntrega: {
        type: DataTypes.ENUM('pickup', 'delivery', 'flete'),
        allowNull: false,
        defaultValue: 'pickup'
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
    Venta.belongsTo(models.User, { foreignKey: 'empacadorId', as: 'empacador' });
    Venta.belongsTo(models.User, { foreignKey: 'etiquetadorId', as: 'etiquetador' });
    Venta.hasMany(models.VentaDetalle, { foreignKey: 'ventaId', as: 'detalles', onDelete: 'CASCADE' });
    Venta.hasMany(models.RetencionIva, { foreignKey: 'ventaId', as: 'retenciones' });
    Venta.hasMany(models.Abono, { foreignKey: 'ventaId', as: 'abonos', onDelete: 'CASCADE' });
    Venta.hasMany(models.MovimientoFinanciero, { foreignKey: 'ventaId', as: 'movimientos' });
    Venta.hasMany(models.SalidaInventario, { foreignKey: 'ventaId', as: 'salidasInventario' });
    Venta.hasMany(models.CuentaPorCobrar, { foreignKey: 'ventaId', as: 'cuentaPorCobrar' });
    Venta.hasMany(models.NotaFiscal, { foreignKey: 'ventaId', as: 'notas' });
    Venta.hasMany(models.VentaEmpaqueItem, { foreignKey: 'ventaId', as: 'empaqueItems', onDelete: 'CASCADE' });
    Venta.hasOne(models.PagoSms, { foreignKey: 'ventaId', as: 'pagoSms' })
};

module.exports = Venta;