import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get('token')?.value;
    
    // Preparamos la URL de Login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);

    // 1. Si no hay token y la ruta es protegida (/superuser), fuera al login.
    if (!token) {
        if (pathname.startsWith('/superuser')) {
            return NextResponse.redirect(loginUrl);
        }
        return NextResponse.next();
    }

    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        if (payload && payload.isAuthenticated) {
            // Verificamos si el token pertenece a un cliente (asumiendo que guardas clienteId o un rol en el payload del JWT)
            // Nota: Asegúrate de incluir 'clienteId' o 'isCliente' al firmar el token en tu API de login backend.
            const esCliente = Boolean(payload.clienteId);

            // 2. REGLA PARA CLIENTES: Si es cliente y está en la raíz (/) o fuera de /tienda, mandarlo a /tienda
            if (esCliente && (pathname === '/' || !pathname.startsWith('/tienda'))) {
                return NextResponse.redirect(new URL('/tienda', request.url));
            }

            return NextResponse.next();
        } else {
            return NextResponse.redirect(loginUrl);
        }

    } catch (error) {
        console.error('Error middleware:', error.message);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete('token');
        return response;
    }
}

export const config = {
    // Ampliamos el matcher para que el middleware revise tanto /superuser como la raíz (/) u otras rutas públicas si lo deseas
    matcher: ['/', '/superuser/:path*'],
};