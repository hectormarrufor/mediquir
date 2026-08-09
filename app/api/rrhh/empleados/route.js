import { NextResponse } from 'next/server';
import db from '../../../../models';

import { Op } from 'sequelize'; // Útil si quieres búsquedas avanzadas en el futuro

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // -----------------------------------------------------------------------
    // 1. LÓGICA DE FILTRADO (WHERE)
    // -----------------------------------------------------------------------
    // Formato esperado: ?where=estado:Activo,genero:Femenino
    const whereParam = searchParams.get('where');
    const whereClause = {};

    if (whereParam) {
      // Separamos por comas si hay múltiples filtros
      const filters = whereParam.split(','); 
      
      filters.forEach(filter => {
        // Separamos clave y valor por los dos puntos
        const [key, value] = filter.split(':');
        if (key && value) {
            // Asignamos al objeto whereClause
            whereClause[key] = value;
        }
      });
    }

    // -----------------------------------------------------------------------
    // 2. LÓGICA DE INCLUDES
    // -----------------------------------------------------------------------
    // Formato esperado: ?include=horasTrabajadas
    const includeParam = searchParams.get('include') || '';
    
    // Definimos includes BASE (Información que casi siempre quieres ver)
    // Si prefieres que sea ESTRICTAMENTE nada si no pasas params, vacía este array.
    // Pero recomiendo dejar 'puestos' y 'usuario' para que la UI no se rompa.
    const includeOptions = [
      {
        model: db.Puesto,
        as: 'puestos',
        through: { attributes: [] }
      },
      {
        model: db.User,
        as: 'usuario',
        attributes: ['id', 'user'],
      }
    ];

    // Agregamos includes dinámicos según el parámetro
    if (includeParam.includes('horasTrabajadas')) {
      includeOptions.push({
        model: db.HorasTrabajadas,
        // Nota: En tu modelo no definiste alias 'as' para esta relación, 
        // así que no lo ponemos aquí para evitar error de Sequelize.
      });
    }

    if (includeParam.includes('cuentasBancarias')) {
      includeOptions.push({
        model: db.CuentaTerceros,
        as: 'cuentasBancarias'
      });
    }

    if (includeParam.includes('pagosMoviles')) {
      includeOptions.push({
        model: db.PagoMovil,
        as: 'pagosMoviles'
      });
    }

    if (includeParam.includes('pagos')) {
      includeOptions.push({
        model: db.GastoVariable,
        as: 'pagos'
      });
    }
    // Puedes agregar más condiciones aquí en el futuro
    // if (includeParam.includes('documentos')) { ... }


    // -----------------------------------------------------------------------
    // 3. PAGINACIÓN Y CONSULTA
    // -----------------------------------------------------------------------
    const page = searchParams.get('page');
    const limit = searchParams.get('limit');
    
    // Opciones base de la consulta
    const queryOptions = {
      where: whereClause,
      include: includeOptions,
      order: [['nombre', 'ASC']],
      distinct: true, // Importante para contar correctamente con includes hasMany
    };

    // Si existen page y limit, agregamos paginación
    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      queryOptions.limit = limitNum;
      queryOptions.offset = offset;
      
      // Usamos findAndCountAll para paginación real
      const { rows, count } = await db.Empleado.findAndCountAll(queryOptions);
      
      return NextResponse.json({
        data: rows,
        meta: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum)
        }
      });
    }

    // Si no hay paginación, traemos todo (Fetchee a todos)
    const empleados = await db.Empleado.findAll(queryOptions);

    return NextResponse.json(empleados);

  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { message: 'Error al obtener empleados', error: error.message }, 
      { status: 500 }
    );
  }
}

export async function POST(request) {
  // Usamos una transacción para asegurar que o todo se crea, o no se crea nada.
  const transaction = await db.sequelize.transaction();
  try {
    const body = await request.json();
    // 1. Separamos los IDs de los puestos del resto de los datos del empleado.
    const { puestos, ...empleadoData } = body;

    // 2. Creamos el empleado dentro de la transacción.
    const nuevoEmpleado = await db.Empleado.create(empleadoData, { transaction });

    // 3. Si el frontend envió un array de puestosIds, los asociamos.
    if (puestos && puestos.length > 0) {
      // ✨ ¡AQUÍ ESTÁ LA MAGIA! ✨
      // 'addPuestos' es un método que Sequelize añade automáticamente.
      // Su nombre viene del alias 'as: "puestos"' en tu modelo Empleado.
      await nuevoEmpleado.addPuestos(puestos, { transaction });
    }

    // 4. Si todo salió bien, confirmamos la transacción.
    await transaction.commit();

    // 5. Devolvemos el empleado recién creado con sus puestos ya asociados.
    const result = await db.Empleado.findByPk(nuevoEmpleado.id, {
      include: [{
        model: db.Puesto,
        as: 'puestos',
        attributes: ['id', 'nombre'],
        through: { attributes: [] } // Para no incluir la data de la tabla intermedia
      }
      ]
    });

    return NextResponse.json(result, { status: 201 });

  } catch (error) {
    // Si algo falla, revertimos todos los cambios.
    await transaction.rollback();
    console.error('Error al crear el empleado:', error);
    return NextResponse.json({
      message: 'Error al crear el empleado',
      error: error.message
    }, { status: 500 });
  }
}