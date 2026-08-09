import { NextResponse } from "next/server";
import { DocumentoEmpleado } from "@/models";

export async function POST(req) {
    try {
        const body = await req.json();
        const { empleadoId, tipo, gradoLicencia } = body;

        console.log("Cuerpo recibido en documento empleado:", body);

        // 1. Construir el criterio de búsqueda para saber si ya existe
        let whereClause = {
            empleadoId: empleadoId,
            tipo: tipo
        };

        // REGLA DE NEGOCIO:
        // Si es Licencia o Certificado, la unicidad es por TIPO + GRADO.
        // (Puede tener Licencia de 3ra y de 5ta, pero no dos de 5ta).
        if (tipo === 'Licencia' || tipo === 'CertificadoMedico') {
            // Aseguramos que estamos buscando exactamente ese grado
            whereClause.gradoLicencia = gradoLicencia; 
        }

        // 2. Buscar si ya existe el documento
        const documentoExistente = await DocumentoEmpleado.findOne({
            where: whereClause
        });

        let resultado;

        if (documentoExistente) {
            // --- ACTUALIZAR (UPDATE) ---
            // Si subieron una imagen nueva (URL), actualizamos todo.
            // Si la imagen viene null en el body (porque no la cambiaron en el form),
            // podríamos querer mantener la vieja, pero tu componente actual manda la URL si existe.
            
            // Filtramos campos undefined para no borrar data accidentalmente si el front no la manda
            const camposActualizar = {};
            if (body.numeroDocumento !== undefined) camposActualizar.numeroDocumento = body.numeroDocumento;
            if (body.fechaVencimiento !== undefined) camposActualizar.fechaVencimiento = body.fechaVencimiento;
            if (body.imagen !== undefined && body.imagen !== null) camposActualizar.imagen = body.imagen;
            
            // Actualizamos registro
            resultado = await documentoExistente.update(camposActualizar);
            
            // Opcional: Borrar la imagen anterior de Vercel Blob si cambió y quieres ahorrar espacio
            // (Requiere lógica extra de borrado de blob)
            
        } else {
            // --- CREAR (INSERT) ---
            resultado = await DocumentoEmpleado.create(body);
        }

        return NextResponse.json(resultado);

    } catch (error) {
        console.error("Error guardando documento:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE se mantiene igual...
export async function DELETE(req) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    try {
        await DocumentoEmpleado.destroy({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}