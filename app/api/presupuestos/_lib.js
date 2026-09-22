// Presupuestos NO son un documento fiscal: su "número" es solo P-000001 a partir del id, sin correlativo propio.
export const numeroDe = (id) => `P-${String(id).padStart(6, '0')}`;
