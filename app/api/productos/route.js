import { NextResponse } from 'next/server';
import { Producto, Categoria, Marca, GrupoEquivalencia, Tag } from '@/models';
import sequelize from '@/sequelize';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { precioVentaWeb, preciosBase, precioUnitario } from '@/app/constants/facturacion';
import { rolDe } from '@/app/constants/roles';
import { resolverEmpaque } from '@/app/constants/inventarioCampos';

// =======================================================================
// GET: Listar todo el inventario con sus relaciones completas
// =======================================================================
// Catálogo público en memoria por 30 s: evita repetir la consulta pesada (600+ productos con relaciones) por cada visitante.
// Solo la versión pública se guarda; la de personal (con costos) siempre se calcula en el momento.
const TTL_PUBLICO_MS = 30_000;
let cachePublico = { t: 0, datos: null };

export async function GET(request) {
    const fresco = new URL(request.url).searchParams.get('fresh') === '1'; // el chequeo previo al pago pide datos al instante
    try {
        const { sesion, error: noEsStaff } = await requerirStaff();
        const esPublico = Boolean(noEsStaff || !sesion);
        const esVend = !esPublico && rolDe(sesion) === 'vendedor';
        if (esPublico && !fresco && cachePublico.datos && Date.now() - cachePublico.t < TTL_PUBLICO_MS) {
            return NextResponse.json(cachePublico.datos, { status: 200, headers: { 'Cache-Control': 'private, max-age=0' } });
        }

        const productos = await Producto.findAll({
            include: [
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'stockMinimoGlobal', 'imagen'] },
                { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } } // through vacío para no traer la tabla puente
            ],
            order: [['createdAt', 'DESC']]
        });
        

        // Un vendedor ve precios de venta ya resueltos pero nunca el costo (los faltantes se completan aquí, en el servidor)
        if (esVend) {
            const paraVendedor = productos.map((p) => {
                const j = p.toJSON();
                const { costoUsd, ...resto } = j;
                const b = preciosBase(j, { sinCosto: true });
                return { ...resto, precio6: precioUnitario(b.p6), precio7: precioUnitario(b.p7) };
            });
            return NextResponse.json(paraVendedor, { status: 200, headers: { 'Cache-Control': 'private, max-age=0' } });
        }

        // El catálogo es público (landing), pero costos y precio mayor son solo del personal.
        if (esPublico) {
            const publicos = productos.map((p) => {
                const j = p.toJSON();
                const { costoUsd, precio6, ...resto } = j;
                // La landing calcula el precio web con precio7; si falta se le entrega ya resuelto (sin revelar el costo)
                return { ...resto, precio7: precioVentaWeb({ precio7: j.precio7, costoUsd, porcentajeDescuento: 0 }) };
            });
            cachePublico = { t: Date.now(), datos: publicos };
            return NextResponse.json(publicos, { status: 200, headers: { 'Cache-Control': 'private, max-age=0' } });
        }
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
    // Antes esta ruta no validaba sesión: cualquiera podía crear productos. La comprobación va ANTES de abrir la transacción.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

    const t = await sequelize.transaction();

    try {
        const body = await req.json();
        
        // Extraemos los tags del cuerpo del mensaje, el resto de los datos quedan en productData
        const { tags, ...productData } = body;

        // 1. Validaciones básicas de seguridad en backend
        if (!productData.nombre || !productData.codigo || !productData.categoriaId || !productData.marcaId) {
            throw new Error('Faltan datos obligatorios (Nombre, Código, Categoría o Marca)');
        }

        // Empaque: bulto -> (cajas) -> unidades. unidadesPorBulto es SIEMPRE el total de unidades del bulto.
        const resuelto = resolverEmpaque({}, {
            presentacion: productData.presentacion || 'unidad',
            unidadesPorCaja: parseInt(productData.unidadesPorCaja) || null,
            cajasPorBulto: parseInt(productData.cajasPorBulto) || null,
            unidadesPorBulto: parseInt(productData.unidadesPorBulto) || 1,
        });
        if (resuelto.error) throw new Error(resuelto.error);
        const empaque = { presentacion: resuelto.cambios.presentacion, unidadesPorCaja: resuelto.cambios.unidadesPorCaja ?? null, cajasPorBulto: resuelto.cambios.cajasPorBulto ?? null, unidadesPorBulto: resuelto.cambios.unidadesPorBulto };

        // 2. Crear el Producto en la base de datos dentro de la transacción
        const nuevoProducto = await Producto.create({
            ...productData,
            // Aseguramos formatos numéricos
            costoUsd: parseFloat(productData.costoUsd || 0),
            precio6: parseFloat(productData.precio6 || 0),
            precio7: parseFloat(productData.precio7 || 0),
            stockAlmacen: parseFloat(productData.stockAlmacen || 0),
            stockMinimo: parseFloat(productData.stockMinimo || 0),
            ...empaque
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
        if (!t.finished) await t.rollback();
        
        // Manejo de errores específicos de base de datos (Ej: Código duplicado)
        if (error.name === 'SequelizeUniqueConstraintError') {
            return NextResponse.json({ error: 'Ya existe un producto con ese Nombre o Código' }, { status: 400 });
        }
        
        console.error("Error crítico al crear producto:", error);
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
    }
}