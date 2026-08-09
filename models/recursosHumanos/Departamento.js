// models/recursosHumanos/Departamento.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Departamento = sequelize.define('Departamento', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    nombre: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    descripcion: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'Departamentos',
    timestamps: true,
});

Departamento.associate = (models) => {
  Departamento.hasMany(models.Puesto, {
        foreignKey: 'departamentoId',
        as: 'puestos'
    });
};

module.exports = Departamento;