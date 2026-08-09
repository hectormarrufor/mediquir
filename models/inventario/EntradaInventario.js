const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const EntradaInventario = sequelize.define('EntradaInventario', {
            cantidad: {
                type: DataTypes.DECIMAL(18, 4),
                allowNull: true
                },
            costoUnitario: {
                type: DataTypes.DECIMAL(18, 4),
                allowNull: true
            },
            tipo: {
                type: DataTypes.ENUM('Compra', 'Otro'),
                allowNull: true,
                defaultValue: 'Otro'
            },
            observacion: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: `Recepción de Combustible. OC: N/A`
            },
            fecha: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: DataTypes.NOW
            },

}, {
    tableName: 'EntradasInventario',
    timestamps: true,
});

EntradaInventario.associate = (models) => {
    EntradaInventario.belongsTo(models.Consumible, {
        foreignKey: 'consumibleId',
        as: 'consumible'
    });
    EntradaInventario.belongsTo(models.User, {
        foreignKey: 'usuarioId',
        as: 'usuario'
    });
};

module.exports = EntradaInventario;