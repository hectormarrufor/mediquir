// models/finanzas/CategoriaFinanciera.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const CategoriaFinanciera = sequelize.define('CategoriaFinanciera', {
    nombre: { 
        type: DataTypes.STRING, 
        allowNull: false // Ej: "Abono de Pedido", "Nómina", "Servicios", "Papelería"
    },
    tipo: {
        type: DataTypes.ENUM('INGRESO', 'GASTO'),
        allowNull: false
    },
    descripcion: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, { tableName: 'CategoriasFinancieras', timestamps: false });

CategoriaFinanciera.associate = (models) => {
    CategoriaFinanciera.hasMany(models.MovimientoFinanciero, { foreignKey: 'categoriaId', as: 'movimientos' });
};

module.exports = CategoriaFinanciera;