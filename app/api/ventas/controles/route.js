import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import db from '@/models';
import { requerirAdmin, requerirNoVendedor } from '@/app/api/_lib/acceso';

export const dynamic = 'force-dynamic';
const { FormaAnulada, Correlativo, Venta } = db;
const consulta = (sql, replacements) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT });
const MAX_FILAS = 3000;

// "00-0122660", "0122660" o "122660" -> 122660
const numeroDe = (texto) => {
    const m = /^(?:00-)?0*(\d{1,9})$/.exec(String(texto ?? '').trim());
    return m ? Number(m[1]) : null;
};

// Documentos (facturas de venta y notas de crédito/débito emitidas) con número de control de la forma libre entre desde y hasta
async function documentosEntre(desde, hasta) {
    return consulta(`
        SELECT CAST(substring(v."numeroControl" from 4) AS bigint)::int AS n, 'FACTURA' AS tipo, v.id::text AS id, v.id::text AS "ventaId", v."numeroDocumento" AS numero,
               (COALESCE(v."fechaEmision", v."createdAt") AT TIME ZONE 'America/Caracas')::date::text AS fecha, c.nombre AS cliente,
               v."totalFinal"::float AS total, v.moneda::text AS moneda, (v."statusDespacho" = 'Cancelado') AS anulado
          FROM "Ventas" v LEFT JOIN "Clientes" c ON c.id = v."clienteId"
         WHERE v."tipoDocumento" = 'FACTURA' AND v."numeroControl" ~ '^00-[0-9]+$' AND CAST(substring(v."numeroControl" from 4) AS bigint) BETWEEN :desde AND :hasta
        UNION ALL
        SELECT CAST(substring(n."numeroControl" from 4) AS bigint)::int, CASE WHEN n.tipo = 'CREDITO' THEN 'NOTA_CREDITO' ELSE 'NOTA_DEBITO' END, n.id::text, n."ventaId"::text, n."numeroDocumento",
               n.fecha::text, c.nombre, n."totalFinal"::float, n.moneda, (n.estado <> 'EMITIDA')
          FROM "NotasFiscales" n LEFT JOIN "Clientes" c ON c.id = n."clienteId"
         WHERE n.origen = 'VENTA' AND n."numeroControl" ~ '^00-[0-9]+$' AND CAST(substring(n."numeroControl" from 4) AS bigint) BETWEEN :desde AND :hasta`,
    { desde, hasta });
}

