// Nota de entrega antigua 0000-6591 (Clínica Ferrebus, 17/09/2026, a crédito, sin abonos): se registra tal cual salió, SIN tocar el correlativo de NE ni el inventario.
//   node scripts/migraciones/ne-6591-ferrebus.cjs            -> simulación
//   node scripts/migraciones/ne-6591-ferrebus.cjs --aplicar  -> carga de verdad
const path = require('path');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const APLICAR = process.argv.includes('--aplicar');
const NUM = 'NE-06591', FECHA = '2026-09-17', VENCE = '2026-09-24', CLIENTE_ID = 1, VENDEDOR_USER = 9;
// [productoId | null, nombre libre, cantidad, precio, IVA]
const R = [
    [null, 'Seda 2-0 (833) Arizi', 24, 2.5, true], [452, '', 4, 7.5, true], [500, '', 200, 0.52, true], [2470, '', 10, 3.2, false],
    [2901, '', 96, 0.85, true], [396, '', 150, 0.13, true], [null, 'Compresa de laparotomía Valemedic', 60, 3.5, true], [10, '', 50, 5.15, true],
    [4254, '', 3, 22, false], [2871, '', 24, 1.65, true], [null, 'Jackson Pratt Trocar + Trocar (19FR/7MM) (E)', 10, 25, false], [318, '', 7, 6, true],
    [2891, '', 48, 1.4, true], [456, '', 4, 7.5, true], [null, 'Seda 1 (845) Medaid', 48, 0.95, true], [null, 'Vicryl 1 (J341) TX Medical', 96, 2.2, true],
    [2813, '', 6, 8.5, true], [266, '', 20, 0.65, true],
];
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
(async () => {
    const db = new Client({ connectionString: process.env.DB_URI, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        if ((await db.query(`SELECT 1 FROM "Ventas" WHERE "numeroDocumento" = $1`, [NUM])).rowCount) throw new Error(`${NUM} ya existe`);
        const sub = r2(R.reduce((s, r) => s + r[2] * r[3], 0));
        const iva = r2(R.filter((r) => r[4]).reduce((s, r) => s + r[2] * r[3] * 0.16, 0));
        const total = r2(sub + iva);
        const tasa = Number((await db.query(`SELECT monto FROM "BcvPreciosHistoricos" WHERE fecha = $1`, [FECHA])).rows[0]?.monto);
        console.log({ sub, iva, total, tasa, esperado: { sub: 1610.2, iva: 201.95, total: 1812.15 } });
        if (!APLICAR) return console.log('Simulación: no se escribió nada.');
        await db.query('BEGIN');
        const id = randomUUID(); const ts = `${FECHA}T12:00:00-04:00`;
        await db.query(`INSERT INTO "Ventas" (id,"clienteId","vendedorId","tipoVenta","tipoDocumento","numeroDocumento","condicionPago","statusPago","fechaVencimiento",moneda,"tasaCambio",subtotal,"montoIva","totalDescuento","totalFinal","statusDespacho","tipoEntrega","fechaEmision","createdAt","updatedAt")
            VALUES ($1,$2,$3,'MAYOR'::"enum_Ventas_tipoVenta",'NOTA_ENTREGA'::"enum_Ventas_tipoDocumento",$4,'Credito'::"enum_Ventas_condicionPago",'Pendiente'::"enum_Ventas_statusPago",$5::timestamptz,'USD'::"enum_Ventas_moneda",$6,$7,$8,0,$9,'Completado','pickup',$10::timestamptz,$10::timestamptz,$10::timestamptz)`,
            [id, CLIENTE_ID, VENDEDOR_USER, NUM, `${VENCE}T12:00:00-04:00`, tasa, sub, iva, total, ts]);
        for (const [pid, nombre, cant, precio, conIva] of R) {
            await db.query(`INSERT INTO "VentaDetalles" (id,"ventaId","productoId","isFicticio","nombreFicticio","aplicaIva","afectaInventario",cantidad,"precioUnitario",subtotal)
                VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8,$9)`,
                [randomUUID(), id, pid, !pid, pid ? null : nombre, conIva, cant, precio, r2(cant * precio)]);
        }
        await db.query(`INSERT INTO "CuentasPorCobrar" ("clienteId","ventaId","montoTotal","saldoPendiente",moneda,"tasaCambio","fechaVencimiento",estado,"createdAt","updatedAt")
            VALUES ($1,$2,$3,$3,'USD',$4,$5,'Pendiente'::"enum_CuentasPorCobrar_estado",$6::timestamptz,now())`, [CLIENTE_ID, id, total, tasa, VENCE, ts]);
        await db.query('COMMIT');
        console.log(`Cargada ${NUM}: USD ${total} por cobrar a Clínica Ferrebus.`);
    } catch (e) { await db.query('ROLLBACK').catch(() => {}); console.error('Falló:', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
