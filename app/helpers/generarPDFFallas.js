import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // Importación explícita

export const generarPDFFallas = (fallas) => {
    const doc = new jsPDF('p', 'pt', 'letter');
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Encabezado con Logo y Franja
    doc.setFillColor(33, 37, 41); // Gris oscuro
    doc.rect(0, 0, pageWidth, 30, 'F');
    
    try {
        doc.addImage('/logo.png', 'PNG', 8, 5, 50, 20); 
    } catch (e) {
        console.warn("No se pudo cargar el logo en el PDF, verifique public/logo.png", e);
    }

    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text('REPORTE DE FALLAS POR EQUIPO', pageWidth / 2 + 25, 20, { align: 'center' });

    // 2. Metadatos
    doc.setFontSize(10);
    doc.setTextColor(73, 80, 87);
    doc.setFont("helvetica", "bold");
    
    const fechaActual = new Date().toLocaleDateString('es-VE');
    doc.text(`FECHA:`, pageWidth - 140, 50);
    doc.setFont("helvetica", "normal");
    doc.text(fechaActual, pageWidth - 90, 50);

    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL FALLAS:`, pageWidth - 140, 65);
    doc.setFont("helvetica", "normal");
    doc.text(`${fallas.length}`, pageWidth - 55, 65);

    // 3. Agrupar las fallas por nombre de equipo
    const fallasAgrupadas = fallas.reduce((acc, falla) => {
        const equipo = falla.nombreEquipo || 'Equipo No Especificado';
        if (!acc[equipo]) acc[equipo] = [];
        acc[equipo].push(falla);
        return acc;
    }, {});

    // 4. Construir el cuerpo de la tabla (con filas separadoras)
    const tableBody = [];
    
    Object.keys(fallasAgrupadas).forEach((equipo) => {
        // Fila 1: El nombre del camión/equipo (Ocupa todas las columnas)
        tableBody.push([
            { 
                content: equipo.toUpperCase(), 
                colSpan: 4, 
                styles: { fillColor: [233, 236, 239], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 11, halign: 'left' } 
            }
        ]);

        // Fila 2...N: Las fallas de ese camión
        fallasAgrupadas[equipo].forEach((f, index) => {
            const fecha = new Date(f.createdAt).toLocaleDateString('es-VE');
            const reportadoPor = f.inspeccion?.reportadoPor?.empleado ? `${f.inspeccion.reportadoPor.empleado.nombre} ${f.inspeccion.reportadoPor.empleado.apellido}` : (f.inspeccion?.reportadoPor?.user || 'Sistema');
            
            tableBody.push([
                `${index + 1}. ${f.descripcion}`, 
                fecha, 
                reportadoPor, 
                f.impacto
            ]);
        });
    });

    // 5. Dibujar la tabla
    // Aplicamos autoTable como función independiente
    autoTable(doc, {
        startY: 85,
        head: [['Descripción de la Falla', 'Fecha Reporte', 'Reportado Por', 'Impacto']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [25, 113, 194], textColor: [255, 255, 255] }, // Azul
        styles: { fontSize: 9, cellPadding: 5 },
        columnStyles: {
            0: { cellWidth: 'auto' }, // Descripción toma el espacio sobrante
            1: { cellWidth: 70, halign: 'center' }, // Fecha
            2: { cellWidth: 100 }, // Persona
            3: { cellWidth: 70, halign: 'center', fontStyle: 'bold' } // Impacto
        },
        willDrawCell: function(data) {
            // Pintamos el texto de la columna Impacto según la gravedad
            if (data.section === 'body' && data.column.index === 3 && data.cell.raw) {
                if (data.cell.raw === 'No Operativo') doc.setTextColor(250, 82, 82); // Rojo
                else if (data.cell.raw === 'Advertencia') doc.setTextColor(253, 126, 20); // Naranja
                else if (data.cell.raw === 'Operativo') doc.setTextColor(64, 192, 87); // Verde
            }
        }
    });

    doc.save(`Reporte_Fallas_${fechaActual.replace(/\//g, '-')}.pdf`);
};