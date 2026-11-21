// Limpia las retenciones de IVA de compras registradas desde noviembre 2026 (Mediquir dejó de ser agente de retención)
// y asegura que FacturasCompras.montoRetencion quede en 0 y los gastos (MovimientosFinancieros / CuentasPorPagar)
// reflejen el monto total completo con el IVA incluido.
// Uso: node scripts/migraciones/eliminar-retenciones-compras-noviembre.cjs
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../../sequelize');

const DESDE = '2026-11-01';
const CREADAS_NOV_DESDE = '2026-11-11';
// Comprobante histórico de febrero 2026 (20260200006568) enlazado a la factura 4192 que tiene fechaFactura 2026-11-28
const FACTURA_HISTORICA_EXCLUIDA = '7d839e7c-e7ef-47ec-84a0-9044cd8ef18a';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

(async () => {
    const t = await sequelize.transaction();
    try {
        // 1. Retenciones de compra emitidas o creadas desde noviembre 2026 (excluyendo las anteriores a nov como id=6777 de feb)
        const retenciones = await sequelize.query(`
            SELECT * FROM "RetencionesIva"
            WHERE tipo = 'COMPRA'
              AND (fecha >= :desde OR "createdAt" >= :creadasDesde)
            ORDER BY id ASC
        `, { replacements: { desde: DESDE, creadasDesde: CREADAS_NOV_DESDE }, type: sequelize.QueryTypes.SELECT, transaction: t });

        const retIds = retenciones.map((r) => r.id);
        const facturaIdsDeRet = [...new Set(retenciones.map((r) => r.facturaCompraId).filter(Boolean))];

        // 2. Facturas de compra vinculadas a esas retenciones o con montoRetencion > 0 desde noviembre (excluyendo factura histórica 4192 de feb)
        const facturasConRet = await sequelize.query(`
            SELECT * FROM "FacturasCompras"
            WHERE id <> :excluida
              AND (
                  id = ANY(ARRAY[:ids]::uuid[])
                  OR ("montoRetencion" > 0 AND ("fechaFactura" >= :desde OR "fechaRecepcion" >= :desde OR "createdAt" >= :creadasDesde))
              )
        `, {
            replacements: {
                excluida: FACTURA_HISTORICA_EXCLUIDA,
                ids: facturaIdsDeRet.length ? facturaIdsDeRet : ['00000000-0000-0000-0000-000000000000'],
                desde: DESDE,
                creadasDesde: CREADAS_NOV_DESDE,
            },
            type: sequelize.QueryTypes.SELECT,
            transaction: t,
        });

        // También todas las compras de contado desde noviembre para verificar que sus movimientos tengan el monto completo con IVA
        const todasComprasNov = await sequelize.query(`
            SELECT id, "numeroDocumento", moneda::text AS moneda, "tasaCambio"::float AS tasa,
                   "totalFinal"::float AS "totalFinal", "montoRetencion"::float AS "montoRetencion",
                   "condicionPago"::text AS "condicionPago"
            FROM "FacturasCompras"
            WHERE id <> :excluida
              AND ("fechaFactura" >= :desde OR "fechaRecepcion" >= :desde OR "createdAt" >= :creadasDesde)
        `, {
            replacements: { excluida: FACTURA_HISTORICA_EXCLUIDA, desde: DESDE, creadasDesde: CREADAS_NOV_DESDE },
            type: sequelize.QueryTypes.SELECT,
            transaction: t,
        });

        const idsFacturaTodasNov = todasComprasNov.map((f) => f.id);
        const idsFacturaRet = facturasConRet.map((f) => f.id);

        const movimientosNov = idsFacturaTodasNov.length ? await sequelize.query(`
            SELECT * FROM "MovimientosFinancieros"
            WHERE "facturaCompraId" = ANY(ARRAY[:ids]::uuid[]) AND tipo = 'GASTO'
        `, { replacements: { ids: idsFacturaTodasNov }, type: sequelize.QueryTypes.SELECT, transaction: t }) : [];

        const cxpAfectadas = idsFacturaRet.length ? await sequelize.query(`
            SELECT * FROM "CuentasPorPagar"
            WHERE "facturaCompraId" = ANY(ARRAY[:ids]::uuid[])
        `, { replacements: { ids: idsFacturaRet }, type: sequelize.QueryTypes.SELECT, transaction: t }) : [];

        const correlativoAntes = await sequelize.query(`
            SELECT * FROM correlativos WHERE prefijo = 'RET-COMPRA'
        `, { type: sequelize.QueryTypes.SELECT, transaction: t });

        // 3. Respaldo JSON previo antes de modificar nada
        const dirDatos = path.join(__dirname, 'datos');
        fs.mkdirSync(dirDatos, { recursive: true });
        const respaldoPath = path.join(dirDatos, 'eliminar-retenciones-compras-noviembre-respaldo-2026-11-20.json');
        fs.writeFileSync(respaldoPath, JSON.stringify({
            generadoEn: new Date().toISOString(),
            retencionesEliminadas: retenciones,
            facturasActualizadas: facturasConRet,
            movimientosRevisados: movimientosNov,
            cxpRevisadas: cxpAfectadas,
            correlativoAntes,
        }, null, 2));
        console.log(`Respaldo guardado en ${respaldoPath}`);

        // 4. Eliminar las retenciones desde noviembre
        let retBorradas = 0;
        if (retIds.length) {
            await sequelize.query(`DELETE FROM "RetencionesIva" WHERE id IN (:ids)`, {
                replacements: { ids: retIds },
                transaction: t,
            });
            retBorradas = retIds.length;
        }

        // 5. Poner montoRetencion = 0 en todas esas FacturasCompras
        let facturasLimpiadas = 0;
        if (idsFacturaRet.length) {
            await sequelize.query(`
                UPDATE "FacturasCompras"
                SET "montoRetencion" = 0, "updatedAt" = NOW()
                WHERE id = ANY(ARRAY[:ids]::uuid[]) AND "montoRetencion" <> 0
            `, { replacements: { ids: idsFacturaRet }, transaction: t });
            facturasLimpiadas = facturasConRet.filter((f) => Number(f.montoRetencion) > 0).length;
        }

        // 6. Asegurar que los movimientos financieros (gastos) de compras de contado tengan el totalFinal completo (sin restar retención)
        const facturaMap = new Map(todasComprasNov.map((f) => [f.id, f]));
        let movsCorregidos = 0;
        for (const m of movimientosNov) {
            const f = facturaMap.get(m.facturaCompraId);
            if (!f || f.condicionPago !== 'Contado') continue;
            const tasa = Number(f.tasa) || 1;
            const total = Number(f.totalFinal) || 0;
            const espUsd = r2(f.moneda === 'USD' ? total : (tasa > 0 ? total / tasa : 0));
            const espVes = r2(f.moneda === 'BS' ? total : total * tasa);
            if (Math.abs(Number(m.montoUsd) - espUsd) > 0.01 || Math.abs(Number(m.montoVes) - espVes) > 0.01) {
                await sequelize.query(`
                    UPDATE "MovimientosFinancieros"
                    SET "montoUsd" = :usd, "montoVes" = :ves, "updatedAt" = NOW()
                    WHERE id = :id
                `, { replacements: { id: m.id, usd: espUsd, ves: espVes }, transaction: t });
                movsCorregidos += 1;
                console.log(`Mov #${m.id} (${f.numeroDocumento}): $${Number(m.montoUsd).toFixed(2)} -> $${espUsd.toFixed(2)} (Bs ${espVes.toFixed(2)})`);
            }
        }

        // 7. Si hubiera CuentasPorPagar vinculadas con saldo/monto reducido por retención, restaurar
        let cxpCorregidas = 0;
        for (const c of cxpAfectadas) {
            const f = facturasConRet.find((x) => x.id === c.facturaCompraId);
            if (!f || !(Number(f.montoRetencion) > 0)) continue;
            const tasa = Number(f.tasaCambio) || 1;
            const totalDoc = Number(f.totalFinal) || 0;
            const espTotal = r2(c.moneda === f.moneda ? totalDoc : (c.moneda === 'USD' ? totalDoc / tasa : totalDoc * tasa));
            if (espTotal - Number(c.montoTotal) > 0.05) {
                const dif = r2(espTotal - Number(c.montoTotal));
                const nuevoSaldo = r2(Number(c.saldoPendiente) + dif);
                await sequelize.query(`
                    UPDATE "CuentasPorPagar"
                    SET "montoTotal" = :total, "saldoPendiente" = :saldo,
                        estado = CASE WHEN :saldo > 0.005 THEN 'Pendiente' ELSE estado END,
                        "updatedAt" = NOW()
                    WHERE id = :id
                `, { replacements: { id: c.id, total: espTotal, saldo: nuevoSaldo }, transaction: t });
                cxpCorregidas += 1;
            }
        }

        // 8. Recalcular el correlativo RET-COMPRA basado en la mayor secuencia restante
        const [maxRestante] = await sequelize.query(`
            SELECT MAX(CAST(RIGHT(comprobante, 8) AS BIGINT))::bigint AS max_seq
            FROM "RetencionesIva"
            WHERE tipo = 'COMPRA' AND comprobante ~ '^[0-9]{14}$'
        `, { type: sequelize.QueryTypes.SELECT, transaction: t });
        const nuevaSeq = (Number(maxRestante?.max_seq) || 0) + 1;
        await sequelize.query(`
            UPDATE correlativos
            SET "siguienteNumero" = :seq
            WHERE prefijo = 'RET-COMPRA'
        `, { replacements: { seq: nuevaSeq }, transaction: t });

        await t.commit();
        console.log(`Listo: ${retBorradas} retenciones eliminadas, ${facturasLimpiadas} facturas con montoRetencion -> 0, ${movsCorregidos} movimientos corregidos, ${cxpCorregidas} CxP corregidas. Correlativo RET-COMPRA siguienteNumero = ${nuevaSeq}.`);

        // 9. Verificación post-commit
        const [verif] = await sequelize.query(`
            SELECT
                (SELECT COUNT(*)::int FROM "RetencionesIva" WHERE tipo = 'COMPRA' AND (fecha >= :desde OR "createdAt" >= :creadasDesde)) AS rets_nov_restantes,
                (SELECT COUNT(*)::int FROM "FacturasCompras" WHERE id <> :excluida AND "montoRetencion" > 0 AND ("fechaFactura" >= :desde OR "fechaRecepcion" >= :desde OR "createdAt" >= :creadasDesde)) AS facts_ret_nov_restantes
        `, { replacements: { desde: DESDE, creadasDesde: CREADAS_NOV_DESDE, excluida: FACTURA_HISTORICA_EXCLUIDA }, type: sequelize.QueryTypes.SELECT });
        console.log('Verificación:', JSON.stringify(verif));
    } catch (err) {
        if (!t.finished) await t.rollback();
        console.error('Error limpiando retenciones de compras:', err);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
})();
