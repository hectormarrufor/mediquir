// Lista de precios en Excel (.xlsx): la misma estructura que el PDF, sin fotos.
//   Membrete claro con los datos de Mediquir · título «LISTA DE PRECIOS» · encabezado de la tabla
//   · un bloque por categoría (fila de la categoría y debajo sus productos) · nota del IVA al final.
// Los precios van como NÚMEROS (se pueden sumar o filtrar) con formato $ de 2 a 3 decimales, sin redondear.
import { zip, xml, letra } from './xlsx';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';

// Estilos (índices de cellXfs, ver estilos más abajo)
const S = { empresa: 1, datos: 2, titulo: 3, subtitulo: 4, cabecera: 5, categoria: 6, texto: 7, precio: 8, precioCaja: 9, nota: 10, cabeceraDer: 11, gris: 12, membrete: 13 };

const celdaTexto = (ref, v, s) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(v ?? '')}</t></is></c>`;
const celdaNumero = (ref, v, s) => (Number.isFinite(Number(v)) && v !== null && v !== ''
    ? `<c r="${ref}" s="${s}"><v>${Number(Number(v).toPrecision(15))}</v></c>`
    : `<c r="${ref}" s="${s}"/>`);
// Fila que ocupa todo el ancho: el texto en la columna A y el resto vacías con el mismo estilo (para que el fondo cubra todo)
const filaAncha = (r, ultima, texto, s, alto) => {
    const vacias = Array.from({ length: ultima }, (_, i) => `<c r="${letra(i + 1)}${r}" s="${s}"/>`).join('');
    return `<row r="${r}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>${celdaTexto(`A${r}`, texto, s)}${vacias}</row>`;
};

/**
 * @param {{ etiqueta: string, fecha: string, filas: Array<{codigo, nombre, marca, categoria, presentacion: string, precio, precioCaja, exento: boolean}>, conCaja: boolean, notaIva: string }} p
 * @returns {Buffer}
 */
