const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Producto = sequelize.define('Producto', {
    nombre: { // Ej: "Aceite 15W40 Venoco", "Filtro WIX 51515"
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    codigo: { // Ej: "ACE-15W40-VEN", "FIL-WIX-51515"
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    porcentajeIva: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            isIn: {
                args: [[0, 8, 16]], // Solo permite 0, 8 o 16
                msg: "El porcentaje de IVA solo puede ser 0, 8 o 16"
            }
        },
        defaultValue: 16 // Si es exento, al crearlo se le pone 0.00
    },
    imagen: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    stockAlmacen: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    stockMinimo: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00
    },
    precio: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },

}, {
    tableName: 'Productos',
    timestamps: true,
});

Producto.associate = (models) => {
    Producto.belongsTo(models.Categoria, {
        foreignKey: 'categoriaId',
        as: 'categoria'
    });
    Producto.belongsToMany(models.Tag, {
        through: 'ProductoTags',
        as: 'tags',
        foreignKey: 'productoId'
    });
    Producto.hasMany(models.SalidaInventario, { foreignKey: 'productoId', onDelete: 'CASCADE' });
    Producto.hasMany(models.EntradaInventario, { foreignKey: 'productoId', onDelete: 'CASCADE' });
};

module.exports = Producto;