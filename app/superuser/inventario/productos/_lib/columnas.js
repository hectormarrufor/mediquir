import { PRESENTACIONES, costoPorCaja, costoPorBulto } from '@/app/constants/inventarioCampos';

// Definición de las columnas de la hoja de inventario.
//   campo    -> campo real que se guarda (coincide con app/constants/inventarioCampos.js)
//   orden    -> clave de ordenamiento en el servidor
//   fuente   -> de dónde salen las opciones de una celda desplegable
//   virtual  -> columna calculada que también se puede editar: convierte lo escrito al campo real
//               (p. ej. escribir el "costo por caja" guarda costoUsd = costo por caja / unidades por caja)
//
// COSTO: `costoUsd` es el costo de UNA unidad. El costo por caja y por bulto se derivan de él.
export const COLUMNAS = [
    { key: 'imagen', label: '', ancho: 56, tipo: 'imagen', fija: true },
    { key: 'codigo', label: 'Código', ancho: 110, tipo: 'texto', campo: 'codigo', orden: 'codigo', sticky: true },
    { key: 'codigoBarras', label: 'Cód. barras', ancho: 150, tipo: 'texto', campo: 'codigoBarras', ayuda: 'Código de barras impreso en el empaque del producto (sirve para verificar el empaque de pedidos). Déjalo vacío si el producto no trae.' },
    { key: 'nombre', label: 'Producto', ancho: 300, tipo: 'texto', campo: 'nombre', orden: 'nombre', sticky: true },
    { key: 'categoriaId', label: 'Categoría', ancho: 150, tipo: 'select', campo: 'categoriaId', fuente: 'categorias', orden: 'categoria', ver: (r) => r.categoria?.nombre },
    { key: 'marcaId', label: 'Marca', ancho: 140, tipo: 'select', campo: 'marcaId', fuente: 'marcas', orden: 'marca', ver: (r) => r.marca?.nombre },
    { key: 'grupoEquivalenciaId', label: 'Grupo', ancho: 190, tipo: 'select', campo: 'grupoEquivalenciaId', fuente: 'grupos', ver: (r) => r.grupo?.nombre },
    { key: 'stockAlmacen', label: 'Stock', ancho: 92, tipo: 'numero', campo: 'stockAlmacen', orden: 'stockAlmacen', decimales: [0, 2], derecha: true, ayuda: 'Existencias en unidades' },
    { key: 'stockMinimo', label: 'Mínimo', ancho: 92, tipo: 'numero', campo: 'stockMinimo', orden: 'stockMinimo', decimales: [0, 2], derecha: true },
    { key: 'costoUsd', label: 'Costo/und $', ancho: 108, tipo: 'numero', campo: 'costoUsd', orden: 'costoUsd', decimales: [2, 5], derecha: true, ayuda: 'Costo de UNA unidad' },
    {
        key: 'costoCaja', label: 'Costo/caja $', ancho: 110, tipo: 'numero', derecha: true, decimales: [2, 3],
        ayuda: 'Costo por unidad × unidades por caja (solo productos en caja)',
        virtual: { campo: 'costoUsd', ver: costoPorCaja, aReal: (v, f) => por(v, f.unidadesPorCaja, true) },
    },
    {
        key: 'costoBulto', label: 'Costo/bulto $', ancho: 116, tipo: 'numero', derecha: true, decimales: [2, 3],
        ayuda: 'Costo por unidad × unidades por bulto',
        virtual: { campo: 'costoUsd', ver: costoPorBulto, aReal: (v, f) => por(v, f.unidadesPorBulto, true) },
    },
    { key: 'precio6', label: 'Precio 6 $', ancho: 100, tipo: 'numero', campo: 'precio6', orden: 'precio6', decimales: [2, 3], derecha: true },
    { key: 'precio7', label: 'Precio 7 $', ancho: 100, tipo: 'numero', campo: 'precio7', orden: 'precio7', decimales: [2, 3], derecha: true },
    { key: 'porcentajeDescuento', label: '% Dto.', ancho: 80, tipo: 'numero', campo: 'porcentajeDescuento', orden: 'porcentajeDescuento', decimales: [0, 0], derecha: true },
    { key: 'margen', label: 'Margen', ancho: 84, tipo: 'derivada', orden: 'margen', derecha: true },
    { key: 'valor', label: 'Valor inv. $', ancho: 104, tipo: 'derivada', orden: 'valor', derecha: true },
    { key: 'porcentajeIva', label: '% IVA', ancho: 76, tipo: 'numero', campo: 'porcentajeIva', decimales: [0, 2], derecha: true },
    { key: 'presentacion', label: 'Presentación', ancho: 130, tipo: 'select', campo: 'presentacion', fuente: 'presentaciones', ver: (r) => PRESENTACIONES.find((p) => p.value === r.presentacion)?.label },
    { key: 'unidadesPorCaja', label: 'Und/caja', ancho: 90, tipo: 'numero', campo: 'unidadesPorCaja', decimales: [0, 0], derecha: true, ayuda: 'Unidades que trae cada caja' },
    { key: 'cajasPorBulto', label: 'Cajas/bulto', ancho: 98, tipo: 'numero', campo: 'cajasPorBulto', decimales: [0, 0], derecha: true, ayuda: 'Cajas que trae el bulto' },
    { key: 'unidadesPorBulto', label: 'Und/bulto', ancho: 96, tipo: 'numero', campo: 'unidadesPorBulto', decimales: [0, 0], derecha: true, ayuda: 'Total de unidades del bulto (con cajas: cajas × und/caja)' },
    { key: 'tags', label: 'Etiquetas', ancho: 200, tipo: 'tags', campo: 'tags' },
    { key: 'updatedAt', label: 'Modificado', ancho: 120, tipo: 'derivada', orden: 'updatedAt' },
    { key: 'acciones', label: '', ancho: 52, tipo: 'acciones', fija: true },
];

