// Columnas que se pueden exportar a Excel desde la hoja de inventario. Las usan el diálogo que pregunta qué columnas
// exportar (clave, nombre y sección) y el servidor que arma el archivo (valor de cada celda), para que nunca discrepen.
//   tipo: 'texto' (se guarda como texto: los códigos de barras no se vuelven 7,59E+12) | 'numero' | 'fecha'
//   valor(fila, entrada): `entrada` es el grupo de equivalencia o el producto suelto del que sale la fila
//   porDefecto: viene marcada la primera vez (después se recuerda lo que eligió cada persona)
import { PRESENTACIONES, costoPorCaja, costoPorBulto } from './inventarioCampos';

export const SECCIONES_EXPORTACION = ['Producto', 'Existencias', 'Costos y precios', 'Empaque', 'Códigos de barras', 'Otros'];

const margen = (r) => (r.costoUsd > 0 && r.precio7 !== null && r.precio7 !== undefined ? ((r.precio7 - r.costoUsd) / r.costoUsd) * 100 : null);

export const COLUMNAS_EXPORTACION = [
    { key: 'codigo', label: 'Código', seccion: 'Producto', tipo: 'texto', ancho: 14, porDefecto: true, valor: (r) => r.codigo },
    { key: 'nombre', label: 'Producto', seccion: 'Producto', tipo: 'texto', ancho: 48, porDefecto: true, valor: (r) => r.nombre },
    { key: 'categoria', label: 'Categoría', seccion: 'Producto', tipo: 'texto', ancho: 22, porDefecto: true, valor: (r) => r.categoria?.nombre },
    { key: 'marca', label: 'Marca', seccion: 'Producto', tipo: 'texto', ancho: 18, porDefecto: true, valor: (r) => r.marca?.nombre },
    { key: 'grupo', label: 'Grupo de equivalencia', seccion: 'Producto', tipo: 'texto', ancho: 28, porDefecto: true, valor: (r) => r.grupo?.nombre },
    { key: 'etiquetas', label: 'Etiquetas', seccion: 'Producto', tipo: 'texto', ancho: 28, valor: (r) => (r.tags || []).map((t) => t.nombre).join(', ') },

    { key: 'stock', label: 'Stock', seccion: 'Existencias', tipo: 'numero', ancho: 10, porDefecto: true, valor: (r) => r.stockAlmacen },
    { key: 'stockMinimo', label: 'Stock mínimo (grupo o propio)', seccion: 'Existencias', tipo: 'numero', ancho: 14, porDefecto: true, valor: (r, e) => (e?.tipo === 'grupo' ? e.grupo.stockMinimoGlobal : r.stockMinimo) },
    { key: 'valorInventario', label: 'Valor del inventario USD (stock × costo)', seccion: 'Existencias', tipo: 'numero', ancho: 16, valor: (r) => (r.stockAlmacen ?? 0) * (r.costoUsd ?? 0) },

    { key: 'costoUsd', label: 'Costo por unidad USD', seccion: 'Costos y precios', tipo: 'numero', ancho: 14, porDefecto: true, valor: (r) => r.costoUsd },
    { key: 'costoCaja', label: 'Costo por caja USD', seccion: 'Costos y precios', tipo: 'numero', ancho: 14, porDefecto: true, valor: (r) => costoPorCaja(r) },
    { key: 'costoBulto', label: 'Costo por bulto USD', seccion: 'Costos y precios', tipo: 'numero', ancho: 14, porDefecto: true, valor: (r) => costoPorBulto(r) },
    { key: 'precio6', label: 'Precio 6 USD', seccion: 'Costos y precios', tipo: 'numero', ancho: 11, porDefecto: true, valor: (r) => r.precio6 },
    { key: 'precio7', label: 'Precio 7 USD', seccion: 'Costos y precios', tipo: 'numero', ancho: 11, porDefecto: true, valor: (r) => r.precio7 },
    { key: 'descuento', label: '% Descuento', seccion: 'Costos y precios', tipo: 'numero', ancho: 11, porDefecto: true, valor: (r) => r.porcentajeDescuento },
    { key: 'iva', label: '% IVA', seccion: 'Costos y precios', tipo: 'numero', ancho: 8, porDefecto: true, valor: (r) => r.porcentajeIva },
    { key: 'margen', label: '% Margen (precio 7 sobre costo)', seccion: 'Costos y precios', tipo: 'numero', ancho: 14, valor: margen },

    { key: 'presentacion', label: 'Presentación', seccion: 'Empaque', tipo: 'texto', ancho: 14, porDefecto: true, valor: (r) => PRESENTACIONES.find((p) => p.value === r.presentacion)?.label || r.presentacion },
    { key: 'unidadesPorCaja', label: 'Und por caja', seccion: 'Empaque', tipo: 'numero', ancho: 11, porDefecto: true, valor: (r) => r.unidadesPorCaja },
    { key: 'cajasPorBulto', label: 'Cajas por bulto', seccion: 'Empaque', tipo: 'numero', ancho: 12, porDefecto: true, valor: (r) => r.cajasPorBulto },
    { key: 'unidadesPorBulto', label: 'Und por bulto', seccion: 'Empaque', tipo: 'numero', ancho: 12, porDefecto: true, valor: (r) => r.unidadesPorBulto },

    { key: 'codigoBarras', label: 'Código de barras (unidad)', seccion: 'Códigos de barras', tipo: 'texto', ancho: 18, valor: (r) => r.codigoBarras },
    { key: 'codigoBarrasCaja', label: 'Código de barras (caja)', seccion: 'Códigos de barras', tipo: 'texto', ancho: 18, valor: (r) => r.codigoBarrasCaja },
    { key: 'codigoBarrasBulto', label: 'Código de barras (bulto)', seccion: 'Códigos de barras', tipo: 'texto', ancho: 18, valor: (r) => r.codigoBarrasBulto },

    { key: 'modificado', label: 'Modificado', seccion: 'Otros', tipo: 'fecha', ancho: 17, porDefecto: true, valor: (r) => r.updatedAt },
];

export const EXPORTACION_POR_DEFECTO = COLUMNAS_EXPORTACION.filter((c) => c.porDefecto).map((c) => c.key);

// Lo que pidió la persona, en el orden de la lista (claves desconocidas se ignoran; nada válido = las de siempre)
export function columnasPedidas(texto) {
    const pedidas = new Set(String(texto || '').split(',').map((s) => s.trim()).filter(Boolean));
    const elegidas = COLUMNAS_EXPORTACION.filter((c) => pedidas.has(c.key));
    return elegidas.length ? elegidas : COLUMNAS_EXPORTACION.filter((c) => c.porDefecto);
}
