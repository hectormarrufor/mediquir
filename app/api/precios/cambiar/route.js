import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import { CambioPrecio, Producto, User, Empleado } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { puedeCambiarPrecios, historialDisponible } from '@/app/api/_lib/preciosAcceso';

export const dynamic = 'force-dynamic';

class ErrorPrecio extends Error {
    constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

const CAMPOS = ['precio7', 'precio6'];
const redondear = (v) => Math.round(Number(v) * 1000) / 1000;

async function autorizar() {
    const acceso = await requerirStaff();
    if (acceso.error) return { error: acceso.error };
    if (!(await puedeCambiarPrecios(acceso.sesion))) return { error: NextResponse.json({ error: 'Solo las administradoras autorizadas pueden cambiar precios' }, { status: 403 }) };
    if (!(await historialDisponible())) return { error: NextResponse.json({ error: 'Falta crear la tabla del historial de precios (migración): sin historial no se cambian precios' }, { status: 503 }) };
    return { sesion: acceso.sesion };
}

// Cambios recientes (para revertir un error)
export async function GET() {
    const a = await autorizar();
    if (a.error) return a.error;
    try {
        const filas = await CambioPrecio.findAll({ order: [['createdAt', 'DESC']], limit: 25 });
        const productos = await Producto.findAll({ where: { id: [...new Set(filas.map((f) => f.productoId))] }, attributes: ['id', 'nombre', 'codigo', 'precio6', 'precio7'] });
        const porId = new Map(productos.map((p) => [p.id, p]));
        const usuarios = await User.findAll({ where: { id: [...new Set(filas.map((f) => f.usuarioId))] }, attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre'], required: false }] });
        const quien = new Map(usuarios.map((u) => [u.id, String(u.empleado?.nombre || u.user || '').trim()]));
        const cambios = filas.map((f) => {
            const p = porId.get(f.productoId);
            const actual = p ? Number(p[f.campo]) : null;
            return {
                id: f.id, productoId: f.productoId, producto: p?.nombre || `Producto ${f.productoId}`, codigo: p?.codigo || null, campo: f.campo,
                anterior: f.precioAnterior === null ? null : Number(f.precioAnterior), nuevo: Number(f.precioNuevo), por: quien.get(f.usuarioId) || '—', cuando: f.createdAt,
                esReversion: Boolean(f.revierteId), revertido: Boolean(f.revertidoAt),
                // solo se revierte si el precio sigue siendo el que dejó este cambio (si alguien lo movió después, revertir pisaría ese cambio)
                revertible: !f.revierteId && !f.revertidoAt && actual !== null && Math.abs(actual - Number(f.precioNuevo)) < 0.0005,
            };
        });
        return NextResponse.json({ cambios });
    } catch (error) {
        console.error('Historial de precios:', error);
        return NextResponse.json({ error: 'No se pudo cargar el historial' }, { status: 500 });
    }
}

// CAMBIAR (por defecto): { productoId, precio7?, precio6?, anteriores?: { precio7, precio6 }, motivo? }   ·   REVERTIR: { accion: 'REVERTIR', cambioId }
export async function POST(request) {
    const a = await autorizar();
    if (a.error) return a.error;
    const usuarioId = Number(a.sesion.id);
    const t = await sequelize.transaction();
    try {
        const body = await request.json();

        if (body.accion === 'REVERTIR') {
            const cambio = await CambioPrecio.findByPk(Number(body.cambioId), { transaction: t, lock: t.LOCK.UPDATE });
            if (!cambio) throw new ErrorPrecio('Ese cambio no existe', 404);
            if (cambio.revierteId) throw new ErrorPrecio('Ese registro ya es una reversión', 409);
            if (cambio.revertidoAt) throw new ErrorPrecio('Ese cambio ya se revirtió', 409);
            const producto = await Producto.findByPk(cambio.productoId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!producto) throw new ErrorPrecio('El producto ya no existe', 404);
            if (Math.abs(Number(producto[cambio.campo]) - Number(cambio.precioNuevo)) > 0.0005) throw new ErrorPrecio(`El ${cambio.campo === 'precio7' ? 'P7' : 'P6'} de este producto ya cambió después (hoy vale ${Number(producto[cambio.campo])}): revertir pisaría ese cambio`, 409);
            const restaurado = cambio.precioAnterior === null ? 0 : Number(cambio.precioAnterior);
            await producto.update({ [cambio.campo]: restaurado }, { transaction: t });
            const nuevo = await CambioPrecio.create({ productoId: cambio.productoId, campo: cambio.campo, precioAnterior: cambio.precioNuevo, precioNuevo: restaurado, usuarioId, motivo: `Reversión del cambio #${cambio.id}`, revierteId: cambio.id }, { transaction: t });
            await cambio.update({ revertidoAt: new Date(), revertidoPorId: usuarioId }, { transaction: t });
            await t.commit();
            return NextResponse.json({ success: true, revertido: { id: nuevo.id, campo: cambio.campo, precio: restaurado } });
        }

        const productoId = Number(body.productoId);
        if (!Number.isInteger(productoId) || productoId < 1) throw new ErrorPrecio('Producto no válido');
        const producto = await Producto.findByPk(productoId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!producto) throw new ErrorPrecio('Producto no encontrado', 404);

        const cambios = [];
        for (const campo of CAMPOS) {
            if (body[campo] === undefined || body[campo] === null || body[campo] === '') continue;
            const nuevo = redondear(body[campo]);
            if (!(nuevo > 0) || nuevo > 1_000_000) throw new ErrorPrecio(`El ${campo === 'precio7' ? 'P7' : 'P6'} debe ser un monto mayor que cero`);
            const actual = Number(producto[campo]) || 0;
            // si la pantalla vio otro precio, alguien más lo cambió mientras se editaba: no se pisa en silencio
            const visto = body.anteriores?.[campo];
            if (visto !== undefined && visto !== null && Math.abs(redondear(visto) - actual) > 0.0005) throw new ErrorPrecio(`El ${campo === 'precio7' ? 'P7' : 'P6'} cambió mientras lo editabas (ahora vale ${actual}): vuelve a abrir el producto`, 409);
            if (Math.abs(nuevo - actual) < 0.0005) continue;
            cambios.push({ campo, anterior: actual, nuevo });
        }
        if (!cambios.length) throw new ErrorPrecio('No hay ningún cambio de precio que guardar');

        await producto.update(Object.fromEntries(cambios.map((c) => [c.campo, c.nuevo])), { transaction: t });
        const guardados = [];
        for (const c of cambios) {
            const f = await CambioPrecio.create({ productoId, campo: c.campo, precioAnterior: c.anterior, precioNuevo: c.nuevo, usuarioId, motivo: String(body.motivo || '').trim().slice(0, 200) || null }, { transaction: t });
            guardados.push({ id: f.id, campo: c.campo, anterior: c.anterior, nuevo: c.nuevo });
        }
        await t.commit();
        return NextResponse.json({ success: true, cambios: guardados });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorPrecio) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Cambiar precio:', error);
        return NextResponse.json({ error: 'No se pudo guardar el cambio de precio' }, { status: 500 });
    }
}
