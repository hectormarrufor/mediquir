const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Marca = sequelize.define('Marca', {
    nombre: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: true 
    },
    imagen: { 
    type: DataTypes.STRING, 
    allowNull: true, 
},
}, { 
    tableName: 'Marcas', 
    timestamps: true 
});

Marca.associate = (models) => {
    Marca.hasMany(models.Producto, { foreignKey: 'marcaId', as: 'productos' });
};

module.exports = Marca;