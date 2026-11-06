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
      this.setDataValue('email', value === undefined || value === null || value === "" ? null : String(value).trim());
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
  // Persona de contacto (en una clínica o droguería, con quién se habla)
  contactoNombre: { type: DataTypes.STRING(150), allowNull: true },
  contactoCargo: { type: DataTypes.STRING(100), allowNull: true },
  contactoTelefono: { type: DataTypes.STRING(40), allowNull: true },
  contactoEmail: { type: DataTypes.STRING(150), allowNull: true },
  // Crédito que da el proveedor: cuántas compras a crédito sin pagar a la vez (0 = no da crédito) y los días de cada una
  maxCreditos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3, validate: { min: 0, max: 100 } },
  diasCredito: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7, validate: { min: 0, max: 365 } },
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