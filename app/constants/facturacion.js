// Cálculo de facturas y pedidos. Lo usan por igual el servidor (que es la AUTORIDAD: guarda lo que calcula
// él, nunca lo que manda el navegador) y las pantallas (POS, checkout, portal B2B), para que lo que ves
// al vender sea exactamente lo que queda guardado.
//
// TODA la aritmética es entera (BigInt sobre valores escalados): así 5 x 0,003 no se convierte en
// 0,014999999 por coma flotante y los redondeos son siempre los mismos.
//
// ============================== REGLAS DE REDONDEO (ajustables aquí) ==============================
//  · El precio unitario se guarda y se imprime con hasta 3 decimales (no se redondea a centavos).
//  · Cada RENGLÓN = precio unitario x cantidad, redondeado a 2 decimales (mitad hacia arriba).
//  · Subtotal = suma de los renglones ya redondeados (así la factura "cuadra" línea por línea).
//  · IVA = alícuota aplicada sobre la BASE IMPONIBLE total (suma de renglones gravados), redondeado a
//    2 decimales una sola vez por alícuota. No se calcula renglón por renglón.
//  · Total = subtotal + IVA + flete, todos a 2 decimales.
//  · Las cantidades son SIEMPRE enteras (no se vende a granel).
//
//  Esta es la práctica habitual de facturación en Venezuela, pero la norma fiscal aplicable debe
//  confirmarla el contador: si pide otro criterio, se cambia SOLO en este archivo.
// ==================================================================================================

export const REGLAS = Object.freeze({
    alicuotaGeneral: 16,   // % de IVA
    decimalesPrecio: 3,    // precio unitario
    decimalesMonto: 2,     // renglones, subtotal, IVA y total
});

const D_PRECIO = REGLAS.decimalesPrecio;
const D_MONTO = REGLAS.decimalesMonto;
const POT = (n) => 10n ** BigInt(n);

// Número -> entero escalado (valor x 10^decimales), redondeando la mitad hacia arriba
function aEscala(valor, decimales) {
    const n = Number(valor);
    if (!Number.isFinite(n)) throw new Error(`Monto inválido: ${valor}`);
    const negativo = n < 0;
    const [entera, fraccion] = Math.abs(n).toFixed(decimales + 6).split('.'); // dígitos de sobra: absorben el ruido binario
    let escalado = BigInt(entera + fraccion.slice(0, decimales));
    if (fraccion[decimales] >= '5') escalado += 1n;
    return negativo ? -escalado : escalado;
}

// División entera con redondeo de la mitad hacia arriba (para positivos)
function dividirRedondeando(numerador, denominador) {
    return (numerador * 2n + denominador) / (denominador * 2n);
}

const aNumero = (escalado, decimales) => Number(escalado) / 10 ** decimales;

export function validarCantidad(cantidad) {
    const n = Number(cantidad);
    if (!Number.isInteger(n) || n < 1) throw new Error(`La cantidad debe ser un número entero mayor a 0 (recibido: ${cantidad})`);
    return n;
}

// Redondea un precio unitario a los decimales con que se guarda y se imprime (3)
export const precioUnitario = (precio) => aNumero(aEscala(precio, D_PRECIO), D_PRECIO);

// Monto de UN renglón: precio unitario (3 dec) x cantidad, redondeado a 2 decimales
export function montoRenglon(precio, cantidad) {
    const milesimas = aEscala(precio, D_PRECIO) * BigInt(validarCantidad(cantidad));
    return aNumero(dividirRedondeando(milesimas, POT(D_PRECIO - D_MONTO)), D_MONTO);
}

// renglones: [{ precioUnitario, cantidad, aplicaIva, porcentajeIva? }]
//   aplicaIva=false -> exento; porcentajeIva por defecto = alícuota general.
// Devuelve todo ya redondeado según las reglas, listo para guardar.
export function calcularFactura({ renglones, costoFlete = 0 }) {
    if (!Array.isArray(renglones) || renglones.length === 0) throw new Error('La factura no tiene renglones');

    let subtotal = 0n;
    let exento = 0n;
    const basesPorAlicuota = new Map(); // alícuota (puntos base) -> base imponible (centavos)

    const lineas = renglones.map((r) => {
        const cantidad = validarCantidad(r.cantidad);
        const unitario = aEscala(r.precioUnitario, D_PRECIO);
        const monto = dividirRedondeando(unitario * BigInt(cantidad), POT(D_PRECIO - D_MONTO));
        const alicuota = r.aplicaIva ? Number(r.porcentajeIva ?? REGLAS.alicuotaGeneral) : 0;

        subtotal += monto;
        if (alicuota > 0) {
            const clave = BigInt(Math.round(alicuota * 100));
            basesPorAlicuota.set(clave, (basesPorAlicuota.get(clave) || 0n) + monto);
        } else {
            exento += monto;
        }
        return {
            precioUnitario: aNumero(unitario, D_PRECIO),
            cantidad,
            monto: aNumero(monto, D_MONTO),
            aplicaIva: alicuota > 0,
            porcentajeIva: alicuota,
        };
    });

    let iva = 0n;
    const ivaDetalle = [...basesPorAlicuota.entries()].map(([puntosBase, base]) => {
        const montoIva = dividirRedondeando(base * puntosBase, 10000n);
        iva += montoIva;
        return { alicuota: Number(puntosBase) / 100, base: aNumero(base, D_MONTO), iva: aNumero(montoIva, D_MONTO) };
    });

    const flete = aEscala(costoFlete || 0, D_MONTO);
    const base = subtotal - exento;
    return {
        renglones: lineas,
        subtotal: aNumero(subtotal, D_MONTO),
        exento: aNumero(exento, D_MONTO),
        baseImponible: aNumero(base, D_MONTO),
        montoIva: aNumero(iva, D_MONTO),
        ivaDetalle,
        flete: aNumero(flete, D_MONTO),
        totalFinal: aNumero(subtotal + iva + flete, D_MONTO),
    };
}

