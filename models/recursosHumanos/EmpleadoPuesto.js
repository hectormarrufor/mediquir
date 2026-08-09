// models/recursosHumanos/EmpleadoPuesto.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');


  const EmpleadoPuesto = sequelize.define('EmpleadoPuesto', {
    id: { // Opcional, pero útil si necesitas atributos adicionales en la relación (ej. fecha de asignación del puesto)
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    empleadoId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Empleados', // Nombre de la tabla
        key: 'id',
      },
      allowNull: false,
    },
    puestoId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Puestos', // Nombre de la tabla
        key: 'id',
      },
      allowNull: false,
    },

  }, {
    tableName: 'EmpleadoPuestos',
    timestamps: true,
    // Asegurarse de que un empleado no tenga el mismo puesto activo dos veces al mismo tiempo
    indexes: [
      {
        unique: true,
        fields: ['empleadoId', 'puestoId'],
      },
    ],
  });

  EmpleadoPuesto.associate = (models) => {
    EmpleadoPuesto.belongsTo(models.Empleado, { foreignKey: 'empleadoId', as: 'empleado' });
    EmpleadoPuesto.belongsTo(models.Puesto, { foreignKey: 'puestoId', as: 'puesto' });
  };

  module.exports = EmpleadoPuesto;
