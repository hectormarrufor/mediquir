import User from "../../../../models/user";
import webpush from 'web-push';
import jwt from 'jsonwebtoken';
import { serialize } from 'cookie';
import { NextResponse } from "next/server";
import { Empleado, Puesto, Departamento, Cliente } from "@/models";
import { notificarDev } from "@/app/handlers/notificar";

webpush.setVapidDetails(
    'mailto:admin@tuapp.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

export async function POST(req) {
    try {
        const parsedBody = await req.json();
        const { user, password } = parsedBody;

        // 1. Buscamos al usuario incluyendo TANTO a Empleado como a Cliente
        const usuario = await User.findOne({
            where: { user },
            include: [
                {
                    model: Empleado, 
                    as: 'empleado',
                    include: [{
                        model: Puesto, as: 'puestos', attributes: ['nombre'],
                        include: [{ model: Departamento, as: 'departamento', attributes: ['nombre'] }]
                    }]
                },
                {
                    model: Cliente,
                    as: 'cliente',
                    attributes: ['id', 'nombre', 'identificacion', 'imagen']
                }
            ]
        });

        if (!usuario) {
            throw new Error('El usuario no existe');
        }

        // 2. Validar contraseña
        const contrasenaValida = await usuario.comparePassword(password);

        if (!contrasenaValida) {
            console.error("Contraseña inválida para el usuario:", user);
            throw new Error('Credenciales inválidas');
        }

        // 3. Determinar la imagen y nombre según sea Empleado, Cliente o Admin
        const nombreUsuario = usuario.empleado 
            ? `${usuario.empleado.nombre}` 
            : usuario.cliente 
                ? (usuario.cliente.nombre || usuario.cliente.identificacion) 
                : "Admin";

        const imagenUsuario = usuario.empleado?.imagen 
            || usuario.cliente?.imagen 
            || "defaultuser.jpg";

        const tokenPayload = {
            id: usuario.id,
            nombre: nombreUsuario,
            imagen: `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${imagenUsuario}?v=${process.env.NEXT_PUBLIC_APP_VERSION}`,
            isAdmin: usuario.isAdmin,
            clienteId: usuario.clienteId || null,
            empleadoId: usuario.empleadoId || null,
            departamentos: usuario.empleado?.puestos?.map(p => p.departamento) || [],
            puestos: usuario.empleado?.puestos || [],
            isAuthenticated: true
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1y' });

        const cookie = serialize('token', token, {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 365 // 1 año
        });

        // Notificar al dev solo si no es admin y es empleado
        if (!usuario.isAdmin && usuario.empleado) {
            await notificarDev({
                title: 'Inicio de sesión detectado',
                body: `${usuario.empleado?.nombre} ha iniciado sesión`,
                url: `/rrhh/empleados/${usuario.empleadoId}`,
            });
        }

        return NextResponse.json({ message: 'Inicio de sesión exitoso' }, {
            status: 200,
            headers: { 'Set-Cookie': cookie },
        });

    } catch (error) {
        console.log(`\x1b[41m [ERROR]: Error al iniciar sesion: ${error.message} \x1b[0m`);
        return NextResponse.json(
            { message: error.message || 'Error al iniciar sesión' },
            { status: 401 }
        );
    }
}