// Dólares -> bolívares a la tasa BCV (tasa con 2 decimales), redondeado a 2 decimales.
// Los USD se toman con 3 decimales para no perder el precio unitario (p. ej. $0,003).
export function aBolivares(usd, tasa) {
    const milesimas = aEscala(usd, D_PRECIO);
    return aNumero(dividirRedondeando(milesimas * aEscala(tasa, 2), POT(D_PRECIO + 2 - D_MONTO)), D_MONTO);
}

// Precio unitario en bolívares (se muestra con 2 decimales)
export const precioEnBolivares = (precioUsd, tasa) => aBolivares(precioUsd, tasa);

// Bolívares -> dólares a la tasa BCV
export function aDolares(bs, tasa) {
    const tasaEscalada = aEscala(tasa, 2);
    if (tasaEscalada <= 0n) throw new Error('Tasa BCV inválida');
    return aNumero(dividirRedondeando(aEscala(bs, D_MONTO) * 100n, tasaEscalada), D_MONTO);
}

// Alícuota que aplica a un producto: su porcentaje propio, o 0 si es exento
export const alicuotaDe = (producto) => Number(producto?.porcentajeIva ?? REGLAS.alicuotaGeneral) || 0;

// Precio de venta al público (USD, 3 decimales) de la tienda web: Precio 7 (o costo x 1,5 si no tiene) menos el
// descuento del producto. Lo usan la landing, el portal B2B y el servidor, para que todos vean el mismo número.
export function precioVentaWeb(producto) {
    const base = Number(producto?.precio7) > 0 ? Number(producto.precio7) : Number(producto?.costoUsd) * 1.5;
    const descuento = Number(producto?.porcentajeDescuento) || 0;
    return precioUnitario(descuento > 0 ? base - base * (descuento / 100) : base);
}

// Precio B2B (mayor): Precio 6; si un producto no lo tiene, cae al precio de venta web. Sin descuento de landing.
export function precioMayor(producto) {
    return Number(producto?.precio6) > 0 ? precioUnitario(producto.precio6) : precioVentaWeb({ ...producto, porcentajeDescuento: 0 });
}

// Tarifa de precios de un cliente con usuario (portal B2B), configurada por administración en su perfil:
//   precio6 = mayor (por defecto) · precio7 = detal, sin el descuento de la landing
export const TARIFAS_CLIENTE = ['precio6', 'precio7'];
export function precioParaCliente(producto, tarifa = 'precio6') {
    return tarifa === 'precio7' ? precioVentaWeb({ ...producto, porcentajeDescuento: 0 }) : precioMayor(producto);
}

// ------------------------------------------------------------------------------------------------
// Tarifas del POS. Las usan el POS (para mostrar) y el servidor (para cobrar a un vendedor), así el
// precio que ve el vendedor es siempre el que el servidor acepta.
//   precio7 = detal (con el descuento del producto) · precio6 = mayor · precio4/5 = las mismas en bolívares
//   precio1 = costo x 1,35 en bolívares (deriva del costo: solo para administración)
// ------------------------------------------------------------------------------------------------
export const TARIFAS_VENDEDOR = ['precio7', 'precio6', 'precio4', 'precio5'];

// Precios base de un producto. Con `sinCosto` nunca se usa el costo para rellenar el Precio 6 (quien vende no debe
// poder deducir el costo de un producto sin Precio 6); en ese caso cae al Precio 7.
export function preciosBase(producto, { sinCosto = false } = {}) {
    const costo = Number(producto?.costoUsd) || 0;
    const p7 = Number(producto?.precio7) > 0 ? Number(producto.precio7) : costo * 1.5;
    const p6 = Number(producto?.precio6) > 0 ? Number(producto.precio6) : (sinCosto ? p7 : costo);
    return { costo, p6, p7, descuento: Number(producto?.porcentajeDescuento) || 0 };
}

export function precioPorTarifa(producto, tarifa, tasa, opciones) {
    const { costo, p6, p7, descuento } = preciosBase(producto, opciones);
    const p7Final = descuento > 0 ? p7 - p7 * (descuento / 100) : p7;
    switch (tarifa) {
        case 'precio6': return { precio: precioUnitario(p6), moneda: 'USD', descuento: 0 };
        case 'precio1': return { precio: aBolivares(costo * 1.35, tasa), moneda: 'BS', descuento: 0 };
        case 'precio4': return { precio: aBolivares(p7Final, tasa), moneda: 'BS', descuento };
        case 'precio5': return { precio: aBolivares(p6, tasa), moneda: 'BS', descuento: 0 };
        default: return { precio: precioUnitario(p7Final), moneda: 'USD', descuento }; // precio7
    }
}
