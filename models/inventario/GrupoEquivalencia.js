const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const GrupoEquivalencia = sequelize.define('GrupoEquivalencia', {
    nombre: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: true 
    },
    stockMinimoGlobal: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    imagen: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, { 
    tableName: 'GruposEquivalencia', 
    timestamps: true 
});

GrupoEquivalencia.associate = (models) => {
    GrupoEquivalencia.hasMany(models.Producto, { foreignKey: 'grupoEquivalenciaId', as: 'productos' });
    GrupoEquivalencia.belongsTo(models.Categoria, { foreignKey: 'categoriaId', as: 'categoria' });
};

module.exports = GrupoEquivalencia;