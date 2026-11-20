// Agrega columnas JSONB para cuentas bancarias y pagos móviles de empleados y cuenta destino en recibos de nómina.
require('dotenv').config();
const sequelize = require('../../sequelize');

(async () => {
    try {
        await sequelize.query(`ALTER TABLE "Empleados" ADD COLUMN IF NOT EXISTS "datosPago" JSONB NOT NULL DEFAULT '[]'::jsonb;`);
        await sequelize.query(`ALTER TABLE "PagosEmpleados" ADD COLUMN IF NOT EXISTS "cuentaDestino" JSONB NULL;`);
        console.log('Columnas "Empleados"."datosPago" y "PagosEmpleados"."cuentaDestino" listas.');
    } catch (err) {
        console.error('Error en migración:', err);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
})();
