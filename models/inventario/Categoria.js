const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Categoria = sequelize.define('Categoria', {
    nombre: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // Ej: "Insumos Descartables", "Equipos Médicos"
    },
    descripcion: {
        type: DataTypes.STRING,
        allowNull: true,
    }
}, {
    tableName: 'Categorias',
    timestamps: false, // Las categorías suelen ser estáticas, no necesitan createdAt/updatedAt
});

Categoria.associate = (models) => {
    // Una categoría tiene muchos productos
    Categoria.hasMany(models.Producto, { foreignKey: 'categoriaId', as: 'productos' });
};

module.exports = Categoria;