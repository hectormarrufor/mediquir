import sequelize from "./sequelize.js";

try {
    await sequelize.authenticate();
    console.log(`\x1b[42m PRUEBA DE CONEXION CON LA BASE DE DATOS EXITOSA \x1b[0m`);
    
  } catch (error) {
    console.error(`\x1b[41m NO SE PUDO CONECTAR A LA BASE DE DATOS: ${error.message} \x1b[0m`);
  }