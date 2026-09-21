import { fechaCaracas, formatearFecha } from '@/app/constants/hora';

export const ESTADOS = ['Activo', 'Vacaciones', 'Permiso', 'Reposo Medico', 'Suspendido', 'Inactivo', 'Retirado'];
export const COLOR_ESTADO = {
    Activo: 'green', Vacaciones: 'blue', Permiso: 'orange', 'Reposo Medico': 'yellow', Suspendido: 'red', Inactivo: 'gray', Retirado: 'dark',
};
export const ETIQUETA_ESTADO = { 'Reposo Medico': 'Reposo médico' };
export const AUSENTES = ['Vacaciones', 'Permiso', 'Reposo Medico'];
export const TALLAS_CAMISA = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const opcionesEstado = ESTADOS.map((v) => ({ value: v, label: ETIQUETA_ESTADO[v] || v }));

// Columnas de la hoja de empleados.
//   campo -> campo real que se guarda con PATCH /api/rrhh/empleados/[id]
//   orden -> clave (de la fila preparada) por la que se ordena al pulsar el encabezado
export const COLUMNAS = [
    { key: 'imagen', label: '', ancho: 56, tipo: 'imagen', fija: true },
    { key: 'cedula', label: 'Cédula', ancho: 112, tipo: 'texto', campo: 'cedula', requerido: true, sticky: true, orden: 'cedula' },
    { key: 'nombreCompleto', label: 'Empleado', ancho: 220, tipo: 'derivada', sticky: true, orden: 'nombreCompleto', abre: true, ayuda: 'Doble clic para abrir la ficha' },
    { key: 'estado', label: 'Estado', ancho: 132, tipo: 'select', campo: 'estado', opciones: opcionesEstado, requerido: true, orden: 'estadoOrden' },
    { key: 'departamento', label: 'Departamento', ancho: 160, tipo: 'derivada', orden: 'departamento' },
    { key: 'puestos', label: 'Cargo(s)', ancho: 210, tipo: 'derivada', orden: 'puestosTxt' },
    { key: 'telefono', label: 'Teléfono', ancho: 132, tipo: 'texto', campo: 'telefono', orden: 'telefono' },
    { key: 'edad', label: 'Edad', ancho: 66, tipo: 'derivada', derecha: true, orden: 'edad' },
    { key: 'fechaNacimiento', label: 'Nacimiento', ancho: 112, tipo: 'fecha', campo: 'fechaNacimiento', orden: 'fechaNacimiento' },
    { key: 'fechaIngreso', label: 'Ingreso', ancho: 108, tipo: 'fecha', campo: 'fechaIngreso', orden: 'fechaIngreso' },
    { key: 'antiguedad', label: 'Antigüedad', ancho: 104, tipo: 'derivada', orden: 'fechaIngreso', ayuda: 'Tiempo desde la fecha de ingreso' },
    { key: 'genero', label: 'Género', ancho: 104, tipo: 'select', campo: 'genero', vaciable: true, orden: 'genero', opciones: ['Masculino', 'Femenino', 'Otro'] },
    { key: 'direccion', label: 'Dirección', ancho: 260, tipo: 'texto', campo: 'direccion', orden: 'direccion' },
    { key: 'tallaCamisa', label: 'Camisa', ancho: 84, tipo: 'select', campo: 'tallaCamisa', vaciable: true, orden: 'tallaCamisa', opciones: TALLAS_CAMISA },
    { key: 'tallaPantalon', label: 'Pantalón', ancho: 88, tipo: 'texto', campo: 'tallaPantalon', orden: 'tallaPantalon' },
    { key: 'tallaCalzado', label: 'Calzado', ancho: 84, tipo: 'texto', campo: 'tallaCalzado', orden: 'tallaCalzado' },
    { key: 'tallaBraga', label: 'Braga', ancho: 80, tipo: 'texto', campo: 'tallaBraga', orden: 'tallaBraga' },
    { key: 'usuario', label: 'Acceso al sistema', ancho: 150, tipo: 'derivada', orden: 'usuarioTxt' },
    { key: 'acciones', label: '', ancho: 52, tipo: 'acciones', fija: true },
];

