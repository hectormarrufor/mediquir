import { Op } from 'sequelize';
import { Producto, Tag, sequelize } from '@/models';
import { validarCampo, resolverEmpaque } from '@/app/constants/inventarioCampos';
import { INCLUDES, filaProducto, tagsPorProducto } from '../_lib';
import { cargarGrupos } from '../_grupos';
import { construirUpdate } from './_sql';

const MAX_ITEMS = 200;
const CAMPOS_BARRAS = ['codigoBarras', 'codigoBarrasCaja', 'codigoBarrasBulto'];

// Valida cada cambio y las reglas entre campos (empaque, mínimo de grupo, etiquetas)
async function validar(items) {
    const errores = [];
    const validos = [];
    const ids = [...new Set(items.map((i) => Number(i?.id)).filter(Number.isInteger))];
    const actuales = new Map(
        (await Producto.findAll({ where: { id: ids }, attributes: ['id', 'presentacion', 'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto', 'grupoEquivalenciaId', 'codigoBarras', 'codigoBarrasCaja', 'codigoBarrasBulto'] })).map((p) => [p.id, p.toJSON()])
    );

    const vistosEnLote = new Set(); // códigos de barras ya vistos en este mismo lote (pegado masivo)
    for (const item of items) {
        const id = Number(item?.id);
        const actual = actuales.get(id);
        if (!actual) { errores.push({ id, error: 'Producto no encontrado' }); continue; }

        let cambios = {};
        let tags;
        let mensaje = null;
        for (const [campo, crudo] of Object.entries(item.cambios || {})) {
            const r = validarCampo(campo, crudo);
            if (!r.ok) { mensaje = `${campo}: ${r.error}`; break; }
            if (campo === 'tags') tags = r.valor;
            else cambios[campo] = r.valor;
        }
        if (!mensaje && Object.keys(cambios).length === 0 && tags === undefined) mensaje = 'No hay cambios';

        // Códigos de barras (unidad, caja, bulto): sin espacios, y no pueden ser los de otro producto ni repetirse entre niveles
        // (el empaque los usa para reconocer el producto y el nivel)
        for (const campo of CAMPOS_BARRAS) {
            if (mensaje || typeof cambios[campo] !== 'string') continue;
            const valor = cambios[campo].replace(/\s+/g, '');
            cambios[campo] = valor;
            if (!valor) continue;
            const finales = { ...actual, ...cambios };
            if (CAMPOS_BARRAS.some((otro) => otro !== campo && finales[otro] === valor)) { mensaje = 'El mismo producto no puede usar el mismo código en dos presentaciones'; break; }
            if (vistosEnLote.has(valor)) { mensaje = 'Ese código de barras se repite en los productos que estás editando'; break; }
            vistosEnLote.add(valor);
            const otro = await Producto.findOne({ where: { id: { [Op.ne]: id }, [Op.or]: CAMPOS_BARRAS.map((c) => ({ [c]: valor })) }, attributes: ['nombre'] });
            if (otro) mensaje = `Ese código de barras ya está registrado en "${otro.nombre}"`;
        }

        // Con grupo de equivalencia, el mínimo que vale es el del grupo
        const grupoFinal = 'grupoEquivalenciaId' in cambios ? cambios.grupoEquivalenciaId : actual.grupoEquivalenciaId;
        if (!mensaje && 'stockMinimo' in cambios && grupoFinal) mensaje = 'Este producto pertenece a un grupo: su stock mínimo se define en el grupo';

        if (!mensaje) {
            const r = resolverEmpaque(actual, cambios);
            if (r.error) mensaje = r.error;
            else cambios = r.cambios;
        }

        if (mensaje) errores.push({ id, error: mensaje });
        else validos.push({ id, cambios, tags, esperado: item.esperado?.stockAlmacen, grupoAnterior: actual.grupoEquivalenciaId });
    }
    return { validos, errores };
}

// Reemplaza las etiquetas de un producto (crea las que no existan)
async function sincronizarTags(productoId, nombres, transaction) {
    const instancias = await Promise.all(nombres.map(async (nombre) => (await Tag.findOrCreate({ where: { nombre }, transaction }))[0]));
    const producto = await Producto.findByPk(productoId, { transaction });
    await producto.setTags(instancias, { transaction });
}

// Aplica una lista de cambios y devuelve las filas ya recalculadas (y los totales de los grupos afectados)
// para que la UI se sincronice sin volver a pedir toda la lista.
export async function aplicarLote(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
        return { error: `Envía entre 1 y ${MAX_ITEMS} productos`, status: 400 };
    }

    const { validos, errores } = await validar(items);

    // Agrupa por conjunto de campos: pegar un bloque de N filas x M columnas = una sola sentencia
    const grupos = new Map();
    validos.filter((i) => Object.keys(i.cambios).length).forEach((i) => {
        const clave = Object.keys(i.cambios).sort().join(',');
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(i);
    });
    const soloTags = validos.filter((i) => i.tags !== undefined && Object.keys(i.cambios).length === 0);

    const actualizados = new Set();
    try {
        await sequelize.transaction(async (transaction) => {
            for (const [clave, grupo] of grupos) {
                const [filas] = await sequelize.query(construirUpdate(clave.split(','), grupo, sequelize.escape.bind(sequelize)), { transaction });
                filas.forEach((f) => actualizados.add(f.id));
            }
            if (soloTags.length) {
                await sequelize.query(`UPDATE "Productos" SET "updatedAt" = NOW() WHERE "id" IN (${soloTags.map((i) => i.id).join(',')})`, { transaction });
                soloTags.forEach((i) => actualizados.add(i.id));
            }
            for (const i of validos.filter((v) => v.tags !== undefined && actualizados.has(v.id))) await sincronizarTags(i.id, i.tags, transaction);
        });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') return { error: 'Ya existe otro producto con ese nombre o código', status: 409 };
        throw err;
    }

    const conflictos = validos.filter((i) => !actualizados.has(i.id)).map((i) => i.id);

    // Filas frescas de todo lo tocado (o en conflicto) para reemplazar lo que la UI tenía
    const idsFilas = [...new Set([...actualizados, ...conflictos])];
    const [filas, tags] = await Promise.all([
        idsFilas.length ? Producto.findAll({ include: INCLUDES, where: { id: idsFilas }, subQuery: false }) : [],
        tagsPorProducto(idsFilas),
    ]);

    // Totales de los grupos afectados (el actual de cada producto y el anterior, si cambió de grupo)
    const idsGrupos = [...filas.map((p) => p.grupoEquivalenciaId), ...validos.map((v) => v.grupoAnterior)].filter(Boolean);
    const gruposAfectados = await cargarGrupos(idsGrupos);

    return {
        rows: filas.map((p) => filaProducto(p, tags.get(p.id) || [])),
        grupos: [...gruposAfectados.values()],
        actualizados: [...actualizados],
        conflictos,
        errores,
    };
}
