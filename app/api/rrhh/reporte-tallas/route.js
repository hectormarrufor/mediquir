import { Empleado } from "@/models";
import { NextResponse } from "next/server";
import sequelize from "@/sequelize";

export async function GET() {
  try {
    const [calzado, camisas, pantalones, bragas] = await Promise.all([
      Empleado.findAll({
        attributes: ['tallaCalzado', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        where: { estado: 'Activo' },
        group: ['tallaCalzado'],
        raw: true
      }),
      Empleado.findAll({
        attributes: ['tallaCamisa', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        where: { estado: 'Activo' },
        group: ['tallaCamisa'],
        raw: true
      }),
      Empleado.findAll({
        attributes: ['tallaPantalon', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        where: { estado: 'Activo' },
        group: ['tallaPantalon'],
        raw: true
      }),
      Empleado.findAll({
        attributes: ['tallaBraga', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
        where: { estado: 'Activo' },
        group: ['tallaBraga'],
        raw: true
      })
    ]);

    return NextResponse.json({ calzado, camisas, pantalones, bragas });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}