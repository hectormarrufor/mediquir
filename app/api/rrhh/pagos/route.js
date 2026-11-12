import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '@/models';
import { fechaCaracas } from '@/app/constants/hora';
import { TIPOS_PAGO, FORMAS_PAGO, totalesPago } from '@/app/constants/pagosEmpleados';
import { requerirAdministracion, nombreDe, FECHA } from './_lib';

export const dynamic = 'force-dynamic';

const { PagoEmpleado, Empleado, Puesto } = db;

// Histórico de recibos (solo administración, con filtros).
// ?tipo= ?empleadoId= ?estado= ?desde= ?hasta= (sobre la fecha del recibo)
export async function GET(request) {
    const acceso = await requerirAdministracion();
    if (acceso.error) return acceso.error;
    try {
        const p = new URL(request.url).searchParams;
        const donde = {};
        if (Number(p.get('empleadoId')) > 0) donde.empleadoId = Number(p.get('empleadoId'));
        if (TIPOS_PAGO[p.get('tipo')]) donde.tipo = p.get('tipo');
        if (['PENDIENTE', 'CONFIRMADO', 'ANULADO'].includes(p.get('estado'))) donde.estado = p.get('estado');
        const fecha = {};
        if (FECHA.test(p.get('desde') || '')) fecha[Op.gte] = p.get('desde');
        if (FECHA.test(p.get('hasta') || '')) fecha[Op.lte] = p.get('hasta');
        if (Reflect.ownKeys(fecha).length) donde.fecha = fecha;

        const pagos = await PagoEmpleado.findAll({ where: donde, order: [['fecha', 'DESC'], ['createdAt', 'DESC']], limit: 500 });
        return NextResponse.json(pagos);
    } catch (error) {
        console.error('Pagos a empleados (listar):', error);
        return NextResponse.json({ error: 'No se pudieron cargar los recibos' }, { status: 500 });
    }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Crea un recibo (solo administración). Se imprime, el empleado lo firma en papel y se archiva.
// { tipo, empleadoId, fecha, periodoDesde, periodoHasta, dias, conceptos: [{ concepto, asignacion, deduccion }], formaPago, referencia, conceptoTexto }
export async function POST(request) {
    const acceso = await requerirAdministracion();
    if (acceso.error) return acceso.error;
    try {
        const b = await request.json();
        const tipo = String(b.tipo || '');
        const cfg = TIPOS_PAGO[tipo];
        if (!cfg) return NextResponse.json({ error: 'Tipo de recibo no válido' }, { status: 400 });

        const empleado = await Empleado.findByPk(Number(b.empleadoId), { include: [{ model: Puesto, as: 'puestos', attributes: ['nombre'] }] });
        if (!empleado) return NextResponse.json({ error: 'Elige al empleado' }, { status: 400 });

        const fecha = FECHA.test(b.fecha || '') ? b.fecha : fechaCaracas();
        let periodoDesde = null, periodoHasta = null, dias = null;
        if (cfg.porDias) {
            if (!FECHA.test(b.periodoDesde || '') || !FECHA.test(b.periodoHasta || '')) return NextResponse.json({ error: 'Escribe las fechas «desde» y «hasta» del período' }, { status: 400 });
            if (b.periodoDesde > b.periodoHasta) return NextResponse.json({ error: 'La fecha «desde» no puede ser posterior a «hasta»' }, { status: 400 });
            periodoDesde = b.periodoDesde; periodoHasta = b.periodoHasta;
            dias = Number.isInteger(Number(b.dias)) && Number(b.dias) > 0 ? Number(b.dias) : null;
            if (!dias) return NextResponse.json({ error: 'Escribe los días trabajados' }, { status: 400 });
        } else if (FECHA.test(b.periodoDesde || '') && FECHA.test(b.periodoHasta || '')) {
            periodoDesde = b.periodoDesde; periodoHasta = b.periodoHasta;
        }

        // Quincena: una sola línea con el monto; beneficios: las líneas que escriba administración (montos editables)
        let conceptos = (Array.isArray(b.conceptos) ? b.conceptos : [])
            .map((c) => ({ concepto: String(c?.concepto || '').trim().slice(0, 120), asignacion: r2(Math.max(0, Number(c?.asignacion) || 0)), deduccion: r2(Math.max(0, Number(c?.deduccion) || 0)) }))
            .filter((c) => c.concepto && (c.asignacion > 0 || c.deduccion > 0));
        const t = totalesPago(conceptos);
        if (!conceptos.length || !(t.totalCobrar > 0)) return NextResponse.json({ error: 'El monto a cobrar debe ser mayor a 0' }, { status: 400 });

        let formaPago = null, referencia = null, conceptoTexto = null;
        if (tipo === 'QUINCENA') {
            formaPago = Object.keys(FORMAS_PAGO).includes(b.formaPago) ? b.formaPago : null;
            if (!formaPago) return NextResponse.json({ error: 'Elige cómo se pagó (efectivo, cheque o transferencia)' }, { status: 400 });
            referencia = String(b.referencia || '').trim().slice(0, 100) || null;
            conceptoTexto = String(b.conceptoTexto || conceptos[0].concepto).trim().slice(0, 250);
            conceptos = [{ concepto: conceptoTexto, asignacion: t.totalCobrar, deduccion: 0 }];
        }

        const cargo = (empleado.puestos || []).map((x) => x.nombre).join(' / ').slice(0, 120) || null;
        const pago = await PagoEmpleado.create({
            tipo, empleadoId: empleado.id, empleadoNombre: `${empleado.nombre} ${empleado.apellido}`.trim().slice(0, 160), cedula: String(empleado.cedula).slice(0, 20),
            cargo, fechaIngreso: empleado.fechaIngreso || null, fecha, periodoDesde, periodoHasta, dias, conceptos,
            ...totalesPago(conceptos), formaPago, referencia, conceptoTexto, creadoPorId: acceso.usuarioId, creadoPorNombre: nombreDe(acceso.sesion),
        });

        return NextResponse.json({ pago }, { status: 201 });
    } catch (error) {
        console.error('Pagos a empleados (crear):', error);
        return NextResponse.json({ error: 'No se pudo guardar el recibo' }, { status: 500 });
    }
}
