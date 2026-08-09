import { NextResponse } from 'next/server';
import db from '../../../../../models';
import sequelize from '@/sequelize';

function getLastFriday() {
  const today = new Date();
  const day = today.getDay(); // 0=Domingo, 5=Viernes

  let diff;
  
  if (day === 5) {
    // CASO ESPECIAL (TU REQUERIMIENTO):
    // Si hoy es Viernes, no queremos "hoy", queremos el de la semana pasada.
    diff = 7;
  } else {
    // Fórmula estándar para buscar el viernes anterior desde cualquier otro día
    // Ejemplo Sábado (6): (6 + 7 - 5) % 7 = 8 % 7 = 1 día atrás.
    // Ejemplo Jueves (4): (4 + 7 - 5) % 7 = 6 días atrás.
    diff = (day + 7 - 5) % 7;
  }

  const lastFriday = new Date(today);
  lastFriday.setDate(today.getDate() - diff);
  lastFriday.setHours(0, 0, 0, 0);
  
  return lastFriday;
}

export async function GET(request, { params }) {
  const { id } = await params;
  
  // 1. Calculamos el inicio (Viernes pasado)
  const fechaInicio = getLastFriday();

  // 2. Calculamos el fin (El corte es hasta ayer Jueves a medianoche)
  // Básicamente: fechaInicio + 7 días exactos = Hoy Viernes a las 00:00:00
  // Usaremos operador "Menor que" (<) esta fecha para excluir lo de hoy.
  const fechaCorte = new Date(fechaInicio);
  fechaCorte.setDate(fechaCorte.getDate() + 7); 

  try {
    const empleado = await db.Empleado.findByPk(id, {
      include: [
        { model: db.Puesto, as: 'puestos', through: { attributes: [] } },
        { model: db.CuentaTerceros, as: 'cuentasBancarias' },
        { model: db.PagoMovil, as: 'pagosMoviles' },
        {
          model: db.HorasTrabajadas,
          // FILTRO AJUSTADO:
          where: {
            fecha: {
              [db.Sequelize.Op.gte]: fechaInicio, // >= Viernes pasado (00:00:00)
              [db.Sequelize.Op.lt]: fechaCorte    // <  Este Viernes (00:00:00) -> O sea, hasta Jueves 23:59:59
            }
          },
          order: [['fecha', 'ASC']],
          separate: true,
          required: false 
        },
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
        sueldo: body.sueldo,
        telefono: body.telefono,
        direccion: body.direccion,
        estado: body.estado,
        imagen: body.imagen,
        tasaSueldo: body.tasaSueldo,
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
    const empleado = await db.Empleado.findByPk(id);

    if (!empleado) {
      return NextResponse.json({ message: 'Empleado no encontrado' }, { status: 404 });
    }

    // Considera una eliminación lógica (cambiar estado a 'Inactivo') en lugar de física
    // await empleado.update({ estado: 'Inactivo' }); // Asumiendo que tienes un campo 'estado'
    // O para eliminación física:
    // Eliminar asociaciones many-to-many (por ejemplo puestos) si existen

    if (typeof empleado.setPuestos === 'function') {
      await empleado.setPuestos([]);
    }

    // Eliminar o desvincular registros que referencian al empleado en otras tablas
    const deletes = [];

    // Lista de modelos relacionados a revisar
    const relatedModels = [
      { model: db.Mantenimiento, name: 'Mantenimiento' },
      { model: db.OperacionCampo, name: 'OperacionCampo' },
    ].filter(item => item.model);

    // Intenta obtener el nombre de la FK desde las asociaciones del modelo
    function getForeignKey(model) {
      if (!model || !model.associations) return null;
      for (const assoc of Object.values(model.associations)) {
        if (assoc.target === db.Empleado || assoc.source === db.Empleado) {
          return assoc.foreignKey || assoc.foreignKeyAttribute || assoc.identifierField || null;
        }
      }
      return null;
    }

    for (const { model, name } of relatedModels) {
      try {
        // intenta primero la FK desde la asociación
        let fk = getForeignKey(model);

        // si no existe, intenta nombres comunes como respaldo
        if (!fk && model.rawAttributes) {
          const candidates = ['empleadoId', 'EmpleadoId', 'empleado_id', 'id_empleado', 'creadorId'];
          fk = candidates.find(c => Object.prototype.hasOwnProperty.call(model.rawAttributes, c));
        }

        // si aún no hay fk válida, omitir este modelo
        if (!fk) {
          console.warn(`No se encontró FK en ${name} para empleado; se omite borrado de registros relacionados.`);
          continue;
        }

        const where = {};
        where[fk] = id;
        deletes.push(model.destroy({ where }));
      } catch (e) {
        // Ignorar errores puntuales (tabla/columna ausente u otros) para no abortar todo el proceso
        console.warn(`Ocurrió un error al eliminar registros relacionados en ${name}:`, e.message);
      }
    }

    if (deletes.length) await Promise.all(deletes);
    await empleado.destroy();

    return NextResponse.json({ message: 'Empleado eliminado (o inactivado) exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return NextResponse.json({ message: 'Error al eliminar empleado', error: error.message }, { status: 500 });
  }
}