import { NextResponse } from "next/server";
import db from "@/models";
import { notificarUsuario } from "@/app/handlers/notificar";
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function POST(request, { params }) {
    const t = await db.sequelize.transaction();
    try {
        // 1. Verificación de seguridad estricta: Solo el Admin principal puede forzar esto
        const cookieStore = await cookies();
        const token = cookieStore.get('token')?.value;
        if (!token) throw new Error("No autorizado");

        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        
        // Verifica que sea el userId 1 (SuperAdmin)
        if (payload.id !== 1 && payload.id !== '1') {
            throw new Error("Solo el Administrador Principal puede forzar devoluciones.");
        }

        const { id } = await params;

        const salida = await db.SalidaInventario.findByPk(id, { 
            include: [{ model: db.Consumible, as: 'consumible' }],
            transaction: t 
        });

        if (!salida || salida.estado !== 'Entregada') {
            throw new Error("Este ítem no está en custodia activa.");
        }

        // 2. Liberamos la custodia forzosamente y dejamos el rastro en la justificación
        await salida.update({ 
            estado: 'Devuelta', 
            justificacion: `${salida.justificacion || ''} | [DEVOLUCIÓN FORZADA POR ADMIN]` 
        }, { transaction: t });
        
        // 3. Regresamos el stock físico al almacén
        if (salida.consumible) {
            await salida.consumible.increment('stockAlmacen', { 
                by: parseFloat(salida.cantidad), 
                transaction: t 
            });
        }

        // 4. Notificamos al empleado
        await notificarUsuario(salida.solicitadoPorId, {
            title: `⚠️ Custodia Revocada por Administración`,
            body: `El sistema ha retornado ${salida.consumible?.nombre} al almacén. Ya no está bajo tu responsabilidad.`,
            url: `/superuser/en-mi-custodia`,
            tipo: 'Info'
        });

        await t.commit();
        return NextResponse.json({ success: true, message: "Devolución forzada exitosamente." });

    } catch (error) {
        if (!t.finished) await t.rollback();
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}