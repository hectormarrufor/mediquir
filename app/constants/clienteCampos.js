// Campos editables de un cliente y cómo se validan. Los usan la hoja de clientes (pantalla) y la API (servidor),
// para que ambos decidan igual. Todo lo que no esté aquí se ignora al guardar (id, fechas, etc.).
//   soloAdmin -> solo un administrador puede cambiarlo (el crédito que se le aprueba al cliente)
export const CAMPOS_CLIENTE = {
    identificacion: { etiqueta: 'RIF / Cédula', tipo: 'texto', requerido: true, min: 4, max: 30 },
    nombre: { etiqueta: 'Razón social', tipo: 'texto', max: 200 },
    telefono: { etiqueta: 'Teléfono', tipo: 'texto', max: 40 },
    email: { etiqueta: 'Correo', tipo: 'email', max: 150 },
    direccion: { etiqueta: 'Dirección', tipo: 'texto', max: 500 },
    notas: { etiqueta: 'Notas', tipo: 'texto', max: 1000 },
    imagen: { etiqueta: 'Imagen', tipo: 'texto', max: 300 },
    esContribuyenteEspecial: { etiqueta: 'Contribuyente especial', tipo: 'booleano' },
    retencionIvaPorDefecto: { etiqueta: 'Retención de IVA', tipo: 'opcion', valores: [75, 100] },
    diasCredito: { etiqueta: 'Días de crédito', tipo: 'entero', min: 0, max: 365, soloAdmin: true },
    maxPedidosCredito: { etiqueta: 'Máx. pedidos a crédito', tipo: 'entero', min: 0, max: 100, soloAdmin: true },
    tarifaPrecio: { etiqueta: 'Tarifa de precios B2B', tipo: 'lista', valores: ['precio6', 'precio7'], soloAdmin: true },
};

const bien = (valor) => ({ ok: true, valor });
const fallo = (error) => ({ ok: false, error });

// Devuelve { ok, valor } (valor ya normalizado) o { ok: false, error }
export function validarCampoCliente(campo, crudo) {
    const spec = CAMPOS_CLIENTE[campo];
    if (!spec) return fallo(`El campo "${campo}" no se puede editar`);
    const vacio = crudo === '' || crudo === null || crudo === undefined;

    switch (spec.tipo) {
        case 'texto':
        case 'email': {
            const v = String(crudo ?? '').trim();
            if (!v) return spec.requerido ? fallo('Es obligatorio') : bien(null);
            if (spec.min && v.length < spec.min) return fallo(`Mínimo ${spec.min} caracteres`);
            if (v.length > spec.max) return fallo(`Máximo ${spec.max} caracteres`);
            if (spec.tipo === 'email' && !/^\S+@\S+\.\S+$/.test(v)) return fallo('Correo inválido');
            return bien(v);
        }
        case 'entero': {
            if (vacio) return fallo('Es obligatorio (usa 0 para ninguno)');
            const n = Number(String(crudo).trim().replace(',', '.'));
            if (!Number.isFinite(n) || !Number.isInteger(n)) return fallo('Debe ser un número entero');
            if (n < spec.min) return fallo(`Mínimo ${spec.min}`);
            if (n > spec.max) return fallo(`Máximo ${spec.max}`);
            return bien(n);
        }
        case 'booleano': {
            if (typeof crudo === 'boolean') return bien(crudo);
            const v = String(crudo ?? '').trim().toLowerCase();
            if (['true', 'si', 'sí', '1'].includes(v)) return bien(true);
            if (['false', 'no', '0'].includes(v)) return bien(false);
            return fallo('Debe ser Sí o No');
        }
        case 'opcion': {
            const n = Number(crudo);
            return spec.valores.includes(n) ? bien(n) : fallo(`Solo se permite ${spec.valores.join(' o ')}`);
        }
        case 'lista': {
            const v = String(crudo ?? '').trim();
            return spec.valores.includes(v) ? bien(v) : fallo(`Solo se permite ${spec.valores.join(' o ')}`);
        }
        default:
            return fallo('Campo no editable');
    }
}

// Del cuerpo de una petición, solo lo permitido y validado. `esAdmin` habilita los campos de crédito.
// Devuelve { cambios } o { error }.
export function filtrarCambiosCliente(cuerpo, { esAdmin }) {
    const cambios = {};
    for (const [campo, crudo] of Object.entries(cuerpo || {})) {
        const spec = CAMPOS_CLIENTE[campo];
        if (!spec) continue;                       // campo desconocido: se ignora
        if (spec.soloAdmin && !esAdmin) continue;  // el crédito no lo cambia cualquiera
        const v = validarCampoCliente(campo, crudo);
        if (!v.ok) return { error: `${spec.etiqueta}: ${v.error}` };
        cambios[campo] = v.valor;
    }
    return { cambios };
}
