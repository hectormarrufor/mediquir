const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Tag = sequelize.define('Tag', {
    nombre: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // Ej: "Estéril", "Descartable", "Pediátrico"
    }
}, {
    tableName: 'Tags',
    timestamps: false, // Los tags suelen ser estáticos, no necesitan createdAt/updatedAt
});

Tag.associate = (models) => {
    // Un Tag pertenece a muchos Productos a través de una tabla intermedia
    Tag.belongsToMany(models.Producto, { 
        through: 'ProductoTags', 
        as: 'productos',
        foreignKey: 'tagId' 
    });
};

module.exports = Tag;