// multiplica (o divide) por el factor de empaque; null si el factor no se puede saber
function por(valor, factor, dividir = false) {
    if (!(factor > 0) || valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
    return dividir ? Number(valor) / factor : Number(valor) * factor;
}

// Columnas visibles al entrar (las demás se activan desde el menú "Columnas")
export const VISIBLES_POR_DEFECTO = COLUMNAS
    .filter((c) => !['porcentajeIva', 'valor', 'tags'].includes(c.key))
    .map((c) => c.key);

const numeroVE = (v, [min, max]) =>
    v === null || v === undefined || Number.isNaN(v) ? '' : Number(v).toLocaleString('es-VE', { minimumFractionDigits: min, maximumFractionDigits: max });

// Texto que se muestra en una celda numérica
export const formatearNumero = (v, col) => numeroVE(v, col.decimales || [0, 2]);

// Texto inicial al editar una celda numérica (coma decimal, como en Excel en español)
export const textoEdicion = (v) => (v === null || v === undefined ? '' : String(Math.round(v * 100000) / 100000).replace('.', ','));

export const margen = (r) => (r.costoUsd > 0 && r.precio7 !== null ? (r.precio7 - r.costoUsd) / r.costoUsd : null);
export const valorInventario = (r) => (r.stockAlmacen ?? 0) * (r.costoUsd ?? 0);

export const estadoDe = (stock, minimo) => {
    const s = Number(stock) || 0;
    if (s <= 0) return 'agotado';
    return s <= (Number(minimo) || 0) ? 'bajo' : 'ok';
};

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Opciones { value, label } de una celda desplegable
export function opcionesDe(col, opciones) {
    switch (col.fuente) {
        case 'categorias': return (opciones?.categorias || []).map((o) => ({ value: String(o.id), label: o.nombre }));
        case 'marcas': return (opciones?.marcas || []).map((o) => ({ value: String(o.id), label: o.nombre }));
        case 'grupos': return (opciones?.grupos || []).map((o) => ({ value: String(o.id), label: o.nombre }));
        case 'presentaciones': return PRESENTACIONES;
        default: return [];
    }
}

// Texto pegado -> valor de la opción (por etiqueta o por valor), '' si está vacío, null si no existe
export function resolverOpcion(col, texto, opciones) {
    const t = sinAcentos(texto);
    if (!t) return '';
    const hallada = opcionesDe(col, opciones).find((o) => sinAcentos(o.label) === t || sinAcentos(o.value) === t);
    return hallada ? hallada.value : null;
}

// ---------------------------------------------------------------------------------------------
// Filas de la hoja: cada grupo de equivalencia es una fila "padre" seguida de sus hermanos.
// ---------------------------------------------------------------------------------------------
export function aplanarEntradas(entries, contraidos) {
    const items = [];
    entries.forEach((e) => {
        if (e.tipo === 'producto') { items.push({ k: 'simple', key: `p${e.fila.id}`, fila: e.fila }); return; }
        items.push({ k: 'grupo', key: `g${e.grupo.id}`, grupo: e.grupo, cerrado: contraidos.has(e.grupo.id), nHijos: e.filas.length });
        if (!contraidos.has(e.grupo.id)) e.filas.forEach((f) => items.push({ k: 'hijo', key: `p${f.id}`, fila: f, grupo: e.grupo }));
    });
    return items;
}

// ¿Se puede editar esta celda y qué se guarda realmente? -> { tabla, campo } o null
export function editableEn(item, col) {
    if (item.k === 'grupo') {
        if (col.key === 'nombre') return { tabla: 'grupo', campo: 'nombre' };
        if (col.key === 'stockMinimo') return { tabla: 'grupo', campo: 'stockMinimoGlobal' };
        return null;
    }
    const f = item.fila;
    // Con grupo, el mínimo vale el del grupo
    if (col.key === 'stockMinimo' && item.k === 'hijo') return null;
    if (col.key === 'unidadesPorCaja' || col.key === 'cajasPorBulto') return f.presentacion === 'caja' ? { tabla: 'producto', campo: col.campo } : null;
    // Con cajas, las unidades del bulto se calculan (cajas x und/caja)
    if (col.key === 'unidadesPorBulto') return f.presentacion === 'caja' ? null : { tabla: 'producto', campo: 'unidadesPorBulto' };
    if (col.virtual) return col.virtual.aReal(1, f) === null ? null : { tabla: 'producto', campo: col.virtual.campo, virtual: col.virtual };
    return col.campo ? { tabla: 'producto', campo: col.campo } : null;
}

// Valor a mostrar de una celda de un producto (aplica columnas virtuales)
export function valorDe(fila, col) {
    if (col.virtual) return col.virtual.ver(fila);
    if (col.campo) return fila[col.campo];
    return null;
}
