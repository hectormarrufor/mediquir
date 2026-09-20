// Avisos del pedido para el CLIENTE del portal B2B (cliente con usuario): que esté al tanto de cada paso de su proceso.
// El cliente solo recibe lo dirigido a él (ver getVisibilidadSql): nunca datos internos (costos, márgenes, notas de administración, otros clientes).
// Un fallo al avisar nunca debe deshacer ni ocultar lo que ya se hizo: todo va en try/catch y se registra.
import { notificarCliente } from '@/app/handlers/notificar';

const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

// Cada evento devuelve el texto que ve el cliente. `v` es la venta; `d` datos sueltos del evento.
const EVENTOS = {
    // Empaque firmado
    EMPACADO: (v) => (v.tipoEntrega === 'pickup'
        ? { title: 'Tu pedido está listo para retirar 🛍️', body: `Pedido ${v.numeroDocumento}: ya lo empacamos y verificamos. Puedes pasar a retirarlo en tienda.` }
        : { title: 'Tu pedido fue empacado 📦', body: `Pedido ${v.numeroDocumento}: ya está armado y verificado. Ahora coordinamos el transporte para enviártelo.` }),

    // Ya se consiguió la empresa de transporte o el chofer
    TRANSPORTE: (v) => ({ title: 'Ya conseguimos el transporte 🚚', body: `Pedido ${v.numeroDocumento}: lo llevará ${v.quienRetira}.` }),

    // Salió el pedido
    DESPACHADO: (v) => (v.tipoEntrega === 'pickup'
        ? { title: 'Pedido retirado ✅', body: `Registramos el retiro de tu pedido ${v.numeroDocumento}. ¡Gracias por tu compra!` }
        : { title: 'Tu pedido va en camino 🚚', body: `Pedido ${v.numeroDocumento}: salió con ${v.quienRetira || 'la empresa de transporte'}.` }),

    // Pago o abono aprobado
    PAGO_RECIBIDO: (v, d) => ({
        title: d.liquidada ? 'Pedido pagado por completo ✅' : 'Recibimos tu pago 💵',
        body: d.liquidada
            ? `Pedido ${v.numeroDocumento}: registramos tu pago de ${usd(d.abonoUsd)} y la factura quedó pagada. ¡Gracias!`
            : `Pedido ${v.numeroDocumento}: registramos tu pago de ${usd(d.abonoUsd)}.${d.saldoRestante > 0 ? ` Te quedan ${usd(d.saldoRestante)} por pagar.` : ''}`,
    }),

    // Comprobante de retención de IVA confirmado por administración
    RETENCION_CONFIRMADA: (v, d) => ({
        title: 'Retención de IVA confirmada ✅',
        body: `Pedido ${v.numeroDocumento}: confirmamos tu comprobante de retención${d.comprobante ? ` (${d.comprobante})` : ''}. Ya descontamos ese monto de tu saldo.`,
    }),

    // Nota de crédito o de débito emitida sobre su factura
    NOTA_EMITIDA: (v, d) => ({
        title: d.tipo === 'DEBITO' ? 'Emitimos una nota de débito 🧾' : 'Emitimos una nota de crédito 🧾',
        body: `Sobre tu factura ${v.numeroDocumento} emitimos la ${d.tipo === 'DEBITO' ? 'nota de débito' : 'nota de crédito'} ${d.numero || ''}. Puedes verla en el detalle del pedido.`.replace('  ', ' '),
    }),

    // Se le devolvió dinero por una nota de crédito de una factura ya cobrada
    REINTEGRO: (v, d) => ({ title: 'Te devolvimos un saldo 💸', body: `Pedido ${v.numeroDocumento}: registramos la devolución de ${usd(d.monto)} a tu favor.` }),

    // Recordatorios de cobro (cron diario)
    POR_VENCER: (v, d) => ({ title: 'Tu factura está por vencer ⏰', body: `Pedido ${v.numeroDocumento}: vence ${d.dias === 0 ? 'hoy' : `en ${d.dias} día${d.dias === 1 ? '' : 's'}`}. Saldo por pagar: ${usd(d.saldo)}.` }),
    VENCIDA: (v, d) => ({ title: 'Tienes una factura vencida ⚠️', body: `Pedido ${v.numeroDocumento}: venció hace ${d.dias} día${d.dias === 1 ? '' : 's'}. Saldo por pagar: ${usd(d.saldo)}.` }),
};

/**
 * Avisa al cliente de la venta (si tiene usuario en el portal). No hace nada con clientes de la tienda sin usuario.
 * @param venta   instancia (o fila) con id, clienteId, numeroDocumento, tipoEntrega, quienRetira
 * @param evento  clave de EVENTOS
 * @param datos   datos del evento (montos, comprobante, número de nota...)
 */
export async function avisarCliente(venta, evento, datos = {}) {
    try {
        if (!venta?.clienteId) return;
        // El saldo de una cuenta en bolívares se muestra en dólares (lo que ve el cliente en su portal)
        if (datos.monedaCuenta === 'BS' && Number(datos.tasa) > 0 && datos.saldoRestante != null) datos = { ...datos, saldoRestante: Number(datos.saldoRestante) / Number(datos.tasa) };
        const plantilla = EVENTOS[evento];
        if (!plantilla) return;
        const { title, body } = plantilla(venta, datos);
        await notificarCliente(venta.clienteId, { title, body, url: `/b2b/pedidos/${venta.id}`, tipo: 'Info' });
    } catch (e) {
        console.error(`No se pudo avisar al cliente (${evento}):`, e.message);
    }
}
