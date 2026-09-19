import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { Cliente, RetencionIva, Venta } from '@/models';
import { requerirCliente } from '@/app/api/_lib/acceso';
import { notificarCabezas } from '@/app/handlers/notificar';
import { hoyCaracas } from '../../../_lib';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Las funciones de Vercel aceptan ~4.5 MB por petición
const MAX_BYTES = 4 * 1024 * 1024;
const FORMATOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const fmtBs = (n) => `Bs ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const error = (mensaje, status = 400) => NextResponse.json({ error: mensaje }, { status });

// El cliente (contribuyente especial) sube el comprobante de la retención de IVA que le hizo a la empresa en una factura.
// Datos por la URL (?comprobante=&fecha=&monto=) y el archivo (PDF o imagen) como cuerpo de la petición.
// Queda "por revisar": administración lo confirma antes de que entre al libro de ventas. Mientras tanto se puede volver a subir.
export async function POST(request, { params }) {
    const acceso = await requerirCliente();
    if (acceso.error) return acceso.error;

    try {
        const { id } = await params;
        if (!UUID.test(id)) return error('Pedido no encontrado', 404);

        const q = new URL(request.url).searchParams;
        const comprobante = String(q.get('comprobante') || '').trim().slice(0, 30);
        const fecha = q.get('fecha') || '';
        const monto = Number(q.get('monto'));
        const tipoArchivo = (request.headers.get('content-type') || '').split(';')[0].trim();
        const formato = FORMATOS[tipoArchivo];

        if (!comprobante) return error('Escribe el número del comprobante de retención');
        if (!FECHA.test(fecha) || fecha > hoyCaracas()) return error('La fecha del comprobante no es válida');
        if (!(monto > 0)) return error('Escribe el monto de IVA retenido en bolívares');
        if (!formato) return error('El comprobante debe ser un PDF o una imagen (JPG, PNG o WebP)', 415);

        // Solo facturas del propio cliente (el clienteId sale del token, nunca del navegador)
        const venta = await Venta.findOne({ where: { id, clienteId: acceso.clienteId } });
        if (!venta) return error('Pedido no encontrado', 404);
        if (venta.tipoDocumento !== 'FACTURA' || venta.statusDespacho === 'Cancelado') return error('Solo las facturas admiten retención de IVA', 409);

        const retencion = await RetencionIva.findOne({ where: { ventaId: venta.id, tipo: 'VENTA' } });
        if (!retencion) return error('Esta factura no tiene una retención de IVA pendiente. Si crees que debería, escríbenos.', 404);
        if (retencion.estado === 'REGISTRADA') return error('El comprobante de esta factura ya fue registrado', 409);
        if (monto > Number(retencion.montoIva) + 0.005) return error(`La retención no puede ser mayor que el IVA de la factura (${fmtBs(retencion.montoIva)})`);

        const bytes = Buffer.from(await request.arrayBuffer());
        if (!bytes.length) return error('El archivo llegó vacío');
        if (bytes.length > MAX_BYTES) return error('El archivo pesa más de 4 MB: comprímelo o toma una foto más pequeña', 413);

        const blob = await put(`retenciones/${venta.numeroDocumento}/comprobante-${Date.now()}.${formato}`, bytes, { access: 'public', contentType: tipoArchivo });
        const anterior = retencion.comprobanteUrl;
        await retencion.update({
            comprobante, fecha, periodo: fecha.slice(0, 7), montoDeclarado: Number(monto.toFixed(2)),
            comprobanteUrl: blob.url, estado: 'POR_REVISAR',
        });
        // Al volver a subirlo no quedan archivos huérfanos en el Blob
        if (anterior) del(anterior).catch((e) => console.error('No se pudo borrar el comprobante anterior:', e.message));

        try {
            const cliente = await Cliente.findByPk(acceso.clienteId, { attributes: ['nombre'] });
            await notificarCabezas({
                title: '🧾 Comprobante de retención de un cliente',
                body: `${cliente?.nombre || 'Un cliente'} subió el comprobante ${comprobante} de la factura ${venta.numeroDocumento} por ${fmtBs(monto)}. Revísalo y confírmalo.`,
                url: `/superuser/ventas/${venta.id}`, tag: `retencion-cliente-${venta.id}`, tipo: 'Info',
            });
        } catch (e) {
            console.error('No se pudo avisar del comprobante de retención:', e.message);
        }
        return NextResponse.json({ success: true, estado: 'POR_REVISAR' });
    } catch (e) {
        console.error('B2B comprobante de retención:', e);
        return error('No se pudo guardar el comprobante', 500);
    }
}
