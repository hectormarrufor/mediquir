// Presentaciones de un producto (unidad, caja, bulto) y cómo se verifican al empacar.
// Módulo PURO (sin base de datos): lo usan el portal B2B, la API y el wizard de empaque, para que todos hablen igual.
//
// Regla de fondo: el stock, el costo y el precio son SIEMPRE por unidad base y `VentaDetalle.cantidad` está SIEMPRE en unidades base.
//   · Unidad base: la unidad, el par o el paquete (campo `presentacion` del producto). La caja NO es una presentación: es un dato aparte.
//   · Caja  = `unidadesPorCaja` unidades base.
//   · Bulto = `unidadesPorBulto` unidades base (que ya incluye las cajas: cajas por bulto × unidades por caja).
// Cuando el cliente pide "2 cajas", el pedido guarda cantidad = 2 × unidades por caja, y además la presentación pedida (2 cajas),
// para que el empacador reciba exactamente lo que se pidió.

export const NIVELES = ['BULTO', 'CAJA', 'UNIDAD']; // de mayor a menor
const ORDEN = { BULTO: 3, CAJA: 2, UNIDAD: 1 };

const BASE = {
    unidad: { etiqueta: 'Unidad', singular: 'unidad', plural: 'unidades', corto: 'und' },
    caja: { etiqueta: 'Unidad', singular: 'unidad', plural: 'unidades', corto: 'und' }, // valor antiguo: ya no se usa
    par: { etiqueta: 'Par', singular: 'par', plural: 'pares', corto: 'pares' },
    paqx2: { etiqueta: 'Paquete x2', singular: 'paquete x2', plural: 'paquetes x2', corto: 'paq x2' },
    paqx4: { etiqueta: 'Paquete x4', singular: 'paquete x4', plural: 'paquetes x4', corto: 'paq x4' },
    cx100: { etiqueta: 'Caja x100', singular: 'caja x100', plural: 'cajas x100', corto: 'cx100' },
    cx200: { etiqueta: 'Caja x200', singular: 'caja x200', plural: 'cajas x200', corto: 'cx200' },
    // Manguera y similares: la unidad es el METRO (enteros) y el ROLLO completo es el nivel de "caja" (unidadesPorCaja = metros del rollo)
    metro: { etiqueta: 'Metro', singular: 'metro', plural: 'metros', corto: 'm', nivelCaja: { etiqueta: 'Rollo', singular: 'rollo', plural: 'rollos' } },
    rollo: { etiqueta: 'Rollo', singular: 'rollo', plural: 'rollos', corto: 'rollos' },
};

const entero = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// Presentaciones en las que se puede pedir el producto, según lo que tenga llenado su ficha
export function presentacionesDe(producto) {
    const base = BASE[producto?.presentacion] || BASE.unidad;
    const porCaja = entero(producto?.unidadesPorCaja);
    const porBulto = entero(producto?.unidadesPorBulto);
    // `corto` dice de qué son las unidades de una caja o un bulto ("Caja x50 pares"): así no se confunde con unidades sueltas
    const lista = [{ clave: 'UNIDAD', etiqueta: base.etiqueta, singular: base.singular, plural: base.plural, corto: base.corto, unidades: 1 }];
    const nc = base.nivelCaja || { etiqueta: 'Caja', singular: 'caja', plural: 'cajas' };
    if (porCaja && porCaja > 1) lista.push({ clave: 'CAJA', etiqueta: `${nc.etiqueta} x${porCaja} ${base.corto}`, singular: nc.singular, plural: nc.plural, corto: base.corto, unidades: porCaja });
    if (porBulto && porBulto > 1 && porBulto > (porCaja || 1)) lista.push({ clave: 'BULTO', etiqueta: `Bulto x${porBulto} ${base.corto}`, singular: 'bulto', plural: 'bultos', corto: base.corto, unidades: porBulto });
    return lista;
}

export const presentacionDe = (producto, clave) => presentacionesDe(producto).find((p) => p.clave === clave) || null;

// Etiqueta de un nivel para este producto ("caja", "par"...)
const nombreNivel = (producto, nivel, cantidad) => {
    const p = presentacionDe(producto, nivel) || presentacionesDe(producto)[0];
    return cantidad === 1 ? p.singular : p.plural;
};

// Cuántos bultos, cajas y unidades sueltas hacen `unidades` (primero bultos, luego cajas cerradas y el resto sueltas)
export function desglose(unidades, producto) {
    let resto = Math.max(0, Math.floor(Number(unidades) || 0));
    const r = { BULTO: 0, CAJA: 0, UNIDAD: 0 };
    const bulto = presentacionDe(producto, 'BULTO');
    const caja = presentacionDe(producto, 'CAJA');
    if (bulto) { r.BULTO = Math.floor(resto / bulto.unidades); resto -= r.BULTO * bulto.unidades; }
    if (caja) { r.CAJA = Math.floor(resto / caja.unidades); resto -= r.CAJA * caja.unidades; }
    r.UNIDAD = resto;
    return r;
}

