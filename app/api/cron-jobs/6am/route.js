import { NextResponse } from 'next/server';
import {
    syncExchangeRates,
    checkConsumableWarranties,
    checkHREvents,
    checkAssetDocs,
    checkFletesActivosYRegistrarHoras,
    checkRequisicionesPorAprobar,
    checkPendingCustodySignatures // 🔥 IMPORTADO
} from './services'; 
import { notificarCabezas, notificarUsuarioEspecifico } from '@/app/handlers/notificar'; 
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
            nominasAutomaticas, requisiciones, custodiasPendientes
        ] = await Promise.allSettled([
            syncExchangeRates(),
            checkConsumableWarranties(),
            checkHREvents(),
            checkAssetDocs(),
            checkFletesActivosYRegistrarHoras(),
            checkRequisicionesPorAprobar(),
            checkPendingCustodySignatures() // 🔥 EJECUTADO
        ]);

        const report = [];

        // 3. Finanzas
        if (finanzas.status === 'fulfilled' && finanzas.value.status === 'OK') {
            report.push("✅ Tasas actualizadas.");
        } else {
            report.push(`❌ Error Finanzas: ${finanzas.status === 'fulfilled' ? finanzas.value.msg : finanzas.reason}`);
        }

        // 4. Garantías
        if (consumibles.status === 'fulfilled' && consumibles.value.length > 0) {
            const items = consumibles.value;
            await notificarCabezas({
                title: 'Alerta de Garantías',
                body: `Hay ${items.length} consumibles próximos a perder garantía.\nEj: ${items[0].nombre} (${items[0].serial})`,
                url: '/superuser/inventario/garantias',
                tag: 'warranty-check'
            });
            report.push(`✅ ${items.length} garantías detectadas.`);
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

        // 7. Requisiciones Pendientes
        if (requisiciones.status === 'fulfilled' && requisiciones.value.length > 0) {
            const reqs = requisiciones.value;
            for (const req of reqs) {
                await notificarCabezas({
                    title: `📌 Requisición Pendiente`,
                    body: `${req.msg}`,
                    url: `/superuser/requisiciones`,
                    tag: `req-aprob-${req.id}-${Date.now()}`
                });
            }
            report.push(`✅ ${reqs.length} requisiciones pendientes notificadas.`);
        } else if (requisiciones.status === 'rejected') {
            report.push(`❌ Error Requisiciones: ${requisiciones.reason}`);
        }

        // 8. Asistencia Automática
        if (nominasAutomaticas.status === 'fulfilled') {
            const info = nominasAutomaticas.value;
            report.push(`✅ Asistencia Automática: ${info.msg}`);
            if (info.count > 0) {
                await notificarCabezas({
                    title: `👷 Nómina en Ruta Asignada`,
                    body: `Se registraron automáticamente ${info.count} jornadas de 8hrs para el personal en misiones activas.`,
                    url: '/superuser/rrhh',
                    tag: 'nomina-auto'
                });
            }
        } else {
            report.push(`❌ Error Nóminas Auto: ${nominasAutomaticas.reason}`);
        }

        // 🔥 9. PROCESAR ALERTAS DE FIRMA DE CUSTODIA 🔥
        if (custodiasPendientes.status === 'fulfilled' && custodiasPendientes.value.length > 0) {
            const retrasos = custodiasPendientes.value;
            for (const item of retrasos) {
                // Alerta dirigida directamente al Administrador/Usuario que entregó la mercancía
                await notificarUsuarioEspecifico(item.entregadoPorId, {
                    title: `⚠️ Alerta: Firma Excedida`,
                    body: `Han pasado más de 24 horas y ${item.receptorNombre} no ha firmado digitalmente la recepción de materiales de la ${item.requisicionCodigo}.`,
                    url: `/superuser/entregas`,
                    tag: `custodia-delay-${item.id}`,
                    tipo: 'Warning'
                });
            }
            report.push(`✅ ${retrasos.length} alertas de firmas de custodia retrasadas enviadas.`);
        } else if (custodiasPendientes.status === 'rejected') {
            report.push(`❌ Error Custodias Pendientes: ${custodiasPendientes.reason}`);
        }

        return NextResponse.json({ success: true, report });

    } catch (error) {
        console.error('CRON CRITICAL ERROR:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}