import { Op, fn, col, where } from 'sequelize';

// ¿Ya hay otro registro con ese nombre, sin importar mayúsculas? ("Guantes" y "GUANTES" son el mismo)
export const nombreRepetido = (Modelo, nombre, excluirId = null) => Modelo.findOne({
    attributes: ['id', 'nombre'],
    where: {
        [Op.and]: [
            where(fn('lower', fn('trim', col('nombre'))), String(nombre).trim().toLowerCase()),
            ...(excluirId ? [{ id: { [Op.ne]: Number(excluirId) } }] : []),
        ],
    },
});
