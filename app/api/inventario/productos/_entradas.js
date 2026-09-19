import { Producto, Categoria, Marca } from '@/models';
import { cargarGrupos, estadoDe } from '../_grupos';

// La lista se pagina por ENTRADAS: cada grupo de equivalencia (con todos sus hermanos) es UNA entrada,
// y cada producto que no pertenece a ningún grupo es otra. Así un grupo nunca se parte entre páginas.
//
// Se calcula en memoria sobre columnas livianas: el filtrado pesado (búsqueda, marca, etiqueta...) ya
// lo hizo la base de datos. Con unos pocos miles de productos cuesta milisegundos; si el catálogo
// llegara a decenas de miles convendría pasar este agrupado a SQL.

const num = (v) => (v === null || v === undefined ? null : Number(v));
const texto = (v) => String(v ?? '').toLowerCase();

const ATRIBUTOS = ['id', 'codigo', 'nombre', 'stockAlmacen', 'stockMinimo', 'costoUsd', 'precio6', 'precio7', 'porcentajeDescuento', 'grupoEquivalenciaId', 'updatedAt'];
const margen = (p) => (p.costoUsd > 0 && p.precio7 !== null ? (p.precio7 - p.costoUsd) / p.costoUsd : null);

// Valor de un producto para ordenar por `sort`
function valorProducto(p, sort) {
    switch (sort) {
        case 'nombre': return texto(p.nombre);
        case 'codigo': return texto(p.codigo);
        case 'categoria': return texto(p.categoria);
        case 'marca': return texto(p.marca);
        case 'valor': return (p.stockAlmacen ?? 0) * (p.costoUsd ?? 0);
        case 'margen': return margen(p);
        case 'updatedAt': return new Date(p.updatedAt).getTime();
        default: return p[sort] ?? null; // stockAlmacen, stockMinimo, costoUsd, precio6, precio7, porcentajeDescuento
    }
}

// Valor de una entrada: para un grupo, el de su conjunto (stock total, mínimo del grupo, el precio
// más bajo o más alto de sus hijos según el sentido del orden...)
function valorEntrada(e, sort, dir) {
    if (e.tipo === 'producto') return valorProducto(e.producto, sort);
    const g = e.grupo;
    const hijos = e.hijos.map((h) => valorProducto(h, sort));
    const extremo = (arr) => {
        const v = arr.filter((x) => x !== null && x !== undefined);
        if (!v.length) return null;
        return dir === 'ASC' ? v.reduce((a, b) => (a < b ? a : b)) : v.reduce((a, b) => (a > b ? a : b));
    };
    switch (sort) {
        case 'nombre': return texto(g.nombre);
        case 'categoria': return texto(g.categoria);
        case 'stockAlmacen': return g.stockTotal;
        case 'stockMinimo': return g.stockMinimoGlobal;
        case 'valor': return hijos.reduce((a, b) => a + (b || 0), 0);
        case 'updatedAt': return g.actualizado ? new Date(g.actualizado).getTime() : extremo(hijos);
        case 'codigo':
        case 'marca': return extremo(hijos);
        default: return extremo(hijos);
    }
}

const comparar = (a, b, dir) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;   // nulos siempre al final
    if (b === null || b === undefined) return -1;
    const r = typeof a === 'string' ? a.localeCompare(b, 'es') : a - b;
    return dir === 'ASC' ? r : -r;
};

// Devuelve TODAS las entradas que cumplen los filtros, ya ordenadas (sin paginar)
export async function obtenerEntradas(f, where) {
    const [filas, grupos] = await Promise.all([
        Producto.findAll({
            attributes: ATRIBUTOS,
            include: [
                { model: Categoria, as: 'categoria', attributes: ['nombre'] },
                { model: Marca, as: 'marca', attributes: ['nombre'] },
            ],
            where,
            subQuery: false,
        }),
        cargarGrupos(),
    ]);

    const productos = filas.map((p) => {
        const j = p.toJSON();
        return {
            id: j.id, codigo: j.codigo, nombre: j.nombre, updatedAt: j.updatedAt, grupoId: j.grupoEquivalenciaId,
            stockAlmacen: num(j.stockAlmacen), stockMinimo: num(j.stockMinimo), costoUsd: num(j.costoUsd),
            precio6: num(j.precio6), precio7: num(j.precio7), porcentajeDescuento: num(j.porcentajeDescuento) ?? 0,
            categoria: j.categoria?.nombre, marca: j.marca?.nombre,
        };
    });

    const porGrupo = new Map();
    const entradas = [];
    productos.forEach((p) => {
        if (p.grupoId && grupos.has(p.grupoId)) {
            if (!porGrupo.has(p.grupoId)) porGrupo.set(p.grupoId, []);
            porGrupo.get(p.grupoId).push(p);
        } else {
            entradas.push({ tipo: 'producto', producto: p, estado: estadoDe(p.stockAlmacen, p.stockMinimo) });
        }
    });
    porGrupo.forEach((hijos, id) => {
        const grupo = grupos.get(id);
        entradas.push({ tipo: 'grupo', grupo, hijos, estado: grupo.estado });
    });

    const visibles = f.stock ? entradas.filter((e) => e.estado === f.stock) : entradas;

    visibles.forEach((e) => { e.orden = valorEntrada(e, f.sort, f.dir); e.nombreOrden = texto(e.tipo === 'grupo' ? e.grupo.nombre : e.producto.nombre); });
    visibles.sort((a, b) => comparar(a.orden, b.orden, f.dir) || comparar(a.nombreOrden, b.nombreOrden, 'ASC'));

    // Dentro de cada grupo, los hermanos siguen el mismo criterio de orden
    visibles.forEach((e) => {
        if (e.tipo !== 'grupo') return;
        e.hijos.sort((a, b) => comparar(valorProducto(a, f.sort), valorProducto(b, f.sort), f.dir) || comparar(texto(a.nombre), texto(b.nombre), 'ASC'));
    });

    return visibles;
}

export const idsDeEntradas = (entradas) => entradas.flatMap((e) => (e.tipo === 'grupo' ? e.hijos.map((h) => h.id) : [e.producto.id]));
export const contarProductos = (entradas) => entradas.reduce((s, e) => s + (e.tipo === 'grupo' ? e.hijos.length : 1), 0);
