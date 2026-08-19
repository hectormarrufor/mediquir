const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const EntradaInventario = sequelize.define('EntradaInventario', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    cantidad: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    fecha: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    justificacion: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    estado: {
        type: DataTypes.ENUM('Pendiente', 'Recibida', 'Cancelada', 'Devuelta al Proveedor'),
        defaultValue: 'Pendiente',
    },
    // El costo unitario al que entró este lote (Vital para calcular rentabilidad futura)
    costoUnitario: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false,
    },
    // 🔥 TRAZABILIDAD 🔥
    proveedorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Proveedores', key: 'id' } // Opcional, si tienes tabla Proveedores
    },
    registradoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Usuarios', key: 'id' },
    },
    recibidoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Usuarios', key: 'id' },
        comment: 'Almacenista que verificó y guardó físicamente la mercancía'
    },
}, {
    tableName: 'EntradasInventario',
    timestamps: true,
    underscored: true,
});

EntradaInventario.associate = (models) => {
    EntradaInventario.belongsTo(models.Producto, {
        foreignKey: 'productoId',
        as: 'producto'
    });
    EntradaInventario.belongsTo(models.User, {
        foreignKey: 'registradoPorId',
        as: 'registrador'
    });
    EntradaInventario.belongsTo(models.User, {
        foreignKey: 'recibidoPorId',
        as: 'recibidor'
    });
    EntradaInventario.belongsTo(models.Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
    EntradaInventario.belongsTo(models.FacturaCompra, { foreignKey: 'facturaCompraId', as: 'facturaCompra' });
};

module.exports = EntradaInventario;