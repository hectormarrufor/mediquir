// Anular una factura de venta con una nota de crédito (la factura no se borra ni cambia: la NC la compensa en el libro de ventas).
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · PARCIAL: se eligen los renglones y cuántas unidades de cada uno. Se pregunta si la NC afecta la cuenta por cobrar:
//      sí -> baja la deuda y los productos vuelven al inventario;  no -> no toca la deuda ni el inventario.
//  · TOTAL: la NC es por todo lo que queda de la factura y los productos vuelven al inventario. Se pregunta si afecta la cuenta por cobrar
//      (sí -> la deuda baja por la NC; no -> la deuda queda igual).
//  · TOTAL de una factura que salió de notas de entrega: la(s) nota(s) vuelven a ser el documento principal y la deuda vuelve a ellas
//      (su monto, con los abonos que ya hubo); el inventario no se mueve (la mercancía sigue con el cliente, ahora por la nota). Si esas
//      notas también están en otras facturas (una nota larga repartida), se anulan todas juntas: una NC por factura, cada una con su
//      número de control.
//  · PARCIAL sobre factura YA PAGADA: no toca nada de lo registrado, salvo que se marque modificarPago (rebaja el ingreso ya registrado por el monto de la NC).
//  · VARIAS NC a la vez (notas: [{ renglones, numero, control }]): la factura se reparte en varias notas de crédito en una sola transacción. Cada nota lleva
//      sus renglones y cantidades (lo que una nota toma ya no queda para las siguientes). Si entre todas cubren la factura completa, se trata como
//      una anulación total (de una factura que salió de notas de entrega: no mueve inventario y la deuda vuelve a las notas); si no la cubren, como parciales.
//  · Cada NC toma el siguiente número de NC (o el que ya tiene en el sistema anterior) y el número de control que se indique.
import db from '../../../models/index.js';
import { numerosAnteriores, unirAnteriores } from '../../constants/documentosAnteriores.js';
import { aBolivares, aDolares } from '../../constants/facturacion.js';
import { emitirNotaVenta, notasDeVenta, ErrorNota } from './notasFiscales.js';
import { controlesLibres, reservarControl, ErrorNumeracion } from './numeracion.js';
import { recalcularCobro, hoyCaracas } from './retencionesVenta.js';

const { sequelize, Venta, CuentaPorCobrar, Abono, ComisionVenta, RetencionIva, NotaFiscal, Correlativo, Cliente, MovimientoFinanciero, CategoriaFinanciera } = db;
const { Op } = db.Sequelize;
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const METODO_NC = 'Nota de crédito';
export const MAX_NOTAS = 20;

export class ErrorAnulacion extends Error {
    constructor(mensaje, status = 400, codigo = null) { super(mensaje); this.status = status; this.codigo = codigo; }
}

// Una nota de crédito PARCIAL sobre una factura que ya está pagada no toca nada de lo ya registrado: ni la cuenta por cobrar, ni los ingresos,
// ni el inventario, ni deja saldo a favor del cliente. Siempre se pide confirmación antes de emitirla (regla del usuario, 11/11/2026).
export const CONFIRMAR_PAGADA = 'CONFIRMAR_PAGADA';
const MENSAJE_PAGADA = 'Esta factura ya está pagada: la nota de crédito parcial NO afectará las cuentas por cobrar ni lo ya ingresado, no dejará saldo a favor y no moverá el inventario. Confirma para emitirla.';

// Excepción a la regla anterior (11/11/2026): si el usuario marca «Sí, modifica el pago ya registrado», además de emitir la NC parcial se REBAJA el
// ingreso ya registrado de esa factura por el monto de la NC (base e IVA por separado), para que quede: pago registrado = total de la factura - NC.
// Si el pago está repartido en varios abonos o movimientos, o la NC supera lo cobrado, responde un error y no emite la nota (la transacción se revierte).
const MENSAJE_SOLO_PAGADA = 'Modificar el pago ya registrado solo aplica a una nota de crédito parcial sobre una factura ya pagada';

