// models/Proveedor.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Proveedor = sequelize.define('Proveedor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  identificacion: { // RIF
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  nombre: { // Razón social
    type: DataTypes.STRING,
    allowNull: false, 
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
    type: DataTypes.INTEGER, 
    defaultValue: 75,
    validate: {
      isIn: {
        args: [[75, 100]],
        msg: "El porcentaje de retención solo puede ser 75 o 100"
      }
    }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    set(value) {
      this.setDataValue('email', value === "" ? null : value.trim());
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
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Proveedores',
  timestamps: true,
});

Proveedor.associate = (models) => {
  // Un proveedor tiene muchas entradas de inventario (compras que le hacemos)
  Proveedor.hasMany(models.EntradaInventario, { foreignKey: 'proveedorId', as: 'entradas' });
};

module.exports = Proveedor;