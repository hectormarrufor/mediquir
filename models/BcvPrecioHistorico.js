// models/BcvPrecioHistorico.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize'); // Asegúrate de que esta ruta sea correcta para tu instancia de Sequelize

const BcvPrecioHistorico = sequelize.define('BcvPrecioHistorico', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  fecha: {
    type: DataTypes.DATEONLY, // Para almacenar solo la fecha (YYYY-MM-DD)
    allowNull: false,
  },
  hora: {
    type: DataTypes.STRING, // Para almacenar la hora como string (HH:MM:SS)
    allowNull: false,
  },
  monto: {
    type: DataTypes.DECIMAL(10, 2), // Para almacenar el precio con 2 decimales
    allowNull: false,
  },
  montoEur: {
    type: DataTypes.DECIMAL(10, 2), // Precio en EUR
    allowNull: true,
  },
  montoUsdt: {
    type: DataTypes.DECIMAL(10, 2), // Precio en USDT
    allowNull: true,
  },
}, {
  tableName: 'BcvPreciosHistoricos',
  timestamps: true, // Esto agregará createdAt y updatedAt automáticamente
});

module.exports = BcvPrecioHistorico;