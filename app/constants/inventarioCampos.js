// Reglas de los campos editables del inventario. Las usan por igual el servidor (validación
// definitiva), la hoja (validación inmediata al escribir o pegar) y el formulario de producto,
// para que nunca discrepen.
import { PAQUETES } from './presentaciones';

export const PRESENTACIONES = [
    { value: 'unidad', label: 'Unidad' },
    { value: 'par', label: 'Par' },
    ...PAQUETES.map((n) => ({ value: `paqx${n}`, label: `Paquete x${n}` })),
    { value: 'cx100', label: 'Caja x100' },
    { value: 'cx200', label: 'Caja x200' },
    { value: 'metro', label: 'Metro' },
    { value: 'rollo', label: 'Rollo' },
]; // la CAJA no es una presentación: es un dato aparte (unidadesPorCaja) que cualquier producto puede tener

export const CAMPOS = {
    codigo: { tipo: 'texto', max: 60, requerido: true },
    codigoBarras: { tipo: 'texto', max: 64 }, // de la UNIDAD; opcional: vacío = el producto no trae código de barras
    codigoBarrasCaja: { tipo: 'texto', max: 64 }, // de la caja cerrada (opcional)
    codigoBarrasBulto: { tipo: 'texto', max: 64 }, // del bulto (opcional)
    nombre: { tipo: 'texto', max: 255, requerido: true },
    imagen: { tipo: 'texto', max: 255 },
    stockAlmacen: { tipo: 'numero', min: 0, max: 99999999, decimales: 2 },
    stockMinimo: { tipo: 'numero', min: 0, max: 99999999, decimales: 2 },
    costoUsd: { tipo: 'numero', min: 0, max: 9999999, decimales: 5 }, // costo de UNA unidad
    precio6: { tipo: 'numero', min: 0, max: 9999999, decimales: 3 },
    precio7: { tipo: 'numero', min: 0, max: 9999999, decimales: 3 },
    porcentajeDescuento: { tipo: 'entero', min: 0, max: 99 },
    porcentajeIva: { tipo: 'numero', min: 0, max: 100, decimales: 2 },
    presentacion: { tipo: 'enum', valores: PRESENTACIONES.map((p) => p.value) },
    unidadesPorCaja: { tipo: 'entero', min: 1, max: 100000, nullable: true },
    cajasPorBulto: { tipo: 'entero', min: 1, max: 100000, nullable: true },
    unidadesPorBulto: { tipo: 'entero', min: 1, max: 10000000, nullable: true }, // vacío = no viene en bulto, solo en la presentación individual (o en caja, si tiene)
    categoriaId: { tipo: 'fk', requerido: true },
    marcaId: { tipo: 'fk', requerido: true },
    grupoEquivalenciaId: { tipo: 'fk', nullable: true },
    tags: { tipo: 'tags' },
};

// Campos de la fila "padre" de un grupo de equivalencia
export const CAMPOS_GRUPO = {
    nombre: { tipo: 'texto', max: 255, requerido: true },
    imagen: { tipo: 'texto', max: 255 },
    stockMinimoGlobal: { tipo: 'entero', min: 0, max: 99999999 },
};

