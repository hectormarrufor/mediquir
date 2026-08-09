// models/facturacion/PedidoRenglon.js
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const PedidoRenglon = sequelize.define('PedidoRenglon', {
    cantidadSolicitada: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    cantidadDespachada: { 
        type: DataTypes.INTEGER, 
        defaultValue: 0 // Inicia en 0. Si piden 10 y mandas 4, esto sube a 4 (Despacho Parcial)
    },
    // FOTOS (Snapshots) DEL PRECIO: Si mañana el producto sube de precio, este pedido histórico no se altera.
    precioFijo: { 
        type: DataTypes.DECIMAL(10, 2), 
        allowNull: false 
    },
    porcentajeIvaFijo: { 
        type: DataTypes.DECIMAL(5, 2), 
        allowNull: false 
    }
}, { tableName: 'PedidoRenglones', timestamps: false });

PedidoRenglon.associate = (models) => {
    PedidoRenglon.belongsTo(models.Pedido, { foreignKey: 'pedidoId', as: 'pedido' });
    PedidoRenglon.belongsTo(models.Producto, { foreignKey: 'productoId', as: 'producto' });
};

module.exports = PedidoRenglon;