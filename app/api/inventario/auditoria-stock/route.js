import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Marca, Producto } from '@/models';
import { puedeEditarInventario, requerirStaff } from '../_lib';

export const dynamic = 'force-dynamic';

// Auditoría de existencias SIN cerrar la tienda: cada producto se cuenta cuando toca y se marca como auditado (verde).
// Mientras no esté auditado (naranja), vender o empacar no mueve su stock (solo suma lo vendido).
async function exigirPermiso() {
    const { sesion, error } = await requerirStaff();
    if (error) return { error };
    if (!(await puedeEditarInventario(sesion))) return { error: NextResponse.json({ error: 'No tienes permiso para auditar el inventario' }, { status: 403 }) };
    return { sesion };
}

// GET ?q=texto&estado=pendiente|auditado|todos&pagina=1
export async function GET(request) {
    const { error } = await exigirPermiso();
    if (error) return error;
    try {
        const sp = new URL(request.url).searchParams;
        const estado = ['pendiente', 'auditado'].includes(sp.get('estado')) ? sp.get('estado') : 'todos';
        const pagina = Math.max(1, parseInt(sp.get('pagina'), 10) || 1);
        const TAM = 30;
        const like = (t) => `%${t.replace(/[\%_]/g, (c) => `\${c}`)}%`;
        const and = [];
        String(sp.get('q') || '').trim().slice(0, 100).split(/\s+/).filter(Boolean).forEach((palabra) => {
            and.push({ [Op.or]: [
                { nombre: { [Op.iLike]: like(palabra) } }, { codigo: { [Op.iLike]: like(palabra) } },
                { codigoBarras: { [Op.iLike]: like(palabra) } }, { codigoBarrasCaja: { [Op.iLike]: like(palabra) } }, { codigoBarrasBulto: { [Op.iLike]: like(palabra) } },
                { '$marca.nombre$': { [Op.iLike]: like(palabra) } },
            ] });
        });
        if (estado === 'pendiente') and.push({ inventarioAuditado: false });
        if (estado === 'auditado') and.push({ inventarioAuditado: true });

        const [filas, auditados, total] = await Promise.all([
            Producto.findAndCountAll({
                where: and.length ? { [Op.and]: and } : {},
                include: [{ model: Marca, as: 'marca', attributes: ['nombre'] }],
                attributes: ['id', 'nombre', 'codigo', 'stockAlmacen', 'inventarioAuditado', 'inventarioAuditadoAt'],
                order: [['nombre', 'ASC']], limit: TAM, offset: (pagina - 1) * TAM, subQuery: false,
            }),
            Producto.count({ where: { inventarioAuditado: true } }),
            Producto.count(),
        ]);
        return NextResponse.json({
            resumen: { total, auditados, pendientes: total - auditados },
            total: filas.count, pagina, paginas: Math.max(1, Math.ceil(filas.count / TAM)),
            productos: filas.rows.map((p) => ({
                id: p.id, nombre: p.nombre, codigo: p.codigo, marca: p.marca?.nombre || null,
                stock: Number(p.stockAlmacen) || 0, auditado: Boolean(p.inventarioAuditado), auditadoAt: p.inventarioAuditadoAt,
            })),
        });
    } catch (e) {
        console.error('Auditoría de stock (lista):', e);
        return NextResponse.json({ error: 'No se pudo cargar la lista' }, { status: 500 });
    }
}

// POST { productoId, stockReal }  -> fija el stock contado y marca el producto como auditado (verde)
// POST { productoId, quitar: true } -> lo devuelve a «sin auditar» (naranja)
export async function POST(request) {
    const { sesion, error } = await exigirPermiso();
    if (error) return error;
    try {
        const { productoId, stockReal, quitar } = await request.json();
        const producto = await Producto.findByPk(Number(productoId));
        if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
        if (quitar) {
            await producto.update({ inventarioAuditado: false, inventarioAuditadoAt: null, inventarioAuditadoPorId: null });
        } else {
            const n = Number(stockReal);
            if (stockReal === '' || stockReal == null || !Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'Escribe la cantidad contada (0 o más)' }, { status: 400 });
            await producto.update({ stockAlmacen: Math.round(n * 100) / 100, inventarioAuditado: true, inventarioAuditadoAt: new Date(), inventarioAuditadoPorId: Number(sesion.id) });
        }
        return NextResponse.json({ success: true, auditado: Boolean(producto.inventarioAuditado), stock: Number(producto.stockAlmacen) });
    } catch (e) {
        console.error('Auditoría de stock (guardar):', e);
        return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    }
}
