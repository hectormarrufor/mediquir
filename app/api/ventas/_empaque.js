import crypto from 'crypto';
import { Op } from 'sequelize';
import db from '@/models/index';
import { codigoCoincide, codigosAceptados, codigosDe, entregaDe, nivelDelCodigo, nivelMayor, normalizarCodigo, presentacionDe } from '@/app/constants/presentaciones';

const { Venta, VentaDetalle, Producto, Marca, GrupoEquivalencia, VentaEmpaqueItem, EmpaqueError, User, Empleado } = db;

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

// Cómo se llama lo que el empacador tiene en la mano según el código que escaneó
function describirNivel(producto, nivel) {
    const p = presentacionDe(producto, nivel);
    if (nivel === 'UNIDAD') return 'una UNIDAD suelta';
    if (nivel === 'CAJA') return `una CAJA cerrada de ${p?.unidades ?? '?'} unidades`;
    const cajas = Number(producto.cajasPorBulto) > 1 ? ` (${producto.cajasPorBulto} cajas)` : '';
    return `un BULTO cerrado de ${p?.unidades ?? '?'} unidades${cajas}`;
}

// Lo que piden, sin ambigüedad: "1 BULTO cerrado de 1000 unidades (10 cajas)" o "50 UNIDADES SUELTAS"
function describirPedido(entrega, producto) {
    return entrega.map((e) => {
        if (e.nivel === 'UNIDAD') return `${e.cantidad} UNIDADES${entrega.length > 1 ? ' SUELTAS' : ''}`;
        const nombre = e.nivel === 'CAJA' ? (e.cantidad === 1 ? 'CAJA cerrada' : 'CAJAS cerradas') : (e.cantidad === 1 ? 'BULTO cerrado' : 'BULTOS cerrados');
        const cajas = e.nivel === 'BULTO' && Number(producto.cajasPorBulto) > 1 ? ` (${producto.cajasPorBulto} cajas)` : '';
        return `${e.cantidad} ${nombre} de ${e.unidadesCada} unidades${e.cantidad === 1 ? "" : " c/u"}${cajas}`;
    }).join(' + ');
}

/**
 * Evalúa un código escaneado o tecleado contra el renglón. Separa dos preguntas:
 *  · ¿es el PRODUCTO correcto? (cualquiera de sus códigos lo confirma)
 *  · ¿es la PRESENTACIÓN correcta? (el código debe ser del nivel que se entrega)
 * Devuelve { productoOk, aceptado, nivelEscaneado, alerta: { tipo: 'error'|'aviso', titulo, detalle } | null }
 *  · Se piden UNIDADES: la unidad, o la caja/bulto de origen, verifican (con aviso si es la caja: "saca unidades, no la entregues cerrada").
 *  · Se piden CAJAS o BULTOS: solo vale el código de ese nivel. Otro nivel del mismo producto se RECHAZA con alerta roja,
 *    salvo que ese nivel no tenga código registrado: entonces identifica el producto, la alerta roja se mantiene y la presentación queda por conteo.
 */
export function evaluarCodigo(detalle, codigo, escaneado = false) {
    const producto = detalle.producto;
    const entrega = entregaDeDetalle(detalle);
    const conocidos = codigosDe(producto);
    const todos = Object.entries(conocidos).map(([nivel, cod]) => ({ nivel, codigo: cod }));
    const nivelEscaneado = nivelDelCodigo(todos, codigo, escaneado);
    const pedido = describirPedido(entrega, producto);

    if (!nivelEscaneado) {
        return { productoOk: false, aceptado: false, nivelEscaneado: null, alerta: { tipo: 'error', titulo: 'ESE CÓDIGO NO ES DE ESTE PRODUCTO', detalle: `Revisa que estés tomando el producto correcto. Te piden: ${pedido}.` } };
    }
    const mayor = nivelMayor(entrega);
    const tiene = describirNivel(producto, nivelEscaneado);

    if (mayor === 'UNIDAD') {
        if (nivelEscaneado === 'UNIDAD') return { productoOk: true, aceptado: true, nivelEscaneado, alerta: null };
        return {
            productoOk: true, aceptado: true, nivelEscaneado,
            alerta: { tipo: 'aviso', titulo: 'PRODUCTO CORRECTO, PERO SON UNIDADES', detalle: `Escaneaste ${tiene}. Te piden ${pedido}: saca esas unidades de ahí. NO entregues la ${nivelEscaneado === 'CAJA' ? 'caja' : 'unidad de bulto'} cerrada.` },
        };
    }
    if (nivelEscaneado === mayor) return { productoOk: true, aceptado: true, nivelEscaneado, alerta: null };

    const hayCodigoDelNivel = Boolean(conocidos[mayor]);
    const detalleBase = `Escaneaste ${tiene}. Lo que te piden es ${pedido}. No es lo mismo: ${mayor === 'BULTO' ? 'trae el BULTO completo, no una caja' : 'trae las CAJAS cerradas, no unidades sueltas'}.`;
    return {
        productoOk: true, aceptado: !hayCodigoDelNivel, nivelEscaneado,
        alerta: {
            tipo: 'error', titulo: '¡ESA NO ES LA PRESENTACIÓN QUE PIDEN!',
            detalle: hayCodigoDelNivel
                ? `${detalleBase} Escanea el código ${mayor === 'BULTO' ? 'del BULTO' : 'de la CAJA'}.`
                : `${detalleBase} Es el producto correcto, pero este nivel no tiene código de barras registrado: el sistema no puede comprobarlo, así que asegúrate de tomar exactamente ${pedido}.`,
        },
    };
}

// Deja constancia de un error del empacador (producto o presentación equivocados) para el reporte por empleado.
// El mismo error (mismo renglón, tipo y código) dentro de 2 minutos cuenta una sola vez: escanear y luego confirmar no lo duplica.
export async function registrarError({ venta, detalle, empacadorId, tipo, codigo }, transaction) {
    const cod = String(codigo || '').replace(/\s+/g, '').slice(0, 64) || null;
    const repetido = await EmpaqueError.findOne({
        where: { ventaDetalleId: detalle.id, empacadorId, tipo, codigo: cod, createdAt: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) } }, transaction,
    });
    if (repetido) return;
    const entrega = entregaDeDetalle(detalle);
    let nivelEscaneado = null;
    if (cod && detalle.producto) {
        const todos = Object.entries(codigosDe(detalle.producto)).map(([nivel, c]) => ({ nivel, codigo: c }));
        nivelEscaneado = nivelDelCodigo(todos, cod, true);
    }
    await EmpaqueError.create({
        ventaId: venta.id, ventaDetalleId: detalle.id, empacadorId, productoId: detalle.productoId || null, tipo,
        nivelPedido: entrega.length ? nivelMayor(entrega) : null, nivelEscaneado, codigo: cod,
    }, { transaction });
}

// ¿Cómo se comprueba este renglón?
//   codigo: el producto trae el código de barras del NIVEL que se entrega (unidad, caja o bulto): se escanea o se escribe
//   marca : ese nivel no tiene código (p. ej. una hojilla de bisturí): se elige la marca que dice el empaque
//   manual: ni código de barras ni marca registrada
// OJO: el código interno (`codigo`, ej. 0483) NO sirve para esto: el empacador no lo ve en el producto físico.
export function modoVerificacion(detalle) {
    if (detalle.isFicticio || !detalle.producto) return 'manual';
    if (Object.keys(codigosDe(detalle.producto)).length) return 'codigo'; // cualquier código del producto (unidad, caja o bulto) sirve para identificarlo
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
