// models/Tarea.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');


  const Tarea = sequelize.define('Tarea', {
    titulo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    estado: {
      type: DataTypes.ENUM('Pendiente', 'En Progreso', 'Completada', 'Cancelada'),
      defaultValue: 'Pendiente',
    },
    prioridad: {
      type: DataTypes.ENUM('Baja', 'Media', 'Alta', 'Urgente'),
      defaultValue: 'Media',
    },
    fechaVencimiento: {
      type: DataTypes.DATEONLY, // O DATE si necesitas hora exacta
      allowNull: true,
    },
    // Claves foráneas (se definen mejor en las asociaciones, pero las declaramos aquí para claridad)

  }, {
    tableName: 'Tareas',
    timestamps: true,
  });

  Tarea.associate = (models) => {
    Tarea.belongsTo(models.User, { foreignKey: 'creadoPorId', as: 'creador' });
    Tarea.belongsTo(models.User, { foreignKey: 'asignadoAId', as: 'responsable' });
  }

module.exports = Tarea;