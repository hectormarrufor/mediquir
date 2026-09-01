// Ruta: app/api/test-cron/route.js

import { NextResponse } from 'next/server';
import {
    syncExchangeRates,
    checkHREvents,
    checkCxP, 
    checkCxC,
    liberarOrdenesExpiradas
} from '../cron-jobs/6am/services'; // Ajusta la ruta si es necesario
import { notificarCabezas } from '@/app/handlers/notificar'; 

export const dynamic = 'force-dynamic';
export const maxDuration = 60; 

export async function GET(request) {
    // 🔒 Pequeña seguridad: Solo se ejecuta si pasas el query param correcto
    // Ejemplo de uso: http://localhost:3000/api/test-cron?secret=mediquir
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== 'mediquir') {
        return NextResponse.json({ error: 'No autorizado. Usa ?secret=mediquir en la URL.' }, { status: 401 });
    }

    try {
        console.log('--- TEST CRON MANUAL START ---');

        // Ejecución en paralelo mapeada exactamente 5 a 5
        const [ finanzas, rrhh, cxp, cxc, limpiezaInventario ] = await Promise.allSettled([
            syncExchangeRates(),
            checkHREvents(),
            checkCxP(),
            checkCxC(),
            liberarOrdenesExpiradas()
        ]);

        const report = [];

        // 1. Finanzas
        if (finanzas.status === 'fulfilled' && finanzas.value.status === 'OK') {
            report.push(`✅ Tasas actualizadas: ${finanzas.value.msg}`);
        } else {
            report.push(`❌ Error Finanzas: ${finanzas.status === 'fulfilled' ? finanzas.value.msg : finanzas.reason}`);
        }

        // 2. RRHH
        if (rrhh.status === 'fulfilled' && rrhh.value.length > 0) {
            const events = rrhh.value;
            for (const ev of events) {
                await notificarCabezas({
                    title: ev.type === 'CUMPLE' ? '🎂 Cumpleaños' : (ev.type === 'ANIVERSARIO' ? '🏆 Aniversario' : '⚠️ Doc. Empleado'),
                    body: ev.msg,
                    url: `/superuser/rrhh/empleados/${ev.id}`,
                    tag: `hr-${ev.id}-${Date.now()}`
                });
            }
            report.push(`✅ ${events.length} eventos de RRHH reportados.`);
        } else if (rrhh.status === 'fulfilled') {
             report.push(`✅ RRHH: Sin eventos pendientes.`);
        }

        // 3. Cuentas Por Pagar (CxP)
        if (cxp.status === 'fulfilled' && cxp.value.length > 0) {
            const docs = cxp.value;
            for (const doc of docs) {
                await notificarCabezas({
                    title: `🔴 CxP: ${doc.estadoTiempo}`,
                    body: `Debemos a ${doc.proveedor} (Fact: ${doc.documento})\nSaldo: ${doc.monto} ${doc.moneda}`,
                    url: `/superuser/finanzas/cxp`,
                    tag: `cxp-${doc.id}-${Date.now()}`
                });
            }
            report.push(`✅ ${docs.length} alertas de CxP enviadas.`);
        } else if (cxp.status === 'fulfilled') {
             report.push(`✅ CxP: Al día.`);
        }

        // 4. Cuentas Por Cobrar (CxC)
        if (cxc.status === 'fulfilled' && cxc.value.length > 0) {
            const docs = cxc.value;
            for (const doc of docs) {
                await notificarCabezas({
                    title: `🟢 CxC: ${doc.estadoTiempo}`,
                    body: `Cobrar a ${doc.cliente} (Doc: ${doc.documento})\nSaldo: ${doc.monto} ${doc.moneda}`,
                    url: `/superuser/finanzas/cxc`,
                    tag: `cxc-${doc.id}-${Date.now()}`
                });
            }
            report.push(`✅ ${docs.length} alertas de CxC enviadas.`);
        } else if (cxc.status === 'fulfilled') {
             report.push(`✅ CxC: Al día.`);
        }

        // 5. Limpieza de Inventario (Ventas abandonadas)
        if (limpiezaInventario.status === 'fulfilled') {
            const canceladas = limpiezaInventario.value.canceladas;
            if (canceladas > 0) {
                await notificarCabezas({
                    title: `🛒 Limpieza Automática de Inventario`,
                    body: `Se anularon ${canceladas} pedidos de 'Retiro en Tienda' vencidos (>24h). El stock ha sido devuelto a los anaqueles.`,
                    url: `/superuser/ventas`,
                    tag: `limpieza-inv-${Date.now()}`
                });
                report.push(`✅ ${canceladas} ventas web expiradas canceladas. Stock devuelto.`);
            } else {
                report.push(`✅ Limpieza de inventario ejecutada (0 órdenes expiradas).`);
            }
        } else {
            report.push(`❌ Error en Limpieza Inventario: ${limpiezaInventario.reason}`);
        }

        console.log('--- TEST CRON MANUAL END ---');
        
        // Retornamos el reporte bien formateado para leerlo fácil en el navegador
        return NextResponse.json({ 
            success: true, 
            modo: 'TEST MANUAL EJECUTADO', 
            report 
        }, { status: 200 });

    } catch (error) {
        console.error('TEST CRON CRITICAL ERROR:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}