const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const SalidaInventario = sequelize.define('SalidaInventario', {
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
        type: DataTypes.ENUM('Pendiente', 'Entregada', 'Cancelada', 'Rechazada', 'Esperando Firma', 'Esperando Devolucion', 'Devuelta'),
        defaultValue: 'Pendiente',
    },
    costoAlMomento: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    // 🔥 NUEVOS CAMPOS DE TRAZABILIDAD Y CUSTODIA 🔥
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
    SalidaInventario.belongsTo(models.Consumible, {
        foreignKey: 'consumibleId',
        as: 'consumible'
    });
    SalidaInventario.belongsTo(models.User, {
        foreignKey: 'solicitadoPorId',
        as: 'solicitante'
    });
    SalidaInventario.belongsTo(models.User, {
        foreignKey: 'despachadoPorId',
        as: 'despachador'
    });
};

module.exports = SalidaInventario;