import { del } from '@vercel/blob';
import db from '@/models';
import { Op } from 'sequelize';

export async function limpiarSoportesRequisicion(requisicionId) {
    try {
        // 1. Buscar todas las cotizaciones asociadas que tengan un archivo
        const cotizaciones = await db.Cotizacion.findAll({
            where: {
                requisicionId: requisicionId,
                archivoUrl: { [Op.ne]: null }
            },
            attributes: ['id', 'archivoUrl']
        });

        if (cotizaciones.length === 0) return true; // Nada que borrar

        // 2. Extraer las URLs
        const urlsParaBorrar = cotizaciones.map(cot => cot.archivoUrl);

        // 3. Vercel Blob elimina arrays de URLs de un solo golpe
        await del(urlsParaBorrar);
        console.log(`🗑️ [Vercel Blob] Eliminados ${urlsParaBorrar.length} archivos de la Requisición ${requisicionId}`);

        // 4. Limpiar los registros en BD para que el frontend sepa que ya no existen
        await db.Cotizacion.update(
            { archivoUrl: null },
            { where: { requisicionId: requisicionId } }
        );

        return true;
    } catch (error) {
        console.error("❌ Error en Garbage Collector de Blob:", error);
        return false; 
    }
}