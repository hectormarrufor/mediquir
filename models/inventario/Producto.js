const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const Producto = sequelize.define('Producto', {
    nombre: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: false, 
    },
    imagen: { 
        type: DataTypes.STRING, 
        allowNull: true, 
    },
    
    // --- CONTROL DE STOCK E IMPUESTOS ---
    stockAlmacen: { 
        type: DataTypes.DECIMAL(10, 2), 
        allowNull: false, 
        defaultValue: 0.00 
    },
    stockMinimo: { 
        type: DataTypes.DECIMAL(10, 2), 
        defaultValue: 0.00 
    },
    porcentajeIva: { 
        type: DataTypes.DECIMAL(5, 2), 
        allowNull: false, 
        defaultValue: 16.00 // Si es exento, se guarda 0
    },

    codigo: { 
        type: DataTypes.STRING, 
        allowNull: true, 
        unique: true, // Es vital que sea único para que no haya dos SKUs iguales
    },
    // Código de barras IMPRESO en el empaque (EAN/UPC), distinto del código interno. Vacío = el producto no trae código de barras.
    // El empaque de pedidos lo usa para comprobar que se tomó el producto correcto (sin él se verifica por la marca).
    codigoBarras: {
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    // --- ESTRUCTURA DE PRECIOS Y COSTOS (En USD) ---
    costoUsd: { 
        type: DataTypes.DECIMAL(12, 5), // costo de UNA unidad: necesita más decimales (p. ej. 0.00825 por guante)
        comment: 'Costo por unidad',
        allowNull: false, 
        defaultValue: 0.00 
    },
    precio6: { 
        type: DataTypes.DECIMAL(10, 3), 
        allowNull: true, 
        defaultValue: 0.00 // Precio manual en USD
    },
    precio7: { // 🔥 NUEVO CAMPO MANUAL
        type: DataTypes.DECIMAL(10, 3), 
        allowNull: true, 
        defaultValue: 0.00 // Precio manual en USD
    },
    porcentajeDescuento: {
        type: DataTypes.INTEGER, // Guardaremos números enteros como 15, 20, 50
        allowNull: true,
        defaultValue: 0
    },
    nroVentas: { 
        type: DataTypes.INTEGER, 
        allowNull: false, 
        defaultValue: 0 // Inicia en 0 y va subiendo con cada pedido
    },
    // --- LOGÍSTICA B2B ---
    presentacion: {
        type: DataTypes.ENUM('unidad', 'par', 'paqx2', 'paqx4', 'caja'),
        allowNull: false,
        defaultValue: 'unidad'
    },
    unidadesPorCaja: {
        type: DataTypes.INTEGER,
        allowNull: true, // Solo se llena si presentacion es 'caja'
    },
    cajasPorBulto: {
        type: DataTypes.INTEGER,
        allowNull: true, // Solo si presentacion es 'caja': cuántas cajas trae el bulto
    },
    unidadesPorBulto: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1 // TOTAL de unidades del bulto (si hay cajas: cajasPorBulto x unidadesPorCaja)
    }

}, { 
    tableName: 'Productos', 
    timestamps: true, 
});

Producto.associate = (models) => {
    // Relaciones 1 a N (Categoría, Marca, GrupoEquivalencia)
    Producto.belongsTo(models.Categoria, { foreignKey: 'categoriaId', as: 'categoria' });
    Producto.belongsTo(models.Marca, { foreignKey: 'marcaId', as: 'marca' });
    Producto.belongsTo(models.GrupoEquivalencia, { foreignKey: 'grupoEquivalenciaId', as: 'grupoEquivalencia' });
    
    // Relación N a M (Tags)
    Producto.belongsToMany(models.Tag, { through: 'ProductoTags', foreignKey: 'productoId', as: 'tags' });

    // Historial de Inventario
    Producto.hasMany(models.SalidaInventario, { foreignKey: 'productoId', onDelete: 'CASCADE' });
    Producto.hasMany(models.EntradaInventario, { foreignKey: 'productoId', onDelete: 'CASCADE' });
};

module.exports = Producto;