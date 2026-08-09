const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Consumible = sequelize.define('Consumible', {
    nombre: { // Ej: "Aceite 15W40 Venoco", "Filtro WIX 51515"
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    tipo: {
        type: DataTypes.ENUM('fungible', 'serializado'),
        allowNull: false

    },
    ubicacionBase: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Almacén Principal' // Ej: "Estante A, Nivel 2"
    },
    categoria: {
        type: DataTypes.STRING,
        allowNull: false
    }
    ,
    stockAlmacen: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    stockAsignado: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    stockMinimo: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0.00
    },
    precioPromedio: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
    },
    unidadMedida: {
        type: DataTypes.ENUM('litros', 'kilogramos', 'unidades', 'metros', 'galones'),
        allowNull: false
    },
    // 🔥 EL CAMPO MAESTRO PARA EVITAR CREAR TABLAS NUEVAS
    datosTecnicos: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    tipoSpecifico: {
        type: DataTypes.ENUM('Aceite', 'Filtro', 'Neumatico', 'Bateria', 'Correa', 'Sensor', 'Repuesto General', "Manguera", "General", "Combustible", "Herramienta"),
        allowNull: false,
        defaultValue: 'Repuesto General'
    }

}, {
    tableName: 'Consumibles',
    timestamps: true,
});

Consumible.associate = (models) => {
    Consumible.hasMany(models.ConsumibleSerializado, { foreignKey: 'consumibleId', as: 'serializados', onDelete: 'CASCADE' });
    Consumible.hasMany(models.SalidaInventario, { foreignKey: 'consumibleId', onDelete: 'CASCADE' });
    Consumible.hasMany(models.EntradaInventario, { foreignKey: 'consumibleId', onDelete: 'CASCADE' });
};

module.exports = Consumible;