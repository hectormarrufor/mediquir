import { NextResponse } from 'next/server';
import { sequelize, Correlativo, Recibo } from '@/models';
import { getSesion } from '@/app/api/notificaciones/_lib';
import { ErrorNumeracion, estadoNumeracion, configurarNumeracion } from '@/app/api/_lib/numeracion';
import { primerReciboLibre } from '../../recibos/_lib';

export const dynamic = 'force-dynamic';

// Pantalla «Numeración»: el número que sigue en cada serie de documentos y su cambio. Solo administradores y el usuario 1.
async function requerirAdminOUno() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (sesion.clienteId || !(sesion.isAdmin || Number(sesion.id) === 1)) return { error: NextResponse.json({ error: 'Solo administradores' }, { status: 403 }) };
    return { sesion };
}

const SERIES_FISCALES = ['F', 'NC', 'ND', 'CONTROL', 'RET-COMPRA'];
const SIMPLES = {
    NE: { etiqueta: 'Notas de entrega', descripcion: 'Notas de entrega del POS y de los pedidos (NE-00001)', ejemplo: '06714' },
    V: { etiqueta: 'Ventas rápidas (recibos de venta)', descripcion: 'Ventas rápidas al detal sin factura (V-00001)', ejemplo: '00002' },
    REC: { etiqueta: 'Recibos de pago', descripcion: 'Recibos «hemos pagado a» / «he recibido de» (Recibo N.º)', ejemplo: '1' },
};
const DESCRIPCIONES = {
    F: 'Facturas de venta (F-000001)', NC: 'Notas de crédito emitidas', ND: 'Notas de débito emitidas',
    CONTROL: 'Número de control de la forma libre (uno solo para facturas y notas)', 'RET-COMPRA': 'Comprobantes de retención de IVA que emite la empresa en las compras',
};

const maxVentas = async (prefijo) => {
    const [f] = await sequelize.query(
        `SELECT MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)) AS n FROM "Ventas" WHERE "numeroDocumento" ~ :patron`,
        { replacements: { patron: `^${prefijo}-[0-9]+$` }, type: sequelize.QueryTypes.SELECT },
    );
    return f?.n === null || f?.n === undefined ? null : Number(f.n);
};
const pad = (n, ceros) => String(n).padStart(ceros, '0');

export async function GET() {
    const a = await requerirAdminOUno();
    if (a.error) return a.error;
    try {
        const fiscales = (await estadoNumeracion()).filter((s) => SERIES_FISCALES.includes(s.clave))
            .map((s) => ({ clave: s.clave, etiqueta: s.etiqueta, descripcion: DESCRIPCIONES[s.clave], configurado: s.configurado, siguiente: s.siguiente, ultimoUsado: s.ultimoUsado, ejemplo: s.ejemplo }));
        const filas = await Correlativo.findAll({ where: { prefijo: ['NE', 'V', 'REC'] } });
        const por = new Map(filas.map((c) => [c.prefijo, c]));
        const simples = [];
        for (const clave of ['NE', 'V']) {
            const c = por.get(clave);
            const ceros = c?.cerosRelleno || 5;
            const ultimo = await maxVentas(clave);
            const sig = Math.max(Number(c?.siguienteNumero) || 1, (ultimo || 0) + 1);
            simples.push({ clave, ...SIMPLES[clave], configurado: true, siguiente: `${clave}-${pad(sig, ceros)}`, ultimoUsado: ultimo === null ? null : `${clave}-${pad(ultimo, ceros)}` });
        }
        const ultimoRecibo = await Recibo.max('numero');
        simples.push({ clave: 'REC', ...SIMPLES.REC, configurado: true, siguiente: String(await primerReciboLibre()), ultimoUsado: ultimoRecibo ? String(ultimoRecibo) : null });
        const orden = ['F', 'NE', 'V', 'NC', 'ND', 'CONTROL', 'REC', 'RET-COMPRA'];
        const series = [...fiscales, ...simples].sort((x, y) => orden.indexOf(x.clave) - orden.indexOf(y.clave));
        return NextResponse.json({ series });
    } catch (error) {
        console.error('Numeración (panel):', error);
        return NextResponse.json({ error: 'No se pudo cargar la numeración' }, { status: 500 });
    }
}

// Cambia el número que sigue en una serie: { clave, siguiente }. No puede quedar por debajo de uno ya usado.
export async function PUT(request) {
    const a = await requerirAdminOUno();
    if (a.error) return a.error;
    const t = await sequelize.transaction();
    try {
        const { clave, siguiente } = await request.json();
        let resultado;
        if (SERIES_FISCALES.includes(clave)) {
            resultado = await configurarNumeracion({ clave, siguiente, transaction: t });
        } else if (SIMPLES[clave]) {
            const m = /^(?:[A-Za-z]{1,3}\s*-\s*)?(\d{1,10})$/.exec(String(siguiente ?? '').trim());
            const n = m ? Number(m[1]) : 0;
            if (!m || !Number.isSafeInteger(n) || n < 1) throw new ErrorNumeracion(`Escribe solo el número, por ejemplo ${SIMPLES[clave].ejemplo}`);
            if (clave === 'REC') {
                if (await Recibo.findOne({ where: { numero: n }, attributes: ['id'], transaction: t })) throw new ErrorNumeracion(`El recibo N.º ${n} ya existe: elige un número libre`, 409);
            } else {
                const ultimo = await maxVentas(clave);
                if (ultimo !== null && n <= ultimo) throw new ErrorNumeracion(`Ya se usó el ${clave}-${pad(ultimo, 5)}: el siguiente debe ser mayor`, 409);
            }
            let c = await Correlativo.findOne({ where: { prefijo: clave }, transaction: t, lock: t.LOCK.UPDATE });
            if (!c) c = await Correlativo.create({ prefijo: clave, siguienteNumero: n, cerosRelleno: clave === 'REC' ? 1 : 5, configurado: true }, { transaction: t });
            else await c.update({ siguienteNumero: n }, { transaction: t });
            resultado = { clave, siguiente: n };
        } else {
            throw new ErrorNumeracion('Numeración no válida');
        }
        await t.commit();
        return NextResponse.json({ success: true, ...resultado });
    } catch (error) {
        if (!t.finished) await t.rollback();
        if (error instanceof ErrorNumeracion) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Cambiar numeración:', error);
        return NextResponse.json({ error: 'No se pudo guardar la numeración' }, { status: 500 });
    }
}
