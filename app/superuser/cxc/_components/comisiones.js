// Reglas de la hoja de los vendedores a comisión. Vienen del Excel de la administradora (es la fuente de la verdad):
//   · AMARILLO = el cliente ya pagó y la comisión está POR PAGAR (se calcula en vivo con el estado del cobro: `porPagar`)
//   · GRIS     = la comisión ya se le pagó al vendedor
//   · BLANCO   = factura sin cobrar: se debe la factura y la comisión aún no es pagable
// La comisión se paga a medida que el cliente abona: cada abono genera la suya sobre la parte SIN IVA de lo abonado.
// La comisión que trae una factura con abonos es solo la posible: no se suma como deuda («por generar»).
// El porcentaje (2 % a 10 %, de medio en medio) se fija en la FACTURA; al cambiarlo el servidor recalcula sus abonos por pagar.
// Aquí solo hay funciones puras: las usan igual la tabla de escritorio y las tarjetas del teléfono.

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const PCT_MIN = 2;
export const PCT_MAX = 10;
export const PORCENTAJES = Array.from({ length: (PCT_MAX - PCT_MIN) * 2 + 1 }, (_, i) => PCT_MIN + i / 2);
export const opcionesPct = (actual) => {
    const lista = [...PORCENTAJES];
    if (actual !== null && actual !== undefined && actual !== '' && Number.isFinite(Number(actual)) && !lista.includes(Number(actual))) lista.push(Number(actual)); // una comisión vieja fuera de la lista se muestra igual
    return lista.sort((a, b) => a - b).map((n) => ({ value: String(n), label: `${n}%` }));
};
export const CONCEPTOS = [{ value: 'FACTURA', label: 'Factura' }, { value: 'ABONO', label: 'Abono / pago' }, { value: 'NOTA', label: 'Nota de crédito' }];

// Clientes: por el nombre escrito en la hoja (normalizado: «FCIA» = «FARMACIA», sin acentos), que es como los agrupa la administradora;
// si la línea no trae nombre, por el del cliente de su factura en el sistema. (Agrupar por la ficha del sistema separaba al mismo
// cliente en dos cuando unas líneas están enlazadas y otras no.)
export const normCliente = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\bFCIA\b/g, 'FARMACIA').replace(/[^A-Z0-9]+/g, ' ').trim();
export const claveCliente = (l) => `t${normCliente(l.clienteTexto || l.clienteNombre)}`;
export const porCliente = (lineas) => { const m = new Map(); for (const l of lineas) { const k = claveCliente(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); } return m; };
// Lo que debe un cliente: el saldo de cada factura enlazada (una sola vez aunque tenga varias líneas)
export const deudaDe = (lineas) => { const vistas = new Set(); let t = 0; for (const l of lineas) { if (!l.ventaId || vistas.has(l.ventaId)) continue; vistas.add(l.ventaId); t += Number(l.saldoCxc) > 0.005 ? Number(l.saldoCxc) : 0; } return r2(t); };
const sumar = (filas, campo) => r2(filas.reduce((t, x) => t + (Number(x[campo]) || 0), 0));

// Una factura con sus renglones de pago (abonos y notas de crédito)
export const esPago = (l) => l.concepto === 'ABONO' || l.concepto === 'NOTA' || Number(l.montoUsd) < 0;
export const claveDoc = (l) => (l.ventaId ? `v${l.ventaId}` : `d${claveCliente(l)}|${String(l.documentoTexto || '').trim().toUpperCase()}`);
export function agruparFacturas(filas) {
    const m = new Map();
    for (const l of filas) { const k = claveDoc(l); if (!m.has(k)) m.set(k, { k, padre: null, pagos: [], todas: [] }); m.get(k).todas.push(l); }
    for (const d of m.values()) {
        const orden = [...d.todas].sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || a.id - b.id);
        d.padre = orden.find((l) => !esPago(l)) || null;
        d.pagos = orden.filter((l) => l !== d.padre);
    }
    const fechaDe = (d) => String((d.padre || d.pagos[0])?.fecha || '');
    return [...m.values()].sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));
}

