// Ruta: app/api/clientes/buscar/route.js
// Autocompletar del checkout de la tienda. Es una ruta PÚBLICA y solo la usa ese checkout, así que devuelve lo mínimo para TODOS
// (también para el personal con sesión abierta: la ficha completa se consulta en el módulo de clientes, no aquí):
//   · nombre con solo el primer nombre visible, y teléfono y correo enmascarados: el checkout los pone en el formulario para que la
//     persona no tenga que reescribirlos (el servidor usa los que ya tiene guardados).
// Nunca el nombre completo, el teléfono, el correo ni la dirección de alguien por el solo hecho de conocer su cédula.

import { Cliente } from '@/models';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const maskTelefono = (t) => {
    const d = String(t || '').replace(/\D/g, '');
    return d.length >= 6 ? `${d.slice(0, 2)}${'*'.repeat(d.length - 4)}${d.slice(-2)}` : null;
};

// "Juan Pérez López" -> "Juan P**** L****": el primer nombre a la vista, el resto solo con la inicial
const maskNombre = (n) => String(n || '').trim().split(/\s+/).map((p, i) => (i === 0 ? p : `${p[0]}${'*'.repeat(Math.max(2, p.length - 1))}`)).join(' ');

const maskEmail = (e) => {
    const [usuario, dominio] = String(e || '').split('@');
    if (!usuario || !dominio) return null;
    return `${usuario[0]}${'*'.repeat(Math.max(2, usuario.length - 1))}@${dominio[0]}${'*'.repeat(Math.max(2, dominio.split('.')[0].length - 1))}.${dominio.split('.').slice(1).join('.') || '***'}`;
};

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const identificacion = String(searchParams.get('id') || '').trim().slice(0, 30);

    if (!identificacion) {
        return NextResponse.json({ message: 'Identificación requerida' }, { status: 400 });
    }

    try {
        const cliente = await Cliente.findOne({ where: { identificacion }, attributes: ['nombre', 'telefono', 'email'] });
        if (!cliente) return NextResponse.json({ success: false, message: 'Cliente no encontrado' }, { status: 404 });

        const primerNombre = String(cliente.nombre || '').trim().split(/\s+/)[0] || null;
        return NextResponse.json({
            success: true,
            cliente: { primerNombre, nombreOculto: maskNombre(cliente.nombre), telefonoOculto: maskTelefono(cliente.telefono), emailOculto: maskEmail(cliente.email) },
        }, { status: 200 });
    } catch (error) {
        console.error('Error buscando cliente:', error);
        return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
    }
}
