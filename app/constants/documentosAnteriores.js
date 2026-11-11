// Una factura puede salir de varias notas de entrega, y una nota con muchos renglones puede repartirse en varias facturas.
// `Ventas.numeroDocumentoAnterior` guarda los números de origen separados por coma ("NE-06610, NE-06614"); con uno solo queda igual que antes.
// Se leen y se escriben con estas funciones, iguales en el servidor y en la pantalla.
export const numerosAnteriores = (texto) => String(texto ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const unirAnteriores = (numeros) => [...new Set((numeros || []).map((n) => String(n || '').trim()).filter(Boolean))].join(', ');
