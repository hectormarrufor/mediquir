import crypto from 'crypto';
import db from '@/models/index';
import { codigoCoincide, codigosAceptados, entregaDe, normalizarCodigo } from '@/app/constants/presentaciones';

const { Venta, VentaDetalle, Producto, Marca, GrupoEquivalencia, VentaEmpaqueItem, User, Empleado } = db;

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Venta con sus renglones (y lo necesario para mostrarlos), buscada por id o por número de documento
export function buscarVentaParaEmpaque(id, opciones = {}) {
    return Venta.findOne({
        where: UUID_REGEX.test(id) ? { id } : { numeroDocumento: id },
        include: [
            { model: VentaDetalle, as: 'detalles', include: [{
                model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo', 'codigoBarras', 'codigoBarrasCaja', 'codigoBarrasBulto', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto', 'imagen'],
                include: [
                    { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
                    { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'imagen'] },
                ],
            }] },
            { model: User, as: 'empacador', attributes: ['id', 'user'], include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'apellido'] }] },
        ],
        ...opciones,
    });
}

// Las imágenes se guardan como nombre de archivo ("0899_1786496446230.jpg"): el navegador necesita la URL completa del Blob
const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL || '';
const aUrl = (ruta) => (!ruta ? null : (/^(https?:)?\/\//.test(ruta) || ruta.startsWith('data:')) ? ruta : `${BLOB}/${ruta}`);

// Foto que guía al empacador: la del producto; si no tiene, la de su grupo de equivalencia; en última instancia la de la marca
export const imagenDe = (producto) => aUrl(producto?.imagen || producto?.grupoEquivalencia?.imagen || producto?.marca?.imagen);

export const nombreDe = (detalle) => (detalle.isFicticio ? detalle.nombreFicticio : detalle.producto?.nombre) || 'Producto';

// La lógica de códigos y presentaciones vive en el módulo compartido (también la usan el portal y el wizard)
export { codigoCoincide, normalizarCodigo };

// Lo que hay que entregar por el renglón: [{ nivel, cantidad, unidadesCada, nombre }] ("2 cajas" o "50 unidades sueltas")
export const entregaDeDetalle = (detalle) => (detalle.isFicticio || !detalle.producto ? [] : entregaDe(detalle, detalle.producto));

// Códigos que sirven para este renglón según el nivel que se entrega: [{ nivel, codigo }] (vacío = el nivel exigido no tiene código)
export const codigosDelRenglon = (detalle) => {
    const entrega = entregaDeDetalle(detalle);
    return entrega.length ? codigosAceptados(entrega, detalle.producto) : [];
};

// ¿Cómo se comprueba este renglón?
//   codigo: el producto trae el código de barras del NIVEL que se entrega (unidad, caja o bulto): se escanea o se escribe
//   marca : ese nivel no tiene código (p. ej. una hojilla de bisturí): se elige la marca que dice el empaque
//   manual: ni código de barras ni marca registrada
// OJO: el código interno (`codigo`, ej. 0483) NO sirve para esto: el empacador no lo ve en el producto físico.
export function modoVerificacion(detalle) {
    if (detalle.isFicticio || !detalle.producto) return 'manual';
    if (codigosDelRenglon(detalle).length) return 'codigo';
    if (detalle.producto.marca?.nombre) return 'marca';
    return 'manual';
}

// Cuatro marcas para elegir (la correcta y tres distintas), en un orden estable por renglón para que no cambie al recargar
export async function opcionesDeMarca(detalle) {
    const correcta = detalle.producto.marca.nombre;
    const otras = await Marca.findAll({ attributes: ['nombre'], limit: 40 });
    const nombres = [...new Set(otras.map((m) => m.nombre).filter((n) => n && n !== correcta))];
    const orden = (n) => crypto.createHash('md5').update(`${detalle.id}:${n}`).digest('hex');
    const distractores = nombres.sort((a, b) => orden(a).localeCompare(orden(b))).slice(0, 3);
    return [correcta, ...distractores].sort((a, b) => orden(a).localeCompare(orden(b)));
}

// Lo que falta para poder firmar el empaque (vacío = todo comprobado)
export async function faltantesDeEmpaque(venta, transaction) {
    const items = await VentaEmpaqueItem.findAll({ where: { ventaId: venta.id }, transaction });
    const porDetalle = new Map(items.map((i) => [i.ventaDetalleId, i]));
    const faltantes = [];
    const sinVerificar = venta.detalles.filter((d) => porDetalle.get(d.id)?.estado !== 'OK');
    if (sinVerificar.length) faltantes.push(`Faltan ${sinVerificar.length} producto(s) por verificar en el empaque paso a paso`);
    if (!venta.fotoCajaAbiertaUrl) faltantes.push('Falta la foto de la caja abierta con el contenido');
    if (!venta.fotoCajaSelladaUrl) faltantes.push('Falta la foto de la caja sellada');
    return faltantes;
}

// Borra todo el avance del wizard (cuando cambia el empacador, la evidencia de otra persona no se hereda)
export async function reiniciarEmpaque(venta, transaction) {
    await VentaEmpaqueItem.destroy({ where: { ventaId: venta.id }, transaction });
    venta.fotoCajaAbiertaUrl = null;
    venta.fotoCajaSelladaUrl = null;
    venta.empaqueIniciadoAt = null;
    venta.empaqueVerificado = false;
}
