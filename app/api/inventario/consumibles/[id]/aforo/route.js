import { NextResponse } from 'next/server';
import { Consumible, Combustible } from '@/models';
import { notificarCabezas } from '@/app/handlers/notificar';

export async function PATCH(request, { params }) {
    try {
        // Obtenemos el ID de la URL y desempaquetamos params (obligatorio en Next.js 15)
        const { id } = await params;
        const { metodo, valor } = await request.json();

        if (valor === undefined || valor === null || valor < 0) {
            return NextResponse.json({ error: 'El valor no puede estar vacío o ser negativo.' }, { status: 400 });
        }

        const consumible = await Consumible.findByPk(id, {
            include: [{ model: Combustible }]
        });

        if (!consumible) {
            return NextResponse.json({ error: 'Tanque no encontrado en el inventario.' }, { status: 404 });
        }

        let nuevosLitros = 0;

        if (metodo === 'cm') {
            if (!consumible.Combustible || !consumible.Combustible.dimensiones) {
                return NextResponse.json({ error: 'Este tanque no tiene dimensiones geométricas registradas para calcular por centímetros.' }, { status: 400 });
            }
            // Llamamos al método prototype que tienes en tu modelo
            nuevosLitros = consumible.Combustible.calcularLitros(parseFloat(valor));
        } else {
            // Si el método es 'litros', se asigna directamente
            nuevosLitros = parseFloat(valor);
        }

        // Validación de seguridad contra la capacidad máxima
        if (consumible.Combustible && consumible.Combustible.capacidadTotalLitros) {
            const capacidadMaxima = parseFloat(consumible.Combustible.capacidadTotalLitros);
            if (nuevosLitros > capacidadMaxima && capacidadMaxima > 0) {
                return NextResponse.json({ error: `El cálculo (${nuevosLitros.toFixed(2)} L) excede la capacidad máxima física del tanque (${capacidadMaxima} L).` }, { status: 400 });
            }
        }

        const stockAnterior = parseFloat(consumible.stockAlmacen);
        consumible.stockAlmacen = nuevosLitros;
        await consumible.save();

        // Notificamos este evento delicado a la gerencia
        const diferencia = nuevosLitros - stockAnterior;
        const signo = diferencia > 0 ? '+' : '';
        await notificarCabezas({
            title: "⚖️ Aforo Maestro Modificado",
            body: `El SuperUsuario ha corregido el stock del tanque principal de Combustible "${consumible.nombre}". Pasó de ${stockAnterior.toFixed(2)}L a ${nuevosLitros.toFixed(2)}L (Ajuste: ${signo}${diferencia.toFixed(2)}L).`,
            url: `/superuser/flota/combustible`
        });

        return NextResponse.json({ success: true, stockAlmacen: nuevosLitros.toFixed(2) });

    } catch (error) {
        console.error("Error actualizando aforo maestro:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}