/**
 * Lo que hay que ENTREGAR por un renglón del pedido, como componentes [{ nivel, cantidad, unidadesCada, nombre }]:
 *  · Si el pedido dice la presentación ("2 cajas") se entrega exactamente eso.
 *  · Si no (punto de venta, pedidos anteriores) se arma con la regla: bultos, luego cajas cerradas y el resto sueltas.
 * `detalle`: { cantidad (unidades), presentacionPedida, cantidadPresentacion, unidadesPorPresentacion }
 */
export function entregaDe(detalle, producto) {
    const unidades = Math.floor(Number(detalle?.cantidad) || 0);
    const clave = detalle?.presentacionPedida;
    const cantidadPres = Number(detalle?.cantidadPresentacion);
    const porPres = Number(detalle?.unidadesPorPresentacion);

    let conteo;
    let factores = {};
    if (['UNIDAD', 'CAJA', 'BULTO'].includes(clave) && cantidadPres > 0 && porPres > 0) {
        conteo = { BULTO: 0, CAJA: 0, UNIDAD: 0, [clave]: cantidadPres };
        factores = { [clave]: porPres };
    } else {
        conteo = desglose(unidades, producto);
    }
    return NIVELES
        .filter((n) => conteo[n] > 0)
        .map((n) => ({
            nivel: n, cantidad: conteo[n],
            unidadesCada: factores[n] || (n === 'UNIDAD' ? 1 : presentacionDe(producto, n)?.unidades || 1),
            unidadCorta: (BASE[producto?.presentacion] || BASE.unidad).corto,
            nombre: nombreNivel(producto, n, conteo[n]),
        }));
}

// "2 cajas + 50 unidades sueltas"
export function textoEntrega(entrega) {
    if (!entrega.length) return '';
    return entrega.map((e) => `${e.cantidad} ${e.nombre}${e.nivel === 'UNIDAD' && entrega.length > 1 ? ' sueltas' : ''}`).join(' + ');
}

export const unidadesDeEntrega = (entrega) => entrega.reduce((a, e) => a + e.cantidad * e.unidadesCada, 0);

// ------------------------------------------------------------------ códigos de barras por nivel
export const normalizarCodigo = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();

// El código escaneado o tecleado corresponde al esperado: completo, sus últimos dígitos (mínimo 4) o,
// si vino de la cámara, un código que contenga el esperado
export function codigoCoincide(esperado, ingresado, escaneado = false) {
    const e = normalizarCodigo(esperado);
    const d = normalizarCodigo(ingresado);
    if (!e || !d) return false;
    if (d === e) return true;
    if (escaneado && d.includes(e)) return true;
    return d.length >= 4 && d.length < e.length && e.endsWith(d);
}

// Códigos de barras registrados del producto, por nivel (solo los que existen)
export function codigosDe(producto) {
    const r = {};
    if (producto?.codigoBarras) r.UNIDAD = producto.codigoBarras;
    if (producto?.codigoBarrasCaja) r.CAJA = producto.codigoBarrasCaja;
    if (producto?.codigoBarrasBulto) r.BULTO = producto.codigoBarrasBulto;
    return r;
}

// El nivel más alto que se va a entregar: es el que manda para el código
export const nivelMayor = (entrega) => entrega.reduce((m, e) => (ORDEN[e.nivel] > ORDEN[m] ? e.nivel : m), 'UNIDAD');

/**
 * Qué códigos sirven para comprobar este renglón. Devuelve [{ nivel, codigo }]:
 *  · se entregan BULTOS  -> solo el código del bulto
 *  · se entregan CAJAS   -> solo el código de la caja (el de una unidad NO sirve: es justo la confusión que se quiere evitar)
 *  · solo UNIDADES sueltas -> el de la unidad, o el de la caja (o bulto) de donde se sacaron
 * Si el nivel exigido no tiene código registrado, la lista queda vacía (y el renglón se comprueba por la marca).
 */
export function codigosAceptados(entrega, producto) {
    const codigos = codigosDe(producto);
    const mayor = nivelMayor(entrega);
    return codigos[mayor] ? [{ nivel: mayor, codigo: codigos[mayor] }] : [];
}

// Nivel del código que coincide con lo escrito o escaneado (null si ninguno)
export function nivelDelCodigo(aceptados, ingresado, escaneado = false) {
    return aceptados.find((a) => codigoCoincide(a.codigo, ingresado, escaneado))?.nivel || null;
}

// Nombre corto del nivel para mensajes ("de la CAJA")
export const NOMBRE_NIVEL = { BULTO: 'del BULTO', CAJA: 'de la CAJA', UNIDAD: 'de la UNIDAD' };
