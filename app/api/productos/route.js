import { NextResponse } from 'next/server';
import { Producto, Categoria, Marca, GrupoEquivalencia, Tag } from '@/models';
import sequelize from '@/sequelize';

// =======================================================================
// GET: Listar todo el inventario con sus relaciones completas
// =======================================================================
export async function GET() {
    try {
        const productos = await Producto.findAll({
            include: [
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'stockMinimoGlobal', 'imagen'] },
                { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } } // through vacío para no traer la tabla puente
            ],
            order: [['createdAt', 'DESC']]
        });
        
        return NextResponse.json(productos, { status: 200 });
    } catch (error) {
        console.error("Error al obtener productos:", error);
        return NextResponse.json({ error: 'Error interno del servidor al cargar inventario' }, { status: 500 });
    }
}

// =======================================================================
// POST: Crear nuevo producto (Operación Transaccional Segura)
// =======================================================================
export async function POST(req) {
    const t = await sequelize.transaction();

    try {
        const body = await req.json();
        
        // Extraemos los tags del cuerpo del mensaje, el resto de los datos quedan en productData
        const { tags, ...productData } = body;

        // 1. Validaciones básicas de seguridad en backend
        if (!productData.nombre || !productData.codigo || !productData.categoriaId || !productData.marcaId) {
            throw new Error('Faltan datos obligatorios (Nombre, Código, Categoría o Marca)');
        }

        // 2. Crear el Producto en la base de datos dentro de la transacción
        const nuevoProducto = await Producto.create({
            ...productData,
            // Aseguramos formatos numéricos
            costoUsd: parseFloat(productData.costoUsd || 0),
            precio6: parseFloat(productData.precio6 || 0),
            stockAlmacen: parseFloat(productData.stockAlmacen || 0),
            stockMinimo: parseFloat(productData.stockMinimo || 0),
            unidadesPorCaja: productData.presentacion === 'caja' ? parseInt(productData.unidadesPorCaja) : null,
            unidadesPorBulto: parseInt(productData.unidadesPorBulto || 1)
        }, { transaction: t });

        // 3. Lógica Inteligente de Tags (Etiquetas)
        if (tags && Array.isArray(tags) && tags.length > 0) {
            // Buscamos o creamos cada tag (doble blindaje por si el front falló)
            const tagInstances = await Promise.all(
                tags.map(async (nombreTag) => {
                    const cleanName = nombreTag.trim().toLowerCase();
                    const [tag] = await Tag.findOrCreate({
                        where: { nombre: cleanName },
                        transaction: t
                    });
                    return tag;
                })
            );
            
            // Sequelize asocia automáticamente los tags al producto en la tabla puente (ProductoTags)
            await nuevoProducto.setTags(tagInstances, { transaction: t });
        }

        // 4. Si todo salió perfecto, confirmamos (Commit)
        await t.commit();
        
        return NextResponse.json({ 
            message: 'Producto creado exitosamente', 
            producto: nuevoProducto 
        }, { status: 201 });

    } catch (error) {
        // Si ALGO falla (un dato mal, un tag duplicado, etc.), revertimos todo (Rollback)
        await t.rollback();
        
        // Manejo de errores específicos de base de datos (Ej: Código duplicado)
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un producto con ese Nombre o Código' }, { status: 400 });
        }
        
        console.error("Error crítico al crear producto:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}