async function rebajarPago({ venta, nota, transaction: t }) {
    const [abonos, movimientos] = await Promise.all([
        Abono.findAll({ where: { ventaId: venta.id, metodoPago: { [Op.ne]: METODO_NC } }, transaction: t, lock: t.LOCK.UPDATE }),
        MovimientoFinanciero.findAll({ where: { ventaId: venta.id, tipo: 'INGRESO' }, transaction: t, lock: t.LOCK.UPDATE }),
    ]);
    if (!movimientos.length) throw new ErrorAnulacion(`La factura ${venta.numeroDocumento} no tiene ingresos registrados que rebajar`, 409);
    if (abonos.length > 1) throw new ErrorAnulacion(`El pago de la factura ${venta.numeroDocumento} está repartido en ${abonos.length} abonos: no hay una sola forma de rebajarlo`, 409);
    const categorias = await CategoriaFinanciera.findAll({ where: { id: movimientos.map((m) => m.categoriaId).filter(Boolean) }, attributes: ['id', 'nombre'], transaction: t });
    const esIva = (m) => categorias.find((c) => c.id === m.categoriaId)?.nombre === 'IVA Recaudado';
    const deIva = movimientos.filter(esIva);
    const deBase = movimientos.filter((m) => !esIva(m));
    if (deBase.length !== 1 || deIva.length > 1) throw new ErrorAnulacion(`El ingreso de la factura ${venta.numeroDocumento} está repartido en ${movimientos.length} movimientos: no hay una sola forma de rebajarlo`, 409);
    const tasa = Number(venta.tasaCambio) || 1;
    // Lo que se rebaja en cada moneda: el monto de la nota está en la moneda de la factura; el de la otra moneda sale a la tasa de la factura
    const montos = (monto) => (venta.moneda === 'BS' ? { bs: r2(monto), usd: aDolares(Number(monto), tasa) } : { usd: r2(monto), bs: aBolivares(Number(monto), tasa) });
    const partes = [{ mov: deBase[0], ...montos(Number(nota.totalFinal) - Number(nota.montoIva)) }];
    if (Number(nota.montoIva) > 0) {
        if (!deIva.length) throw new ErrorAnulacion(`La factura ${venta.numeroDocumento} no tiene el ingreso del IVA registrado por separado: no hay una sola forma de rebajarlo`, 409);
        partes.push({ mov: deIva[0], ...montos(nota.montoIva) });
    }
    for (const p of partes) {
        if (r2(Number(p.mov.montoVes) - p.bs) < 0 || r2(Number(p.mov.montoUsd) - p.usd) < -0.01) {
            throw new ErrorAnulacion(`La nota de crédito (${Number(nota.totalFinal).toFixed(2)} ${venta.moneda}) supera lo que se registró como pagado de la factura ${venta.numeroDocumento}`, 409);
        }
    }
    for (const p of partes) {
        p.mov.montoVes = r2(Number(p.mov.montoVes) - p.bs);
        p.mov.montoUsd = Math.max(0, r2(Number(p.mov.montoUsd) - p.usd));
        p.mov.descripcion = `${p.mov.descripcion || ''} · rebajado por la nota de crédito ${nota.numeroDocumento}`;
        await p.mov.save({ transaction: t });
    }
    if (abonos.length === 1) {
        const a = abonos[0];
        const { bs, usd } = montos(nota.totalFinal);
        if (r2(Number(a.montoVes) - bs) < 0) throw new ErrorAnulacion(`La nota de crédito supera el abono registrado de la factura ${venta.numeroDocumento}`, 409);
        a.montoVes = r2(Number(a.montoVes) - bs);
        a.montoBs = a.montoVes;
        a.montoUsd = Math.max(0, r2(Number(a.montoUsd) - usd));
        a.notas = `${a.notas || ''} Rebajado por la nota de crédito ${nota.numeroDocumento}.`.trim();
        await a.save({ transaction: t });
    }
    return true;
}

// ¿La mercancía de la factura ya salió? (si no salió, no hay nada que devolver al inventario)
const yaSalio = (v) => v.tipoVenta !== 'MAYOR' || Boolean(v.empacadoAt) || v.statusDespacho === 'Completado';
const regexNumero = (num) => `(^|, )${String(num).replace(/[^A-Za-z0-9-]/g, '')}(,|$)`;

