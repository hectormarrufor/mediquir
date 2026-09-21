import { NextResponse } from 'next/server';
import { Producto, Marca, Categoria, GrupoEquivalencia } from '@/models';
import { Op } from 'sequelize';
import { precioVentaWeb } from '@/app/constants/facturacion';

export const dynamic = 'force-dynamic';

// Ruta pública: solo campos de vitrina. Antes devolvía la fila completa del producto (costo y precio mayor incluidos) y además fallaba
// con error 500 porque las ofertas se buscaban en una columna que ya no existe (precioDescuento; el descuento es porcentajeDescuento).
const CAMPOS_PUBLICOS = ['id', 'nombre', 'imagen', 'stockAlmacen', 'porcentajeIva', 'porcentajeDescuento', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto', 'precio7', 'costoUsd'];
const INCLUIR = [
    { model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] },
    { model: Categoria, as: 'categoria', attributes: ['nombre'] },
    { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['nombre', 'imagen'] },
];

// El costo solo se usa para resolver el precio web cuando el producto no tiene Precio 7; nunca sale en la respuesta
const publico = (p) => {
    const { costoUsd, ...resto } = p.toJSON();
    return { ...resto, precio7: precioVentaWeb({ precio7: resto.precio7, costoUsd, porcentajeDescuento: 0 }) };
};

export async function GET() {
    try {
        // 1. Los 10 más vendidos con existencia (desempate: los más recientes)
        const masVendidos = await Producto.findAll({
            attributes: CAMPOS_PUBLICOS,
            where: { stockAlmacen: { [Op.gt]: 0 } },
            order: [['nroVentas', 'DESC'], ['updatedAt', 'DESC']],
            limit: 10,
            include: INCLUIR,
        });

        // 2. Ofertas: productos con descuento y existencia
        const ofertas = await Producto.findAll({
            attributes: CAMPOS_PUBLICOS,
            where: { porcentajeDescuento: { [Op.gt]: 0 }, stockAlmacen: { [Op.gt]: 0 } },
            order: [['updatedAt', 'DESC']],
            limit: 10,
            include: INCLUIR,
        });

        return NextResponse.json({ masVendidos: masVendidos.map(publico), ofertas: ofertas.map(publico) }, { status: 200 });
    } catch (error) {
        console.error('Error al cargar destacados:', error);
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}
