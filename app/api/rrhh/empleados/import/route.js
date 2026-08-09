// app/api/empleados/import/route.js
import { NextResponse } from 'next/server';
import db from '../../../../../models';
import sequelize from '@/sequelize';

export async function POST(request) {
  const body = await request.json(); // JSON exportado previamente
  const t = await sequelize.transaction();

  try {
    for (const registro of body) {
      // 1. Crear empleado
      const empleado = await db.Empleado.create(registro, { transaction: t });

      // 2. Crear cuentas bancarias
      if (registro.cuentasBancarias) {
        for (const cuenta of registro.cuentasBancarias) {
          await db.CuentaTerceros.create(
            { ...cuenta, empleadoId: empleado.id },
            { transaction: t }
          );
        }
      }

      // 3. Crear pagos móviles
      if (registro.pagosMovil) {
        for (const pago of registro.pagosMovil) {
          await db.PagoMovil.create(
            { ...pago, empleadoId: empleado.id },
            { transaction: t }
          );
        }
      }

      // 4. Crear cuenta de usuario
      if (registro.cuentaUsuario) {
        await db.CuentaUsuario.create(
          { ...registro.cuentaUsuario, empleadoId: empleado.id },
          { transaction: t }
        );
      }

      // 5. Crear relaciones de puestos y departamentos
      if (registro.puestos && Array.isArray(registro.puestos)) {
        for (const puesto of registro.puestos) {
          // Crear o buscar departamento
          let departamento = null;
          if (puesto.departamento) {
            departamento = await db.Departamento.findOrCreate({
              where: { nombre: puesto.departamento.nombre },
              defaults: puesto.departamento,
              transaction: t
            }).then(([dep]) => dep);
          }

          // Crear puesto vinculado al departamento
          const nuevoPuesto = await db.Puesto.findOrCreate({
            where: { nombre: puesto.nombre },
            defaults: { ...puesto, departamentoId: departamento?.id },
            transaction: t
          }).then(([p]) => p);

          // Vincular empleado con puesto
          await db.EmpleadoPuesto.create(
            { empleadoId: empleado.id, puestoId: nuevoPuesto.id },
            { transaction: t }
          );
        }
      }
    }

    await t.commit();
    return NextResponse.json({ message: 'Empleados importados con todas sus relaciones y departamentos' }, { status: 201 });
  } catch (error) {
    await t.rollback();
    console.error('Error importando empleados:', error);
    return NextResponse.json(
      { message: 'Error al importar empleados', error: error.message },
      { status: 500 }
    );
  }
}