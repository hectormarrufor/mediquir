// models/inventario/SalidaInventario.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const SalidaInventario = sequelize.define('SalidaInventario', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    // 🔥 NUEVO CAMPO: Para trazar exactamente a qué factura pertenece esta salida
    ventaId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'Ventas', key: 'id' }
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
        type: DataTypes.ENUM('Pendiente','Empacada', 'Entregada', 'Cancelada', 'Rechazada', 'Esperando Firma', 'Esperando Devolucion', 'Devuelta'),
        defaultValue: 'Pendiente',
    },
    costoAlMomento: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    solicitadoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Usuarios', key: 'id' },
    },
    despachadoPorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Usuarios', key: 'id' },
        comment: 'ID del almacenista/usuario del sistema que realiza el despacho físico'
    },
}, {
    tableName: 'SalidasInventario',
    timestamps: true,
    underscored: true,
});

SalidaInventario.associate = (models) => {
    SalidaInventario.belongsTo(models.Producto, {
        foreignKey: 'productoId',
        as: 'producto'
    });
    SalidaInventario.belongsTo(models.User, {
        foreignKey: 'solicitadoPorId',
        as: 'solicitante'
    });
    SalidaInventario.belongsTo(models.User, {
        foreignKey: 'despachadoPorId',
        as: 'despachador'
    });
    // 🔥 ASOCIACIÓN CON LA VENTA 🔥
    SalidaInventario.belongsTo(models.Venta, {
        foreignKey: 'ventaId',
        as: 'venta'
    });
};

module.exports = SalidaInventario;