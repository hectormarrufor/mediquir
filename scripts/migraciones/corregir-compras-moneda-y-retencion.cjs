// Corrige:
// 1) Las 3 compras de gastos cargadas con moneda = 'USD' cuando sus montos estaban en bolívares
//    (Farmatodo 19898, Zoom 1722243095 y Unión Línea Alba 23153).
// 2) Los movimientos financieros de compras de nov 2026+ a los que se les restó la retención de IVA
//    (ya no somos agentes de retención: el gasto debe reflejar el monto completo de la compra).
// Guarda respaldo JSON antes de modificar nada.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../../sequelize');

const IDS_MONEDA_ERRONEA = [
    'bcfb6cce-33c8-4152-9a29-03879e7add06', // FARMATODO 19898 (42.900,87 Bs -> $47.43)
    '27ea45c9-65bb-41de-bffe-d64c43c3dcb2', // ZOOM 1722243095 (31.674,10 Bs -> $35.02)
    'c494b1ff-e30b-4d7c-92d5-96a9d758e745', // SOCIEDAD CIVIL UNION LINEA ALB 23153 (20.020,00 Bs -> $22.20)
];

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

(async () => {
    const t = await sequelize.transaction();
    try {
        // 1. Respaldo completo antes de tocar nada
        const [facturasErr] = await sequelize.query(
            `SELECT * FROM "FacturasCompras" WHERE id IN (:ids)`,
            { replacements: { ids: IDS_MONEDA_ERRONEA }, transaction: t }
        );
        const [movsAfectados] = await sequelize.query(
            `SELECT m.*, f."numeroDocumento", f.moneda AS f_moneda, f."tasaCambio" AS f_tasa, f."totalFinal" AS f_total, f."montoRetencion" AS f_ret,
                    (SELECT COUNT(*)::int FROM "MovimientosFinancieros" m2 WHERE m2."facturaCompraId" = m."facturaCompraId") AS n_movs_factura
             FROM "MovimientosFinancieros" m
             JOIN "FacturasCompras" f ON f.id = m."facturaCompraId"
             WHERE m."facturaCompraId" IN (:ids)
                OR (m.fecha >= '2026-11-01' AND f."montoRetencion" > 0)`,
            { replacements: { ids: IDS_MONEDA_ERRONEA }, transaction: t }
        );

        const respaldoPath = path.join(__dirname, 'datos', 'corregir-compras-moneda-y-retencion-respaldo-2026-11-20.json');
        fs.mkdirSync(path.dirname(respaldoPath), { recursive: true });
        fs.writeFileSync(respaldoPath, JSON.stringify({ fecha: new Date().toISOString(), facturasErr, movsAfectados }, null, 2));
        console.log(`Respaldo guardado en ${respaldoPath}`);

        // 2. Corregir moneda USD -> BS en las 3 compras erróneas
        for (const f of facturasErr) {
            if (f.moneda !== 'BS') {
                await sequelize.query(
                    `UPDATE "FacturasCompras" SET moneda = 'BS', "montoRetencion" = 0, "updatedAt" = NOW() WHERE id = :id`,
                    { replacements: { id: f.id }, transaction: t }
                );
                console.log(`FacturaCompra ${f.numeroDocumento} (${f.id}): moneda USD -> BS`);
            }
        }

        // 3. Corregir MovimientosFinancieros (3 erróneas + compras nov+ con retención restada)
        let actualizados = 0;
        for (const m of movsAfectados) {
            // Solo tocamos pagos únicos de la compra (evita alterar abonos parciales)
            if (m.n_movs_factura !== 1) continue;
            const esErronea = IDS_MONEDA_ERRONEA.includes(m.facturaCompraId);
            const monedaReal = esErronea ? 'BS' : m.f_moneda;
            const tasa = Number(m.f_tasa) || Number(m.tasaBcvAplicada) || 1;
            const total = Number(m.f_total) || 0;
            const nuevoUsd = monedaReal === 'USD' ? r2(total) : r2(total / tasa);
            const nuevoVes = monedaReal === 'BS' ? r2(total) : r2(total * tasa);

            if (Math.abs(Number(m.montoUsd) - nuevoUsd) > 0.01 || Math.abs(Number(m.montoVes) - nuevoVes) > 0.01) {
                await sequelize.query(
                    `UPDATE "MovimientosFinancieros" SET "montoUsd" = :usd, "montoVes" = :ves, "updatedAt" = NOW() WHERE id = :id`,
                    { replacements: { id: m.id, usd: nuevoUsd, ves: nuevoVes }, transaction: t }
                );
                actualizados += 1;
                console.log(`Mov #${m.id} (${m.numeroDocumento}): $${Number(m.montoUsd).toFixed(2)} -> $${nuevoUsd.toFixed(2)} (Bs ${nuevoVes.toFixed(2)})`);
            }
        }

        await t.commit();
        console.log(`Listo: ${facturasErr.length} facturas revisadas, ${actualizados} movimientos actualizados.`);
        await sequelize.close();
    } catch (e) {
        await t.rollback();
        console.error('Error en migración:', e);
        process.exit(1);
    }
})();
