import { NextResponse } from "next/server";
import db from "@/models"; // Ajusta tu importación de modelos

export async function POST(request) {
    const t = await db.sequelize.transaction();
    try {
        const body = await request.json();
        const { empleadoId, monto, moneda, cuentaBancariaId, fecha, detalles } = body;

        let nuevoMovimiento = null;
        let estadoGasto = 'Pendiente';

        // 1. SI SE SELECCIONÓ UNA CUENTA BANCARIA (Se registra el egreso)
        if (cuentaBancariaId) {
            // a. Crear movimiento
            nuevoMovimiento = await db.MovimientoTesoreria.create({
                fechaMovimiento: fecha || new Date(),
                monto: monto, // El monto suele guardarse en positivo y el tipo define si resta
                moneda: moneda || 'USD',
                tipoMovimiento: 'Egreso',
                categoria: 'Pago Salario',
                cuentaOrigenId: cuentaBancariaId,
                empleadoId: empleadoId, // Relación directa opcional
                descripcion: detalles || `Pago de nómina`
            }, { transaction: t });

            // b. Actualizar saldo de la cuenta (Restar)
            const cuenta = await db.CuentaBancaria.findByPk(cuentaBancariaId, { transaction: t });
            if (!cuenta) throw new Error("Cuenta bancaria no encontrada");
            
            // Asumiendo que manejas el saldo en la cuenta (simple)
            // Si usas logica calculada, este paso se omite.
            await cuenta.decrement('saldoActual', { by: monto, transaction: t });

            estadoGasto = 'Pagado';
        }

        // 2. SIEMPRE REGISTRAR EL GASTO (La obligación contable)
        const nuevoGasto = await db.GastoVariable.create({
            fechaGasto: fecha || new Date(),
            monto: monto,
            moneda: moneda || 'USD',
            tipoOrigen: 'Nomina',
            empleadoId: empleadoId,
            estado: estadoGasto, // 'Pendiente' o 'Pagado'
            movimientoTesoreriaId: nuevoMovimiento ? nuevoMovimiento.id : null,
            descripcion: detalles || `Pago de nómina semanal`
        }, { transaction: t });

        await t.commit();
        return NextResponse.json({ success: true, gasto: nuevoGasto });

    } catch (error) {
        await t.rollback();
        console.error("Error procesando pago:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}