/** Facturas vigentes que comparten notas de entrega con `venta` (incluida ella) y esas notas. Sin notas de origen: solo la factura. */
async function grupoDeNotas(venta, transaction) {
    const notas = new Set(numerosAnteriores(venta.numeroDocumentoAnterior).filter((n) => n.startsWith('NE-')));
    if (!notas.size) return { facturas: [venta], notas: [] };
    const facturas = new Map([[venta.id, venta]]);
    // Cierre: una factura hermana puede traer otra nota, que a su vez puede estar en otra factura
    for (let vuelta = 0; vuelta < 10; vuelta++) {
        const antes = facturas.size + notas.size;
        const otras = await Venta.findAll({
            where: { tipoDocumento: 'FACTURA', statusDespacho: { [Op.ne]: 'Cancelado' }, [Op.or]: [...notas].map((n) => ({ numeroDocumentoAnterior: { [Op.regexp]: regexNumero(n) } })) },
            transaction, lock: transaction?.LOCK.UPDATE,
        });
        for (const f of otras) {
            facturas.set(f.id, facturas.get(f.id) || f);
            numerosAnteriores(f.numeroDocumentoAnterior).filter((n) => n.startsWith('NE-')).forEach((n) => notas.add(n));
        }
        if (facturas.size + notas.size === antes) break;
    }
    const ventasNota = await Venta.findAll({ where: { tipoDocumento: 'NOTA_ENTREGA', numeroDocumento: [...notas] }, transaction, lock: transaction?.LOCK.UPDATE });
    const ordenar = (a, b) => String(a.numeroDocumento).localeCompare(String(b.numeroDocumento));
    return { facturas: [...facturas.values()].sort(ordenar), notas: ventasNota.sort(ordenar) };
}

/** Siguiente número de NC (sin tomarlo): solo para mostrarlo en el formulario. */
async function siguienteNcTexto(transaction) {
    const corr = await Correlativo.findOne({ where: { prefijo: 'NC' }, transaction });
    if (!corr) return null;
    const [{ maximo }] = await sequelize.query(
        `SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace("numeroDocumento", '\\D', '', 'g'), '') AS bigint)), 0) AS maximo FROM "NotasFiscales" WHERE origen = 'VENTA' AND "numeroDocumento" LIKE 'NC-%'`,
        { type: sequelize.QueryTypes.SELECT, transaction },
    );
    return `NC-${String(Math.max(Number(corr.siguienteNumero) || 1, Number(maximo) + 1)).padStart(corr.cerosRelleno || 5, '0')}`;
}

