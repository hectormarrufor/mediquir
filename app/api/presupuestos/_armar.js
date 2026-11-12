import { Cliente } from '@/models';
import { calcularFactura, REGLAS } from '@/app/constants/facturacion';
import { TARIFAS } from './_lib';
import { tasaVigente } from '../_lib/tasaBcv';

// Valida el cuerpo y arma los datos del presupuesto (crear y modificar usan lo mismo). El servidor es la autoridad del cálculo.
// Devuelve { error } o { datos }.
export async function armarPresupuesto(body) {
        const renglonesCrudos = Array.isArray(body.renglones) ? body.renglones : [];
        const validos = renglonesCrudos.filter((r) => String(r.nombre || '').trim() && Number(r.precioUnitario) >= 0 && Number.isInteger(Number(r.cantidad)) && Number(r.cantidad) >= 1);
        if (!validos.length) return { error: 'El presupuesto necesita al menos un renglón válido' };
        // El cliente es opcional: un presupuesto rápido puede salir sin cliente (se imprime con las líneas en blanco)

        // La tasa es la de la base de datos (la que trae el cron de las 6 a. m.), igual que en las ventas: no se confía en la del navegador
        let tasaCambio;
        try { tasaCambio = await tasaVigente(); } catch { return { error: 'No hay una tasa BCV vigente registrada' }; }
        // Los precios en Bs que armó la pantalla usaron su tasa: si ya no coincide, se pide recargar para no guardar números mezclados
        if (Number(body.tasaCambio) > 0 && Math.abs(Number(body.tasaCambio) - tasaCambio) > 0.005) return { error: `La tasa BCV cambió (ahora ${tasaCambio}). Recarga la página y vuelve a guardar el presupuesto.` };
        const tarifa = TARIFAS.includes(body.tarifa) ? body.tarifa : 'precio6';
        const moneda = body.moneda === 'BS' ? 'BS' : 'USD'; // los precios y totales quedan en esta moneda, tal cual se cotizaron
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
            marca: String(r.marca || '').trim().slice(0, 100) || null,
            cantidad: calc.renglones[i].cantidad,
            precioUnitario: calc.renglones[i].precioUnitario,
            aplicaIva: calc.renglones[i].aplicaIva,
            porcentajeIva: calc.renglones[i].porcentajeIva,
            subtotal: calc.renglones[i].monto,
        }));

    return { datos: {
            clienteId: cliente?.id || null,
            clienteNombre: cliente?.nombre || String(body.clienteNombre || '').trim().slice(0, 255),
            clienteIdentificacion: (cliente?.identificacion ?? body.clienteIdentificacion) || null,
            clienteDireccion: (cliente?.direccion ?? body.clienteDireccion) || null,
            tarifa,
            moneda,
            tasaCambio,
            subtotal: calc.subtotal,
            montoIva: calc.montoIva,
            totalFinal: calc.totalFinal,
            validoDias,
            renglones,
            notas: String(body.notas || '').slice(0, 1000) || null
    } };
}
