// models/Presupuesto.js
// Presupuesto (cotización) para un cliente: NO es un documento fiscal, no usa correlativo de facturación ni
// afecta la contabilidad ni el inventario. Su "número" es simplemente P-000001 a partir del id.
// `renglones` guarda una FOTO de los productos, precios e IVA al momento de cotizar (si el precio del producto
// cambia después, el presupuesto ya emitido no cambia).
const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Presupuesto = sequelize.define('Presupuesto', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    clienteId: { type: DataTypes.INTEGER, allowNull: true },
    clienteNombre: { type: DataTypes.STRING, allowNull: false },
    clienteIdentificacion: { type: DataTypes.STRING, allowNull: true },
    clienteDireccion: { type: DataTypes.TEXT, allowNull: true },
    tarifa: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'precio6' }, // precio6 (mayor) o precio7 (detal): solo de referencia, cada renglón guarda su propio precio
    tasaCambio: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 1 },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    montoIva: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    totalFinal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    validoDias: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 15 },
    renglones: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    notas: { type: DataTypes.TEXT, allowNull: true },
    creadoPorId: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'Presupuestos', timestamps: true });

Presupuesto.associate = (models) => {
    Presupuesto.belongsTo(models.Cliente, { foreignKey: 'clienteId', as: 'cliente' });
};

module.exports = Presupuesto;
