import { NextResponse } from 'next/server';
import db from '../../../../../models';

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const cliente = await db.Cliente.findByPk(id, {
      include: [
        { model: db.ContratoServicio, as: 'contratos' },
        { model: db.Factura, as: 'facturas' },
      ],
    });

    if (!cliente) {
      return NextResponse.json({ success: false, message: 'Cliente no encontrado' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: cliente }, { status: 200 });
  } catch (error) {
    console.error('Error fetching cliente:', error);
    return NextResponse.json({ success: false, message: 'Error al obtener cliente', error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const cliente = await db.Cliente.findByPk(id);

    if (!cliente) {
      return NextResponse.json({ success: false, message: 'Cliente no encontrado' }, { status: 404 });
    }

    // Filtramos para asegurar que no nos inyecten IDs u otros datos corruptos
    const payloadSeguro = {
      nombre: body.nombre !== undefined ? body.nombre : cliente.nombre,
      identificacion: body.identificacion !== undefined ? body.identificacion : cliente.identificacion,
      contacto: body.contacto !== undefined ? body.contacto : cliente.contacto,
      telefono: body.telefono !== undefined ? body.telefono : cliente.telefono,
      email: body.email !== undefined ? body.email : cliente.email,
      direccion: body.direccion !== undefined ? body.direccion : cliente.direccion,
      notas: body.notas !== undefined ? body.notas : cliente.notas,
      // Campos Fiscales
      tipoPersona: body.tipoPersona !== undefined ? body.tipoPersona : cliente.tipoPersona,
      esContribuyenteEspecial: body.esContribuyenteEspecial !== undefined ? body.esContribuyenteEspecial : cliente.esContribuyenteEspecial,
      retencionIvaPorDefecto: body.retencionIvaPorDefecto !== undefined ? body.retencionIvaPorDefecto : cliente.retencionIvaPorDefecto,
      activo: body.activo !== undefined ? body.activo : cliente.activo,
    };

    await cliente.update(payloadSeguro);
    
    return NextResponse.json({ success: true, data: cliente }, { status: 200 });
  } catch (error) {
    console.error('Error updating cliente:', error);
    return NextResponse.json({ success: false, message: 'Error al actualizar cliente', error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    const cliente = await db.Cliente.findByPk(id);

    if (!cliente) {
      return NextResponse.json({ success: false, message: 'Cliente no encontrado' }, { status: 404 });
    }

    // Eliminación lógica recomendada para mantener historial de facturas
    await cliente.update({ activo: false });

    return NextResponse.json({ success: true, message: 'Cliente desactivado exitosamente' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting cliente:', error);
    return NextResponse.json({ success: false, message: 'Error al eliminar cliente', error: error.message }, { status: 500 });
  }
}