import { NextResponse } from 'next/server';
import { requerirAdmin } from '@/app/api/_lib/acceso';
import db from '@/models/index';

const { sequelize } = db;

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Errores de empaque por empleado en un período (solo administradores):
//   ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD   (por defecto, los últimos 30 días; fechas en hora de Caracas)
// Un error es tomar otro producto, otra presentación (unidad/caja/bulto) o elegir otra marca. La tasa se mide contra los
// productos que la persona verificó en el mismo período, para que comparar a quien empaca mucho con quien empaca poco sea justo.
export async function GET(request) {
    const { error } = await requerirAdmin();
    if (error) return error;
    try {
        const p = new URL(request.url).searchParams;
        const hoy = new Date();
        const hace30 = new Date(Date.now() - 30 * 86400000);
        const iso = (d) => new Date(d.getTime() - 4 * 3600000).toISOString().slice(0, 10); // Caracas = UTC-4
        const desde = FECHA.test(p.get('desde') || '') ? p.get('desde') : iso(hace30);
        const hasta = FECHA.test(p.get('hasta') || '') ? p.get('hasta') : iso(hoy);
        const reemplazos = { d: `${desde}T00:00:00-04:00`, h: `${hasta}T23:59:59.999-04:00` };
        const q = async (sql) => (await sequelize.query(sql, { replacements: reemplazos }))[0];

        const [verificados, errores, recientes] = await Promise.all([
            q(`SELECT v."empacadorId" AS id, COUNT(*)::int AS verificados, SUM(CASE WHEN ei.estado = 'NOVEDAD' THEN 1 ELSE 0 END)::int AS novedades
               FROM "VentaEmpaqueItems" ei JOIN "Ventas" v ON v.id = ei."ventaId"
               WHERE ei."verificadoAt" BETWEEN :d AND :h AND v."empacadorId" IS NOT NULL GROUP BY 1`),
            q(`SELECT "empacadorId" AS id, tipo, COUNT(*)::int AS n FROM "EmpaqueErrores" WHERE "createdAt" BETWEEN :d AND :h GROUP BY 1, 2`),
            q(`SELECT e.id, e."createdAt", e."empacadorId", e.tipo, e."nivelPedido", e."nivelEscaneado", v."numeroDocumento" AS pedido, v.id AS "ventaId", pr.nombre AS producto
               FROM "EmpaqueErrores" e LEFT JOIN "Ventas" v ON v.id = e."ventaId" LEFT JOIN "Productos" pr ON pr.id = e."productoId"
               WHERE e."createdAt" BETWEEN :d AND :h ORDER BY e."createdAt" DESC LIMIT 60`),
        ]);

        const ids = [...new Set([...verificados.map((r) => r.id), ...errores.map((r) => r.id), ...recientes.map((r) => r.empacadorId)])];
        const nombres = new Map();
        if (ids.length) {
            const usuarios = await sequelize.query(
                `SELECT u.id, u."user" AS usuario, e.nombre, e.apellido FROM "Usuarios" u LEFT JOIN "Empleados" e ON e.id = u."empleadoId" WHERE u.id IN (:ids)`,
                { replacements: { ids } });
            usuarios[0].forEach((u) => nombres.set(u.id, `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.usuario));
        }

        const filas = new Map();
        const fila = (id) => {
            if (!filas.has(id)) filas.set(id, { id, nombre: nombres.get(id) || `Usuario ${id}`, verificados: 0, novedades: 0, PRODUCTO: 0, PRESENTACION: 0, MARCA: 0 });
            return filas.get(id);
        };
        verificados.forEach((r) => { const f = fila(r.id); f.verificados = r.verificados; f.novedades = r.novedades; });
        errores.forEach((r) => { fila(r.id)[r.tipo] = r.n; });

        const empleados = [...filas.values()].map((f) => {
            const total = f.PRODUCTO + f.PRESENTACION + f.MARCA;
            return { ...f, errores: total, por100: f.verificados > 0 ? Math.round((total / f.verificados) * 1000) / 10 : null };
        }).sort((a, b) => b.errores - a.errores || (b.por100 ?? 0) - (a.por100 ?? 0));

        return NextResponse.json({
            desde, hasta, empleados,
            recientes: recientes.map((r) => ({ ...r, empacador: nombres.get(r.empacadorId) || `Usuario ${r.empacadorId}` })),
        });
    } catch (err) {
        console.error('Reporte de errores de empaque:', err);
        return NextResponse.json({ error: 'No se pudo cargar el reporte' }, { status: 500 });
    }
}
