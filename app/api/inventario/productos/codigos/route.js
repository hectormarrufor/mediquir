import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { GrupoEquivalencia, Marca, Producto } from '@/models';
import { imagenDe } from '@/app/api/ventas/_empaque';
import { presentacionesDe } from '@/app/constants/presentaciones';
import { puedeEditarInventario, requerirStaff } from '../../_lib';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 30;
const COLUMNAS_BARRAS = ['codigoBarras', 'codigoBarrasCaja', 'codigoBarrasBulto'];
const CAMPO_DE_NIVEL = { UNIDAD: 'codigoBarras', CAJA: 'codigoBarrasCaja', BULTO: 'codigoBarrasBulto' };
const vacio = (c) => ({ [Op.or]: [{ [c]: null }, { [c]: '' }] });
const lleno = (c) => ({ [c]: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } });

// Escapa % _ \ para que la búsqueda trate el texto literalmente
const like = (texto) => `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Lista ligera de productos para cargar sus códigos de barras desde el teléfono.
//   ?filtro=sin|todos  ?q=texto (nombre, código interno, código de barras o marca)  ?limite=30
// Devuelve el progreso (cuántos ya tienen código de barras) y los productos, los que no tienen primero.
export async function GET(request) {
    const { sesion, error } = await requerirStaff();
    if (error) return error;

    try {
        const p = new URL(request.url).searchParams;
        const filtro = p.get('filtro') === 'todos' ? 'todos' : 'sin';
        const q = String(p.get('q') || '').trim().slice(0, 100);
        const limite = Math.min(Math.max(parseInt(p.get('limite'), 10) || POR_PAGINA, 1), 300);

        const where = [];
        // "Sin código": no tiene ninguno en ninguna presentación
        if (filtro === 'sin') COLUMNAS_BARRAS.forEach((c) => where.push(vacio(c)));
        q.split(/\s+/).filter(Boolean).forEach((palabra) => {
            const patron = like(palabra);
            where.push({ [Op.or]: [
                { nombre: { [Op.iLike]: patron } }, { codigo: { [Op.iLike]: patron } }, ...COLUMNAS_BARRAS.map((c) => ({ [c]: { [Op.iLike]: patron } })), { '$marca.nombre$': { [Op.iLike]: patron } },
            ] });
        });

        const [total, conCodigo, filas] = await Promise.all([
            Producto.count(),
            Producto.count({ where: { [Op.or]: COLUMNAS_BARRAS.map(lleno) } }),
            Producto.findAll({
                where: { [Op.and]: where },
                attributes: ['id', 'nombre', 'codigo', ...COLUMNAS_BARRAS, 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto', 'imagen'],
                include: [
                    { model: Marca, as: 'marca', attributes: ['nombre', 'imagen'] },
                    { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['imagen'] },
                ],
                order: [['nombre', 'ASC']],
                limit: limite + 1, // uno de más para saber si hay más resultados
            }),
        ]);

        return NextResponse.json({
            total, conCodigo,
            puedeEditar: await puedeEditarInventario(sesion),
            hayMas: filas.length > limite,
            productos: filas.slice(0, limite).map((f) => ({
                id: f.id, nombre: f.nombre, codigo: f.codigo,
                // Un renglón por presentación que el producto tiene (unidad siempre; caja y bulto si su ficha los define)
                niveles: presentacionesDe(f.toJSON()).map((n) => ({ clave: n.clave, etiqueta: n.etiqueta, campo: CAMPO_DE_NIVEL[n.clave], codigo: f[CAMPO_DE_NIVEL[n.clave]] || null })),
                marca: f.marca?.nombre || null, imagen: imagenDe(f),
            })),
        });
    } catch (err) {
        console.error('Códigos de barras:', err);
        return NextResponse.json({ error: 'No se pudo cargar la lista de productos' }, { status: 500 });
    }
}
