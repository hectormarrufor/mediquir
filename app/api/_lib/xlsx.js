// Archivo de Excel (.xlsx) de UNA hoja, sin librerías: un .xlsx es un ZIP con unos XML adentro.
// Encabezado en negrita y fijo al bajar, filtros en cada columna, números como números (sin redondear),
// textos como texto (los códigos de barras largos no se vuelven 7,59E+12) y fechas como fechas.
import { deflateRawSync } from 'zlib';

// ---------- ZIP ----------
const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

function zip(archivos) {
    const partes = [];
    const central = [];
    let offset = 0;
    for (const { nombre, contenido } of archivos) {
        const nom = Buffer.from(nombre, 'utf8');
        const datos = Buffer.from(contenido, 'utf8');
        const comp = deflateRawSync(datos);
        const crc = crc32(datos);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);       // versión necesaria
        local.writeUInt16LE(0x0800, 6);   // nombres en UTF-8
        local.writeUInt16LE(8, 8);        // deflate
        local.writeUInt16LE(0, 10);       // hora
        local.writeUInt16LE(0x21, 12);    // fecha 01/01/1980
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(comp.length, 18);
        local.writeUInt32LE(datos.length, 22);
        local.writeUInt16LE(nom.length, 26);
        partes.push(local, nom, comp);

        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0);
        cen.writeUInt16LE(20, 4);
        cen.writeUInt16LE(20, 6);
        cen.writeUInt16LE(0x0800, 8);
        cen.writeUInt16LE(8, 10);
        cen.writeUInt16LE(0, 12);
        cen.writeUInt16LE(0x21, 14);
        cen.writeUInt32LE(crc, 16);
        cen.writeUInt32LE(comp.length, 20);
        cen.writeUInt32LE(datos.length, 24);
        cen.writeUInt16LE(nom.length, 28);
        cen.writeUInt32LE(offset, 42);
        central.push(cen, nom);

        offset += local.length + nom.length + comp.length;
    }
    const tamCentral = central.reduce((s, b) => s + b.length, 0);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(archivos.length, 8);
    fin.writeUInt16LE(archivos.length, 10);
    fin.writeUInt32LE(tamCentral, 12);
    fin.writeUInt32LE(offset, 16);
    return Buffer.concat([...partes, ...central, fin]);
}

// ---------- Hoja ----------
const xml = (s) => String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '') // caracteres que el XML no admite
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const letra = (i) => { // 0 -> A, 25 -> Z, 26 -> AA
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
};

// Venezuela está en UTC-4 todo el año: la fecha se muestra en hora de Caracas, como en la app
const HUSO_CARACAS_MS = -4 * 3600 * 1000;
const serialExcel = (fecha) => (new Date(fecha).getTime() + HUSO_CARACAS_MS) / 86400000 + 25569;

const ESTILO = { encabezado: 1, fecha: 2, texto: 3 };

function celda(ref, tipo, v) {
    if (v === null || v === undefined || v === '') return '';
    if (tipo === 'numero') {
        const n = Number(v);
        if (!Number.isFinite(n)) return '';
        return `<c r="${ref}"><v>${Number(n.toPrecision(15))}</v></c>`; // solo quita el ruido de coma flotante (0.1+0.2), no redondea
    }
    if (tipo === 'fecha') {
        const t = new Date(v).getTime();
        if (!Number.isFinite(t)) return '';
        return `<c r="${ref}" s="${ESTILO.fecha}"><v>${serialExcel(v)}</v></c>`;
    }
    return `<c r="${ref}" s="${ESTILO.texto}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

/**
 * @param {{ hoja?: string, columnas: Array<{ label: string, tipo?: 'texto'|'numero'|'fecha', ancho?: number }>, filas: Array<Array<any>> }} p
 * @returns {Buffer} el .xlsx listo para descargar
 */
export function crearXlsx({ hoja = 'Hoja1', columnas, filas }) {
    const nombreHoja = xml(String(hoja).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja1');
    const ultima = letra(Math.max(columnas.length - 1, 0));
    const rango = `A1:${ultima}${filas.length + 1}`;

    const cols = columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho || 14}" customWidth="1"/>`).join('');
    const encabezado = `<row r="1">${columnas.map((c, i) => `<c r="${letra(i)}1" s="${ESTILO.encabezado}" t="inlineStr"><is><t xml:space="preserve">${xml(c.label)}</t></is></c>`).join('')}</row>`;
    const cuerpo = filas.map((fila, f) => {
        const r = f + 2;
        return `<row r="${r}">${columnas.map((c, i) => celda(`${letra(i)}${r}`, c.tipo || 'texto', fila[i])).join('')}</row>`;
    }).join('');

    const hojaXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<dimension ref="${rango}"/>`
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        + '<sheetFormatPr defaultRowHeight="15"/>'
        + (cols ? `<cols>${cols}</cols>` : '')
        + `<sheetData>${encabezado}${cuerpo}</sheetData>`
        + `<autoFilter ref="${rango}"/>`
        + '</worksheet>';

    const libro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets>`
        + `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nombreHoja.replace(/'/g, "''")}'!$A$1:$${ultima}$${filas.length + 1}</definedName></definedNames>`
        + '</workbook>';

    const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        + '<fill><patternFill patternType="solid"><fgColor rgb="FF1B2A4A"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="4">'
        + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
        + '</cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        + '</styleSheet>';

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