// Convierte texto a número aceptando el formato de Excel en español: "1.234,56", "12,5", "$ 3.50".
export function parseNumero(crudo) {
    if (typeof crudo === 'number') return crudo;
    let s = String(crudo ?? '').replace(/[^\d.,-]/g, '');
    if (!s || s === '-') return NaN;
    const coma = s.lastIndexOf(',');
    const punto = s.lastIndexOf('.');
    if (coma !== -1 && punto !== -1) {
        // El último separador es el decimal; el otro es de miles
        s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (coma !== -1) {
        s = s.replace(',', '.');
    }
    return Number(s);
}

const fallo = (error) => ({ ok: false, error });
const bien = (valor) => ({ ok: true, valor });

// Valida y normaliza un valor para un campo. Devuelve { ok, valor } o { ok:false, error }.
export function validarCampo(campo, crudo, specs = CAMPOS) {
    const spec = specs[campo];
    if (!spec) return fallo(`El campo "${campo}" no se puede editar`);

    const vacio = crudo === '' || crudo === null || crudo === undefined;

    switch (spec.tipo) {
        case 'texto': {
            const v = String(crudo ?? '').trim();
            if (!v) return spec.requerido ? fallo('Es obligatorio') : bien(null);
            if (v.length > spec.max) return fallo(`Máximo ${spec.max} caracteres`);
            return bien(v);
        }
        case 'numero':
        case 'entero': {
            if (vacio) return spec.nullable ? bien(null) : fallo('Es obligatorio');
            let n = parseNumero(crudo);
            if (!Number.isFinite(n)) return fallo('Debe ser un número');
            if (spec.tipo === 'entero') {
                if (!Number.isInteger(n)) return fallo('Debe ser un número entero');
            } else {
                const factor = 10 ** spec.decimales;
                n = Math.round(n * factor) / factor;
            }
            if (n < spec.min) return fallo(`Mínimo ${spec.min}`);
            if (n > spec.max) return fallo(`Máximo ${spec.max}`);
            return bien(n);
        }
        case 'enum': {
            const v = String(crudo ?? '').trim().toLowerCase();
            return spec.valores.includes(v) ? bien(v) : fallo('Valor no permitido');
        }
        case 'fk': {
            if (vacio) return spec.nullable ? bien(null) : fallo('Es obligatorio');
            const n = Number(crudo);
            return Number.isInteger(n) && n > 0 ? bien(n) : fallo('Selección inválida');
        }
        case 'tags': {
            const lista = Array.isArray(crudo) ? crudo : String(crudo ?? '').split(',');
            const limpias = [...new Set(lista.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
            if (limpias.length > 20) return fallo('Máximo 20 etiquetas');
            if (limpias.some((t) => t.length > 50)) return fallo('Cada etiqueta admite hasta 50 caracteres');
            return bien(limpias);
        }
        default:
            return fallo('Tipo de campo desconocido');
    }
}

// ---------------------------------------------------------------------------------------------
// EMPAQUE: bulto -> (cajas) -> unidades
//
// Cómo se vende el insumo médico:
//   · Con CAJA:   la caja trae M unidades y el bulto N cajas        -> unidadesPorBulto = N x M
//   · Sin cajas:  el bulto trae directamente K unidades             -> unidadesPorBulto = K
//   · Sin bulto:  no hay una presentación de bulto, solo la individual (o la caja, si tiene) -> unidadesPorBulto = NULL
// `presentacion` es lo que es UNA unidad (unidad, par, paquete x2, paquete x4): en ella se cuenta el stock y están el costo y los precios.
// La caja es independiente: una jeringa se vende por unidad al detal y a la vez viene en cajas de 100 y bultos de 30 cajas.
// `unidadesPorBulto` es SIEMPRE el total de unidades del bulto (o NULL si no viene en bulto); `cajasPorBulto` solo existe si hay cajas.
// ---------------------------------------------------------------------------------------------
const UNIDADES_FIJAS = { unidad: 1, par: 2, ...Object.fromEntries(PAQUETES.map((n) => [`paqx${n}`, n])), cx100: 100, cx200: 200, metro: 1, rollo: 1 };

// Unidades individuales que trae UNA presentación de venta (null si no se puede saber)
export function unidadesPorPresentacion(f) {
    return UNIDADES_FIJAS[f.presentacion] ?? 1;
}

// COSTO: `costoUsd` es el costo de UNA UNIDAD (un guante, una jeringa). El stock y los precios también
// están por unidad. El costo de una caja o de un bulto se DERIVA multiplicando por sus unidades.
const por = (costo, unidades) => (costo === null || costo === undefined || !(unidades > 0) ? null : costo * unidades);
export const costoPorCaja = (f) => por(f.costoUsd, f.unidadesPorCaja);
export const costoPorBulto = (f) => por(f.costoUsd, f.unidadesPorBulto);
export const costoPorPresentacion = (f) => por(f.costoUsd, unidadesPorPresentacion(f));

// Aplica las reglas de empaque a un conjunto de cambios sobre un producto existente y devuelve
// los cambios definitivos (con los campos derivados ya calculados) o un error explicativo.
export function resolverEmpaque(actual, cambios) {
    const toca = ['presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto'].some((k) => k in cambios);
    if (!toca) return { cambios };

    const m = { ...actual, ...cambios };
    const salida = { ...cambios };

    if (m.unidadesPorCaja) {
        // Con caja, el total del bulto se calcula (cajas x unidades por caja)
        const soloTotal = 'unidadesPorBulto' in cambios && !['unidadesPorCaja', 'cajasPorBulto'].some((k) => k in cambios);
        if (soloTotal) return { error: 'Con unidades por caja el total del bulto se calcula: edita "Cajas/bulto" o "Und/caja"' };
        // Al agregar la caja a un producto que ya traía bulto (sin cajas), las cajas salen de dividir: 5000 und / 100 por caja = 50 cajas
        const yaTraiaBulto = !actual.unidadesPorCaja && !('cajasPorBulto' in cambios) && actual.unidadesPorBulto > 1 && actual.unidadesPorBulto % m.unidadesPorCaja === 0;
        const cajas = m.cajasPorBulto || (yaTraiaBulto ? actual.unidadesPorBulto / m.unidadesPorCaja : 1);
        salida.cajasPorBulto = cajas;
        salida.unidadesPorBulto = cajas * m.unidadesPorCaja;
    } else {
        if (cambios.cajasPorBulto) return { error: '"Cajas/bulto" necesita "Und/caja": llena primero cuántas unidades trae la caja' };
        if ('unidadesPorCaja' in cambios) salida.cajasPorBulto = null; // se quitó la caja: el bulto conserva su total de unidades
    }
    return { cambios: salida };
}
