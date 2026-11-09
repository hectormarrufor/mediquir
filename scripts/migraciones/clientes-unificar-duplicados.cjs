// Unifica clientes duplicados (mismo cliente cargado dos veces con el RIF mal escrito en uno). Se queda el registro cuyo RIF pasa el dígito verificador del SENIAT; todo lo del
// duplicado (ventas, cuentas por cobrar, notas, pedidos, presupuestos, cuentas manuales, usuarios del portal) se pasa al que se queda, se le copian los datos que le falten (dirección, teléfono…)
// y el duplicado se borra. Todo en una transacción y con respaldo en JSON de las dos fichas y de los ids movidos.
//   · FARMACIA SANTA MARIA, C.A.: queda #3501 (J-31218959-2, válido); #929 (J-03128959-2, inválido) aportaba la dirección completa.
//   · INVERSIONES Y SERVICIOS CT, C.A.: queda #1282 (J-30356543-3, válido); #1281 (J-30351543-3, inválido) aportaba la dirección completa.
// Uso:  node scripts/migraciones/clientes-unificar-duplicados.cjs [--aplicar]      (sin --aplicar solo muestra lo que haría)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
const PARES = [{ queda: 3501, duplicado: 929 }, { queda: 1282, duplicado: 1281 }];
const TABLAS = [['Pedidos', 'clienteId'], ['Presupuestos', 'clienteId'], ['Usuarios', 'clienteId'], ['CuentasPorCobrar', 'clienteId'], ['Ventas', 'clienteId'], ['CuentasManuales', 'clienteId'], ['NotasFiscales', 'clienteId']];
const CAMPOS_A_COMPLETAR = ['direccion', 'telefono', 'email', 'imagen', 'notas'];

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const respaldo = [];
    try {
        await db.query('BEGIN');
        for (const { queda, duplicado } of PARES) {
            const [q] = (await db.query('SELECT * FROM "Clientes" WHERE id = $1', [queda])).rows;
            const [d] = (await db.query('SELECT * FROM "Clientes" WHERE id = $1', [duplicado])).rows;
            if (!q || !d) throw new Error(`Falta el cliente #${queda} o #${duplicado}`);
            if (String(q.nombre).replace(/[^A-Z0-9]/gi, '').toUpperCase() !== String(d.nombre).replace(/[^A-Z0-9]/gi, '').toUpperCase()) throw new Error(`#${queda} y #${duplicado} no tienen el mismo nombre`);
            console.log(`\n${q.nombre}: queda #${queda} [${q.identificacion}], se unifica #${duplicado} [${d.identificacion}]`);
            const movidos = {};
            for (const [tabla, col] of TABLAS) {
                const ids = (await db.query(`SELECT id FROM "${tabla}" WHERE "${col}" = $1`, [duplicado])).rows.map((r) => r.id);
                if (!ids.length) continue;
                movidos[tabla] = ids;
                await db.query(`UPDATE "${tabla}" SET "${col}" = $1 WHERE "${col}" = $2`, [queda, duplicado]);
                console.log(`  ${tabla}: ${ids.length} → #${queda}`);
            }
            const completar = {};
            for (const c of CAMPOS_A_COMPLETAR) if ((q[c] === null || q[c] === '') && d[c] !== null && d[c] !== '') completar[c] = d[c];
            if (Object.keys(completar).length) {
                const cols = Object.keys(completar);
                await db.query(`UPDATE "Clientes" SET ${cols.map((c, i) => `"${c}" = $${i + 2}`).join(', ')}, "updatedAt" = now() WHERE id = $1`, [queda, ...cols.map((c) => completar[c])]);
                console.log('  datos completados:', Object.keys(completar).join(', '));
            }
            await db.query('DELETE FROM "Clientes" WHERE id = $1', [duplicado]);
            console.log(`  #${duplicado} eliminado`);
            respaldo.push({ queda: q, duplicado: d, movidos, completado: completar });
        }
        if (APLICAR) {
            const archivo = path.join(__dirname, 'datos', 'privado', 'respaldo-clientes-unificados-2026-11-09.json');
            fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 1));
            await db.query('COMMIT');
            console.log('\n✅ CAMBIOS GUARDADOS. Respaldo:', archivo);
        } else {
            await db.query('ROLLBACK');
            console.log('\n🧪 SIMULACIÓN: no se guardó nada. Para aplicar: --aplicar');
        }
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
