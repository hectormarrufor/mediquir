// models/Cliente.js
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Cliente = sequelize.define('Cliente', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  identificacion: { 
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  nombre: { 
    type: DataTypes.STRING,
    allowNull: true, 
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
}, {
  tableName: 'Clientes',
  timestamps: true,
});

Cliente.associate = (models) => {
  // 🔥 CORRECCIÓN 1: Un cliente solo tiene UN usuario asociado
  Cliente.hasOne(models.User, { foreignKey: 'clienteId', as: 'usuario' });
  
  // 🔥 CORRECCIÓN 2: Semántica perfecta. El modelo es Venta, pero para el cliente son sus "pedidos"
  Cliente.hasMany(models.Venta, { foreignKey: 'clienteId', as: 'pedidos' });
};

module.exports = Cliente;