// Columnas de la hoja de clientes.
//   campo   -> campo real que se guarda (validado en app/constants/clienteCampos.js)
//   tipo    -> texto | numero | select (editables) · derivada | imagen | acciones (solo lectura)
//   soloAdmin -> solo un administrador la edita (crédito aprobado)
//   dinero  -> se oculta a los vendedores (no ven montos)
export const COLUMNAS = [
    { key: 'imagen', label: '', ancho: 56, tipo: 'imagen', fija: true },
    { key: 'identificacion', label: 'RIF / Cédula', ancho: 130, tipo: 'texto', campo: 'identificacion', sticky: true },
    { key: 'nombre', label: 'Razón social', ancho: 250, tipo: 'texto', campo: 'nombre', sticky: true },
    { key: 'telefono', label: 'Teléfono', ancho: 130, tipo: 'texto', campo: 'telefono' },
    { key: 'email', label: 'Correo', ancho: 210, tipo: 'texto', campo: 'email' },
    { key: 'direccion', label: 'Dirección', ancho: 280, tipo: 'texto', campo: 'direccion' },
    { key: 'esContribuyenteEspecial', label: 'Especial', ancho: 96, tipo: 'select', campo: 'esContribuyenteEspecial', ayuda: 'Contribuyente especial (retiene IVA)' },
    { key: 'retencionIvaPorDefecto', label: 'Retención IVA', ancho: 112, tipo: 'select', campo: 'retencionIvaPorDefecto', ayuda: 'Porcentaje de IVA que retiene (solo contribuyentes especiales)' },
    { key: 'diasCredito', label: 'Días crédito', ancho: 100, tipo: 'numero', campo: 'diasCredito', derecha: true, soloAdmin: true, ayuda: 'Días que tiene para pagar un pedido a crédito' },
    { key: 'maxPedidosCredito', label: 'Máx. pedidos créd.', ancho: 124, tipo: 'numero', campo: 'maxPedidosCredito', derecha: true, soloAdmin: true, ayuda: 'Pedidos a crédito activos a la vez (0 = sin crédito)' },
    { key: 'creditosActivos', label: 'Créd. activos', ancho: 104, tipo: 'derivada', orden: 'creditosActivos', derecha: true, ayuda: 'Pedidos a crédito activos / máximo' },
    { key: 'compras', label: 'Compras $', ancho: 110, tipo: 'derivada', orden: 'compras', derecha: true, dinero: true },
    { key: 'saldo', label: 'Saldo $', ancho: 104, tipo: 'derivada', orden: 'saldo', derecha: true, dinero: true },
    { key: 'pedidos', label: 'Pedidos', ancho: 84, tipo: 'derivada', orden: 'pedidos', derecha: true, dinero: true },
    { key: 'ultimaCompra', label: 'Último pedido', ancho: 116, tipo: 'derivada', orden: 'ultimaCompra', dinero: true },
    { key: 'usuario', label: 'Portal B2B', ancho: 130, tipo: 'derivada', orden: 'usuario' },
    { key: 'notas', label: 'Notas', ancho: 240, tipo: 'texto', campo: 'notas' },
    { key: 'acciones', label: '', ancho: 52, tipo: 'acciones', fija: true },
];

// Columnas de texto que también se pueden ordenar
const ORDENABLES_TEXTO = ['identificacion', 'nombre', 'telefono', 'email', 'direccion', 'notas'];
COLUMNAS.forEach((c) => { if (ORDENABLES_TEXTO.includes(c.key)) c.orden = c.key; });
COLUMNAS.find((c) => c.key === 'diasCredito').orden = 'diasCredito';
COLUMNAS.find((c) => c.key === 'maxPedidosCredito').orden = 'maxPedidosCredito';

export const OPCIONES = {
    esContribuyenteEspecial: [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }],
    retencionIvaPorDefecto: [{ value: '75', label: '75%' }, { value: '100', label: '100%' }],
};

// Texto con el que arranca el editor de una celda
export const textoEdicion = (fila, col) => {
    const v = fila[col.campo];
    if (col.tipo === 'select') return String(v ?? '');
    return v === null || v === undefined ? '' : String(v);
};

// Comparación para ordenar (nulos al final)
export function comparar(a, b, clave) {
    const x = a[clave];
    const y = b[clave];
    if (x === null || x === undefined) return (y === null || y === undefined) ? 0 : 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y), 'es', { sensitivity: 'base', numeric: true });
}
