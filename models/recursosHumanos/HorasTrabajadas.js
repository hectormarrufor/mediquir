// models/recursosHumanos/HorasTrabajadas.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../sequelize");

const HorasTrabajadas = sequelize.define("HorasTrabajadas", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    fecha: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    horas: {
        type: DataTypes.FLOAT, // permite decimales (ej: 7.5 horas)
        allowNull: false,
    },
    inicio: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    fin: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    observaciones: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
});

// Relaciones
HorasTrabajadas.associate = (models) => {
    HorasTrabajadas.belongsTo(models.Empleado, { foreignKey: "empleadoId" });
    HorasTrabajadas.belongsTo(models.User, {
    foreignKey: "creadorId",
    as: "creador"
});
}

module.exports = HorasTrabajadas;