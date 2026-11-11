// F-146817 (MULTITIENDA INTER SALUD, control 00-0122586) salió mal: la buena es la F-146818. La carga la dejó de Contado y Pagada (el origen traía TIPO=1 aunque
// ESCREDITO=1 y TOTPAGOS=0) y registró 2 ingresos en caja que nunca existieron. Decisión de Hector (2026-11-11): anularla con la NC-06273 (control 00-0122688),
// quitar esos ingresos y dejarla como crédito. NO se devuelve inventario (la carga de facturas nunca lo descontó) y no se toca la cuenta por cobrar.
// Usa la misma emisión de notas del sistema (numeración, libro de ventas, control). Repetible: si la NC-06273 ya existe, no hace nada.
//   node scripts/migraciones/anular-f146817.cjs [--aplicar]
const path = require('path');
const { pathToFileURL } = require('url');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const APLICAR = process.argv.includes('--aplicar');
const raiz = path.join(__dirname, '..', '..');
const cargar = (rel) => import(pathToFileURL(path.join(raiz, rel)).href);

(async () => {
    const { default: db } = await cargar('models/index.js');
    const { emitirNotaVenta } = await cargar('app/api/_lib/notasFiscales.js');
    const { reservarControl } = await cargar('app/api/_lib/numeracion.js');
    const { sequelize, Venta, VentaDetalle, NotaFiscal } = db;
    const t = await sequelize.transaction();
    try {
        const venta = await Venta.findOne({ where: { numeroDocumento: 'F-146817' }, transaction: t, lock: t.LOCK.UPDATE });
        if (!venta || venta.numeroControl !== '00-0122586') throw new Error('No se encontró la F-146817 con control 00-0122586');
        if (await NotaFiscal.findOne({ where: { numeroDocumento: 'NC-06273' }, transaction: t })) throw new Error('La NC-06273 ya existe: no se repite');
        const detalles = await VentaDetalle.findAll({ where: { ventaId: venta.id }, transaction: t });
        const control = await reservarControl('00-0122688', t);
        const nota = await emitirNotaVenta({
            venta, tipo: 'CREDITO', renglones: detalles.map((d) => ({ ventaDetalleId: d.id, cantidad: Number(d.cantidad) })),
            motivo: 'Anulación total de la factura F-146817: salió mal; la factura válida es la F-146818',
            devuelveInventario: false, afectaCxc: false, numeroManual: 'NC-06273', numeroControl: control, transaction: t,
        });
        console.log(`NC emitida: ${nota.numeroDocumento} · control ${nota.numeroControl} · total ${nota.totalFinal} ${nota.moneda}`);
        const [, info] = await sequelize.query(`DELETE FROM "MovimientosFinancieros" WHERE "ventaId" = :id AND "abonoId" IS NULL AND referencia = 'F-146817' AND descripcion LIKE '%migrada del sistema anterior%'`, { replacements: { id: venta.id }, transaction: t });
        console.log(`Ingresos eliminados: ${info.rowCount} (se esperaban 2)`);
        if (info.rowCount !== 2) throw new Error('Se esperaba eliminar exactamente 2 movimientos de ingreso');
        venta.condicionPago = 'Credito'; // era a crédito en el sistema anterior
        await venta.save({ transaction: t });
        if (APLICAR) { await t.commit(); console.log('\n✅ CAMBIOS GUARDADOS'); }
        else { await t.rollback(); console.log('\n🧪 SIMULACIÓN: no se guardó nada. Para aplicar: --aplicar'); }
    } catch (e) {
        if (!t.finished) await t.rollback();
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
})();
