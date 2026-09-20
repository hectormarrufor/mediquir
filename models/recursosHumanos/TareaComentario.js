// models/recursosHumanos/TareaComentario.js
// Conversación y bitácora de una tarea: COMENTARIO (lo escribe una persona) o ACTIVIDAD (lo anota el sistema: cambió de estado, se reasignó...)
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const TareaComentario = sequelize.define('TareaComentario', {
    tareaId: { type: DataTypes.INTEGER, allowNull: false },
    usuarioId: { type: DataTypes.INTEGER, allowNull: true },
    tipo: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'COMENTARIO' },
    texto: { type: DataTypes.TEXT, allowNull: false },
}, { tableName: 'TareaComentarios', timestamps: true });

TareaComentario.associate = (models) => {
    TareaComentario.belongsTo(models.Tarea, { foreignKey: 'tareaId', as: 'tarea' });
    TareaComentario.belongsTo(models.User, { foreignKey: 'usuarioId', as: 'autor' });
};

module.exports = TareaComentario;
