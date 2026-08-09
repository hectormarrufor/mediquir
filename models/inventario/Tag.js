const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Tag = sequelize.define('Tag', {
    nombre: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: true 
    }
}, { 
    tableName: 'Tags', 
    timestamps: true 
});

Tag.associate = (models) => {
    // Relación Muchos a Muchos con Producto
    Tag.belongsToMany(models.Producto, { 
        through: 'ProductoTags', 
        foreignKey: 'tagId', 
        as: 'productos' 
    });
};

module.exports = Tag;