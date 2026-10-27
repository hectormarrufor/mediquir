// Cómo se le paga a un proveedor (compras de contado, pagos de cuentas por pagar). Son los mismos nombres que usa caja.
// Pagar con la tarjeta de Mediquir en el punto del comercio queda como "Punto de Venta".
export const METODOS_PAGO_PROVEEDOR = ['Transferencia', 'Punto de Venta', 'Pago Móvil', 'Efectivo (Bs)', 'Efectivo ($)', 'Zelle'];

const ETIQUETAS = { 'Punto de Venta': 'Tarjeta de la empresa (punto de venta)' };

// Para un Select: { value, label }
export const OPCIONES_PAGO_PROVEEDOR = METODOS_PAGO_PROVEEDOR.map((value) => ({ value, label: ETIQUETAS[value] || value }));
