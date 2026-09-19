import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Cliente, User } from '@/models';
import { requerirNoVendedor } from '../../../_lib/acceso';

export const dynamic = 'force-dynamic';

// Clave temporal legible: sin caracteres que se confunden (0/O, 1/l/I)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function claveTemporal(largo = 10) {
    return Array.from(crypto.randomBytes(largo), (b) => ALFABETO[b % ALFABETO.length]).join('');
}

// Usuario sugerido: iniciales del nombre + dígitos de la identificación
function sugerirUsuario(cliente) {
    const base = String(cliente.nombre || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'cliente';
    const digitos = String(cliente.identificacion || '').replace(/\D/g, '').slice(-4);
    return `${base}${digitos}`;
}

// Estado del acceso al portal B2B de un cliente
export async function GET(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const cliente = await Cliente.findByPk(id, { attributes: ['id', 'nombre', 'identificacion', 'telefono'] });
        if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        const usuario = await User.findOne({ where: { clienteId: cliente.id }, attributes: ['id', 'user'] });
        return NextResponse.json({ usuario: usuario?.user || null, sugerido: sugerirUsuario(cliente) });
    } catch (error) {
        console.error('Estado de acceso:', error);
        return NextResponse.json({ error: 'No se pudo consultar el acceso' }, { status: 500 });
    }
}

// CREAR: crea el usuario del cliente con una clave temporal · RESTABLECER: genera otra clave temporal (recuperación de contraseña).
// La clave temporal solo se devuelve UNA vez en esta respuesta; en la base queda únicamente su hash.
export async function POST(request, { params }) {
    const acceso = await requerirNoVendedor();
    if (acceso.error) return acceso.error;

    try {
        const { id } = await params;
        const { accion, user } = await request.json();
        const cliente = await Cliente.findByPk(id, { attributes: ['id', 'nombre', 'identificacion', 'telefono'] });
        if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });

        const existente = await User.findOne({ where: { clienteId: cliente.id } });
        const clave = claveTemporal();
        const hash = await bcrypt.hash(clave, parseInt(process.env.SALT_ROUNDS));

        if (accion === 'CREAR') {
            if (existente) return NextResponse.json({ error: 'Este cliente ya tiene un usuario' }, { status: 409 });
            const nombreUsuario = String(user || sugerirUsuario(cliente)).trim().toLowerCase();
            if (!/^[a-z0-9._-]{3,30}$/.test(nombreUsuario)) return NextResponse.json({ error: 'El usuario debe tener de 3 a 30 letras minúsculas, números, punto, guion o guion bajo' }, { status: 400 });
            if (await User.findOne({ where: { user: nombreUsuario } })) return NextResponse.json({ error: 'Ese nombre de usuario ya está en uso' }, { status: 409 });

            await User.create({ user: nombreUsuario, password: hash, clienteId: cliente.id, isAdmin: false });
            return NextResponse.json({ user: nombreUsuario, password: clave, creado: true }, { status: 201 });
        }

        if (accion === 'RESTABLECER') {
            if (!existente) return NextResponse.json({ error: 'Este cliente aún no tiene usuario' }, { status: 404 });
            await existente.update({ password: hash });
            return NextResponse.json({ user: existente.user, password: clave, creado: false });
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    } catch (error) {
        console.error('Acceso del cliente:', error);
        return NextResponse.json({ error: 'No se pudo completar la operación' }, { status: 500 });
    }
}
