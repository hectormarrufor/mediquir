import { NextResponse } from 'next/server';
import db from '../../../../../models';
import sequelize from '@/sequelize';
import { requerirAdmin, limpiar } from '../../_lib';


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
    if (!t.finished) await t.rollback();
    console.error(error);
    return NextResponse.json(
      { message: 'Error al actualizar empleado', error: error.message },
      { status: 500 }
    );
  }

}

// Edición de UN campo desde la hoja de empleados: lista blanca, no toca los puestos (el PUT sí los reemplaza).
const CAMPOS_HOJA = {
  nombre: { requerido: true }, apellido: { requerido: true }, cedula: { requerido: true },
  telefono: {}, direccion: {}, tallaPantalon: {}, tallaCalzado: {}, tallaBraga: {},
  estado: { opciones: ['Activo', 'Inactivo', 'Suspendido', 'Reposo Medico', 'Vacaciones', 'Permiso', 'Retirado'], requerido: true },
  tallaCamisa: { opciones: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
  genero: { opciones: ['Masculino', 'Femenino', 'Otro'] },
  fechaIngreso: { fecha: true }, fechaNacimiento: { fecha: true },
};

export async function PATCH(request, { params }) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  const { id } = await params;
  try {
    const body = await request.json();
    const cambios = {};
    for (const [campo, valor] of Object.entries(body || {})) {
      const regla = CAMPOS_HOJA[campo];
      if (!regla) continue; // campos ajenos: se ignoran
      const v = limpiar(valor);
      if (v === null) {
        if (regla.requerido) return NextResponse.json({ message: `"${campo}" no puede quedar vacío` }, { status: 400 });
        cambios[campo] = null;
        continue;
      }
      if (regla.opciones && !regla.opciones.includes(v)) return NextResponse.json({ message: `Valor no válido para "${campo}"` }, { status: 400 });
      if (regla.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return NextResponse.json({ message: 'La fecha debe ser AAAA-MM-DD' }, { status: 400 });
      cambios[campo] = v;
    }
    if (!Object.keys(cambios).length) return NextResponse.json({ message: 'Nada que actualizar' }, { status: 400 });

    const empleado = await db.Empleado.findByPk(id);
    if (!empleado) return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    if (cambios.cedula && cambios.cedula !== empleado.cedula && await db.Empleado.count({ where: { cedula: cambios.cedula } })) {
      return NextResponse.json({ message: 'Ya existe otro empleado con esa cédula' }, { status: 409 });
    }
    await empleado.update(cambios);
    return NextResponse.json({ ok: true, ...cambios });
  } catch (error) {
    console.error('Error en PATCH empleado:', error);
    return NextResponse.json({ message: 'No se pudo guardar', error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const acceso = await requerirAdmin();
  if (acceso.error) return acceso.error;
  const { id } = await params;

  const t = await sequelize.transaction();
  try {
    const empleado = await db.Empleado.findByPk(id, { transaction: t });
    if (!empleado) {
      await t.rollback();
      return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    }
    // Con usuario o documentos ya hay historia: se marca como "Retirado" en lugar de borrarlo
    if (await db.User.count({ where: { empleadoId: id }, transaction: t })) {
      await t.rollback();
      return NextResponse.json({ message: 'Tiene un usuario del sistema. Márcalo como "Retirado" o elimina su usuario primero.' }, { status: 409 });
    }
    if (await db.DocumentoEmpleado.count({ where: { empleadoId: id }, transaction: t })) {
      await t.rollback();
      return NextResponse.json({ message: 'Tiene documentos cargados. Márcalo como "Retirado" en lugar de eliminarlo.' }, { status: 409 });
    }
    await db.EmpleadoPuesto.destroy({ where: { empleadoId: id }, transaction: t });
    await empleado.destroy({ transaction: t });
    await t.commit();
    return NextResponse.json({ message: 'Empleado eliminado correctamente' });
  } catch (error) {
    if (!t.finished) await t.rollback();
    console.error('Error deleting employee:', error);
    return NextResponse.json(
      { message: 'Error al eliminar empleado', error: error.message },
      { status: 500 }
    );
  }
}

