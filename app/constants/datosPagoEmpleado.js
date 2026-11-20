// Datos bancarios y pagos móviles de los empleados para pagos de nómina.

export const TIPOS_DATO_PAGO = {
    CUENTA_BANCARIA: 'Cuenta bancaria',
    PAGO_MOVIL: 'Pago móvil',
};

export const TIPOS_CUENTA_BANCARIA = ['Corriente', 'Ahorro'];

const limpiarTexto = (v, max = 120) => String(v || '').trim().slice(0, max);

// Limpia y normaliza el arreglo de cuentas/pagos móviles antes de guardarlo en Empleados.datosPago
export function sanitizarDatosPago(lista) {
    if (!Array.isArray(lista)) return [];
    const limpios = [];
    for (const item of lista) {
        if (!item || typeof item !== 'object') continue;
        const tipo = item.tipo === 'PAGO_MOVIL' ? 'PAGO_MOVIL' : item.tipo === 'CUENTA_BANCARIA' ? 'CUENTA_BANCARIA' : null;
        if (!tipo) continue;
        const banco = limpiarTexto(item.banco, 100);
        if (!banco) continue;

        const base = {
            id: limpiarTexto(item.id, 60) || `${tipo === 'PAGO_MOVIL' ? 'pm' : 'cb'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            tipo,
            banco,
            titular: limpiarTexto(item.titular, 120) || null,
            cedula: limpiarTexto(item.cedula, 25) || null,
            principal: Boolean(item.principal),
            notas: limpiarTexto(item.notas, 160) || null,
        };

        if (tipo === 'CUENTA_BANCARIA') {
            const numeroCuenta = limpiarTexto(item.numeroCuenta, 30);
            if (!numeroCuenta) continue;
            const tipoCuenta = TIPOS_CUENTA_BANCARIA.includes(item.tipoCuenta) ? item.tipoCuenta : 'Corriente';
            limpios.push({ ...base, tipoCuenta, numeroCuenta });
        } else {
            const telefono = limpiarTexto(item.telefono, 25);
            if (!telefono) continue;
            limpios.push({ ...base, telefono });
        }
    }

    // Garantiza a lo sumo un principal; si hay registros y ninguno marcado, deja el primero como principal
    let yaPrincipal = false;
    for (const d of limpios) {
        if (d.principal) {
            if (yaPrincipal) d.principal = false;
            else yaPrincipal = true;
        }
    }
    if (limpios.length > 0 && !yaPrincipal) limpios[0].principal = true;
    return limpios;
}

export function sanitizarCuentaDestino(item) {
    if (!item || typeof item !== 'object') return null;
    const lista = sanitizarDatosPago([item]);
    return lista[0] || null;
}

export function resumenDatoPago(d) {
    if (!d) return '';
    if (d.tipo === 'PAGO_MOVIL') {
        return `Pago móvil · ${d.banco} · ${d.telefono}${d.cedula ? ` · C.I. ${d.cedula}` : ''}`;
    }
    return `Cuenta ${d.tipoCuenta || 'Corriente'} · ${d.banco} · ${d.numeroCuenta}`;
}

export function textoParaCopiarDatoPago(d, empleadoNombre = '', empleadoCedula = '') {
    if (!d) return '';
    const titular = d.titular || empleadoNombre;
    const cedula = d.cedula || empleadoCedula;
    if (d.tipo === 'PAGO_MOVIL') {
        return [
            `Pago móvil`,
            `Banco: ${d.banco}`,
            `Teléfono: ${d.telefono}`,
            cedula ? `Cédula: ${cedula}` : null,
            titular ? `Titular: ${titular}` : null,
        ].filter(Boolean).join('\n');
    }
    return [
        `Cuenta bancaria (${d.tipoCuenta || 'Corriente'})`,
        `Banco: ${d.banco}`,
        `Cuenta: ${d.numeroCuenta}`,
        titular ? `Titular: ${titular}` : null,
        cedula ? `Cédula: ${cedula}` : null,
    ].filter(Boolean).join('\n');
}
