import { NextResponse } from 'next/server';
import { Presupuesto, Cliente } from '@/models';
import { requerirStaff } from '../inventario/_lib';
import { calcularFactura, REGLAS } from '@/app/constants/facturacion';
import { numeroDe } from './_lib';

const plano = (p) => ({ ...p.toJSON(), numero: numeroDe(p.id) });

export async function GET(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { searchParams } = new URL(request.url);
        const limite = Math.min(Number(searchParams.get('limite')) || 50, 200);
        const presupuestos = await Presupuesto.findAll({
            include: [{ model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'identificacion'] }],
            order: [['createdAt', 'DESC']],
            limit: limite,
        });
        return NextResponse.json(presupuestos.map(plano));
    } catch (error) {
        console.error('Presupuestos:', error);
        return NextResponse.json({ error: 'No se pudo cargar la lista de presupuestos' }, { status: 500 });
    }
}

export async function POST(request) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const body = await request.json();
        const renglonesCrudos = Array.isArray(body.renglones) ? body.renglones : [];
        const validos = renglonesCrudos.filter((r) => String(r.nombre || '').trim() && Number(r.precioUnitario) >= 0 && Number.isInteger(Number(r.cantidad)) && Number(r.cantidad) >= 1);
        if (!validos.length) return NextResponse.json({ error: 'El presupuesto necesita al menos un renglón válido' }, { status: 400 });
        if (!String(body.clienteNombre || '').trim()) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 });

        const tasaCambio = Number(body.tasaCambio) > 0 ? Number(body.tasaCambio) : 1;
        const tarifa = body.tarifa === 'precio7' ? 'precio7' : 'precio6';
        const validoDias = Number.isInteger(Number(body.validoDias)) && Number(body.validoDias) > 0 ? Number(body.validoDias) : 15;

        // El servidor es la autoridad del cálculo: nunca se guardan los totales que manda el navegador
        const calc = calcularFactura({
            renglones: validos.map((r) => ({ precioUnitario: Number(r.precioUnitario), cantidad: Math.floor(Number(r.cantidad)), aplicaIva: Boolean(r.aplicaIva), porcentajeIva: r.aplicaIva ? (Number(r.porcentajeIva) || REGLAS.alicuotaGeneral) : 0 })),
        });

        let cliente = null;
        if (body.clienteId) {
            cliente = await Cliente.findByPk(Number(body.clienteId), { attributes: ['id', 'nombre', 'identificacion', 'direccion'] });
        }

        const renglones = validos.map((r, i) => ({
            productoId: Number(r.productoId) || null,
            codigo: String(r.codigo || '').slice(0, 40),
            nombre: String(r.nombre).slice(0, 255),
            cantidad: calc.renglones[i].cantidad,
            precioUnitario: calc.renglones[i].precioUnitario,
            aplicaIva: calc.renglones[i].aplicaIva,
            porcentajeIva: calc.renglones[i].porcentajeIva,
            subtotal: calc.renglones[i].monto,
        }));

        const presupuesto = await Presupuesto.create({
            clienteId: cliente?.id || null,
            clienteNombre: cliente?.nombre || String(body.clienteNombre).trim(),
            clienteIdentificacion: (cliente?.identificacion ?? body.clienteIdentificacion) || null,
            clienteDireccion: (cliente?.direccion ?? body.clienteDireccion) || null,
            tarifa,
            tasaCambio,
            subtotal: calc.subtotal,
            montoIva: calc.montoIva,
            totalFinal: calc.totalFinal,
            validoDias,
            renglones,
            notas: String(body.notas || '').slice(0, 1000) || null,
            creadoPorId: Number(acceso.sesion.id) || null,
        });

        return NextResponse.json(plano(presupuesto), { status: 201 });
    } catch (error) {
        console.error('Presupuestos (crear):', error);
        return NextResponse.json({ error: 'No se pudo guardar el presupuesto' }, { status: 500 });
    }
}
