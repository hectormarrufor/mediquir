import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
    // Obtenemos el almacén de cookies de forma asíncrona (Requisito de Next.js 15)
    const cookieStore = await cookies();
    
    // Eliminamos la cookie usando el método nativo, que maneja paths y dominios automáticamente
    cookieStore.delete('token');

    return NextResponse.json({ message: 'Sesión cerrada exitosamente' }, { status: 200 });
}