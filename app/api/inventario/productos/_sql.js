// Generación del SQL de edición masiva. Módulo puro (sin acceso a la base) para poder probarlo aislado.
import { CAMPOS } from '../../../constants/inventarioCampos';

const CAST = { texto: '::text', numero: '::numeric', entero: '::int', fk: '::int', enum: '::text::"enum_Productos_presentacion"' };

const literal = (campo, valor, escape) => {
    const cast = CAST[CAMPOS[campo].tipo];
    if (valor === null || valor === undefined) return `NULL${cast}`;
    return typeof valor === 'number' ? `${valor}${cast}` : `${escape(valor)}${cast}`;
};

// UPDATE ... FROM (VALUES ...) : actualiza N productos en UNA sentencia. Los nombres de columna salen
// de la lista blanca CAMPOS y los valores ya validados, nunca de texto libre del usuario.
// Si se edita stockAlmacen y llega `esperado`, solo se actualiza si el stock sigue siendo ese (compare-and-set):
// así un ajuste manual no pisa una venta que descontó stock mientras editabas.
export function construirUpdate(campos, items, escape) {
    const conCas = campos.includes('stockAlmacen') && items.some((i) => i.esperado !== undefined && i.esperado !== null);
    const columnas = ['id', ...campos, ...(conCas ? ['esperado'] : [])].map((c) => `"${c}"`).join(', ');

    const filas = items.map((i) => {
        const celdas = [`${i.id}::int`, ...campos.map((c) => literal(c, i.cambios[c], escape))];
        if (conCas) celdas.push(i.esperado === undefined || i.esperado === null ? 'NULL::numeric' : `${Number(i.esperado)}::numeric`);
        return `(${celdas.join(', ')})`;
    });

    const set = [...campos.map((c) => `"${c}" = v."${c}"`), '"updatedAt" = NOW()'].join(', ');
    const guardia = conCas ? ` AND (v."esperado" IS NULL OR p."stockAlmacen" = v."esperado")` : '';

    return `UPDATE "Productos" AS p SET ${set} FROM (VALUES ${filas.join(', ')}) AS v(${columnas}) WHERE p."id" = v."id"${guardia} RETURNING p."id"`;
}