export const VISIBLES_POR_DEFECTO = ['estado', 'departamento', 'puestos', 'telefono', 'edad', 'fechaIngreso', 'antiguedad', 'usuario'];
// Columnas que el usuario puede activar / desactivar (las fijas siempre se ven)
export const OPCIONALES = COLUMNAS.filter((c) => !c.fija && !c.sticky);

const partes = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').map(Number) : null);

function edadDe(nac, hoy) {
    const n = partes(nac);
    if (!n) return null;
    let edad = hoy[0] - n[0];
    if (hoy[1] < n[1] || (hoy[1] === n[1] && hoy[2] < n[2])) edad--;
    return edad;
}

function antiguedadDe(ing, hoy) {
    const i = partes(ing);
    if (!i) return '';
    let meses = (hoy[0] - i[0]) * 12 + (hoy[1] - i[1]) - (hoy[2] < i[2] ? 1 : 0);
    if (meses < 0) return 'Por ingresar';
    if (meses < 1) return 'Nuevo';
    const a = Math.floor(meses / 12);
    meses %= 12;
    return [a ? `${a} ${a === 1 ? 'año' : 'años'}` : '', meses ? `${meses} m` : ''].filter(Boolean).join(' ');
}

// Datos derivados que la hoja, los filtros y las tarjetas necesitan (todo en hora de Caracas)
export function prepararEmpleado(e) {
    const hoy = partes(fechaCaracas());
    const puestos = e.puestos || [];
    const departamentos = [...new Set(puestos.map((p) => p.departamento?.nombre).filter(Boolean))];
    const nac = partes(e.fechaNacimiento);
    return {
        ...e,
        nombreCompleto: `${e.nombre || ''} ${e.apellido || ''}`.trim(),
        departamentos,
        departamento: departamentos.join(', '),
        puestosTxt: puestos.map((p) => p.nombre).join(', '),
        estadoOrden: ESTADOS.indexOf(e.estado) === -1 ? 99 : ESTADOS.indexOf(e.estado),
        edad: edadDe(e.fechaNacimiento, hoy),
        cumpleEsteMes: Boolean(nac && nac[1] === hoy[1]),
        cumpleHoy: Boolean(nac && nac[1] === hoy[1] && nac[2] === hoy[2]),
        antiguedad: antiguedadDe(e.fechaIngreso, hoy),
        usuarioTxt: e.usuario?.user || '',
        sinTallas: !e.tallaCamisa || !e.tallaPantalon || !e.tallaCalzado,
        inactivo: e.estado === 'Retirado' || e.estado === 'Inactivo',
    };
}

// Comparación para ordenar (vacíos al final)
export function comparar(a, b, clave) {
    const x = a[clave];
    const y = b[clave];
    const vacio = (v) => v === null || v === undefined || v === '';
    if (vacio(x)) return vacio(y) ? 0 : 1;
    if (vacio(y)) return -1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y), 'es', { sensitivity: 'base', numeric: true });
}

// CSV (con BOM y ; como separador para que Excel en español lo abra bien)
export function aCsv(filas) {
    const cab = ['Cédula', 'Nombre', 'Apellido', 'Estado', 'Departamento', 'Cargos', 'Teléfono', 'Nacimiento', 'Edad', 'Ingreso', 'Antigüedad', 'Género', 'Dirección', 'Camisa', 'Pantalón', 'Calzado', 'Braga', 'Usuario'];
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = filas.map((f) => [f.cedula, f.nombre, f.apellido, ETIQUETA_ESTADO[f.estado] || f.estado, f.departamento, f.puestosTxt, f.telefono, formatearFecha(f.fechaNacimiento), f.edad, formatearFecha(f.fechaIngreso), f.antiguedad, f.genero, f.direccion, f.tallaCamisa, f.tallaPantalon, f.tallaCalzado, f.tallaBraga, f.usuarioTxt].map(celda).join(';'));
    return `﻿${[cab.map(celda).join(';'), ...lineas].join('\r\n')}`;
}