// Comisión POR PAGAR (el renglón amarillo del Excel): el cliente ya pagó y al vendedor todavía no se le pagó la comisión.
//   · un ABONO / pago parcial: genera su comisión sobre lo abonado
//   · una factura pagada completa y sin abonos aparte: queda por pagar la comisión completa de esa factura
// Si la factura tiene abonos, su comisión vive en ellos: el renglón de la factura no se pinta ni se suma como deuda.
const cobradaCompleta = (l) => (l.ventaId ? l.pagoVenta === 'Pagado' : /PAGAD|COMPLETO/i.test(l.estatusCliente || ''));
// una nota de crédito no es un cobro del cliente: no vuelve amarillo su renglón
export const porPagar = (l) => l.estatusComision !== 'PAGADA' && (esPago(l) ? l.concepto !== 'NOTA' : !l.tienePagos && cobradaCompleta(l));

// Estado de una línea en palabras (para el color, el ícono y la etiqueta; nunca solo el color)
export function estadoLinea(l) {
    if (l.estatusComision === 'PAGADA') return 'pagada';
    if (porPagar(l)) return 'porpagar';
    if (l.concepto === 'NOTA') return 'nota';
    if (!esPago(l) && l.tieneAbonos) return 'enabonos'; // solo con abonos de verdad (una nota de crédito no genera comisión)
    return 'sincobrar';
}
export const ESTADOS = {
    porpagar: { etiqueta: 'Por pagar', ayuda: 'El cliente ya pagó: esta comisión se le debe al vendedor' },
    pagada: { etiqueta: 'Pagada', ayuda: 'La comisión ya se le pagó al vendedor' },
    sincobrar: { etiqueta: 'Sin cobrar', ayuda: 'El cliente todavía no paga esta factura: la comisión aún no se puede pagar' },
    enabonos: { etiqueta: 'En sus abonos', ayuda: 'Su comisión la generan los abonos (debajo). La de la factura es solo la posible y no se suma como deuda' },
    nota: { etiqueta: 'Nota de crédito', ayuda: 'Una nota de crédito no es un cobro del cliente' },
};
export const FILTROS = [
    { value: 'porpagar', label: 'Por pagar', largo: 'Por pagar (amarillas)' },
    { value: 'pendientes', label: 'Pendientes', largo: 'Comisión pendiente' },
    { value: 'pagadas', label: 'Pagadas', largo: 'Pagadas' },
    { value: 'todas', label: 'Todas', largo: 'Todas' },
];
export const cumpleFiltro = (l, filtro) => filtro === 'todas' || (filtro === 'porpagar' ? porPagar(l) : filtro === 'pendientes' ? l.estatusComision !== 'PAGADA' : l.estatusComision === 'PAGADA');

export function totales(filas) {
    // comisión POR GENERAR: la que dejarán las facturas aún sin cobrar del todo (lo que ya generaron sus abonos no se cuenta dos veces)
    let futura = 0;
    for (const d of agruparFacturas(filas)) {
        const pa = d.padre;
        if (!pa || pa.estatusComision === 'PAGADA' || porPagar(pa)) continue;
        futura += Math.max(0, (Number(pa.comisionUsd) || 0) - d.pagos.reduce((t, x) => t + (Number(x.comisionUsd) || 0), 0));
    }
    return {
        monto: sumar(filas, 'montoUsd'), // la columna tal cual (las facturas suman, los abonos y notas de crédito restan)
        abonos: r2(filas.filter((x) => esPago(x) && x.concepto !== 'NOTA').reduce((t, x) => t + Math.abs(Number(x.montoUsd) || 0), 0)), // lo abonado, en positivo
        facturas: sumar(filas.filter((x) => x.concepto === 'FACTURA' && !esPago(x)), 'montoUsd'), // total de las facturas, con IVA, tal como se facturaron
        base: sumar(filas, 'baseUsd'), // SIN IVA: sobre esto se calcula la comisión
        comision: sumar(filas, 'comisionUsd'),
        pendiente: sumar(filas.filter((x) => x.estatusComision !== 'PAGADA'), 'comisionUsd'),
        porPagar: sumar(filas.filter((x) => porPagar(x)), 'comisionUsd'), // la que ya se puede pagar: el cliente ya cobró
        futura: r2(futura),
    };
}

