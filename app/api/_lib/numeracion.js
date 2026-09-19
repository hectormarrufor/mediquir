// Numeración fiscal: facturas (F), notas de crédito (NC), notas de débito (ND) y número de control de la forma libre.
// Imports relativos con extensión (sin alias "@/") para poder probarlo con un script de Node.
//
//  · F / NC / ND : el número del documento (F-00001, NC-02325...). Cada serie tiene su correlativo; para NC y ND la persona dice
//                  con qué número empieza (no siempre es el 1: puede venir de un talonario anterior).
//  · CONTROL     : el número de control (00-005432) sale de la FORMA LIBRE preimpresa y es UN SOLO correlativo compartido por facturas,
//                  notas de crédito y notas de débito. Se asigna al imprimir el documento (así coincide con la forma que se gasta),
//                  una sola vez por documento; si la forma se daña se puede pedir el siguiente.
import db from '../../../models/index.js';

const { sequelize, Correlativo, Venta, NotaFiscal, RetencionIva } = db;

export class ErrorNumeracion extends Error {
    constructor(mensaje, status = 400, codigo = null) { super(mensaje); this.status = status; this.codigo = codigo; }
}

// prefijo: lo que va antes del guion en el texto final ("NC-02325", "00-005432")
export const CLAVES = {
    F: { etiqueta: 'Facturas', prefijo: 'F', ceros: 5, ejemplo: '00001', pregunta: 'Número de tu próxima factura' },
    NC: { etiqueta: 'Notas de crédito', prefijo: 'NC', ceros: 5, ejemplo: '02325', pregunta: 'Número de tu primera nota de crédito' },
    ND: { etiqueta: 'Notas de débito', prefijo: 'ND', ceros: 5, ejemplo: '00410', pregunta: 'Número de tu primera nota de débito' },
    CONTROL: { etiqueta: 'Número de control (forma libre)', prefijo: '00', ceros: 6, ejemplo: '00-005432', pregunta: 'Número de control de la próxima forma libre que vas a imprimir' },
};

const formatear = (clave, n, ceros) => `${CLAVES[clave].prefijo}-${String(n).padStart(ceros, '0')}`;

// Mayor número ya usado de cada serie (null si no hay ninguno)
export async function ultimoUsado(clave, transaction) {
    const consulta = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: sequelize.QueryTypes.SELECT, transaction });
    const numerico = (col) => `CAST(NULLIF(regexp_replace(${col}, '\\D', '', 'g'), '') AS bigint)`;
    let fila;
    if (clave === 'F') {
        [fila] = await consulta(`SELECT MAX(${numerico('"numeroDocumento"')}) AS n FROM "Ventas" WHERE "numeroDocumento" LIKE 'F-%'`);
    } else if (clave === 'NC' || clave === 'ND') {
        [fila] = await consulta(`SELECT MAX(${numerico('"numeroDocumento"')}) AS n FROM "NotasFiscales" WHERE "origen" = 'VENTA' AND "numeroDocumento" LIKE :patron`, { patron: `${clave}-%` });
    } else {
        [fila] = await consulta(`SELECT MAX(n) AS n FROM (
            SELECT CAST(substring("numeroControl" from 4) AS bigint) AS n FROM "Ventas" WHERE "numeroControl" ~ '^00-[0-9]+$'
            UNION ALL
            SELECT CAST(substring("numeroControl" from 4) AS bigint) FROM "NotasFiscales" WHERE "origen" = 'VENTA' AND "numeroControl" ~ '^00-[0-9]+$'
        ) t`);
    }
    return fila?.n === null || fila?.n === undefined ? null : Number(fila.n);
}

// Estado de todas las series, para mostrarlo y para saber cuáles faltan por configurar
export async function estadoNumeracion(transaction) {
    const filas = await Correlativo.findAll({ where: { prefijo: Object.keys(CLAVES) }, transaction });
    const porClave = new Map(filas.map((c) => [c.prefijo, c]));
    const resultado = [];
    for (const [clave, meta] of Object.entries(CLAVES)) {
        const c = porClave.get(clave);
        const ceros = c?.cerosRelleno || meta.ceros;
        const ultimo = await ultimoUsado(clave, transaction);
        // El siguiente nunca baja del mayor ya usado (aunque la fila del correlativo esté atrasada)
        const siguiente = Math.max(c?.siguienteNumero || 1, (ultimo || 0) + 1);
        resultado.push({
            clave, etiqueta: meta.etiqueta, pregunta: meta.pregunta, ejemplo: meta.ejemplo, prefijo: meta.prefijo,
            configurado: c ? Boolean(c.configurado) : false, siguienteNumero: siguiente, ceros,
            siguiente: formatear(clave, siguiente, ceros), ultimoUsado: ultimo === null ? null : formatear(clave, ultimo, ceros),
        });
    }
    return resultado;
}

