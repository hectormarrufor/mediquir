// Aprobación de documentos hechos por vendedores (mientras se acostumbran al sistema): sus facturas y notas de crédito/débito quedan
// "por aprobar"; jolexi (o el usuario 1) las revisa, las corrige y las aprueba, y recién entonces se imprimen.
// Las columnas (Ventas / NotasFiscales . aprobacionEstado) se tocan con SQL directo: si la migración aprobacion-documentos aún no se corrió,
// nada se rompe (simplemente ningún documento está pendiente).
import { sequelize, User } from '@/models';
import { notificarUsuario } from '@/app/handlers/notificar';
import { puedeCorregirFacturas } from './corregirFactura';

export const URL_POR_APROBAR = '/superuser/ventas/por-aprobar';
export const URL_POR_IMPRIMIR = '/superuser/ventas/por-imprimir';
const TABLAS = { VENTA: 'Ventas', NOTA: 'NotasFiscales' };
const columnaFaltante = (e) => e?.original?.code === '42703' || /aprobacionEstado/.test(e?.message || '');

/** Quien aprueba: el usuario 1 y «jolexi» (los mismos que corrigen facturas). */
export const puedeAprobar = puedeCorregirFacturas;

/** Marca un documento como por aprobar. Devuelve false (y lo deja anotado) si no se pudo, p. ej. por migración sin correr. */
export async function marcarPorAprobar(tipo, id, transaction = undefined) {
    try {
        await sequelize.query(`UPDATE "${TABLAS[tipo]}" SET "aprobacionEstado" = 'PENDIENTE', "aprobadaAt" = NULL, "aprobadaPorId" = NULL WHERE id = :id`, { replacements: { id }, transaction });
        return true;
    } catch (e) {
        console.error(columnaFaltante(e) ? 'Falta correr la migración aprobacion-documentos' : 'No se pudo marcar por aprobar:', e.message);
        return false;
    }
}

/** ¿Está por aprobar? (false si la columna aún no existe) */
export async function estaPorAprobar(tipo, id) {
    try {
        const [f] = await sequelize.query(`SELECT "aprobacionEstado" FROM "${TABLAS[tipo]}" WHERE id = :id`, { replacements: { id }, type: sequelize.QueryTypes.SELECT });
        return f?.aprobacionEstado === 'PENDIENTE';
    } catch (e) {
        if (columnaFaltante(e)) return false;
        throw e;
    }
}

/** De una lista de ids, cuáles están por aprobar. */
export async function idsPorAprobar(tipo, ids) {
    if (!ids.length) return new Set();
    try {
        const filas = await sequelize.query(`SELECT id FROM "${TABLAS[tipo]}" WHERE "aprobacionEstado" = 'PENDIENTE' AND id IN (:ids)`, { replacements: { ids }, type: sequelize.QueryTypes.SELECT });
        return new Set(filas.map((f) => String(f.id)));
    } catch (e) {
        if (columnaFaltante(e)) return new Set();
        throw e;
    }
}

/** ¿Es una factura de este vendedor y ya está aprobada? Solo así un vendedor puede imprimirla (asignarle el número de control y marcarla impresa). */
export async function esFacturaAprobadaDe(ventaId, usuarioId) {
    try {
        const [f] = await sequelize.query(
            `SELECT 1 AS ok FROM "Ventas" WHERE id = :id AND "vendedorId" = :u AND "tipoDocumento" = 'FACTURA' AND "aprobacionEstado" = 'APROBADA' AND "statusDespacho" <> 'Cancelado'`,
            { replacements: { id: ventaId, u: Number(usuarioId) }, type: sequelize.QueryTypes.SELECT },
        );
        return Boolean(f);
    } catch (e) {
        if (columnaFaltante(e)) return false;
        throw e;
    }
}

/** Aprueba un documento por aprobar. Devuelve true si estaba pendiente. */
export async function aprobar(tipo, id, usuarioId, transaction = undefined) {
    const [, meta] = await sequelize.query(
        `UPDATE "${TABLAS[tipo]}" SET "aprobacionEstado" = 'APROBADA', "aprobadaAt" = now(), "aprobadaPorId" = :u WHERE id = :id AND "aprobacionEstado" = 'PENDIENTE'`,
        { replacements: { id, u: usuarioId || null }, transaction },
    );
    return (meta?.rowCount ?? 0) > 0;
}

