import { Op, fn, col, where } from 'sequelize';
import { Proveedor } from '@/models';
import { normRif } from '@/app/constants/rif';
import { formatearIdentificacion, formatearTelefono, formatearDireccion } from '@/app/constants/identificacion';

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
        // Siempre en el formato único: J-12345678-9 / V-12345678 (se acepta como lo escriban: con o sin guiones, puntos o ceros)
        const { valor, motivo } = formatearIdentificacion(c.identificacion);
        if (!valor) return { error: `El RIF del proveedor no es válido (${motivo || 'revísalo'}). Ejemplo: J-12345678-9` };
        datos.identificacion = valor;
    }
    if (viene('nombre')) {
        const nombre = texto(c.nombre, 200);
        if (!nombre || nombre.length < 2) return { error: 'Escribe la razón social del proveedor' };
        datos.nombre = nombre;
    }
    const telefono = (campo, etiqueta) => {
        const t = texto(c[campo], 40);
        if (!t) return { valor: null };
        const f = formatearTelefono(t);
        return f.valor ? { valor: f.valor } : { error: `${etiqueta} no es válido: usa 04141234567 o, si es de otro país, +57 3001234567` };
    };
    if (viene('telefono')) { const t = telefono('telefono', 'El teléfono'); if (t.error) return { error: t.error }; datos.telefono = t.valor; }
    if (viene('contactoTelefono')) { const t = telefono('contactoTelefono', 'El teléfono de la persona de contacto'); if (t.error) return { error: t.error }; datos.contactoTelefono = t.valor; }
    if (viene('direccion')) { const d = texto(c.direccion, 500); datos.direccion = d ? formatearDireccion(d) : null; }
    if (viene('contactoNombre')) datos.contactoNombre = texto(c.contactoNombre, 150);
    if (viene('contactoCargo')) datos.contactoCargo = texto(c.contactoCargo, 100);
    if (viene('contactoEmail')) {
        const e = texto(c.contactoEmail, 150);
        if (e && !/^\S+@\S+\.\S+$/.test(e)) return { error: 'El correo de la persona de contacto no es válido' };
        datos.contactoEmail = e;
    }
    // Crédito: cuántas compras a crédito a la vez (0 = no da crédito) y los días de cada una. Por defecto 3 y 7.
    for (const [campo, max, etiqueta] of [['maxCreditos', 100, 'La cantidad de créditos'], ['diasCredito', 365, 'Los días de crédito']]) {
        if (!viene(campo)) continue;
        const n = c[campo] === undefined || c[campo] === null || c[campo] === '' ? (campo === 'maxCreditos' ? 3 : 7) : Number(c[campo]);
        if (!Number.isInteger(n) || n < 0 || n > max) return { error: `${etiqueta} debe ser un número entero entre 0 y ${max}` };
        datos[campo] = n;
    }
    if (viene('imagen')) datos.imagen = texto(c.imagen, 1000); // logo
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
