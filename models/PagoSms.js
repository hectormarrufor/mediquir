const sequelize = require('../sequelize');
const { DataTypes } = require('sequelize');


const PagoSms = sequelize.define('PagoSms', {
    banco: DataTypes.STRING,
    referencia: DataTypes.STRING, // Los 4 o 6 dígitos
    monto: DataTypes.DECIMAL(12, 2),
    telefonoEmisor: DataTypes.STRING,
    fechaHora: DataTypes.DATE,
    procesado: { type: DataTypes.BOOLEAN, defaultValue: false } // Para saber si ya se usó en una venta
}, {
  tableName: 'PagoSms'
});

module.exports = PagoSms;