// Números de control en orden descendente con su documento; donde falta registro (ni documento ni forma anulada) se marca para revisarlo.
//   ?cantidad=150 (los últimos N números)  ó  ?desde=122501&hasta=122700
//   ?factura=146870 -> { id } de esa factura (para emitirle una nota de crédito o débito con un control que faltaba)
export async function GET(request) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        if (p.get('factura')) {
            const digitos = String(p.get('factura')).replace(/\D/g, '');
            const venta = digitos ? await Venta.findOne({ where: { numeroDocumento: `F-${digitos}`, tipoDocumento: 'FACTURA' }, attributes: ['id', 'numeroDocumento', 'statusDespacho'] }) : null;
            if (!venta || venta.statusDespacho === 'Cancelado') return NextResponse.json({ error: `No existe la factura ${digitos ? `F-${digitos}` : ''} (o está anulada)` }, { status: 404 });
            return NextResponse.json({ id: venta.id, numero: venta.numeroDocumento });
        }

        const corr = await Correlativo.findOne({ where: { prefijo: 'CONTROL' }, attributes: ['siguienteNumero', 'cerosRelleno'] });
        const [{ maximo }] = await consulta(`SELECT GREATEST(
              (SELECT MAX(CAST(substring("numeroControl" from 4) AS bigint)) FROM "Ventas" WHERE "tipoDocumento" = 'FACTURA' AND "numeroControl" ~ '^00-[0-9]+$'),
              (SELECT MAX(CAST(substring("numeroControl" from 4) AS bigint)) FROM "NotasFiscales" WHERE origen = 'VENTA' AND "numeroControl" ~ '^00-[0-9]+$'),
              (SELECT MAX(numero) FROM "FormasAnuladas"))::int AS maximo`);
        const siguiente = Number(corr?.siguienteNumero) || null;
        const tope = Math.max(Number(maximo) || 0, siguiente ? siguiente - 1 : 0);
        let hasta = numeroDe(p.get('hasta')) || tope;
        let desde = numeroDe(p.get('desde')) || Math.max(1, hasta - Math.min(MAX_FILAS, Math.max(10, Number(p.get('cantidad')) || 150)) + 1);
        if (desde > hasta) [desde, hasta] = [hasta, desde];
        if (hasta - desde + 1 > MAX_FILAS) desde = hasta - MAX_FILAS + 1;

        const [docs, anuladas] = await Promise.all([
            documentosEntre(desde, hasta),
            consulta(`SELECT numero, motivo, "createdAt" FROM "FormasAnuladas" WHERE numero BETWEEN :desde AND :hasta`, { desde, hasta }),
        ]);
        const porNumero = new Map();
        for (const d of docs) (porNumero.get(d.n) || porNumero.set(d.n, []).get(d.n)).push(d);
        const anuladaDe = new Map(anuladas.map((a) => [Number(a.numero), a]));
        const ceros = corr?.cerosRelleno || 7;
        const filas = [];
        for (let n = hasta; n >= desde; n--) {
            const documentos = porNumero.get(n) || [];
            const anulada = anuladaDe.get(n) || null;
            const estado = documentos.length > 1 ? 'DUPLICADO' : documentos.length === 1 ? 'DOCUMENTO' : anulada ? 'ANULADA' : 'FALTA';
            filas.push({ n, control: `00-${String(n).padStart(ceros, '0')}`, estado, documentos, anulada });
        }
        const cuenta = (e) => filas.filter((f) => f.estado === e).length;
        return NextResponse.json({
            desde, hasta, siguiente: siguiente ? `00-${String(siguiente).padStart(ceros, '0')}` : null,
            resumen: { documentos: cuenta('DOCUMENTO'), faltan: cuenta('FALTA'), anuladas: cuenta('ANULADA'), duplicados: cuenta('DUPLICADO') },
            filas,
        });
    } catch (error) {
        console.error('Números de control:', error);
        return NextResponse.json({ error: 'No se pudo armar la lista de números de control' }, { status: 500 });
    }
}

// Marca un número de control como forma anulada (dañada, rota o nunca usada): { numero, motivo }
export async function POST(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const n = numeroDe(b.numero);
        if (!n) return NextResponse.json({ error: 'Escribe el número de control, por ejemplo 00-0122660' }, { status: 400 });
        const motivo = String(b.motivo || '').trim().slice(0, 500);
        if (!motivo) return NextResponse.json({ error: 'Escribe qué pasó con la forma (se dañó, se rompió, nunca se usó…)' }, { status: 400 });
        if ((await documentosEntre(n, n)).length) return NextResponse.json({ error: 'Ese número de control ya tiene un documento registrado' }, { status: 409 });
        const [fila, creada] = await FormaAnulada.findOrCreate({ where: { numero: n }, defaults: { motivo, usuarioId: Number(acceso.sesion.id) || null } });
        if (!creada) return NextResponse.json({ error: 'Ese número de control ya está marcado como forma anulada' }, { status: 409 });
        return NextResponse.json({ ok: true, numero: fila.numero }, { status: 201 });
    } catch (error) {
        console.error('Anular forma libre:', error);
        return NextResponse.json({ error: 'No se pudo marcar la forma' }, { status: 500 });
    }
}

// Deshace la marca (p. ej. apareció el documento de ese número): ?numero=00-0122660
export async function DELETE(request) {
    const acceso = await requerirAdmin();
    if (acceso.error) return acceso.error;
    try {
        const n = numeroDe(new URL(request.url).searchParams.get('numero'));
        if (!n) return NextResponse.json({ error: 'Número de control no válido' }, { status: 400 });
        const borradas = await FormaAnulada.destroy({ where: { numero: n } });
        if (!borradas) return NextResponse.json({ error: 'Ese número no estaba marcado como forma anulada' }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Deshacer forma anulada:', error);
        return NextResponse.json({ error: 'No se pudo deshacer' }, { status: 500 });
    }
}
