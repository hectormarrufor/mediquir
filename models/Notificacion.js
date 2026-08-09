const sequelize = require('../sequelize');
const { DataTypes } = require('sequelize');


const Notificacion = sequelize.define('Notificacion', {
  titulo: { type: DataTypes.STRING, allowNull: false },
  mensaje: { type: DataTypes.TEXT, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: true },
  
  // AHORA SON ARREGLOS (Listas de strings)
  // Ejemplo: ["Mantenimiento", "RRHH"]
  departamentosObjetivo: { 
    type: DataTypes.JSONB, // Usa JSONB si estás en Postgres puro
    allowNull: true 
  },
  
  // Ejemplo: ["Chofer", "Vigilante"]
  puestosObjetivo: { 
    type: DataTypes.JSONB, 
    allowNull: true 
  },
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  
  fechaHoraCaracas: { type: DataTypes.STRING, allowNull: true },
  tipo: { type: DataTypes.ENUM('Info', 'Alerta', 'Critico'), defaultValue: 'Info' }
}, {
  tableName: 'Notificaciones'
});

Notificacion.associate = (models) => {
  Notificacion.belongsTo(models.User, { foreignKey: 'usuarioId', as: 'usuario' });
};

module.exports = Notificacion;