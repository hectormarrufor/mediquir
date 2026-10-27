import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { requerirStaff } from '../../inventario/_lib';

export const dynamic = 'force-dynamic';

// Equivalencias aprendidas de un proveedor (código o descripción de su factura -> producto y presentación), para que el
// formulario de compras proponga el producto al leer una factura nueva. Si la tabla aún no existe, se responde vacío.
// Con ?gasto=1 responde el último gasto de ese proveedor (descripción y categoría) para proponer la categoría al leer otro.
export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    const params = new URL(request.url).searchParams;
    const proveedorId = Number(params.get('proveedorId'));
    const esGasto = params.get('gasto') === '1';
    if (!Number.isInteger(proveedorId) || proveedorId < 1) return NextResponse.json(esGasto ? null : []);
    if (esGasto) {
        const [ultimo] = await sequelize.query(
            `SELECT "descripcionGasto", "categoriaGastoId" FROM "FacturasCompras"
             WHERE "proveedorId" = :proveedorId AND "esGasto" = true AND "categoriaGastoId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
            { replacements: { proveedorId }, type: sequelize.QueryTypes.SELECT }
        );
        return NextResponse.json(ultimo || null);
    }
    try {
        const filas = await sequelize.query(
            `SELECT e."clave", e."productoId", e."unidadCompra", e."usos" FROM "ProductosProveedor" e
             JOIN "Productos" p ON p."id" = e."productoId" WHERE e."proveedorId" = :proveedorId`,
            { replacements: { proveedorId }, type: sequelize.QueryTypes.SELECT }
        );
        return NextResponse.json(filas);
    } catch (error) {
        // 42P01 = la tabla no existe todavía (falta correr scripts/migraciones/productos-proveedor.cjs): se sigue sin memoria
        if (error?.parent?.code !== '42P01') console.error('Equivalencias de proveedor:', error.message);
        return NextResponse.json([]);
    }
}
