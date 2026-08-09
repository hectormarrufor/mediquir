import { NextResponse } from "next/server";
import db from "@/models";

// Tu estructura exacta sin inventar nada
const includeActivoExacto = {
  model: db.Activo,
  as: 'activo',
  attributes: ['id', 'codigoInterno', 'estado'],
  include: [
    {
      model: db.VehiculoInstancia,
      as: 'vehiculoInstancia',
      attributes: ['placa'],
      include: [{ model: db.Vehiculo, as: 'plantilla', attributes: ['marca', 'modelo'] }]
    },
    {
      model: db.RemolqueInstancia,
      as: 'remolqueInstancia',
      attributes: ['placa', 'marca', 'modelo'], // Remolque lo tiene directo también
      include: [{ model: db.Remolque, as: 'plantilla', attributes: ['marca', 'modelo'] }]
    },
    {
      model: db.MaquinaInstancia,
      as: 'maquinaInstancia',
      attributes: ['placa'],
      include: [{ model: db.Maquina, as: 'plantilla', attributes: ['marca', 'modelo'] }]
    }
  ]
};

export async function GET() {
  try {
    const registros = await db.HorasTrabajadas.findAll({
      include: [
        {
          model: db.Empleado
        },
        {
          model: db.ODT,
          include: [
            { model: db.Cliente, as: 'cliente' },
            {
              model: db.Activo, as: "vehiculoPrincipal",
              include: [
                {
                  model: db.VehiculoInstancia,
                  as: 'vehiculoInstancia',
                  attributes: ['placa'],
                  include: [{ model: db.Vehiculo, as: 'plantilla', attributes: ['marca', 'modelo'] }]
                }
              ]
            },
            {
              model: db.Activo, as: "vehiculoRemolque",
              include: [
                {
                  model: db.RemolqueInstancia,
                  as: 'remolqueInstancia',
                  attributes: ['placa'], // Remolque lo tiene directo también
                  include: [{ model: db.Remolque, as: 'plantilla', attributes: ['marca', 'modelo'] }]
                }
              ]
            },
            {
              model: db.Activo, as: "maquinaria",
              include: [
                {
                  model: db.MaquinaInstancia,
                  as: 'maquinaInstancia',
                  attributes: ['placa'],
                  include: [{ model: db.Maquina, as: 'plantilla', attributes: ['marca', 'modelo'] }]
                }
              ]
            }]
        },
        {
          model: db.Flete,
          include: [
            { model: db.Cliente },
            {
              model: db.Activo, as: "vehiculo",
              include: [
                {
                  model: db.VehiculoInstancia,
                  as: 'vehiculoInstancia',
                  attributes: ['placa'],
                  include: [{ model: db.Vehiculo, as: 'plantilla', attributes: ['marca', 'modelo'] }]
                },

              ]
            },
            {
              model: db.Activo, as: "remolque",
              include: [
                {
                  model: db.RemolqueInstancia,
                  as: 'remolqueInstancia',
                  attributes: ['placa'], // Remolque lo tiene directo también
                  include: [{ model: db.Remolque, as: 'plantilla', attributes: ['marca', 'modelo'] }]
                }
              ]
            }
          ],
        },
      ],
      order: [['fecha', 'DESC']]
    });

    return NextResponse.json(registros);
  } catch (error) {
    console.error("Error obteniendo horas trabajadas centralizadas:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}