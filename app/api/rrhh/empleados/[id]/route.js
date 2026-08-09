import { NextResponse } from 'next/server';
import db from '../../../../../models';
import sequelize from '@/sequelize';


export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const empleado = await db.Empleado.findByPk(id, {
      include: [
        { model: db.Puesto, as: 'puestos', through: { attributes: [] } },
        { model: db.DocumentoEmpleado, as: 'documentos' },
      ],
    });

    if (!empleado) {
      return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    }

    return NextResponse.json(empleado);
  } catch (error) {
    console.error('Error fetching employee:', error);
    return NextResponse.json({ message: 'Error al obtener empleado', error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const t = await sequelize.transaction();

  try {
    // 1. Actualizar datos básicos del empleado
    await db.Empleado.update(
      {
        nombre: body.nombre,
        apellido: body.apellido,
        cedula: body.cedula,
        fechaNacimiento: body.fechaNacimiento,
        fechaIngreso: body.fechaIngreso,
        telefono: body.telefono,
        direccion: body.direccion,
        estado: body.estado,
        imagen: body.imagen,
        tallaCamisa: body.tallaCamisa,
        tallaPantalon: body.tallaPantalon,
        tallaCalzado: body.tallaCalzado,
        tallaBraga: body.tallaBraga,
      },
      { where: { id }, transaction: t }
    );

    // 2. Borrar relaciones actuales de puestos
    await db.EmpleadoPuesto.destroy({
      where: { empleadoId: id },
      transaction: t,
    });

    // 3. Insertar nuevas relaciones
    if (body.puestos && Array.isArray(body.puestos)) {
      const nuevasRelaciones = body.puestos.map((puestoId) => ({
        empleadoId: id,
        puestoId,
      }));

      await db.EmpleadoPuesto.bulkCreate(nuevasRelaciones, { transaction: t });
    }

    // 4. Confirmar transacción
    await t.commit();

    return NextResponse.json({ message: 'Empleado actualizado con puestos' });
  } catch (error) {
    await t.rollback();
    console.error(error);
    return NextResponse.json(
      { message: 'Error al actualizar empleado', error: error.message },
      { status: 500 }
    );
  }

}

export async function DELETE(request, { params }) {
  const { id } = await params;

  try {
    const deleted = await db.Empleado.destroy({
      where: { id },
    });

    if (!deleted) {
      return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Empleado eliminado correctamente' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return NextResponse.json(
      { message: 'Error al eliminar empleado', error: error.message },
      { status: 500 }
    );
  }
}

