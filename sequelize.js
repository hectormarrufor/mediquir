const { Sequelize } = require('sequelize');
require('dotenv').config();

const globalForDb = globalThis;

if (!globalForDb.sequelize) {
  let pgModule;
  try {
    pgModule = require('pg');
  } catch (e) {
    console.error('No se pudo encontrar el módulo pg.');
    throw e;
  }

  globalForDb.sequelize = new Sequelize(process.env.DB_URI, {
    dialect: 'postgres',
    dialectModule: pgModule,
    logging: false,
    timezone: '-04:00',
    pool: {
      max: 2,           // 1 para una transacción + 1 de holgura; techo = instancias × 2
      min: 0,
      idle: 4000,       // < idle_session_timeout (5000): el cliente cierra antes que el servidor
      evict: 1000,
      acquire: 15000,   // falla antes del maxDuration en vez de colgarse
    },
    dialectOptions: {
      useUTC: false,
      timezone: 'America/Caracas',
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      // 🔥 EL FRANCOTIRADOR DEL LADO DEL SERVIDOR (AIVEN) 🔥
      // Le inyectamos comandos nativos a Postgres al momento de conectarnos.
      // -c idle_session_timeout=5000: Si el contenedor de Vercel se congela y deja la conexión Idle, Aiven la destruye a los 5 segundos.
      // -c statement_timeout=20000: Cancela queries que tarden más de 20s.
      options: "-c idle_session_timeout=5000 -c statement_timeout=20000 -c idle_in_transaction_session_timeout=10000"
    },
    define: {
      // 2. Opcional pero recomendado: evita que cambie los nombres de tablas a plurales automáticos si ya los tienes definidos
      freezeTableName: true 
    }
  });
}

module.exports = globalForDb.sequelize;