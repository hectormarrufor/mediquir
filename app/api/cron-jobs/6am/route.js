import { NextResponse } from 'next/server';
import {
    syncExchangeRates,
    checkHREvents,
    checkAssetDocs,
    checkCxP, checkCxC
} from './services'; 
import { notificarCabezas } from '@/app/handlers/notificar'; 
// Nota: Si no tienes configurado notificarUsuarioEspecifico en tu handler, puedes usar notificarCabezas para el aviso.

export const dynamic = 'force-dynamic';
export const maxDuration = 60; 

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('--- CRON 6AM START ---');

        // Ejecutar los 7 servicios en paralelo de forma segura
        const [
            finanzas, consumibles, rrhh, activos, 
            nominasAutomaticas, requisiciones, custodiasPendientes,
            cxp, cxc
        ] = await Promise.allSettled([
            syncExchangeRates(),
            checkHREvents(),
            checkAssetDocs(),
            checkCxP(),
            checkCxC(),
        ]);

        const report = [];

        // 3. Finanzas
        if (finanzas.status === 'fulfilled' && finanzas.value.status === 'OK') {
            report.push("✅ Tasas actualizadas.");
        } else {
            report.push(`❌ Error Finanzas: ${finanzas.status === 'fulfilled' ? finanzas.value.msg : finanzas.reason}`);
        }


        // 5. RRHH
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

        // 6. Documentos Activos
        if (activos.status === 'fulfilled' && activos.value.length > 0) {
            const docs = activos.value;
            for (const doc of docs) {
                await notificarCabezas({
                    title: `🚨 Doc. de Activo: ${doc.tipoDoc}`,
                    body: `${doc.nombreActivo}\n${doc.estadoTiempo}`,
                    url: `/superuser/flota/activos/${doc.id}`,
                    tag: `asset-doc-${doc.id}-${doc.tipoDoc}-${Date.now()}`
                });
            }
            report.push(`✅ ${docs.length} alertas de documentos de activos enviadas.`);
        } else if (activos.status === 'rejected') {
            report.push(`❌ Error Documentos Activos: ${activos.reason}`);
        }


        // 🔥 NOTIFICACIONES CUENTAS POR PAGAR (CxP)
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

        // 🔥 NOTIFICACIONES CUENTAS POR COBRAR (CxC)
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

        return NextResponse.json({ success: true, report });

    } catch (error) {
        console.error('CRON CRITICAL ERROR:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

      
