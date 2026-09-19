import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { requerirStaff } from '@/app/api/inventario/_lib';
import db from '@/models/index';
import { buscarVentaParaEmpaque } from '../../../_empaque';

const { VentaEmpaqueItem } = db;

export const dynamic = 'force-dynamic';

// Las funciones de Vercel aceptan ~4.5 MB por petición: el teléfono comprime la foto antes de enviarla
const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = { abierta: 'fotoCajaAbiertaUrl', sellada: 'fotoCajaSelladaUrl' };
const FORMATOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Foto de la caja abierta (con el contenido) o sellada. Solo el empacador asignado, y solo cuando ya verificó todos los productos.
// La URL queda guardada al instante: si el wizard se interrumpe, la evidencia no se pierde. Tras la firma ya no se puede cambiar.
export async function POST(request, { params }) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const { id } = await params;
        const tipo = new URL(request.url).searchParams.get('tipo');
        if (!TIPOS[tipo]) return NextResponse.json({ error: 'Tipo de foto no válido' }, { status: 400 });

        const formato = FORMATOS[(request.headers.get('content-type') || '').split(';')[0].trim()];
        if (!formato) return NextResponse.json({ error: 'Solo se aceptan imágenes JPG, PNG o WebP' }, { status: 415 });

        const venta = await buscarVentaParaEmpaque(id);
        if (!venta) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
        if (Number(venta.empacadorId) !== Number(acceso.sesion.id)) return NextResponse.json({ error: 'Este empaque no está asignado a ti' }, { status: 403 });
        if (['Cancelado', 'Completado'].includes(venta.statusDespacho)) return NextResponse.json({ error: 'Este pedido ya está cerrado' }, { status: 409 });
        if (venta.empacadoAt) return NextResponse.json({ error: 'El empaque ya fue firmado: la evidencia no se puede modificar' }, { status: 409 });

        const pendientes = venta.detalles.length - await VentaEmpaqueItem.count({ where: { ventaId: venta.id, estado: 'OK' } });
        if (pendientes > 0) return NextResponse.json({ error: `Primero verifica los ${pendientes} producto(s) que faltan` }, { status: 409 });
        if (tipo === 'sellada' && !venta.fotoCajaAbiertaUrl) return NextResponse.json({ error: 'Primero toma la foto de la caja abierta' }, { status: 409 });

        const bytes = Buffer.from(await request.arrayBuffer());
        if (!bytes.length) return NextResponse.json({ error: 'La foto llegó vacía' }, { status: 400 });
        if (bytes.length > MAX_BYTES) return NextResponse.json({ error: 'La foto es demasiado grande' }, { status: 413 });

        // Cada foto queda con su propio nombre (las repetidas se conservan como historial de la evidencia)
        const blob = await put(`empaques/${venta.numeroDocumento}/${tipo}-${Date.now()}.${formato}`, bytes, {
            access: 'public', contentType: `image/${formato === 'jpg' ? 'jpeg' : formato}`,
        });
        venta[TIPOS[tipo]] = blob.url;
        await venta.save({ fields: [TIPOS[tipo]] });

        return NextResponse.json({ success: true, url: blob.url });
    } catch (error) {
        console.error('Error subiendo la foto del empaque:', error);
        return NextResponse.json({ error: 'No se pudo guardar la foto' }, { status: 500 });
    }
}
