// Correcciones al libro de cobranza según los Excel de la administradora (Hector, 2026-11-09). Repetible; node scripts/migraciones/cxc-correccion-grupos-2026-11-09.cjs [--aplicar]
//  1. Zaghloul Coro: el Excel resta 1.263,76 $ de pago a la NE-06391 (1.395,75 $), o sea 182,43 $ de más que el sistema perdió al cerrar la nota; se compensan en la NE-06487 (Excel: debe 3.695,89 $).
//  2. «Droguesi y Grupo Farmasi»: quedaba con los clientes del archivo viejo (Madre Rafols, Materno…). Pasa a los del CXC DROGUESI Y GRUPO FARMASI (1).xlsx: Droguesi + Farmasi (La Puerta, Las Calderas, Caja de Agua, Santa María, Santa Irene, Farmaconnection, Aroa Yaracuy).
//  3. Maraplus se separa por ciudad como las hojas del Excel: Maracaibo (MCBO), Cabimas y Ciudad Ojeda.
//  4. La Económica Plus 2 (único cliente «sin grupo», de Michael) pasa a Vendedores.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
const DROGUESI = [2, 892, 906, 891, 3501, 893, 944, 868];
const CABIMAS = [888, 1910, 3394];
const OJEDA = [1902];

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        // 1. Zaghloul Coro
        const [ne] = (await db.query(`SELECT v.id, c.id AS cxc, c."saldoPendiente"::float AS saldo FROM "Ventas" v JOIN "CuentasPorCobrar" c ON c."ventaId" = v.id WHERE v."numeroDocumento" = 'NE-06487' AND c."clienteId" = 939 FOR UPDATE`)).rows;
        if (!ne) throw new Error('No se encontró la NE-06487 de Zaghloul Coro');
        const ya = (await db.query(`SELECT 1 FROM "Abonos" WHERE "ventaId" = $1 AND referencia = 'EXCEDENTE NE-06391'`, [ne.id])).rows.length;
        if (ya) console.log('Zaghloul Coro: el excedente ya está compensado');
        else {
            const M = 182.43, F = '2026-08-03';
            const [bcv] = (await db.query(`SELECT monto::float AS tasa FROM "BcvPreciosHistoricos" WHERE fecha <= $1 ORDER BY fecha DESC, id DESC LIMIT 1`, [F])).rows;
            const tasa = bcv?.tasa || 1, bs = Math.round(M * tasa * 100) / 100;
            await db.query(`INSERT INTO "Abonos" ("fechaPago", "metodoPago", referencia, "montoUsd", "tasaBcvAplicada", "montoVes", notas, "createdAt", "updatedAt", "ventaId", "montoBs", "tasaCambio")
                VALUES ($1, 'Excedente de pago (compensación)', 'EXCEDENTE NE-06391', $2, $3, $4, $5, now(), now(), $6, $4, $3)`,
                [F, M, tasa, bs, 'Zaghloul Coro pagó 182,43 $ de más la NE-06391 (el Excel resta 1.263,76 $ de pago); se compensa en esta nota. No entra ni sale dinero.', ne.id]);
            await db.query(`UPDATE "CuentasPorCobrar" SET "saldoPendiente" = $1, "updatedAt" = now() WHERE id = $2`, [Math.round((ne.saldo - M) * 100) / 100, ne.cxc]);
            console.log(`NE-06487: saldo ${ne.saldo.toFixed(2)} → ${(ne.saldo - M).toFixed(2)}`);
        }
        const [tot] = (await db.query(`SELECT COALESCE(SUM("saldoPendiente"),0)::float s FROM "CuentasPorCobrar" WHERE "clienteId" = 939 AND estado <> 'Pagado'`)).rows;
        console.log(`Zaghloul Coro debe: ${tot.s.toFixed(2)} $ (Excel: 3695,89)`);

        // 2. Droguesi y Grupo Farmasi
        const [dro] = (await db.query(`SELECT id FROM "GruposCobranza" WHERE nombre = 'Droguesi y Grupo Farmasi'`)).rows;
        if (dro) {
            await db.query(`DELETE FROM "GrupoCobranzaClientes" WHERE "grupoId" = $1 AND NOT ("clienteId" = ANY($2::int[]))`, [dro.id, DROGUESI]);
            await db.query(`INSERT INTO "GrupoCobranzaClientes" ("grupoId", "clienteId") SELECT $1, x FROM unnest($2::int[]) x ON CONFLICT DO NOTHING`, [dro.id, DROGUESI]);
        }
        // 3. Maraplus por ciudad
        const [mar] = (await db.query(`SELECT id, orden FROM "GruposCobranza" WHERE nombre IN ('Maraplus', 'Maraplus Maracaibo') ORDER BY id LIMIT 1`)).rows;
        if (mar) {
            await db.query(`UPDATE "GruposCobranza" SET nombre = 'Maraplus Maracaibo' WHERE id = $1`, [mar.id]);
            const nuevo = async (nombre, ids, pos) => {
                let [g] = (await db.query(`SELECT id FROM "GruposCobranza" WHERE nombre = $1`, [nombre])).rows;
                if (!g) {
                    await db.query(`UPDATE "GruposCobranza" SET orden = orden + 1 WHERE orden > $1`, [mar.orden + pos - 1]);
                    [g] = (await db.query(`INSERT INTO "GruposCobranza" (nombre, orden, "createdAt", "updatedAt") VALUES ($1, $2, now(), now()) RETURNING id`, [nombre, mar.orden + pos])).rows;
                }
                await db.query(`INSERT INTO "GrupoCobranzaClientes" ("grupoId", "clienteId") SELECT $1, x FROM unnest($2::int[]) x ON CONFLICT DO NOTHING`, [g.id, ids]);
            };
            await db.query(`DELETE FROM "GrupoCobranzaClientes" WHERE "grupoId" = $1 AND "clienteId" = ANY($2::int[])`, [mar.id, [...CABIMAS, ...OJEDA]]);
            await nuevo('Maraplus Cabimas', CABIMAS, 1);
            await nuevo('Maraplus Ciudad Ojeda', OJEDA, 2);
        }
        // 4. La Económica Plus 2 → Vendedores
        await db.query(`INSERT INTO "GrupoCobranzaClientes" ("grupoId", "clienteId") SELECT id, 901 FROM "GruposCobranza" WHERE nombre = 'Vendedores' ON CONFLICT DO NOTHING`);

        console.table((await db.query(`SELECT g.orden, g.nombre, count(m."clienteId") clientes FROM "GruposCobranza" g LEFT JOIN "GrupoCobranzaClientes" m ON m."grupoId" = g.id GROUP BY g.id ORDER BY g.orden, g.id`)).rows);
        if (APLICAR) { await db.query('COMMIT'); console.log('✅ CAMBIOS GUARDADOS'); }
        else { await db.query('ROLLBACK'); console.log('🧪 SIMULACIÓN: no se guardó nada. Para aplicar: --aplicar'); }
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('❌', e.message); process.exitCode = 1;
    } finally { await db.end(); }
})();
