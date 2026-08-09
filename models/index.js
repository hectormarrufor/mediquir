// index.js
const sequelize = require('../sequelize');

const db = {
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

    Consumible: require('./inventario/Consumible'),
    ConsumibleSerializado: require('./inventario/ConsumibleSerializado'),
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