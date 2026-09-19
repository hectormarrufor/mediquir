const sequelize = require('../sequelize');
const { DataTypes } = require('sequelize');

// Una notificación se envía a un grupo (todos, departamentos, puestos o un usuario), así que
// "leída" no puede ser un campo de Notificacion: cada usuario tiene su propio estado de lectura.
// Esta tabla guarda una fila por (notificación, usuario) solo cuando ese usuario la marca como leída.
const NotificacionLeida = sequelize.define('NotificacionLeida', {
  notificacionId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  leidaAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'NotificacionesLeidas',
  timestamps: false,
  indexes: [
    // Impide duplicados y permite INSERT ... ON CONFLICT DO NOTHING
    { unique: true, fields: ['notificacionId', 'usuarioId'] },
    // Acelera "cuántas tengo sin leer" para un usuario
    { fields: ['usuarioId'] },
  ],
});

NotificacionLeida.associate = (models) => {
  NotificacionLeida.belongsTo(models.Notificacion, { foreignKey: 'notificacionId', onDelete: 'CASCADE' });
  NotificacionLeida.belongsTo(models.User, { foreignKey: 'usuarioId', onDelete: 'CASCADE' });
};

module.exports = NotificacionLeida;