/** Avisa a jolexi que hay un documento nuevo por aprobar. Nunca falla (es un aviso). */
export async function avisarPorAprobar({ tipoDoc, numero, vendedor }) {
    try {
        const usuarios = await sequelize.query(`SELECT id FROM "Usuarios" WHERE lower("user") = 'jolexi' AND "clienteId" IS NULL`, { type: sequelize.QueryTypes.SELECT });
        const destino = usuarios[0]?.id ? [usuarios[0].id] : [1]; // si no existe «jolexi», le llega al usuario 1
        for (const id of destino) {
            await notificarUsuario(id, {
                title: 'Documento por aprobar 🧾',
                body: `${vendedor || 'Un vendedor'} asentó ${tipoDoc} ${numero}. Revísalo, corrígelo si hace falta y apruébalo para imprimirlo.`,
                url: URL_POR_APROBAR, tipo: 'Info',
            });
        }
    } catch (e) { console.error('No se pudo avisar de un documento por aprobar:', e.message); }
}

/** Avisa al vendedor dueño de un documento (si quien actúa no es él). Nunca falla (es un aviso). */
export async function avisarAlVendedor({ vendedorId, actorId = null, titulo, texto, url = URL_POR_IMPRIMIR }) {
    try {
        if (!vendedorId || Number(vendedorId) === Number(actorId)) return;
        await notificarUsuario(Number(vendedorId), { title: titulo, body: texto, url, tipo: 'Info' });
    } catch (e) { console.error('No se pudo avisar al vendedor:', e.message); }
}

/** Al aprobar: el vendedor se entera de que ya puede imprimir su factura o nota. */
export async function avisarAprobado({ tipo, id, aprobadorId }) {
    try {
        const [d] = tipo === 'VENTA'
            ? await sequelize.query(`SELECT v."numeroDocumento" AS numero, v."vendedorId" AS vendedor, 'la factura' AS texto FROM "Ventas" v WHERE v.id = :id`, { replacements: { id }, type: sequelize.QueryTypes.SELECT })
            : await sequelize.query(`SELECT n."numeroDocumento" AS numero, COALESCE(n."registradoPorId", v."vendedorId") AS vendedor, (CASE WHEN n."tipo" = 'CREDITO' THEN 'la nota de crédito' ELSE 'la nota de débito' END) AS texto FROM "NotasFiscales" n LEFT JOIN "Ventas" v ON v.id = n."ventaId" WHERE n.id = :id`, { replacements: { id }, type: sequelize.QueryTypes.SELECT });
        if (!d) return;
        const quien = await nombreDeUsuario(aprobadorId).catch(() => null);
        await avisarAlVendedor({ vendedorId: d.vendedor, actorId: aprobadorId, titulo: 'Documento aprobado ✅', texto: `${quien || 'Jolexi'} aprobó ${d.texto} ${d.numero}. Ya puedes imprimirla desde «Documentos por imprimir». Al imprimir, el sistema te dirá el N° de control que va a usar: compáralo con el de la forma que tienes en la impresora. Si no coincide, NO imprimas y cerciórate con Jolexi de que no tenga ningún documento pendiente por imprimir.` });
    } catch (e) { console.error('No se pudo avisar la aprobación:', e.message); }
}

/** Nombre del usuario (empleado o usuario) para los avisos. */
export async function nombreDeUsuario(id) {
    const u = await User.findByPk(Number(id), { attributes: ['id', 'user'], include: [{ association: 'empleado', attributes: ['nombre', 'apellido'], required: false }] });
    return u?.empleado ? `${u.empleado.nombre} ${u.empleado.apellido}` : (u?.user || null);
}