/** Lo que el formulario necesita: renglones por acreditar, si viene de notas de entrega (y sus facturas hermanas) y qué lo impide. */
export async function planAnulacion({ venta, transaction }) {
    if (venta.tipoDocumento !== 'FACTURA') throw new ErrorAnulacion('Solo se anulan facturas', 409);
    if (venta.statusDespacho === 'Cancelado') throw new ErrorAnulacion('La factura ya está anulada', 409);
    const propia = await notasDeVenta(venta, transaction);
    const grupo = await grupoDeNotas(venta, transaction);
    const ids = grupo.facturas.map((f) => f.id);
    const [retenciones, pagos, comisionesPagadas, notasEmitidas] = await Promise.all([
        RetencionIva.count({ where: { ventaId: ids }, transaction }),
        Abono.findAll({ where: { ventaId: ids, metodoPago: { [Op.ne]: METODO_NC } }, attributes: ['id', 'ventaId', 'montoUsd'], transaction }),
        ComisionVenta.count({ where: { ventaId: ids, estatusComision: 'PAGADA' }, transaction }),
        NotaFiscal.count({ where: { ventaId: ids, estado: 'EMITIDA' }, transaction }),
    ]);
    const deNotas = grupo.notas.length > 0;
    const bloqueosNotas = [];
    if (deNotas) {
        if (grupo.notas.length !== numerosAnteriores(grupo.facturas.map((f) => f.numeroDocumentoAnterior).join(', ')).filter((n) => n.startsWith('NE-')).filter((n, i, a) => a.indexOf(n) === i).length) {
            bloqueosNotas.push('No se encontró alguna de las notas de entrega de origen');
        }
        if (retenciones) bloqueosNotas.push('La factura tiene retención de IVA registrada: anula primero la retención');
        if (notasEmitidas) bloqueosNotas.push('La factura ya tiene notas de crédito o débito: anúlalas primero para que la deuda vuelva completa a la nota de entrega');
        if (comisionesPagadas) bloqueosNotas.push('Al vendedor ya se le pagó la comisión de esta factura');
        if (pagos.length && grupo.notas.length > 1) bloqueosNotas.push('Las facturas tienen abonos y salieron de varias notas de entrega: no hay una sola forma de repartir esos pagos entre las notas');
    }
    const facturas = await Promise.all(grupo.facturas.map(async (f) => {
        const n = f.id === venta.id ? propia : await notasDeVenta(f, transaction);
        return { id: f.id, numero: f.numeroDocumento, moneda: f.moneda, total: Number(f.totalFinal), acreditable: n.acreditable, notas: numerosAnteriores(f.numeroDocumentoAnterior).filter((x) => x.startsWith('NE-')) };
    }));
    return {
        factura: { id: venta.id, numero: venta.numeroDocumento, moneda: venta.moneda, tasa: Number(venta.tasaCambio), total: Number(venta.totalFinal), acreditable: propia.acreditable, yaSalio: yaSalio(venta), pagada: venta.statusPago === 'Pagado' },
        renglones: propia.renglones,
        deNotas,
        notasEntrega: grupo.notas.map((n) => ({ id: n.id, numero: n.numeroDocumento, totalUsd: Number(n.totalFinal) })),
        facturas: deNotas ? facturas.filter((f) => f.acreditable > 0.005) : facturas.filter((f) => f.id === venta.id),
        abonosUsd: r2(pagos.reduce((a, x) => a + Number(x.montoUsd), 0)),
        bloqueosNotas,
        siguienteNc: await siguienteNcTexto(transaction),
        // Varias notas de crédito sobre la misma factura: hacen falta controles de sobra (el formulario pregunta cuántas son)
        controlesSugeridos: await controlesLibres((deNotas ? Math.max(1, facturas.length) : 1) + MAX_NOTAS, transaction),
    };
}

/**
 * Emite la(s) nota(s) de crédito de la anulación. No hace commit.
 *   tipo: 'TOTAL' | 'PARCIAL'
 *   renglones (PARCIAL): [{ ventaDetalleId, cantidad }]
 *   afectaCxc: obligatorio salvo en la anulación total de una factura que salió de notas de entrega (ahí la deuda vuelve a las notas)
 *   documentos: { [ventaId de la factura]: { numero?, control } } -> número de NC (si ya se emitió en el sistema anterior) y su control
 */
