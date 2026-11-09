// Diferenciales cambiarios pendientes de Centro Clínico de Cabimas (hoja de Eddy del Excel «CXC VENDEDORES», filas 5 a 12, «DIFERENCIAL PENDIENTE»): el cliente pagó esas facturas
// pero todavía debe la diferencia de tasa. Las facturas están en bolívares y ya cobradas, así que no aplica una nota de débito fiscal (esa solo se emite sobre facturas en USD y
// entra al libro de ventas): se registran como cuentas manuales (deuda sin venta) para que el libro de cobranza muestre lo mismo que el Excel. Si más adelante se emite la nota
// fiscal real, se borra o se cierra la cuenta manual. Repetible: no duplica.   node scripts/migraciones/cxc-diferenciales-cabimas.cjs
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const CLIENTE_ID = 484; // CENTRO CLINICO DE CABIMAS, C.A
// factura, monto USD (diferencial), emisión, vencimiento (del Excel)
const FILAS = [
    ['145445', 20.42, '2026-05-06', '2026-05-06'],
    ['145446', 5.44, '2026-05-06', '2026-05-06'],
    ['145705', 101.8, '2026-06-06', '2026-06-13'],
    ['145357', 233.35, '2026-04-28', '2026-05-05'],
    ['145808', 168.76, '2026-06-18', '2026-06-25'],
    ['146138', 6.98, '2026-08-04', '2026-08-11'],
    ['146172', 32.19, '2026-08-10', '2026-08-17'],
    ['146258', 51.57, '2026-08-27', '2026-09-03'],
];

(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query('BEGIN');
        const [cli] = (await db.query('SELECT id, nombre FROM "Clientes" WHERE id = $1', [CLIENTE_ID])).rows;
        if (!cli || !/CABIMAS/i.test(cli.nombre)) throw new Error('El cliente #484 no es Centro Clínico de Cabimas');
        let creadas = 0;
        for (const [factura, monto, fecha, vence] of FILAS) {
            const concepto = `DIFERENCIAL FACTURA ${factura}`;
            const ya = (await db.query('SELECT id FROM "CuentasManuales" WHERE "clienteId" = $1 AND concepto = $2', [CLIENTE_ID, concepto])).rows.length;
            if (ya) { console.log(`  ya existe: ${concepto}`); continue; }
            const v = (await db.query(`SELECT id FROM "Ventas" WHERE "clienteId" = $1 AND "numeroDocumento" = $2`, [CLIENTE_ID, `F-${factura}`])).rows;
            if (!v.length) throw new Error(`La factura F-${factura} no es de Centro Clínico de Cabimas`);
            await db.query(
                `INSERT INTO "CuentasManuales" ("clienteId", "clienteTexto", concepto, "montoUsd", fecha, vence, observacion, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
                [CLIENTE_ID, cli.nombre, concepto, monto, fecha, vence, `Diferencial cambiario pendiente de cobrar sobre la factura ${factura} (ya cobrada). Hoja de Eddy del Excel CXC VENDEDORES. Sin nota fiscal emitida.`],
            );
            creadas++;
            console.log(`  + ${concepto}: ${monto} $ (vence ${vence})`);
        }
        await db.query('COMMIT');
        console.log(`\n✅ ${creadas} cuentas manuales creadas`);
    } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