/** ¿Ya está la migración (columnas de aprobación)? Sin ella no se deja a un vendedor emitir notas, porque no podrían quedar por aprobar. */
export async function aprobacionDisponible() {
    try {
        await sequelize.query(`SELECT "aprobacionEstado" FROM "NotasFiscales" LIMIT 1`);
        return true;
    } catch (e) {
        if (columnaFaltante(e)) return false;
        throw e;
    }
}

/** ¿Es una nota de este vendedor y ya está aprobada? Solo así un vendedor puede imprimirla (asignarle el número de control). */
export async function esNotaAprobadaDe(notaId, usuarioId) {
    try {
        const [f] = await sequelize.query(
            `SELECT 1 AS ok FROM "NotasFiscales" n LEFT JOIN "Ventas" v ON v."id" = COALESCE(n."ventaId", (n."facturasAfectadas"->0->>'ventaId')::uuid)
              WHERE n."id" = :id AND n."origen" = 'VENTA' AND n."estado" = 'EMITIDA' AND n."aprobacionEstado" = 'APROBADA'
                AND COALESCE(n."registradoPorId", v."vendedorId") = :u`,
            { replacements: { id: notaId, u: Number(usuarioId) }, type: sequelize.QueryTypes.SELECT },
        );
        return Boolean(f);
    } catch (e) {
        if (columnaFaltante(e)) return false;
        throw e;
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// EFECTOS DIFERIDOS: la factura o nota de un vendedor no mueve inventario, cuentas por cobrar, caja ni comisiones hasta que jolexi la aprueba.
// Lo que hay que aplicar al aprobar queda en la columna efectosPendientes (JSON). NULL = ya se aplicaron (o el documento no es de un vendedor).
// Si la migración aprobacion-efectos no se corrió, nada se difiere (todo funciona como antes).
// La consulta de disponibilidad va SIN transacción: un error de columna dentro de una transacción la dejaría abortada.
// ---------------------------------------------------------------------------------------------------------------------------------------
let efectosOk = null;
let efectosRevisado = 0;

/** ¿Existe la columna efectosPendientes en Ventas y NotasFiscales? (se recuerda un minuto cuando no existe) */
export async function efectosDiferidosDisponible() {
    if (efectosOk === true) return true;
    if (efectosOk === false && Date.now() - efectosRevisado < 60000) return false;
    try {
        await sequelize.query('SELECT "efectosPendientes" FROM "Ventas" LIMIT 1');
        await sequelize.query('SELECT "efectosPendientes" FROM "NotasFiscales" LIMIT 1');
        efectosOk = true;
    } catch (e) {
        if (!columnaFaltante(e) && !/efectosPendientes/.test(e?.message || '')) throw e;
        efectosOk = false;
    }
    efectosRevisado = Date.now();
    return efectosOk;
}

/** Deja anotado lo que se aplicará al aprobar. Devuelve false si no se pudo (migración sin correr). */
export async function guardarEfectosPendientes(tipo, id, datos, transaction) {
    if (!(await efectosDiferidosDisponible())) return false;
    await sequelize.query(`UPDATE "${TABLAS[tipo]}" SET "efectosPendientes" = CAST(:d AS jsonb) WHERE id = :id`, { replacements: { id, d: JSON.stringify(datos || {}) }, transaction });
    return true;
}

/** Los efectos que esperan aprobación (objeto) o null si ya se aplicaron / no aplica. */
export async function leerEfectosPendientes(tipo, id, transaction) {
    if (!(await efectosDiferidosDisponible())) return null;
    const [f] = await sequelize.query(`SELECT "efectosPendientes" AS e FROM "${TABLAS[tipo]}" WHERE id = :id`, { replacements: { id }, type: sequelize.QueryTypes.SELECT, transaction });
    return f?.e ?? null;
}

/** Cambia los datos anotados (p. ej. jolexi corrige el método de pago antes de aprobar). */
export const actualizarEfectosPendientes = guardarEfectosPendientes;

export async function limpiarEfectosPendientes(tipo, id, transaction) {
    if (!(await efectosDiferidosDisponible())) return;
    await sequelize.query(`UPDATE "${TABLAS[tipo]}" SET "efectosPendientes" = NULL WHERE id = :id`, { replacements: { id }, transaction });
}
