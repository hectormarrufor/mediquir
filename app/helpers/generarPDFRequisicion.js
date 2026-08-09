import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generarPDFRequisicion = (requisicion, equipoInfo = 'No especificado', fallaInfo = '') => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Encabezado con Logo y Franja
    doc.setFillColor(33, 37, 41); // Gris oscuro
    doc.rect(0, 0, pageWidth, 30, 'F');
    
    try {
        // El logo se busca en public/logo.png
        // (x, y, width, height) - Ajustado para que quepa en la franja de 30px
        doc.addImage('/logo.png', 'PNG', 8, 5, 50, 20); 
    } catch (e) {
        console.warn("No se pudo cargar el logo en el PDF, verifique public/logo.png", e);
    }

    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    // Moví el texto un poco a la derecha para no chocar con el logo si es muy ancho
    doc.text('ORDEN DE REQUISICIÓN DE MATERIALES', pageWidth / 2 + 25, 18, { align: 'center' });

    // 2. Metadatos (Se mantiene igual)
    doc.setFontSize(10);
    doc.setTextColor(73, 80, 87);
    doc.setFont("helvetica", "bold");
    doc.text(`CÓDIGO:`, pageWidth - 60, 40);
    doc.text(`FECHA:`, pageWidth - 60, 47);
    
    doc.setFont("helvetica", "normal");
    doc.text(`${requisicion.codigo}`, pageWidth - 35, 40);
    doc.text(`${new Date().toLocaleDateString('es-VE')}`, pageWidth - 35, 47);

    // 3. Información del Solicitante y Equipo
    const nombreSolicitante = requisicion.solicitante?.empleado 
        ? `${requisicion.solicitante.empleado.nombre} ${requisicion.solicitante.empleado.apellido}` 
        : requisicion.solicitante?.user || 'Usuario del Sistema';

    doc.setFont("helvetica", "bold");
    doc.text(`SOLICITADO POR:`, 14, 40);
    doc.text(`PRIORIDAD:`, 14, 47);
    doc.text(`EQUIPO DESTINO:`, 14, 54);

    doc.setFont("helvetica", "normal");
    doc.text(`${nombreSolicitante}`, 50, 40);
    
    // Color según prioridad
    const esCritica = requisicion.prioridad === 'Critica' || requisicion.prioridad === 'Alta';
    doc.setTextColor(esCritica ? 201 : 73, esCritica ? 42 : 80, esCritica ? 42 : 87);
    doc.text(`${requisicion.prioridad.toUpperCase()}`, 50, 47);
    
    doc.setTextColor(73, 80, 87);
    doc.text(`${equipoInfo}`, 50, 54);

    // 4. Justificación
    doc.setDrawColor(206, 212, 218);
    doc.line(14, 60, pageWidth - 14, 60);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text('JUSTIFICACIÓN DE LA SOLICITUD:', 14, 70);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const justificacionLines = doc.splitTextToSize(requisicion.justificacion || 'Sin justificación detallada.', pageWidth - 28);
    doc.text(justificacionLines, 14, 77);

    // 5. Tabla de Ítems usando autoTable directamente
    const startY = 85 + (justificacionLines.length * 5);
    const tableBody = requisicion.detalles.map((det, index) => [
        index + 1,
        det.consumible?.nombre || 'N/A',
        det.consumible?.categoria?.toUpperCase() || 'REPUESTO',
        `${det.cantidadSolicitada} ${det.consumible?.unidadMedida || 'und'}`
    ]);

    autoTable(doc, {
        startY: startY,
        head: [['#', 'DESCRIPCIÓN DEL COMPONENTE', 'CATEGORÍA', 'CANTIDAD']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [25, 113, 194], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'center', fontStyle: 'bold' } }
    });

    // 6. Firmas
    const finalY = doc.lastAutoTable.finalY + 30;
    doc.setDrawColor(173, 181, 189);
    doc.line(30, finalY + 15, 80, finalY + 15);
    doc.line(pageWidth - 80, finalY + 15, pageWidth - 30, finalY + 15);
    
    doc.setFontSize(9);
    doc.text('FIRMA SOLICITANTE', 55, finalY + 20, { align: 'center' });
    doc.text('AUTORIZADO POR', pageWidth - 55, finalY + 20, { align: 'center' });

    // Guardar
    doc.save(`${requisicion.codigo}_DADICA.pdf`);
};