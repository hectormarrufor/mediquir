import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Marca, Producto } from '@/models';
import { preciosBase, precioUnitario } from '@/app/constants/facturacion';
import { rolDe } from '@/app/constants/roles';
import { requerirStaff } from '../../inventario/_lib';

export const dynamic = 'force-dynamic';

const LIMITE = 30;

// Consultor rápido de precios: existencia y TODOS los precios de venta de cada producto (P7 y P6 en dólares; P4 y P5 se obtienen de ellos en bolívares
// a la tasa del día, igual que en el POS). Un vendedor nunca recibe costos; administración recibe además el P1 (35 % sobre el costo).
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const esVendedor = rolDe(acceso.sesion) === 'vendedor';
        const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
        const where = {};
        if (q) {
            // cada palabra debe aparecer en el nombre o el código: «guante nitrilo» encuentra «Guantes de nitrilo»
            where[Op.and] = q.split(/\s+/).filter(Boolean).slice(0, 5).map((palabra) => ({ [Op.or]: [{ nombre: { [Op.iLike]: `%${palabra}%` } }, { codigo: { [Op.iLike]: `%${palabra}%` } }] }));
        }
        const filas = await Producto.findAll({
            where,
            attributes: ['id', 'codigo', 'nombre', 'presentacion', 'unidadesPorCaja', 'stockAlmacen', 'stockMinimo', 'precio6', 'precio7', 'porcentajeDescuento', 'costoUsd'],
            include: [{ model: Marca, as: 'marca', attributes: ['nombre'] }],
            order: [['nombre', 'ASC']],
            limit: LIMITE,
        });
        const productos = filas.map((p) => {
            const j = p.toJSON();
            const b = preciosBase(j, { sinCosto: true }); // el precio faltante nunca se rellena con el costo
            const real = (v) => Number(v) > 0;
            const p7Final = b.descuento > 0 ? b.p7 - b.p7 * (b.descuento / 100) : b.p7;
            const stock = Math.floor(Number(j.stockAlmacen) || 0);
            return {
                id: j.id, codigo: j.codigo, nombre: j.nombre, marca: j.marca?.nombre || null, presentacion: j.presentacion, unidadesPorCaja: j.unidadesPorCaja,
                stock, bajo: stock > 0 && stock <= (Number(j.stockMinimo) || 0), descuento: b.descuento,
                precio7: real(j.precio7) ? precioUnitario(p7Final) : null, // con la oferta aplicada, como lo cobra el POS
                precio7Lista: real(j.precio7) ? precioUnitario(b.p7) : null,
                precio6: real(j.precio6) ? precioUnitario(b.p6) : null,
                ...(esVendedor ? {} : { precio1: Number(j.costoUsd) > 0 ? precioUnitario(Number(j.costoUsd) * 1.35) : null }),
            };
        });
        return NextResponse.json({ productos, hayMas: productos.length >= LIMITE });
    } catch (error) {
        console.error('Consultor de precios:', error);
        return NextResponse.json({ error: 'No se pudo consultar los precios' }, { status: 500 });
    }
}
