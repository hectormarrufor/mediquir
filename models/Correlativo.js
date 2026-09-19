const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');
const Correlativo = sequelize.define('Correlativo', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    prefijo: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        // Ej: 'F' (Factura), 'NE' (Nota Entrega), 'V' (Venta Rápida)
    },
    siguienteNumero: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    cerosRelleno: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 5 // Para que formatee como F-00001
    },
    // false = falta preguntarle a la persona con qué número empieza esta numeración (notas de crédito y débito, número de control)
    configurado: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
}, {
    tableName: 'correlativos',
    timestamps: false
});

module.exports = Correlativo;