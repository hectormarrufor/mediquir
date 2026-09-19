import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// ------------------------------------------------------------------------------------------------
// Quién puede llamar a cada API (regla central: TODO lo que no esté aquí exige sesión de PERSONAL).
// Cada ruta sigue haciendo su propia validación fina (permisos, dueño del dato); esto es la red de seguridad
// que evita que una ruta nueva o antigua quede abierta por olvido.
// ------------------------------------------------------------------------------------------------

// Públicas: las usa la landing sin iniciar sesión (o las llaman servicios externos con su propia clave).
const PUBLICAS = [
    ['GET', /^\/api\/bcv$/],                       // tasa BCV (también la consulta el cron de Vercel)
    ['GET', /^\/api\/productos$/],                 // catálogo público (la ruta oculta costos y precio mayor a quien no es personal)
    ['GET', /^\/api\/categorias$/],
    ['GET', /^\/api\/tienda\/destacados$/],
    ['GET', /^\/api\/clientes\/buscar$/],          // autocompletar del checkout (solo devuelve el nombre a quien no es personal)
    ['POST', /^\/api\/checkout\/procesar$/],       // compra web (el servidor recalcula precios, IVA y tasa)
    ['POST', /^\/api\/users\/login$/],
    ['GET', /^\/api\/users\/hay-admin$/],          // el login pregunta si ya existe un administrador
    ['POST', /^\/api\/users$/],                    // sin sesión solo sirve para crear el PRIMER administrador (lo valida la ruta)
    ['POST', /^\/api\/users\/logout$/],
    ['GET', /^\/api\/users\/session$/],
    ['GET', /^\/api\/auth\/check-status$/],
    ['POST', /^\/api\/suscribir$/],                // suscripción a notificaciones push
    ['POST', /^\/api\/webhooks\/pagomovil$/],      // valida su propio Bearer token
    ['GET', /^\/api\/cron-jobs\/[^/]+$/],          // valida CRON_SECRET
];

// Cualquier usuario con sesión (personal o cliente); la ruta valida lo demás.
const CUALQUIER_SESION = [/^\/api\/notificaciones(\/|$)/, /^\/api\/users\/change-password$/, /^\/api\/suscribir(\/|$)/];

const json = (mensaje, status) => NextResponse.json({ error: mensaje }, { status });

async function leerSesion(request) {
    const token = request.cookies.get('token')?.value;
    if (!token) return null;
    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload?.isAuthenticated ? payload : null;
    } catch {
        return null;
    }
}

export async function middleware(request) {
    const { pathname } = request.nextUrl;
    const metodo = request.method;
    const sesion = await leerSesion(request);
    const esCliente = Boolean(sesion?.clienteId);

    // ---------- API ----------
    if (pathname.startsWith('/api/')) {
        if (PUBLICAS.some(([m, patron]) => m === metodo && patron.test(pathname))) return NextResponse.next();
        if (!sesion) return json('No autorizado', 401);
        if (CUALQUIER_SESION.some((patron) => patron.test(pathname))) return NextResponse.next();

        if (esCliente) {
            // Los clientes solo trabajan con su portal B2B
            return pathname.startsWith('/api/b2b/') ? NextResponse.next() : json('Acceso restringido al personal', 403);
        }
        // El personal no usa las rutas del portal de clientes
        return pathname.startsWith('/api/b2b/') ? json('Ruta exclusiva de clientes', 403) : NextResponse.next();
    }

    // ---------- Páginas ----------
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);

    if (!sesion) {
        return pathname.startsWith('/superuser') || pathname.startsWith('/b2b')
            ? NextResponse.redirect(loginUrl)
            : NextResponse.next();
    }

    // Clientes: su casa es /b2b (no ven la landing ni el panel del personal)
    if (esCliente && !pathname.startsWith('/b2b')) return NextResponse.redirect(new URL('/b2b', request.url));
    // El personal no entra al portal de clientes
    if (!esCliente && pathname.startsWith('/b2b')) return NextResponse.redirect(new URL('/superuser', request.url));

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/superuser/:path*', '/b2b/:path*', '/api/:path*'],
};
