// Producto tal como lo ve el público: sin costos ni datos internos del negocio y con el precio web ya resuelto.
// Es lo mismo que entrega /api/productos al público (la tienda lo usa para precios, carrito y presentaciones).
import { precioVentaWeb } from '@/app/constants/facturacion';

export function productoPublico(instancia) {
    const j = typeof instancia.toJSON === 'function' ? instancia.toJSON() : { ...instancia };
    const {
        costoUsd, precio6, stockMinimo, nroVentas, inventarioAuditado, inventarioAuditadoAt, inventarioAuditadoPorId,
        presentacionesVerificadasAt, presentacionesVerificadasPorId, ...resto
    } = j;
    if (resto.grupoEquivalencia) { const { stockMinimoGlobal, ...grupo } = resto.grupoEquivalencia; resto.grupoEquivalencia = grupo; }
    // Fechas como texto: este objeto viaja del servidor al navegador
    for (const k of ['createdAt', 'updatedAt', 'fichaActualizadaAt']) if (resto[k] instanceof Date) resto[k] = resto[k].toISOString();
    return { ...resto, precio7: precioVentaWeb({ precio7: j.precio7, costoUsd, porcentajeDescuento: 0 }) };
}
