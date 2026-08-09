import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get('token')?.value;
    
    // Preparamos la URL de Login
    const loginUrl = new URL('/login', request.url);
    // AGREGADO: Guardamos dónde quería ir el usuario para devolverlo después
    loginUrl.searchParams.set('callbackUrl', pathname);

    // 1. Si no hay token, fuera.
    if (!token) {
        return NextResponse.redirect(loginUrl);
    }

    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);

        if (payload && payload.isAuthenticated) {
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
    // Asegúrate de incluir todas las rutas privadas
    matcher: ['/superuser/:path*'],
};