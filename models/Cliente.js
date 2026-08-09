// models/Cliente.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Cliente = sequelize.define('Cliente', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  identificacion: { // RIF, cedula
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  nombre: { // Nombre de la empresa o persona jurídica
    type: DataTypes.STRING,
    allowNull: true, // Puede ser nulo si es persona natural
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  esContribuyenteEspecial: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  retencionIvaPorDefecto: {
    type: DataTypes.ENUM('75', '100'),
    defaultValue: '75'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    set(value) {
      // Si el valor es una cadena vacía o solo espacios, guarda NULL
      this.setDataValue('email', value === "" ? null : value);
    },
    validate: {
      isEmail: {
        msg: "Formato de email inválido"
      }
    },
  },
  direccion: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  imagen: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  notas: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'Clientes',
  timestamps: true, // createdAt, updatedAt
});

// Este `associate` se llamará desde `models/index.js`
Cliente.associate = (models) => {
};

module.exports = Cliente;