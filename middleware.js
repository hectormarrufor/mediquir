import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { rolDe } from './app/constants/roles';

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

// Vendedor (puesto "Vendedor"): solo lo que necesita para vender, comprar y cumplir sus tareas de logística.
// Todo lo demás (finanzas, RRHH, costos, edición de inventario, usuarios...) queda cerrado. Cada ruta además filtra
// SUS datos (solo lo suyo) y recalcula precios en el servidor.
const VENDEDOR_API = [
    ['GET', /^\/api\/(categorias|marcas|grupos-equivalencia|tags|proveedores|correlativos)$/],
    ['POST', /^\/api\/proveedores$/],
    ['GET', /^\/api\/clientes(\/[^/]+)?$/],
    ['POST', /^\/api\/clientes$/],
    ['GET', /^\/api\/ventas$/],
    ['POST', /^\/api\/ventas$/],
    ['GET', /^\/api\/ventas\/[^/]+$/],
    ['PUT', /^\/api\/ventas\/[^/]+$/],       // solo las acciones de firma (lo valida la ruta)
    ['GET', /^\/api\/compras$/],
    ['POST', /^\/api\/compras$/],
    ['GET', /^\/api\/vendedor\/[^/]+$/],
    ['GET', /^\/api\/inventario\/lista-precios$/],
];
const VENDEDOR_PAGINAS = [
    /^\/superuser$/, /^\/superuser\/ventas(\/.*)?$/, /^\/superuser\/compras$/,
    /^\/superuser\/inventario\/consulta$/, /^\/superuser\/clientes(\/nuevo)?$/, /^\/superuser\/notificaciones$/,
];

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
        if (pathname.startsWith('/api/b2b/')) return json('Ruta exclusiva de clientes', 403);
        if (rolDe(sesion) === 'vendedor' && !VENDEDOR_API.some(([m, patron]) => m === metodo && patron.test(pathname))) {
            return json('Tu rol no permite esta acción', 403);
        }
        return NextResponse.next();
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
    // El vendedor solo entra a sus pantallas; cualquier otra lo devuelve a su panel
    if (rolDe(sesion) === 'vendedor' && pathname.startsWith('/superuser') && !VENDEDOR_PAGINAS.some((p) => p.test(pathname))) {
        return NextResponse.redirect(new URL('/superuser', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/superuser/:path*', '/b2b/:path*', '/api/:path*'],
};
