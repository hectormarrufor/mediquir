import { put, del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { requerirStaff } from '@/app/api/inventario/_lib';


export async function POST(request) {
    // Antes esta ruta no validaba sesión: cualquiera podía modificar datos.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  // ✨ Log para depuración: ¿Está llegando la petición?
  console.log(`[API UPLOAD] Iniciando subida para el archivo: ${filename}`);

  if (!filename || !request.body) {
    console.error('[API UPLOAD] Error: Faltó el nombre del archivo o el cuerpo de la petición.');
    return NextResponse.json({ message: 'No se proporcionó un nombre de archivo.' }, { status: 400 });
  }

  try {
    const blob = await put(filename, request.body, {
      access: 'public',
      allowOverwrite: true, // Permitir sobrescribir archivos con el mismo nombre
    });

    console.log(`[API UPLOAD] Éxito: Archivo subido a la URL: ${blob.url}`);
    return NextResponse.json(blob);

  } catch (error) {
    // ✨ Log de error detallado
    console.error("[API UPLOAD] Error CRÍTICO al subir a Vercel Blob:", error);
    return NextResponse.json({ message: 'Error en el servidor al subir el archivo.', error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
    // Antes esta ruta no validaba sesión: cualquiera podía modificar datos.
    const { error: sinAcceso } = await requerirStaff();
    if (sinAcceso) return sinAcceso;

    const { id } = params;
    const transaction = await db.sequelize.transaction();
    try {
        const activoAEliminar = await db.Activo.findByPk(id, { transaction });
        if (!activoAEliminar) {
            await transaction.rollback();
            return NextResponse.json({ message: 'Activo no encontrado' }, { status: 404 });
        }

        const urlImagenAEliminar = activoAEliminar.imagen;

        // 1. Eliminamos el registro del activo de la base de datos.
        await activoAEliminar.destroy({ transaction });

        await transaction.commit();

        // El Blob se elimina fuera de la transacción para no retener la conexión durante I/O de red.
        if (urlImagenAEliminar) {
            try { await del(urlImagenAEliminar); }
            catch (e) { console.error('Blob huérfano, no se pudo borrar:', urlImagenAEliminar, e.message); }
        }
        console.log(`\x1b[32m [SUCCESS]: Activo ${id} eliminado correctamente. \x1b[0m`);
        return NextResponse.json({ message: 'Activo eliminado correctamente.' }, { status: 200 });

    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.log(`\x1b[41m [ERROR]: Error al eliminar la imagen: ${error.message} \x1b[0m`);
        
        return NextResponse.json({ message: 'Error al eliminar el activo.', error: error.message }, { status: 500 });
        // ... (tu manejo de errores)
    }
}