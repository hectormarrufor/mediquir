// Aprobación de documentos hechos por vendedores (mientras se acostumbran al sistema): sus facturas y notas de crédito/débito quedan
// "por aprobar"; jolexi (o el usuario 1) las revisa, las corrige y las aprueba, y recién entonces se imprimen.
// Las columnas (Ventas / NotasFiscales . aprobacionEstado) se tocan con SQL directo: si la migración aprobacion-documentos aún no se corrió,
// nada se rompe (simplemente ningún documento está pendiente).
import { sequelize, User } from '@/models';
import { notificarUsuario } from '@/app/handlers/notificar';
import { puedeCorregirFacturas } from './corregirFactura';

export const URL_POR_APROBAR = '/superuser/ventas/por-aprobar';
const TABLAS = { VENTA: 'Ventas', NOTA: 'NotasFiscales' };
const columnaFaltante = (e) => e?.original?.code === '42703' || /aprobacionEstado/.test(e?.message || '');

/** Quien aprueba: el usuario 1 y «jolexi» (los mismos que corrigen facturas). */
export const puedeAprobar = puedeCorregirFacturas;

/** Marca un documento como por aprobar. Devuelve false (y lo deja anotado) si no se pudo, p. ej. por migración sin correr. */
export async function marcarPorAprobar(tipo, id) {
    try {
        await sequelize.query(`UPDATE "${TABLAS[tipo]}" SET "aprobacionEstado" = 'PENDIENTE', "aprobadaAt" = NULL, "aprobadaPorId" = NULL WHERE id = :id`, { replacements: { id } });
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

/** Aprueba un documento por aprobar. Devuelve true si estaba pendiente. */
export async function aprobar(tipo, id, usuarioId) {
    const [, meta] = await sequelize.query(
        `UPDATE "${TABLAS[tipo]}" SET "aprobacionEstado" = 'APROBADA', "aprobadaAt" = now(), "aprobadaPorId" = :u WHERE id = :id AND "aprobacionEstado" = 'PENDIENTE'`,
        { replacements: { id, u: usuarioId || null } },
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
