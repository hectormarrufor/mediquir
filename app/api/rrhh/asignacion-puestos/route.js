// app/api/superuser/rrhh/asignacion-puestos/route.js
import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import db from '../../../../models';


// GET: Obtener todas las asignaciones o filtrar por empleado/puesto
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const empleadoId = searchParams.get('empleadoId');
    const puestoId = searchParams.get('puestoId');

    const where = {};
    if (empleadoId) {
      where.empleadoId = parseInt(empleadoId);
    }
    if (puestoId) {
      where.puestoId = parseInt(puestoId);
    }

    const asignaciones = await db.EmpleadoPuesto.findAll({
      where,
      include: [
        {
          model: db.Empleado,
          as: 'Empleado', // Este alias debe coincidir con el nombre del modelo
          attributes: ['id', 'nombre', 'apellido', 'cedula'],
        },
        {
          model: db.Puesto,
          as: 'Puesto', // Este alias debe coincidir con el nombre del modelo
          attributes: ['id', 'nombre'],
        },
      ],
      order: [['fechaAsignacion', 'DESC']],
    });

    return NextResponse.json(asignaciones);
  } catch (error) {
    console.error('Error al obtener asignaciones de puestos:', error);
    return NextResponse.json({ message: 'Error al obtener asignaciones de puestos', error: error.message }, { status: 500 });
  }
}

// POST: Crear una nueva asignación de puesto
export async function POST(request) {
  try {
    const { empleadoId, puestoId, fechaAsignacion, fechaFin } = await request.json();

    if (!empleadoId || !puestoId || !fechaAsignacion) {
      return NextResponse.json({ message: 'Empleado, Puesto y Fecha de Asignación son requeridos' }, { status: 400 });
    }

    // Opcional: Verificar si ya existe una asignación activa similar
    // const existingAssignment = await db.EmpleadoPuesto.findOne({
    //   where: {
    //     empleadoId,
    //     puestoId,
    //     fechaFin: { [Op.is]: null } // Que no tenga fecha de fin, es decir, activa
    //   }
    // });
    // if (existingAssignment) {
    //   return NextResponse.json({ message: 'Esta asignación de puesto ya existe y está activa para este empleado.' }, { status: 409 });
    // }

    const nuevaAsignacion = await db.EmpleadoPuesto.create({
      empleadoId,
      puestoId,
      fechaAsignacion,
      fechaFin,
    });

    return NextResponse.json(nuevaAsignacion, { status: 201 });
  } catch (error) {
    console.error('Error al crear asignación de puesto:', error);
    return NextResponse.json({ message: 'Error al crear asignación de puesto', error: error.message }, { status: 500 });
  }
}

// PUT: Actualizar una asignación existente
export async function PUT(request) {
  try {
    const { id, fechaAsignacion, fechaFin } = await request.json();

    if (!id) {
      return NextResponse.json({ message: 'ID de asignación es requerido para actualizar' }, { status: 400 });
    }

    const asignacion = await db.EmpleadoPuesto.findByPk(id);
    if (!asignacion) {
      return NextResponse.json({ message: 'Asignación no encontrada' }, { status: 404 });
    }

    await asignacion.update({ fechaAsignacion, fechaFin });

    return NextResponse.json(asignacion);
  } catch (error) {
    console.error('Error al actualizar asignación de puesto:', error);
    return NextResponse.json({ message: 'Error al actualizar asignación de puesto', error: error.message }, { status: 500 });
  }
}

// DELETE: Eliminar una asignación
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'ID de asignación es requerido para eliminar' }, { status: 400 });
    }

    const result = await db.EmpleadoPuesto.destroy({
      where: { id: parseInt(id) },
    });

    if (result === 0) {
      return NextResponse.json({ message: 'Asignación no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Asignación eliminada exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error al eliminar asignación de puesto:', error);
    return NextResponse.json({ message: 'Error al eliminar asignación de puesto', error: error.message }, { status: 500 });
  }
}