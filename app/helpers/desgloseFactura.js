// Desglose de una factura, en la moneda del documento: subtotal, exento (renglones sin IVA), base gravable, IVA, flete y total.
// El exento solo existe en documentos con IVA: son los renglones que no aportaron a la base imponible (aplicaIva = false).
const num = (x) => Number(x) || 0;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function desgloseFactura(v) {
    const subtotal = num(v?.subtotal);
    const iva = num(v?.montoIva);
    const exento = iva > 0 ? r2((v?.detalles || []).filter((d) => d.aplicaIva === false).reduce((t, d) => t + num(d.subtotal), 0)) : 0;
    return { subtotal, exento, gravable: r2(subtotal - exento), iva, flete: num(v?.costoFlete), total: num(v?.totalFinal), conIva: iva > 0 };
}
