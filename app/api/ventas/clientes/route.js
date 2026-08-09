import { NextResponse } from 'next/server';
import db from '../../../../models';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const activo = searchParams.get('activo'); 

    const whereClause = {};
    if (activo !== null) { 
      whereClause.activo = activo === 'true';
    }

    const clientes = await db.Cliente.findAll({
      where: whereClause,
      order: [['nombre', 'ASC']] // Siempre es bueno devolverlos ordenados
    });
    
    // Estandarizamos la respuesta con un objeto { success, data }
    return NextResponse.json({ success: true, data: clientes }, { status: 200 });
  } catch (error) {
    console.error('Error fetching clientes:', error);
    return NextResponse.json({ success: false, message: 'Error al obtener clientes', error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Filtramos exactamente lo que queremos guardar (Seguridad Anti-Inyección)
    const payloadSeguro = {
      nombre: body.nombre,
      identificacion: body.identificacion,
      contacto: body.contacto,
      telefono: body.telefono,
      email: body.email,
      direccion: body.direccion,
      notas: body.notas,
      // Nuevos campos fiscales:
      tipoPersona: body.tipoPersona || 'Juridica',
      esContribuyenteEspecial: body.esContribuyenteEspecial || false,
      retencionIvaPorDefecto: body.retencionIvaPorDefecto || '75',
      activo: body.activo !== undefined ? body.activo : true,
    };

    const nuevoCliente = await db.Cliente.create(payloadSeguro);
    
    return NextResponse.json({ success: true, data: nuevoCliente }, { status: 201 });
  } catch (error) {
    console.error('Error creating cliente:', error);
    return NextResponse.json({ success: false, message: 'Error al crear cliente', error: error.message }, { status: 400 });
  }
}