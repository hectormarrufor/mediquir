import { NextResponse } from 'next/server';
import {
    syncExchangeRates,
    checkHREvents,
    checkCxP, 
    checkCxC,
    liberarOrdenesExpiradas,
    limpiarFotosEmpaque,
    recordarTareas,
    avisarClientesCobro,
    avisarOperacion
} from './services';
import { notificarCabezas } from '@/app/handlers/notificar'; 

export const dynamic = 'force-dynamic';
export const maxDuration = 60; 

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('--- CRON 6AM START ---');

        // Ejecución en paralelo mapeada exactamente 6 a 6
        const [ finanzas, rrhh, cxp, cxc, limpiezaInventario, limpiezaFotos, tareasRecordadas, clientesCobro, operacion ] = await Promise.allSettled([
            syncExchangeRates(),
            checkHREvents(),
            checkCxP(),
            checkCxC(),
            liberarOrdenesExpiradas(),
            limpiarFotosEmpaque(),
            recordarTareas(),
            avisarClientesCobro(),
            avisarOperacion()
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
        }

        // 5. Limpieza de Inventario (Ventas abandonadas)
        if (limpiezaInventario.status === 'fulfilled') {
            const { canceladas, vencidosPorVerificar, esperando } = limpiezaInventario.value;
            if (esperando?.length > 0) {
                await notificarCabezas({
                    title: '🕵️ Pagos por verificar',
                    body: `${esperando.length} pedido(s) de la tienda esperan que confirmes el pago en el banco: ${esperando.slice(0, 5).join(', ')}. A las 72 horas se cancelan solos.`,
                    url: '/superuser/ventas',
                    tag: `pagos-por-verificar-${Date.now()}`
                });
                report.push(`⚠️ ${esperando.length} pedido(s) con pago por verificar (recordatorio enviado).`);
            }
            if (vencidosPorVerificar > 0) report.push(`⚠️ ${vencidosPorVerificar} pedido(s) por verificar se cancelaron por pasar 72 horas sin confirmar el pago.`);
            if (canceladas > 0) {
                await notificarCabezas({
                    title: `🛒 Limpieza Automática de Inventario`,
                    body: `Se anularon ${canceladas} pedido(s) de la tienda vencidos (retiro sin pagar >24h o pago sin verificar >72h). El stock volvió a los anaqueles.`,
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

        // 6. Limpieza de fotos de empaque (sin notificación push: es mantenimiento)
        if (limpiezaFotos.status === 'fulfilled') {
            const { borradasVencidas, borradasAbandonadas, errores } = limpiezaFotos.value;
            report.push(`✅ Fotos de empaque borradas: ${borradasVencidas} vencidas, ${borradasAbandonadas} de empaques abandonados${errores ? ` (${errores} pedido(s) con error, se reintenta mañana)` : ''}.`);
        } else {
            report.push(`❌ Error en limpieza de fotos de empaque: ${limpiezaFotos.reason}`);
        }

        // 7-9. Tareas del personal, recordatorios de cobro a clientes del portal y resumen de operación (los avisos los envía cada servicio)
        if (tareasRecordadas.status === 'fulfilled') report.push(`✅ Tareas: ${tareasRecordadas.value.tareas} recordada(s) a ${tareasRecordadas.value.personas} persona(s), ${tareasRecordadas.value.vencidas} vencida(s).`);
        else report.push(`❌ Error recordando tareas: ${tareasRecordadas.reason}`);
        if (clientesCobro.status === 'fulfilled') report.push(`✅ Clientes del portal avisados de vencimientos: ${clientesCobro.value.avisados}.`);
        else report.push(`❌ Error avisando cobros a clientes: ${clientesCobro.reason}`);
        if (operacion.status === 'fulfilled') report.push(`✅ Operación: ${operacion.value.stockBajo} producto(s) bajo mínimo, ${operacion.value.sinAsignar} pedido(s) sin asignar.`);
        else report.push(`❌ Error en resumen de operación: ${operacion.reason}`);

        console.log('--- CRON 6AM END ---');
        return NextResponse.json({ success: true, report });

    } catch (error) {
        console.error('CRON CRITICAL ERROR:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}