// Las líneas de un vendedor listas para mostrar: las facturas con abonos quedan marcadas (`tienePagos`) y un abono sin comisión
// calculada la genera sobre la parte sin IVA de lo abonado (proporción de su factura) con el % de su factura.
export function prepararLineas(todas, porcentajeVendedor) {
    const grupos = agruparFacturas(todas);
    const conPagos = new Set();
    const conAbonos = new Set(); // para la etiqueta «En sus abonos» (no cambia qué se pinta de amarillo)
    const calculada = new Map();
    for (const d of grupos) {
        const pa = d.padre;
        if (pa && d.pagos.length) conPagos.add(pa.id);
        if (pa && d.pagos.some((x) => x.concepto !== 'NOTA')) conAbonos.add(pa.id);
        const razon = pa && Number(pa.montoUsd) > 0 && pa.baseUsd !== null ? Math.min(1, Number(pa.baseUsd) / Number(pa.montoUsd)) : 1;
        for (const x of d.pagos) {
            if (x.concepto !== 'ABONO' || x.comisionUsd !== null) continue;
            const base = x.baseUsd !== null ? Number(x.baseUsd) : r2(Math.abs(Number(x.montoUsd) || 0) * razon);
            const pct = pa && pa.porcentaje !== null && pa.porcentaje !== undefined ? Number(pa.porcentaje) : Number(porcentajeVendedor) || 0; // el % es el de la factura
            calculada.set(x.id, { baseUsd: base, comisionUsd: r2((base * pct) / 100), calculada: true });
        }
    }
    return todas.map((l) => ({ ...l, ...(calculada.get(l.id) || {}), ...(conPagos.has(l.id) ? { tienePagos: true } : {}), ...(conAbonos.has(l.id) ? { tieneAbonos: true } : {}) }));
}

const sinAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Con el filtro (y la búsqueda) se ven las facturas que tengan algún renglón que lo cumpla, completas (la factura y todos sus pagos)
export function filtrarLineas(lineas, filtro, q = '') {
    const claves = new Set(lineas.filter((l) => cumpleFiltro(l, filtro)).map(claveDoc));
    if (q) {
        const coinciden = new Set(lineas.filter((l) => [l.clienteNombre, l.clienteTexto, l.documentoTexto, l.numeroVenta, l.observacion, l.estatusCliente].some((x) => sinAcentos(x).includes(q))).map(claveDoc));
        for (const k of [...claves]) if (!coinciden.has(k)) claves.delete(k);
    }
    return lineas.filter((l) => claves.has(claveDoc(l)));
}

// Cuántas facturas (o pagos sueltos) hay en cada filtro: se muestra junto a cada opción
export function contarPorFiltro(lineas) {
    const cuenta = {};
    for (const f of FILTROS) cuenta[f.value] = new Set(lineas.filter((l) => cumpleFiltro(l, f.value)).map(claveDoc)).size;
    return cuenta;
}

// Líneas agrupadas por cliente, con lo que debe cada uno (sobre TODAS sus líneas, no solo las que deja ver el filtro)
export function agruparPorCliente(lineas, todasPorCliente) {
    const m = new Map();
    for (const l of lineas) {
        const k = claveCliente(l);
        // sin ninguna factura enlazada no se sabe lo que debe (se lleva a mano): deuda null, no «$0.00»
        if (!m.has(k)) { const suyas = todasPorCliente.get(k) || []; m.set(k, { k, nombre: '', filas: [], deuda: suyas.some((x) => x.ventaId) ? deudaDe(suyas) : null, t: null, items: [] }); }
        m.get(k).filas.push(l);
    }
    for (const g of m.values()) {
        // el nombre del sistema si alguna factura está enlazada; si no, como está escrito en la hoja
        g.nombre = g.filas.find((l) => l.clienteNombre)?.clienteNombre || g.filas.find((l) => l.clienteTexto)?.clienteTexto || 'Sin cliente';
        g.t = totales(g.filas);
        g.items = agruparFacturas(g.filas);
        g.facturas = g.items.filter((d) => d.padre).length;
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}
