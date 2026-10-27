// app/api/ocr/factura/route.js
// Lee con IA (Gemini) la foto o el PDF de la factura de un proveedor y devuelve los datos para proponerlos en el formulario de compras.
import { NextResponse } from "next/server";
import { analizarFactura } from "../_analizarFactura.mjs";
import { requerirStaff } from "../../inventario/_lib";

export const maxDuration = 60;

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_MB = 15;

export async function POST(req) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!file) return NextResponse.json({ error: "Sin archivo" }, { status: 400 });
        const tipo = file.type || "image/jpeg";
        if (!TIPOS.includes(tipo)) return NextResponse.json({ error: "Sube una foto (JPG, PNG, WEBP) o un PDF de la factura" }, { status: 400 });
        if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `El archivo pesa más de ${MAX_MB} MB` }, { status: 400 });

        const buffer = Buffer.from(await file.arrayBuffer());
        return NextResponse.json(await analizarFactura(buffer, tipo));
    } catch (error) {
        console.error("OCR factura Error:", error);
        // Error de la IA con detalle por modelo: se manda a la pantalla para que se vea qué pasó
        if (error?.intentos) {
            const detalle = error.intentos.map(i => `${i.modelo}: ${i.motivo}`).join(' · ');
            const cuota = error.status === 429;
            return NextResponse.json({
                error: `${cuota ? 'Se agotó el uso gratuito de la IA por hoy.' : 'La IA no pudo leer la factura.'} Llena la factura a mano o inténtalo más tarde. (${detalle})`,
                intentos: error.intentos,
            }, { status: error.status });
        }
        if (error instanceof SyntaxError) return NextResponse.json({ error: 'La IA respondió algo que no se pudo interpretar. Intenta con una foto más nítida o llena la factura a mano.' }, { status: 502 });
        const detalleGeneral = String(error?.message || '').slice(0, 160);
        return NextResponse.json({ error: `No se pudo leer la factura${detalleGeneral ? `: ${detalleGeneral}` : ''}` }, { status: 500 });
    }
}