// Lo que escribió la persona -> número entero. Acepta "2325", "02325", "NC-02325" o (control) "00-005432".
export function interpretarNumero(clave, crudo) {
    const texto = String(crudo ?? '').trim();
    const m = /^(?:[A-Za-z0-9]{1,3}\s*-\s*)?(\d{1,10})$/.exec(texto);
    if (!m) throw new ErrorNumeracion(`Escribe solo el número, por ejemplo ${CLAVES[clave].ejemplo}`);
    const n = Number(m[1]);
    if (!Number.isSafeInteger(n) || n < 1) throw new ErrorNumeracion('El número debe ser mayor a 0');
    return { n, digitos: m[1].length };
}

// Fija con qué número sale el PRÓXIMO documento de la serie. No puede repetir ni quedar por debajo de uno ya usado.
export async function configurarNumeracion({ clave, siguiente, transaction: t }) {
    if (!CLAVES[clave]) throw new ErrorNumeracion('Numeración no válida');
    const { n, digitos } = interpretarNumero(clave, siguiente);
    const ultimo = await ultimoUsado(clave, t);
    if (ultimo !== null && n <= ultimo) {
        throw new ErrorNumeracion(`Ya se usó el ${formatear(clave, ultimo, CLAVES[clave].ceros)}: el siguiente debe ser mayor`, 409);
    }
    let c = await Correlativo.findOne({ where: { prefijo: clave }, transaction: t, lock: t.LOCK.UPDATE });
    const ceros = Math.max(CLAVES[clave].ceros, digitos);
    if (!c) c = await Correlativo.create({ prefijo: clave, siguienteNumero: n, cerosRelleno: ceros, configurado: true }, { transaction: t });
    else await c.update({ siguienteNumero: n, cerosRelleno: ceros, configurado: true }, { transaction: t });
    return { clave, siguiente: formatear(clave, n, ceros) };
}

// Toma el siguiente número de control y avanza el correlativo compartido. Falla si todavía no se dijo con cuál se empieza.
export async function siguienteControl(t) {
    const c = await Correlativo.findOne({ where: { prefijo: 'CONTROL' }, transaction: t, lock: t.LOCK.UPDATE });
    if (!c || !c.configurado) {
        throw new ErrorNumeracion('Antes de imprimir debes indicar el número de control de la forma libre con la que empiezas', 409, 'CONTROL_PENDIENTE');
    }
    const ultimo = await ultimoUsado('CONTROL', t);
    const n = Math.max(c.siguienteNumero, (ultimo || 0) + 1);
    c.siguienteNumero = n + 1;
    await c.save({ transaction: t });
    return formatear('CONTROL', n, c.cerosRelleno || CLAVES.CONTROL.ceros);
}

/**
 * Asigna el número de control a una factura (origen 'VENTA') o a una nota emitida (origen 'NOTA'), UNA sola vez.
 * Si ya lo tiene devuelve el que tiene; con reasignar=true toma uno nuevo (forma libre dañada).
 */
export async function asignarControl({ origen, id, reasignar = false, transaction: t }) {
    const esNota = origen === 'NOTA';
    if (!esNota && origen !== 'VENTA') throw new ErrorNumeracion('Documento no válido');
    const doc = await (esNota ? NotaFiscal : Venta).findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!doc) throw new ErrorNumeracion('Documento no encontrado', 404);
    if (esNota && (doc.origen !== 'VENTA' || doc.estado !== 'EMITIDA')) throw new ErrorNumeracion('Solo las notas emitidas por la empresa llevan número de control', 409);
    if (!esNota && doc.tipoDocumento !== 'FACTURA') throw new ErrorNumeracion('Solo las facturas llevan número de control', 409);
    if (!esNota && doc.statusDespacho === 'Cancelado') throw new ErrorNumeracion('La factura está anulada', 409);

    if (doc.numeroControl && !reasignar) return { numeroControl: doc.numeroControl, nuevo: false };

    const numero = await siguienteControl(t);
    doc.numeroControl = numero;
    await doc.save({ transaction: t });
    // La retención de IVA guarda una copia del control de la factura
    if (!esNota) await RetencionIva.update({ numeroControlFactura: numero }, { where: { ventaId: doc.id }, transaction: t });
    return { numeroControl: numero, nuevo: true };
}
