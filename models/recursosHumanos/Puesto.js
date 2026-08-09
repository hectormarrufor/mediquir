// models/recursosHumanos/Puesto.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Puesto = sequelize.define('Puesto', {
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
  salarioBaseSugerido: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
  },
   departamentoId: { // ✨ NUEVO CAMPO
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Departamentos',
            key: 'id'
        }
    }
}, {
  tableName: 'Puestos',
  timestamps: true,
});

Puesto.associate = (models) => {
    // Un Puesto puede tener muchos Empleados
    Puesto.belongsToMany(models.Empleado, {
        through: 'EmpleadoPuesto',
        foreignKey: 'puestoId',
        as: 'empleados'
    });

    // Un Puesto pertenece a un Departamento
  Puesto.belongsTo(models.Departamento, {
        foreignKey: 'departamentoId',
        as: 'departamento'
    });
};

module.exports = Puesto;