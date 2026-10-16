// Presupuestos NO son un documento fiscal: su "número" es solo P-000001 a partir del id, sin correlativo propio.
export const numeroDe = (id) => `P-${String(id).padStart(6, '0')}`;

// Tarifa con que se armó (solo de referencia: cada renglón guarda su precio en $). precio4/5/1 son las tarifas en Bs del POS.
export const TARIFAS = ['precio6', 'precio7', 'precio4', 'precio5', 'precio1'];
export const ETIQUETA_TARIFA = { precio6: 'Mayor (P6)', precio7: 'Detal (P7)', precio4: 'Detal Bs (P4)', precio5: 'Mayor Bs (P5)', precio1: 'P1 Bs' };
