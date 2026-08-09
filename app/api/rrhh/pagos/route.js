import { NextResponse } from "next/server";
import db from "@/models"; // Ajusta la ruta a tus modelos según tu estructura

export async function POST(request) {
  // Iniciamos una transacción para asegurar que no se descuente dinero si falla el registro del gasto
  const t = await db.sequelize.transaction();

  try {
    const body = await request.json();
    const { 
      empleadoId, 
      monto, 
      moneda, 
      cuentaBancariaId, 
      fecha, 
      detalles 
    } = body;

    // Validaciones básicas
    if (!empleadoId || !monto) {
      throw new Error("Faltan datos obligatorios (empleado o monto)");
    }

    let nuevoMovimiento = null;
    let estadoGasto = 'Pendiente'; // Por defecto es una deuda

    // ---------------------------------------------------------
    // 1. SI SE SELECCIONÓ CUENTA BANCARIA (PROCESAR PAGO REAL)
    // ---------------------------------------------------------
    if (cuentaBancariaId) {
      // A. Verificar que la cuenta exista
      const cuenta = await db.CuentaBancaria.findByPk(cuentaBancariaId, { transaction: t });
      if (!cuenta) {
        throw new Error("La cuenta bancaria seleccionada no existe");
      }

      // B. Crear el Movimiento de Tesorería (Egreso)
      nuevoMovimiento = await db.MovimientoTesoreria.create({
        fechaMovimiento: fecha || new Date(),
        monto: monto, 
        moneda: moneda || 'USD',
        tipoMovimiento: 'Egreso',
        categoria: 'Pago Salario', // Categoría fija para nómina
        cuentaOrigenId: cuentaBancariaId, // Relación con la cuenta
        empleadoId: empleadoId, // Relación directa con empleado (opcional pero útil)
        descripcion: detalles || `Pago de nómina`
      }, { transaction: t });

      // C. Descontar el saldo de la cuenta bancaria
      // decrement es una función atómica de Sequelize/SQL
      await cuenta.decrement('saldoActual', { by: monto, transaction: t });

      // Cambiamos el estado futuro del gasto
      estadoGasto = 'Pagado';
    }

    // ---------------------------------------------------------
    // 2. REGISTRAR EL GASTO VARIABLE (OBLIGACIÓN CONTABLE)
    // ---------------------------------------------------------
    // Esto se crea SIEMPRE, ya sea que se pague ahora o después.
    const nuevoGasto = await db.GastoVariable.create({
      fechaGasto: fecha || new Date(),
      monto: monto,
      moneda: moneda || 'USD',
      tipoOrigen: 'Nomina', // Identificador clave para reportes
      empleadoId: empleadoId,
      estado: estadoGasto, // 'Pendiente' o 'Pagado'
      movimientoTesoreriaId: nuevoMovimiento ? nuevoMovimiento.id : null, // Enlace mágico
      descripcion: detalles || `Pago de nómina semanal`
    }, { transaction: t });

    // ---------------------------------------------------------
    // 3. CONFIRMAR TRANSACCIÓN
    // ---------------------------------------------------------
    await t.commit();

    return NextResponse.json({ 
      success: true, 
      message: estadoGasto === 'Pagado' ? 'Pago procesado exitosamente' : 'Deuda registrada exitosamente',
      gasto: nuevoGasto 
    }, { status: 201 });

  } catch (error) {
    // Si algo falla, revertimos cualquier cambio en la base de datos
    await t.rollback();
    console.error("Error procesando pago de nómina:", error);
    
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Error interno del servidor' 
    }, { status: 500 });
  }
}