// models/recursosHumanos/Empleado.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');


const Empleado = sequelize.define('Empleado', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  cedula: {
    type: DataTypes.STRING(15),
    allowNull: false,
    unique: true,
  },
  imagen: {
    type: DataTypes.TEXT, // Usamos TEXT para almacenar la imagen en formato Base64
    allowNull: true,
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  apellido: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  fechaNacimiento: {
    type: DataTypes.DATEONLY, // Solo fecha, sin hora
    allowNull: true,
  },
  genero: {
    type: DataTypes.ENUM('Masculino', 'Femenino', 'Otro'),
    allowNull: true,
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  sueldo: { // Sueldo total del empleado, independiente de los puestos
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
  },
  tasaSueldo: {
    type: DataTypes.ENUM('bcv', 'euro', 'usdt'),
    allowNull: true,
    defaultValue: 'bcv',
  },
  fechaIngreso: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW, // Fecha actual por defecto, pero modificable
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM('Activo', 'Inactivo', 'Suspendido', "Reposo Medico", 'Vacaciones', 'Permiso', 'Retirado'),
    defaultValue: 'Activo',
    allowNull: false,
  },
  tallaCamisa: {
    type: DataTypes.ENUM('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'),
    allowNull: true,
  },
  tallaPantalon: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tallaCalzado: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tallaBraga: {
    type: DataTypes.STRING,
    allowNull: true,
  },

}, {
  tableName: 'Empleados',
  timestamps: true, // createdAt, updatedAt
});

Empleado.associate = (models) => {
  // Un Empleado puede tener varios Puestos (a través de la tabla intermedia EmpleadoPuesto)
  Empleado.belongsToMany(models.Puesto, {
    through: 'EmpleadoPuesto',
    foreignKey: 'empleadoId',
    otherKey: 'puestoId',
    as: 'puestos',
  });
  Empleado.hasOne(models.User, { foreignKey: 'empleadoId', as: 'usuario' });
  Empleado.hasMany(models.DocumentoEmpleado, { foreignKey: "empleadoId", as: "documentos" });
 

};

module.exports = Empleado;