export function crearXlsxListaPrecios({ etiqueta, fecha, filas, conCaja, notaIva }) {
    const columnas = [
        { label: 'Código', ancho: 14 },
        { label: 'Producto', ancho: 58 },
        { label: 'Marca', ancho: 20 },
        { label: 'Presentación', ancho: 16 },
        { label: `${etiqueta} (USD)`, ancho: 18, der: true },
        ...(conCaja ? [{ label: 'Precio por caja (USD)', ancho: 20, der: true }] : []),
    ];
    const ultima = columnas.length - 1;
    const L = letra(ultima);
    const fechaTxt = new Date(fecha).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'long', year: 'numeric' });

    const filasXml = [];
    const unir = [];
    let r = 0;
    const ancha = (texto, s, alto) => { r += 1; filasXml.push(filaAncha(r, ultima, texto, s, alto)); unir.push(`A${r}:${L}${r}`); };

    // ---- Membrete (fondo claro, letras azul marino) ----
    ancha('', S.membrete, 6);
    ancha(`MEDIQUIR · ${MEMBRETE_MEDIQUIR.nombre.toUpperCase()}`, S.empresa, 24);
    ancha(`RIF ${MEMBRETE_MEDIQUIR.rif}  ·  Tel. ${MEMBRETE_MEDIQUIR.telefonos}  ·  ${MEMBRETE_MEDIQUIR.email}  ·  @mediquirca`, S.datos, 17);
    ancha(MEMBRETE_MEDIQUIR.direccion, S.datos, 17);
    ancha('', S.membrete, 6);
    r += 1; filasXml.push(`<row r="${r}" ht="8" customHeight="1"/>`);

    // ---- Título ----
    ancha('LISTA DE PRECIOS', S.titulo, 30);
    ancha(`${etiqueta} · Precios en dólares (USD), sin IVA · ${fechaTxt} · ${filas.length.toLocaleString('es-VE')} productos`, S.subtitulo, 18);
    r += 1; filasXml.push(`<row r="${r}" ht="8" customHeight="1"/>`);

    // ---- Encabezado de la tabla (queda fijo al bajar) ----
    r += 1;
    const filaCabecera = r;
    filasXml.push(`<row r="${r}" ht="22" customHeight="1">${columnas.map((c, i) => celdaTexto(`${letra(i)}${r}`, c.label, c.der ? S.cabeceraDer : S.cabecera)).join('')}</row>`);

    // ---- Un bloque por categoría ----
    let categoriaActual = null;
    for (const f of filas) {
        if (f.categoria !== categoriaActual) {
            categoriaActual = f.categoria;
            ancha(String(f.categoria || 'Sin categoría').toUpperCase(), S.categoria, 20);
        }
        r += 1;
        const celdas = [
            celdaTexto(`A${r}`, f.codigo || '', S.gris),
            celdaTexto(`B${r}`, f.exento ? `${f.nombre} (E)` : f.nombre, S.texto),
            celdaTexto(`C${r}`, f.marca || '', S.gris),
            celdaTexto(`D${r}`, f.presentacion || '', S.texto),
            celdaNumero(`E${r}`, f.precio, S.precio),
        ];
        if (conCaja) celdas.push(celdaNumero(`F${r}`, f.precioCaja, S.precioCaja));
        filasXml.push(`<row r="${r}">${celdas.join('')}</row>`);
    }

    // ---- Nota del IVA ----
    r += 1; filasXml.push(`<row r="${r}" ht="8" customHeight="1"/>`);
    ancha(notaIva, S.nota, 30);

    const cols = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho}" customWidth="1"/>`).join('');
    const hojaXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
        + `<dimension ref="A1:${L}${r}"/>`
        + `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${filaCabecera}" topLeftCell="A${filaCabecera + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
        + '<sheetFormatPr defaultRowHeight="16"/>'
        + `<cols>${cols}</cols>`
        + `<sheetData>${filasXml.join('')}</sheetData>`
        + `<mergeCells count="${unir.length}">${unir.map((u) => `<mergeCell ref="${u}"/>`).join('')}</mergeCells>`
        + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
        + '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
        + '</worksheet>';

    // Paleta: azul marino 0B1B3D, azul de marca 005AAA, fondo del membrete F0F6FD, fondo de categoría E6F1FC
    const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<numFmts count="1"><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00#"/></numFmts>'
        + '<fonts count="9">'
        + '<font><sz val="10"/><color rgb="FF232D3C"/><name val="Calibri"/><family val="2"/></font>'                 // 0 cuerpo
        + '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>'             // 1 cabecera tabla
        + '<font><b/><sz val="14"/><color rgb="FF0B1B3D"/><name val="Calibri"/><family val="2"/></font>'             // 2 empresa
        + '<font><sz val="9.5"/><color rgb="FF354D85"/><name val="Calibri"/><family val="2"/></font>'                // 3 datos empresa
        + '<font><b/><sz val="20"/><color rgb="FF0B1B3D"/><name val="Calibri"/><family val="2"/></font>'             // 4 título
        + '<font><sz val="10"/><color rgb="FF005AAA"/><name val="Calibri"/><family val="2"/></font>'                 // 5 subtítulo
        + '<font><b/><sz val="10.5"/><color rgb="FF0B1B3D"/><name val="Calibri"/><family val="2"/></font>'           // 6 categoría
        + '<font><i/><sz val="8.5"/><color rgb="FF6E7887"/><name val="Calibri"/><family val="2"/></font>'            // 7 nota
        + '<font><sz val="9.5"/><color rgb="FF6E7887"/><name val="Calibri"/><family val="2"/></font>'                // 8 gris (código, marca)
        + '</fonts>'
        + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F6FD"/><bgColor indexed="64"/></patternFill></fill>'   // 2 membrete
        + '<fill><patternFill patternType="solid"><fgColor rgb="FF005AAA"/><bgColor indexed="64"/></patternFill></fill>'   // 3 cabecera
        + '<fill><patternFill patternType="solid"><fgColor rgb="FFE6F1FC"/><bgColor indexed="64"/></patternFill></fill>'   // 4 categoría
        + '</fills>'
        + '<borders count="3">'
        + '<border><left/><right/><top/><bottom/><diagonal/></border>'
        + '<border><left/><right/><top/><bottom style="thin"><color rgb="FFDEE4EC"/></bottom><diagonal/></border>'      // 1 renglón
        + '<border><left/><right/><top/><bottom style="medium"><color rgb="FF005AAA"/></bottom><diagonal/></border>'    // 2 filo del membrete
        + '</borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="14">'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'                                                                                              // 0
        + '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>'   // 1 empresa
        + '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>'   // 2 datos
        + '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'                            // 3 título
        + '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'                            // 4 subtítulo
        + '<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>'   // 5 cabecera
        + '<xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>'   // 6 categoría
        + '<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' // 7 texto
        + '<xf numFmtId="165" fontId="6" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 8 precio
        + '<xf numFmtId="165" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 9 precio caja
        + '<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>'                  // 10 nota
        + '<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' // 11 cabecera derecha
        + '<xf numFmtId="49" fontId="8" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' // 12 gris
        + '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>'                                                                                // 13 relleno del membrete
        + '</cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>';

    const libro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="Lista de precios" sheetId="1" r:id="rId1"/></sheets>'
        + `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'Lista de precios'!$${filaCabecera}:$${filaCabecera}</definedName></definedNames>`
        + '</workbook>';

    return zip([
        {
            nombre: '[Content_Types].xml',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                + '<Default Extension="xml" ContentType="application/xml"/>'
                + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                + '</Types>',
        },
        {
            nombre: '_rels/.rels',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                + '</Relationships>',
        },
        { nombre: 'xl/workbook.xml', contenido: libro },
        {
            nombre: 'xl/_rels/workbook.xml.rels',
            contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                + '</Relationships>',
        },
        { nombre: 'xl/worksheets/sheet1.xml', contenido: hojaXml },
        { nombre: 'xl/styles.xml', contenido: estilos },
    ]);
}
