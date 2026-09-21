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
    // Códigos de barras IMPRESOS en cada empaque (EAN/UPC), distintos del código interno. Vacío = ese empaque no trae código.
    // El empaque de pedidos los usa para comprobar que se tomó el producto correcto y en la presentación correcta
    // (sin código en el nivel que se entrega se verifica por la marca).
    codigoBarras: { // de la UNIDAD (el par, el paquete o la pieza)
        type: DataTypes.STRING(64),
        allowNull: true,
    },
    codigoBarrasCaja: { type: DataTypes.STRING(64), allowNull: true },
    codigoBarrasBulto: { type: DataTypes.STRING(64), allowNull: true },
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
        // 'caja' se conserva en el tipo de la base solo por compatibilidad: ya no se usa (la caja es unidadesPorCaja)
        type: DataTypes.ENUM('unidad', 'par', 'paqx2', 'paqx4', 'caja', 'cx100', 'cx200', 'metro', 'rollo', 'paqx100', 'paqx200',
            'paqx5', 'paqx6', 'paqx7', 'paqx10', 'paqx12', 'paqx14', 'paqx15', 'paqx20', 'paqx24', 'paqx50', 'paqx52', 'paqx72', 'paqx80', 'paqx85'),
        allowNull: false,
        defaultValue: 'unidad'
    },
    unidadesPorCaja: {
        type: DataTypes.INTEGER,
        allowNull: true, // Unidades que trae una caja (opcional, para cualquier presentación)
    },
    cajasPorBulto: {
        type: DataTypes.INTEGER,
        allowNull: true, // Solo si hay unidadesPorCaja: cuántas cajas trae el bulto
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