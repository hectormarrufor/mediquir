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
    pool: {
      max: 1,           // 🔥 CRÍTICO: 1 contenedor Vercel = 1 conexión. No más.
      min: 0,           // Siempre 0.
      idle: 1000,       
      acquire: 20000,
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      // 🔥 EL FRANCOTIRADOR DEL LADO DEL SERVIDOR (AIVEN) 🔥
      // Le inyectamos comandos nativos a Postgres al momento de conectarnos.
      // -c idle_session_timeout=5000: Si el contenedor de Vercel se congela y deja la conexión Idle, Aiven la destruye a los 5 segundos.
      // -c statement_timeout=20000: Cancela queries que tarden más de 20s.
      options: "-c idle_session_timeout=5000 -c statement_timeout=20000"
    }
  });
}

module.exports = globalForDb.sequelize;