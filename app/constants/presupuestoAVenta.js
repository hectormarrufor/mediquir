// Pasar un presupuesto a factura o a nota de entrega: NO crea nada en el servidor, solo copia el cliente y los renglones (con sus precios y
// cantidades tal cual) al borrador de la pantalla de venta (POS), donde se pueden cambiar renglones y precios y elegir el cliente si el presupuesto
// no tenía. El presupuesto no se toca.
// Una factura admite CONFIG_FISCAL.maxRenglonesFactura líneas (una descripción larga ocupa 2): si el presupuesto trae más, se reparte en varias
// facturas; la 1.ª queda en el carrito y las demás en `cola` (el POS las va cargando conforme se asienta cada una).
import { nombreConMarca } from './nombreConMarca';
import { repartirEnFacturas } from './lineasFactura';
import { aBolivares } from './facturacion';

export const BORRADOR_VENTA = 'mediquir:borrador-venta';

// Tarifa del POS equivalente a la del presupuesto (en su moneda), igual que al modificar un presupuesto
const tarifaDe = (p) => (p.moneda === 'BS'
    ? (['precio4', 'precio5'].includes(p.tarifa) ? p.tarifa : 'precio4')
    : ({ precio4: 'precio7', precio5: 'precio6', precio1: 'precio7' }[p.tarifa] || p.tarifa || 'precio7'));

/** @param {'FACTURA'|'NOTA'} tipo  @returns borrador listo para guardar en localStorage (BORRADOR_VENTA) */
export function armarBorradorVenta(presupuesto, tipo, tasa = 0) {
    // Una factura de un presupuesto en $ se pasa a bolívares a la tasa BCV de hoy, con los precios en $ del presupuesto (ya modificados a mano si fue el caso)
    const aBs = tipo === 'FACTURA' && presupuesto.moneda !== 'BS' && Number(tasa) > 0;
    const enBs = presupuesto.moneda === 'BS' || aBs;
    const conv = (v) => (aBs ? aBolivares(v, tasa) : v);
    let flete = 0;
    const items = [];
    (presupuesto.renglones || []).forEach((r, i) => {
        // El flete del presupuesto es el costo de flete de la venta, no un renglón
        if (!r.productoId && String(r.nombre).trim().toLowerCase() === 'flete' && !r.aplicaIva) { flete += conv(Number(r.subtotal ?? r.precioUnitario) || 0); return; }
        const base = { clave: `pres-${i}`, presentacion: 'UNIDAD', unidadesPorPres: 1, cantidadPres: r.cantidad, cantidad: r.cantidad, precio: conv(Number(r.precioUnitario)), precioManual: true, simbolo: enBs ? 'Bs' : '$', tieneDescuento: false };
        items.push(r.productoId
            ? { ...base, id: r.productoId, nombre: r.nombre, codigo: r.codigo, marcaNombre: r.marca || undefined, porcentajeIva: Number(r.porcentajeIva) || 0, isFicticio: false, afectaInventario: true }
            : { ...base, id: `ficticio-pres-${i}`, nombre: r.nombre, codigo: r.codigo || '1010', aplicaIva: Boolean(r.aplicaIva), isFicticio: true, afectaInventario: false });
    });

    const esFactura = tipo === 'FACTURA';
    const grupos = esFactura ? repartirEnFacturas(items.map((it) => (it.isFicticio ? it.nombre : nombreConMarca(it.nombre, it.marcaNombre)))) : [items.map((_, i) => i)];
    const carritos = grupos.map((g) => g.map((i) => items[i]));
    return {
        tipoVenta: 'MAYOR', // el documento a un cliente (factura o nota de entrega) es una venta al mayor
        form: {
            clienteId: presupuesto.clienteId ? String(presupuesto.clienteId) : null,
            tipoPrecio: aBs ? 'precio4' : tarifaDe(presupuesto), conIva: esFactura, costoFlete: flete > 0 ? flete : '',
        },
        carrito: carritos[0] || [],
        cola: carritos.slice(1),
        origen: { numero: presupuesto.numero, parte: 1, de: carritos.length },
    };
}
