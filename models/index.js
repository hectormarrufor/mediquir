// index.js
const sequelize = require('../sequelize');

const db = {
    CuentaPorPagar: require('./CuentaPorPagar'),
    CuentaPorCobrar: require('./CuentaPorCobrar'),
    FacturaCompra: require('./FacturaCompra'),
    Proveedor: require('./Proveedor'),
    Venta: require('./Venta'),
    Correlativo: require('./Correlativo'),
    VentaDetalle: require('./VentaDetalle'),
    Marca: require('./inventario/Marca'),
    GrupoEquivalencia: require('./inventario/GrupoEquivalencia'),
    CategoriaFinanciera: require('./finanzas/CategoriaFinanciera'),
    MovimientoFinanciero: require('./finanzas/MovimientoFinanciero'),
    Abono: require('./facturacion/Abono'),
    Cliente: require('./Cliente'),
    Tag: require('./inventario/Tag'),
    Categoria: require('./inventario/Categoria'),
    MenuPermission: require('./MenuPermission'),
    Tarea: require('./recursosHumanos/Tarea'),
    BcvPrecioHistorico: require('./BcvPrecioHistorico'),
    
    // RECURSOS HUMANOS
    User: require('./user'),
    Empleado: require('./recursosHumanos/Empleado'),

    DocumentoEmpleado: require('./recursosHumanos/DocumentoEmpleado'),
    Puesto: require('./recursosHumanos/Puesto'),
    EmpleadoPuesto: require('./recursosHumanos/EmpleadoPuesto'),
    Departamento: require('./recursosHumanos/Departamento'),
    PushSubscription: require('./pushSubscription'),

    Producto: require('./inventario/Producto'),
    EntradaInventario: require('./inventario/EntradaInventario'),
    SalidaInventario: require('./inventario/SalidaInventario'),
    
    //Facturacion
    Cliente: require('./Cliente'),
    
    // NOTIFICACIONES
    Notificacion: require('./Notificacion'),
    
};

// --- Llamar al método 'associate' de cada modelo ---
Object.values(db).forEach(model => {
    if (typeof model.associate === 'function') {
        model.associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = require('sequelize');

module.exports = db;