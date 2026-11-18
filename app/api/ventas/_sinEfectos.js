// ¿La factura de un vendedor sigue "por aprobar" sin haber aplicado sus efectos? (Ventas.efectosPendientes no es NULL)
// Mientras sea así NO hay salidas de inventario, cuenta por cobrar, ingresos en caja ni comisión que revertir: corregir o eliminar la factura
// toca solo el documento. Imports relativos con extensión y sin el alias "@/" para poder usarlo desde scripts de Node.
// La consulta de disponibilidad de la columna va SIN transacción (un error de columna dentro de una transacción la dejaría abortada).
import db from '../../../models/index.js';

const { sequelize } = db;
let columnaOk = null;
let revisadoEn = 0;

async function hayColumna() {
    if (columnaOk === true) return true;
    if (columnaOk === false && Date.now() - revisadoEn < 60000) return false;
    try {
        await sequelize.query('SELECT "efectosPendientes" FROM "Ventas" LIMIT 1');
        columnaOk = true;
    } catch (e) {
        if (e?.original?.code !== '42703' && !/efectosPendientes/.test(e?.message || '')) throw e;
        columnaOk = false;
    }
    revisadoEn = Date.now();
    return columnaOk;
}

/** true si la factura todavía tiene sus efectos por aplicar (nada movió inventario, caja, cuentas por cobrar ni comisión). */
export async function sinEfectosAplicados(ventaId, transaction) {
    if (!(await hayColumna())) return false;
    const [f] = await sequelize.query('SELECT ("efectosPendientes" IS NOT NULL) AS pendiente FROM "Ventas" WHERE id = :id', { replacements: { id: ventaId }, type: sequelize.QueryTypes.SELECT, transaction });
    return Boolean(f?.pendiente);
}

/** Cambia el método de pago / referencia que se usarán al aprobar (jolexi los corrige antes de aprobar una factura de contado). */
export async function anotarPagoPendiente(ventaId, { metodoPago, referencia }, transaction) {
    await sequelize.query(
        `UPDATE "Ventas" SET "efectosPendientes" = COALESCE("efectosPendientes", '{}'::jsonb)
            || jsonb_strip_nulls(jsonb_build_object('metodoPago', CAST(:m AS text), 'referencia', CAST(:r AS text))) WHERE id = :id`,
        { replacements: { id: ventaId, m: metodoPago || null, r: referencia || null }, transaction },
    );
}
