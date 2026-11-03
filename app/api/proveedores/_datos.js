import { Op, fn, col, where } from 'sequelize';
import { Proveedor } from '@/models';
import { normRif } from '@/app/constants/rif';

const texto = (v, max) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, max) : null;
};

/**
 * Datos de un proveedor tal como se guardan, validados. Lo usan la pantalla de proveedores y el registro de compras.
 * La retención de IVA NO tiene valor por defecto: al crear hay que elegir 75 o 100 (lo dice el SENIAT al consultar el RIF).
 * @param {object} cuerpo      lo que mandó la pantalla
 * @param {{ creando: boolean }} o   al editar solo se valida lo que venga
 * @returns {{ datos?: object, error?: string }}
 */
export function datosProveedor(cuerpo, { creando }) {
    const c = cuerpo || {};
    const datos = {};
    const viene = (k) => creando || Object.prototype.hasOwnProperty.call(c, k);

    if (viene('identificacion')) {
        const rif = String(c.identificacion ?? '').trim().toUpperCase().replace(/\s+/g, '');
        if (normRif(rif).length < 4) return { error: 'Escribe el RIF del proveedor' };
        datos.identificacion = rif.slice(0, 30);
    }
    if (viene('nombre')) {
        const nombre = texto(c.nombre, 200);
        if (!nombre || nombre.length < 2) return { error: 'Escribe la razón social del proveedor' };
        datos.nombre = nombre;
    }
    if (viene('telefono')) datos.telefono = texto(c.telefono, 40);
    if (viene('direccion')) datos.direccion = texto(c.direccion, 500);
    if (viene('notas')) datos.notas = texto(c.notas, 1000);
    if (viene('email')) {
        const email = texto(c.email, 150);
        if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'El correo no es válido' };
        datos.email = email;
    }
    if (viene('esContribuyenteEspecial')) datos.esContribuyenteEspecial = c.esContribuyenteEspecial === true || c.esContribuyenteEspecial === 'true';
    if (viene('retencionIvaPorDefecto')) {
        const pct = Number(c.retencionIvaPorDefecto);
        if (c.retencionIvaPorDefecto === null || c.retencionIvaPorDefecto === undefined || c.retencionIvaPorDefecto === '' || ![75, 100].includes(pct)) {
            return { error: 'Elige el porcentaje de retención de IVA del proveedor: 75 % o 100 %' };
        }
        datos.retencionIvaPorDefecto = pct;
    }
    if (!creando && Object.prototype.hasOwnProperty.call(c, 'activo')) datos.activo = c.activo === true || c.activo === 'true';
    if (creando) datos.activo = true;
    return { datos };
}

// ¿Ya hay otro proveedor con ese RIF, escrito con o sin guiones? ("J-12345678-9" y "J123456789" son el mismo)
export const rifRepetido = (rif, excluirId = null, transaction) => Proveedor.findOne({
    attributes: ['id', 'nombre', 'identificacion'],
    where: {
        [Op.and]: [
            where(fn('regexp_replace', fn('upper', col('identificacion')), '[^A-Z0-9]', '', 'g'), normRif(rif)),
            ...(excluirId ? [{ id: { [Op.ne]: Number(excluirId) } }] : []),
        ],
    },
    transaction,
});