export async function anularFactura({ venta, tipo, renglones = [], afectaCxc = null, motivo, documentos = {}, notas = null, fecha = null, usuarioId = null, confirmarPagada = false, modificarPago = false, transaction: t }) {
    const varias = Array.isArray(notas) && notas.length > 1;
    if (!varias && !['TOTAL', 'PARCIAL'].includes(tipo)) throw new ErrorAnulacion('Elige si la anulación es total o parcial');
    const motivoTxt = String(motivo || '').trim();
    if (motivoTxt.length < 5) throw new ErrorAnulacion('Explica el motivo de la anulación (mínimo 5 caracteres)');
    const plan = await planAnulacion({ venta, transaction: t });
    if (plan.factura.acreditable <= 0.005) throw new ErrorAnulacion('Esta factura ya está acreditada por completo con notas de crédito', 409);
    const datosDe = (id) => documentos?.[id] || {};
    const control = async (id) => {
        const c = String(datosDe(id).control || '').trim();
        if (!c) throw new ErrorAnulacion('Indica el número de control de cada nota de crédito');
        try { return await reservarControl(c, t); } catch (e) { if (e instanceof ErrorNumeracion) throw new ErrorAnulacion(e.message, e.status); throw e; }
    };
    const emitir = async (factura, lineas, devuelve, afecta, texto) => emitirNotaVenta({
        venta: factura, tipo: 'CREDITO', renglones: lineas, motivo: texto, devuelveInventario: devuelve, afectaCxc: afecta, usuarioId, transaction: t,
        numeroManual: datosDe(factura.id).numero || null, numeroControl: await control(factura.id), fecha,
    });
    const todos = (r) => r.filter((x) => x.restante > 0).map((x) => ({ ventaDetalleId: x.id, cantidad: x.restante }));

    // ---------- Varias notas de crédito sobre la misma factura
    const previas = new Map(); // ventaId -> notas ya emitidas aquí (la factura que se repartió en varias)
    if (varias) {
        if (notas.length > MAX_NOTAS) throw new ErrorAnulacion(`Máximo ${MAX_NOTAS} notas de crédito por factura`);
        const usado = new Map();
        const grupos = notas.map((n) => {
            const els = (Array.isArray(n.renglones) ? n.renglones : []).filter((r) => Number(r.cantidad) > 0).map((r) => ({ ventaDetalleId: r.ventaDetalleId, cantidad: Number(r.cantidad) }));
            if (!els.length) throw new ErrorAnulacion('Cada nota de crédito necesita al menos un renglón');
            for (const e of els) usado.set(e.ventaDetalleId, (usado.get(e.ventaDetalleId) || 0) + e.cantidad);
            return { ...n, renglones: els };
        });
        const porId = new Map(plan.renglones.map((r) => [r.id, r]));
        for (const [id, cant] of usado) {
            const r = porId.get(id);
            if (!r) throw new ErrorAnulacion('Uno de los renglones no pertenece a esta factura');
            if (cant > r.restante) throw new ErrorAnulacion(`De "${r.nombre}" quedan ${r.restante} por acreditar y entre las notas se anulan ${cant}`);
        }
        const completa = plan.renglones.every((r) => (usado.get(r.id) || 0) === r.restante);
        const sinCxc = completa && plan.deNotas; // la deuda vuelve a las notas de entrega, sin mover inventario
        if (modificarPago && (completa || !plan.factura.pagada)) throw new ErrorAnulacion(MENSAJE_SOLO_PAGADA);
        if (!completa && plan.factura.pagada) { // parcial sobre factura pagada: no toca nada, previa confirmación
            if (!confirmarPagada) throw new ErrorAnulacion(MENSAJE_PAGADA, 409, CONFIRMAR_PAGADA);
            afectaCxc = false;
        }
        if (sinCxc && plan.bloqueosNotas.length) throw new ErrorAnulacion(plan.bloqueosNotas[0], 409);
        if (!sinCxc && typeof afectaCxc !== 'boolean') throw new ErrorAnulacion('Indica si las notas de crédito afectan la cuenta por cobrar');
        const devuelve = !sinCxc && yaSalio(venta) && (completa || afectaCxc);
        const emitidasAqui = [];
        for (let i = 0; i < grupos.length; i++) {
            const g = grupos[i];
            let ctrl;
            try { ctrl = await reservarControl(String(g.control || '').trim(), t); } catch (e) { if (e instanceof ErrorNumeracion) throw new ErrorAnulacion(`Nota ${i + 1}: ${e.message}`, e.status); throw e; }
            const nota = await emitirNotaVenta({
                venta, tipo: 'CREDITO', renglones: g.renglones, devuelveInventario: devuelve, afectaCxc: sinCxc ? false : afectaCxc, usuarioId, transaction: t,
                motivo: `Anulación ${completa ? 'total' : 'parcial'} de la factura ${venta.numeroDocumento} en ${grupos.length} notas de crédito (${i + 1} de ${grupos.length}): ${motivoTxt}`,
                numeroManual: g.numero || null, numeroControl: ctrl, fecha,
            });
            const pagoRebajado = modificarPago ? await rebajarPago({ venta, nota, transaction: t }) : false;
            emitidasAqui.push({ numero: nota.numeroDocumento, control: nota.numeroControl, factura: venta.numeroDocumento, total: Number(nota.totalFinal), moneda: nota.moneda, pagoRebajado });
        }
        if (!sinCxc) return { notas: emitidasAqui, notasEntrega: [] };
        previas.set(venta.id, emitidasAqui);
    }

    // ---------- Parcial
    if (!varias && tipo === 'PARCIAL') {
        if (modificarPago && !plan.factura.pagada) throw new ErrorAnulacion(MENSAJE_SOLO_PAGADA);
        if (plan.factura.pagada) { // factura ya pagada: no toca cuentas por cobrar, ingresos, inventario ni saldo a favor, previa confirmación
            if (!confirmarPagada) throw new ErrorAnulacion(MENSAJE_PAGADA, 409, CONFIRMAR_PAGADA);
            afectaCxc = false;
        }
        if (typeof afectaCxc !== 'boolean') throw new ErrorAnulacion('Indica si la nota de crédito afecta la cuenta por cobrar');
        const elegidos = (Array.isArray(renglones) ? renglones : []).filter((r) => Number(r.cantidad) > 0).map((r) => ({ ventaDetalleId: r.ventaDetalleId, cantidad: Number(r.cantidad) }));
        if (!elegidos.length) throw new ErrorAnulacion('Elige al menos un renglón y cuántas unidades se anulan');
        // Si afecta la deuda, lo anulado vuelve al inventario; si no la afecta, no se mueve nada
        const nota = await emitir(venta, elegidos, afectaCxc && yaSalio(venta), afectaCxc, `Anulación parcial de la factura ${venta.numeroDocumento}: ${motivoTxt}`);
        const pagoRebajado = modificarPago ? await rebajarPago({ venta, nota, transaction: t }) : false;
        return { notas: [{ numero: nota.numeroDocumento, control: nota.numeroControl, factura: venta.numeroDocumento, total: Number(nota.totalFinal), moneda: nota.moneda, pagoRebajado }], notasEntrega: [] };
    }
    if (modificarPago) throw new ErrorAnulacion(MENSAJE_SOLO_PAGADA);

    // ---------- Total de una factura propia (no viene de notas de entrega)
    if (!varias && !plan.deNotas) {
        if (typeof afectaCxc !== 'boolean') throw new ErrorAnulacion('Indica si la nota de crédito afecta la cuenta por cobrar');
        const nota = await emitir(venta, todos(plan.renglones), yaSalio(venta), afectaCxc, `Anulación total de la factura ${venta.numeroDocumento}: ${motivoTxt}`);
        return { notas: [{ numero: nota.numeroDocumento, control: nota.numeroControl, factura: venta.numeroDocumento, total: Number(nota.totalFinal), moneda: nota.moneda }], notasEntrega: [] };
    }

    // ---------- Total de factura(s) que salieron de notas de entrega: la deuda vuelve a las notas
    if (plan.bloqueosNotas.length) throw new ErrorAnulacion(plan.bloqueosNotas[0], 409);
    const grupo = await grupoDeNotas(venta, t);
    const facturas = grupo.facturas.filter((f) => plan.facturas.some((p) => p.id === f.id));
    const notasEntrega = grupo.notas;
    const idsFacturas = facturas.map((f) => f.id);
    const textoNotas = unirAnteriores(notasEntrega.map((n) => n.numeroDocumento));
    const emitidas = [];
    for (const f of facturas) {
        if (previas.has(f.id)) { emitidas.push(...previas.get(f.id)); continue; }
        const { renglones: r } = await notasDeVenta(f, t);
        // La NC no baja la deuda de la factura (esa deuda deja de existir: vuelve a la nota) ni mueve inventario
        const nota = await emitir(f, todos(r), false, false, `Anulación total de la factura ${f.numeroDocumento}: vuelve a ser documento principal ${textoNotas}. ${motivoTxt}`);
        emitidas.push({ numero: nota.numeroDocumento, control: nota.numeroControl, factura: f.numeroDocumento, total: Number(nota.totalFinal), moneda: nota.moneda });
    }

    const sql = (texto, reemplazos) => sequelize.query(texto, { replacements: reemplazos, transaction: t });
    const principal = notasEntrega[0];
    // Pagos del cliente (no las NC): pasan a la nota con su dinero (solo se llega aquí con pagos si es una sola nota)
    const pagos = await Abono.findAll({ where: { ventaId: idsFacturas, metodoPago: { [Op.ne]: METODO_NC } }, attributes: ['id'], transaction: t });
    if (pagos.length) {
        const idsPagos = pagos.map((p) => p.id);
        await Abono.update({ ventaId: principal.id }, { where: { id: idsPagos }, transaction: t });
        await sql('UPDATE "MovimientosFinancieros" SET "ventaId" = :n WHERE "abonoId" IN (:ids)', { n: principal.id, ids: idsPagos });
        await sql('UPDATE "PagoSms" SET "ventaId" = :n WHERE "ventaId" IN (:f)', { n: principal.id, f: idsFacturas });
    }
    // La mercancía sigue con el cliente: las salidas de inventario vuelven a la nota que tiene ese producto (o a la primera)
    const productosDe = new Map();
    for (const n of notasEntrega) {
        const filas = await sequelize.query('SELECT DISTINCT "productoId" FROM "VentaDetalles" WHERE "ventaId" = :n AND "productoId" IS NOT NULL', { replacements: { n: n.id }, type: sequelize.QueryTypes.SELECT, transaction: t });
        productosDe.set(n.id, new Set(filas.map((x) => Number(x.productoId))));
    }
    const salidas = await sequelize.query('SELECT id, producto_id AS "productoId" FROM "SalidasInventario" WHERE venta_id IN (:f)', { replacements: { f: idsFacturas }, type: sequelize.QueryTypes.SELECT, transaction: t });
    for (const s of salidas) {
        const destino = notasEntrega.find((n) => productosDe.get(n.id).has(Number(s.productoId))) || principal;
        await sql('UPDATE "SalidasInventario" SET venta_id = :n WHERE id = :id', { n: destino.id, id: s.id });
    }
    // Comisión: vuelve a ser una por nota (base = lo de la nota sin IVA)
    const comisiones = await ComisionVenta.findAll({ where: { ventaId: idsFacturas, concepto: 'FACTURA' }, transaction: t });
    if (comisiones.length) {
        const k = comisiones[0];
        const pct = Number(k.porcentaje) || 0;
        for (const n of notasEntrega) {
            await ComisionVenta.create({
                vendedorId: k.vendedorId, ventaId: n.id, concepto: 'FACTURA', fecha: hoyCaracas(), vencimiento: null, documentoTexto: n.numeroDocumento.replace(/\D/g, '').replace(/^0+/, ''),
                clienteTexto: k.clienteTexto, montoUsd: Number(n.totalFinal), baseUsd: Number(n.subtotal), porcentaje: pct, comisionUsd: r2((Number(n.subtotal) * pct) / 100),
                estatusCliente: k.estatusCliente, estatusComision: 'PENDIENTE', observacion: `Vuelve a la nota al anularse ${unirAnteriores(facturas.map((f) => f.numeroDocumento))}`,
            }, { transaction: t });
        }
        await ComisionVenta.destroy({ where: { id: comisiones.map((c) => c.id) }, transaction: t });
    }
    await sql(`UPDATE "ComisionesVenta" SET "ventaId" = :n, "documentoTexto" = :doc WHERE "ventaId" IN (:f)`, { n: principal.id, doc: principal.numeroDocumento.replace(/\D/g, '').replace(/^0+/, ''), f: idsFacturas });

    // La deuda de las facturas deja de existir; cada nota vuelve con su propia cuenta por cobrar (en dólares, como se vendió)
    await CuentaPorCobrar.destroy({ where: { ventaId: idsFacturas }, transaction: t });
    const cliente = await Cliente.findByPk(principal.clienteId, { attributes: ['diasCredito'], transaction: t });
    for (const n of notasEntrega) {
        const vence = n.fechaVencimiento ? new Date(n.fechaVencimiento) : new Date(Date.now() + (Number(cliente?.diasCredito) || 7) * 86400000);
        await CuentaPorCobrar.create({
            clienteId: n.clienteId, ventaId: n.id, montoTotal: Number(n.totalFinal), saldoPendiente: Number(n.totalFinal), moneda: 'USD', tasaCambio: Number(n.tasaCambio) || 1,
            fechaVencimiento: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(vence), estado: 'Pendiente',
            observacion: `Vuelve de la factura anulada ${unirAnteriores(facturas.map((f) => f.numeroDocumento))}`,
        }, { transaction: t });
        n.statusDespacho = facturas[0].statusDespacho === 'Cancelado' ? 'Completado' : facturas[0].statusDespacho;
        n.statusPago = 'Pendiente';
        await n.save({ transaction: t });
        await recalcularCobro(n, t);
    }
    // Las facturas quedan acreditadas por completo con su NC: ya no se deben
    for (const f of facturas) { f.statusPago = 'Pagado'; await f.save({ transaction: t }); }
    return { notas: emitidas, notasEntrega: notasEntrega.map((n) => n.numeroDocumento) };
}
