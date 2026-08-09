// app/api/empleados/export/route.js
import { NextResponse } from 'next/server';
import db from '../../../../../models';

export async function GET() {
  try {
    const empleados = await db.Empleado.findAll({
      include: [
        { model: db.CuentaTerceros, as: 'cuentasBancarias' },
        { model: db.PagoMovil, as: 'pagosMovil' },
        { model: db.CuentaUsuario, as: 'cuentaUsuario' },
        {
          model: db.Puesto,
          as: 'puestos',
          through: { attributes: [] },
          include: [
            { model: db.Departamento, as: 'departamento' } // 👈 relación con departamento
          ]
        }
      ],
    });

    const respaldo = empleados.map(e => e.toJSON());
    return NextResponse.json(respaldo, { status: 200 });
  } catch (error) {
    console.error('Error exportando empleados:', error);
    return NextResponse.json(
      { message: 'Error al exportar empleados', error: error.message },
      { status: 500 }
    );
  }
}