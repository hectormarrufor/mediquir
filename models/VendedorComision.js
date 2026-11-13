// Vendedor a comisión: cobra un % de lo que vende, no forma parte de la nómina y no tiene usuario ni acceso al sistema.
// Cada línea de su hoja (factura, abono o nota de crédito) es una ComisionVenta.
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const VendedorComision = sequelize.define('VendedorComision', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    porcentaje: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 5 }, // % de comisión por defecto
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    notas: { type: DataTypes.TEXT, allowNull: true },
    // Lo ya pagado de su comisión acumulada que todavía no cubre una línea entera (pagos parciales): se descuenta de lo acumulado por pagar
    comisionAbonadaUsd: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
}, { tableName: 'VendedoresComision', timestamps: true });

VendedorComision.associate = (models) => {
    VendedorComision.hasMany(models.ComisionVenta, { foreignKey: 'vendedorId', as: 'comisiones', onDelete: 'CASCADE' });
};

module.exports = VendedorComision;
