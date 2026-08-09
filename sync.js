// sync.js
// Solo necesitas importar el objeto 'db' desde tu index.js central
const db = require('./models'); // Ajusta la ruta si tu index.js está en otro lugar, ej. './models/flota'

db.sequelize.sync({ alter: true }) // Usa la instancia de sequelize del objeto db
    .then(() => {
        console.log(`\x1b[42m MODELOS SINCRONIZADOS CON LA BASE DE DATOS \x1b[0m`);
        
    })
    .catch(error => {
        console.error(`\x1b[41m ERROR AL SINCRONIZAR LOS MODELOS: ${error} \x1b[0m`);
        
    });