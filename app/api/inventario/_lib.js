import { NextResponse } from 'next/server';
import { Categoria, Marca, GrupoEquivalencia, MenuPermission, sequelize } from '@/models';
import { getSesion } from '../notificaciones/_lib';

// Clave del permiso "editar inventario como hoja de cálculo" en la tabla menu_permissions.
// Se administra desde el mismo panel de Control de Accesos que el resto de módulos.
export const CLAVE_EDITAR = 'inventario:editar';

// Exige sesión de personal (los clientes de la tienda no ven costos ni inventario).
export async function requerirStaff() {
    const sesion = await getSesion();
    if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (sesion.clienteId) return { error: NextResponse.json({ error: 'Acceso restringido al personal' }, { status: 403 }) };
    return { sesion };
}

const nombres = (lista, campo = 'nombre') =>
    (Array.isArray(lista) ? lista : []).map((x) => String(x?.[campo] ?? x ?? '').toLowerCase()).filter(Boolean);

// Admin, o coincidencia por usuario / departamento / puesto (misma regla que el panel de accesos).
export async function puedeEditarInventario(sesion) {
    if (sesion.isAdmin) return true;

    const permiso = await MenuPermission.findOne({ where: { href: CLAVE_EDITAR }, attributes: ['allowedDepartments', 'allowedPositions', 'allowedUsers'] });
    if (!permiso) return false;

    if ((permiso.allowedUsers || []).map(Number).includes(Number(sesion.id))) return true;

    const misDeptos = nombres(sesion.departamentos);
    const misPuestos = nombres(sesion.puestos);
    const coincide = (permitidos, propios) =>
        (permitidos || []).some((p) => propios.some((mio) => mio.includes(String(p).toLowerCase())));

    return coincide(permiso.allowedDepartments, misDeptos) || coincide(permiso.allowedPositions, misPuestos);
}

// Includes comunes: solo relaciones belongsTo, así una fila de producto = una fila SQL (paginación correcta).
export const INCLUDES = [
    { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
    { model: Marca, as: 'marca', attributes: ['id', 'nombre', 'imagen'] },
    { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre', 'imagen', 'stockMinimoGlobal'] },
];

const num = (v) => (v === null || v === undefined ? null : Number(v));

// Fila plana y con números reales (Sequelize devuelve los DECIMAL como texto)
export function filaProducto(p, tags = []) {
    const j = p.toJSON ? p.toJSON() : p;
    return {
        id: j.id,
        codigo: j.codigo,
        nombre: j.nombre,
        imagen: j.imagen,
        stockAlmacen: num(j.stockAlmacen),
        stockMinimo: num(j.stockMinimo),
        costoUsd: num(j.costoUsd),
        precio6: num(j.precio6),
        precio7: num(j.precio7),
        porcentajeDescuento: num(j.porcentajeDescuento) ?? 0,
        porcentajeIva: num(j.porcentajeIva),
        presentacion: j.presentacion,
        unidadesPorCaja: num(j.unidadesPorCaja),
        cajasPorBulto: num(j.cajasPorBulto),
        unidadesPorBulto: num(j.unidadesPorBulto),
        categoriaId: j.categoriaId,
        marcaId: j.marcaId,
        grupoEquivalenciaId: j.grupoEquivalenciaId,
        categoria: j.categoria || null,
        marca: j.marca || null,
        grupo: j.grupoEquivalencia ? { id: j.grupoEquivalencia.id, nombre: j.grupoEquivalencia.nombre } : null,
        tags,
        updatedAt: j.updatedAt,
    };
}

// Etiquetas de un conjunto de productos en UNA consulta (evita el JOIN muchos-a-muchos en la paginación)
export async function tagsPorProducto(ids) {
    const mapa = new Map();
    if (!ids.length) return mapa;
    const filas = await sequelize.query(
        `SELECT pt."productoId" AS "productoId", t."id" AS "id", t."nombre" AS "nombre"
         FROM "ProductoTags" pt JOIN "Tags" t ON t."id" = pt."tagId"
         WHERE pt."productoId" IN (:ids) ORDER BY t."nombre"`,
        { replacements: { ids }, type: 'SELECT' }
    );
    filas.forEach((f) => {
        if (!mapa.has(f.productoId)) mapa.set(f.productoId, []);
        mapa.get(f.productoId).push({ id: f.id, nombre: f.nombre });
    });
    return mapa;
}
