const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

// Número de control de la forma libre que NUNCA llevó un documento: la hoja se dañó (café, se rompió, se imprimió mal) o se saltó.
// Deja explicado el hueco en la secuencia de números de control y el sistema no vuelve a asignar ese número.
//   numero: la parte numérica del control (00-0122660 -> 122660)
const FormaAnulada = sequelize.define('FormaAnulada', {
    numero: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    usuarioId: { type: DataTypes.INTEGER, allowNull: true },
}, {
    tableName: 'FormasAnuladas',
    timestamps: true,
});

module.exports = FormaAnulada;
