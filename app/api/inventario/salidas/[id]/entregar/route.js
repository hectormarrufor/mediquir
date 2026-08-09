import { NextResponse } from "next/server";
import db from "@/models";
import { notificarUsuario } from "@/app/handlers/notificar"; 
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function POST(request, { params }) {
    const t = await db.sequelize.transaction();
    try {
        // 1. Extraer el token de sesión de forma segura para saber qué almacenista despacha
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;
        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }

        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        const almacenistaId = payload.id; // El ID del usuario logueado en mostrador

        const { id } = await params;
        const { serialAsignadoId, receptorId } = await request.json(); 

        const salida = await db.SalidaInventario.findByPk(id, { 
            include: [{ model: db.Consumible, as: 'consumible' }],
            transaction: t 
        });
        
        if (!salida || salida.estado !== 'Pendiente') {
            throw new Error("El vale de despacho no es válido o ya fue procesado.");
        }

        // Asignación de seriales si aplica
        if (serialAsignadoId) {
            const componenteSerial = await db.ConsumibleSerializado.findByPk(serialAsignadoId, { transaction: t });
            if (componenteSerial) {
                await componenteSerial.update({ estado: 'En Uso', activoId: salida.activoId || null }, { transaction: t });
            }
        }

        const idDelCustodioFinal = receptorId ? parseInt(receptorId) : salida.solicitadoPorId;

        if (!idDelCustodioFinal) {
            throw new Error("No se ha definido un usuario válido para recibir la custodia.");
        }

        // 2. Actualizamos el estado, el receptor y asentamos al despachador de la ventanilla
        await salida.update({ 
            estado: 'Esperando Firma',
            solicitadoPorId: idDelCustodioFinal,
            despachadoPorId: almacenistaId // ✅ Asentamiento de la doble responsabilidad
        }, { transaction: t });

        // 3. Notificación PUSH bloqueante al custodio
        await notificarUsuario(idDelCustodioFinal, {
            title: `✍️ Firma de Custodia Requerida`,
            body: `Almacén te despachó: ${salida.consumible?.nombre}. Por favor, entra al sistema y confirma.`,
            url: `/`, 
            tipo: 'Warning'
        });

        await t.commit();

        return NextResponse.json({ success: true, message: "Material despachado físicamente. Custodio y despachador asentados." });

    } catch (error) {
        if (!t.finished) {
            await t.rollback();
        }
        console.error("Error procesando entrega física:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}