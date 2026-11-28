// app/api/presupuestos/analizar-archivo/route.js
// Analiza un PDF, Excel (.xlsx), CSV o imagen de solicitud de cotización con Gemini y propone renglones
// emparejados contra el catálogo real de Mediquir (con alternativas de marca y detección de faltantes).
import { NextResponse } from 'next/server';
import { Producto, Categoria, Marca, GrupoEquivalencia, Tag } from '@/models';
import { requerirStaff } from '@/app/api/inventario/_lib';
import { generarConFallback } from '@/app/helpers/geminiConFallback.mjs';
import { buscarProductos, normalizar } from '@/app/helpers/busquedaProductos';
import { presentacionDe } from '@/app/constants/presentaciones';
import { leerXlsx } from '@/app/api/_lib/xlsx';

export const maxDuration = 60;

const MAX_MB = 15;
const MAX_ITEMS = 120;

const IMAGENES_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]);

const IMAGEN_POR_EXT = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
};

const PROMPT_EXTRACCION = `
Eres un asistente experto en suministros médicos, quirúrgicos, odontológicos, laboratorio y hospitalarios en Venezuela.
El cliente envió este documento (PDF, hoja de Excel, CSV o foto) solicitando una COTIZACIÓN / PRESUPUESTO.
Tu empresa que cotiza es MEDIQUIR (MATERIALES Y EQUIPOS QUIRURGICOS MEDIQUIR, C.A.), así que si aparece Mediquir no es el cliente, sino el proveedor que emitirá el presupuesto.

Extrae TODOS los renglones o artículos solicitados sin omitir ninguno.
Reglas:
1. "textoOriginal": el texto tal como aparece en la fila/renglón del documento (corto y legible, máx. 180 caracteres).
2. "descripcionLimpia": descripción normalizada en español para buscar en inventario médico, SIN la cantidad al inicio (ej: "Guantes de látex talla M", "Gasas estériles 10x10", "Sutura nylon 3-0 aguja 3/8"). Conserva medidas, tallas, calibres (G, Fr, mm, ml, cm, pulgadas) porque distinguen productos diferentes.
3. "marcaSolicitada": la marca o fabricante SI el cliente la especifica expresamente en ese renglón o columna (ej: "Nipro", "Protec", "3M", "Kramer", "Supermax"); si no especifica marca, null.
4. "cantidad": número entero positivo (>= 1) pedido en el renglón. Si no hay cantidad clara o dice "c/u" sin número, usa 1.
5. "presentacionSolicitada": "CAJA" si pide cajas ("caja", "cajas", "cj", "cx100", "box"), "BULTO" si pide bultos o fardos ("bulto", "bto", "fardo"), "UNIDAD" si pide unidades, pares, piezas, paquetes o rollos; null si no es claro.
6. "unidadSolicitada": texto breve de la unidad tal como viene en el archivo (ej: "Cajas", "Pares", "Unidades", "Paquetes"), o null.
7. "precioReferencia": número solo si el archivo ya incluye un precio objetivo/referencia por unidad para ese renglón; normalmente null.
8. "clienteSugerido": nombre o razón social del cliente/clínica/farmacia solicitante si aparece en el documento (no Mediquir); si no, null.
9. "notasGenerales": breve nota opcional si el archivo indica vigencia, condiciones de entrega u observación relevante; si no, null.

Ignora filas de encabezados de tabla ("Descripción", "Cant.", "Total"), subtotales, totales generales, firmas o pies de página.

Responde SOLO este JSON válido:
{
  "clienteSugerido": "string" | null,
  "notasGenerales": "string" | null,
  "items": [
    {
      "textoOriginal": "string",
      "descripcionLimpia": "string",
      "marcaSolicitada": "string" | null,
      "cantidad": number,
      "presentacionSolicitada": "UNIDAD" | "CAJA" | "BULTO" | null,
      "unidadSolicitada": "string" | null,
      "precioReferencia": number | null
    }
  ]
}
`;

const PROMPT_EMPAREJAR = `
Eres el cotizador experto de Mediquir (insumos médicos, quirúrgicos y odontológicos).
Recibirás una lista de renglones solicitados por un cliente junto con hasta 8 productos CANDIDATOS reales de nuestro inventario para cada renglón.

Para cada renglón ("idx"):
1. Elige el "productoId" del mejor candidato que realmente corresponda al artículo pedido, o null si NINGÚN candidato corresponde al mismo producto (por ejemplo si el catálogo no tiene ese artículo, o si la medida/calibre/tipo de los candidatos es claramente distinta al pedido). No fuerces coincidencias falsas.
2. Si el cliente pidió una marca específica y existe en los candidatos, prefierela. Si esa marca no está pero existe otra marca equivalente del mismo producto, elige la mejor alternativa (preferiblemente con "stock" > 0), pon "confianza": "media" y explica breve en "motivo" (ej: "Otra marca: pidió X, sugerimos Y").
3. Si el mejor candidato tiene "stock" <= 0 pero hay otra marca/opción con stock > 0, considera sugerir la que tiene stock (o indícalo en "motivo"). Si la única coincidencia tiene stock 0, selecciónala igualmente e indica "Sin stock actual" en "motivo".
4. "confianza":
   - "alta": coincide producto, medida/calibre y marca (o no pidió marca)
   - "media": mismo producto pero cambia marca, presentación, falta verificar medida, o no tiene stock
   - "baja": coincidencia parcial o dudosa que requiere revisión manual
   - "ninguna": productoId es null (no existe en inventario)
5. "presentacion": elige "CAJA" solo si pidió por cajas y el candidato elegido tiene "porCaja" > 1; "BULTO" solo si pidió bultos y tiene "porBulto" > 1; en cualquier otro caso usa "UNIDAD".
6. "motivo": explicación muy corta en español (máx. 60 caracteres) para ayudar al vendedor a decidir (ej: "Coincide con marca pedida", "Otra marca disponible", "Sin stock actual", "No encontrado en catálogo").
7. "alternativasIds": hasta 5 IDs de otros candidatos razonables (por ejemplo otras marcas del mismo producto) distintos del productoId elegido.

Responde SOLO este JSON válido:
{
  "matches": [
    {
      "idx": number,
      "productoId": number | null,
      "confianza": "alta" | "media" | "baja" | "ninguna",
      "presentacion": "UNIDAD" | "CAJA" | "BULTO",
      "motivo": "string",
      "alternativasIds": [number]
    }
  ]
}
`;

const limpiarJson = (txt) => String(txt || '').replace(/```json|```/gi, '').trim();

function esPdfBuffer(buf) {
    return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

function esZipBuffer(buf) {
    return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

function esXlsAntiguoBuffer(buf) {
    return buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

function decodificarTextoPlano(buf) {
    const utf8 = buf.toString('utf8');
    if (utf8.includes('\uFFFD')) {
        return buf.toString('latin1').slice(0, 80000);
    }
    return utf8.slice(0, 80000);
}

function prepararEntradaArchivo(file, buffer) {
    const nombre = String(file.name || '').trim();
    const ext = nombre.includes('.') ? nombre.split('.').pop().toLowerCase() : '';
    const tipo = String(file.type || '').toLowerCase().trim();

    if (esXlsAntiguoBuffer(buffer) || (ext === 'xls' && !esZipBuffer(buffer))) {
        return {
            error: 'El archivo está en formato Excel antiguo (.xls). Guárdalo como Excel moderno (.xlsx) o PDF y vuelve a subirlo.',
        };
    }

    if (tipo === 'application/pdf' || ext === 'pdf' || esPdfBuffer(buffer)) {
        return {
            kind: 'inline',
            part: { inlineData: { data: buffer.toString('base64'), mimeType: 'application/pdf' } },
        };
    }

    if (IMAGENES_MIME.has(tipo) || IMAGEN_POR_EXT[ext]) {
        const mime = IMAGEN_POR_EXT[ext] || (tipo === 'image/jpg' ? 'image/jpeg' : tipo);
        return {
            kind: 'inline',
            part: { inlineData: { data: buffer.toString('base64'), mimeType: mime } },
        };
    }

    const pareceXlsx =
        ext === 'xlsx'
        || tipo === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        || (esZipBuffer(buffer) && !['pdf', 'csv', 'tsv', 'txt'].includes(ext));
    if (pareceXlsx) {
        const { hojas, textoPlano } = leerXlsx(buffer);
        if (!hojas.length || !textoPlano.trim()) {
            return { error: 'El archivo Excel no tiene renglones legibles.' };
        }
        return { kind: 'text', texto: textoPlano };
    }

    const pareceTextoCsv =
        ['csv', 'tsv', 'txt'].includes(ext)
        || ['text/csv', 'text/plain', 'text/tab-separated-values', 'application/csv'].includes(tipo)
        || (tipo === 'application/vnd.ms-excel' && ext === 'csv');
    if (pareceTextoCsv) {
        const texto = decodificarTextoPlano(buffer);
        if (!texto.trim()) {
            return { error: 'El archivo de texto o CSV está vacío.' };
        }
        return { kind: 'text', texto };
    }

    return {
        error: 'Formato no soportado. Sube un PDF, Excel (.xlsx), CSV o imagen (JPG, PNG, WEBP).',
    };
}

function construirCandidatos(item, productosCatalogo, porGrupo) {
    const desempate = (p) => (Number(p.stockAlmacen) > 0 ? 1 : 0);
    const conMarca = [item.descripcionLimpia, item.marcaSolicitada].filter(Boolean).join(' ');

    const hits = [];
    const vistos = new Set();
    const agregar = (lista, limite) => {
        let añadidos = 0;
        for (const p of lista) {
            if (!p || vistos.has(p.id)) continue;
            vistos.add(p.id);
            hits.push(p);
            añadidos++;
            if (añadidos >= limite) break;
        }
    };

    if (conMarca) agregar(buscarProductos(productosCatalogo, conMarca, { desempate }), 5);
    if (item.descripcionLimpia) agregar(buscarProductos(productosCatalogo, item.descripcionLimpia, { desempate }), 5);
    if (item.textoOriginal && item.textoOriginal !== item.descripcionLimpia) {
        agregar(buscarProductos(productosCatalogo, item.textoOriginal, { desempate }), 3);
    }

    // Añadir hermanos del mismo grupo de equivalencia de los mejores resultados para mostrar otras marcas
    const gruposVistos = new Set();
    let gruposAñadidos = 0;
    for (const h of [...hits]) {
        const gid = h.grupoEquivalenciaId || h.grupoEquivalencia?.id;
        if (!gid || gruposVistos.has(gid)) continue;
        gruposVistos.add(gid);
        gruposAñadidos++;
        const hermanos = (porGrupo.get(gid) || [])
            .filter((p) => !vistos.has(p.id))
            .sort((a, b) => (Number(b.stockAlmacen) || 0) - (Number(a.stockAlmacen) || 0));
        agregar(hermanos, 4);
        if (gruposAñadidos >= 2) break;
    }

    return hits.slice(0, 8);
}

function elegirPresentacionValida(producto, solicitada) {
    if (!producto) return 'UNIDAD';
    const pref = ['CAJA', 'BULTO', 'UNIDAD'].includes(solicitada) ? solicitada : 'UNIDAD';
    if (pref !== 'UNIDAD' && presentacionDe(producto, pref)) return pref;
    return 'UNIDAD';
}

function resumenAlternativa(p) {
    return {
        id: p.id,
        nombre: p.nombre,
        marca: p.marca?.nombre || null,
        codigo: p.codigo || null,
        stock: Number(p.stockAlmacen) || 0,
    };
}

export async function POST(req) {
    const acceso = await requerirStaff();
    if (acceso.error) return acceso.error;

    try {
        const formData = await req.formData();
        const file = formData.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') {
            return NextResponse.json({ error: 'Debes seleccionar un archivo para analizar.' }, { status: 400 });
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            return NextResponse.json({ error: `El archivo pesa más de ${MAX_MB} MB.` }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const entrada = prepararEntradaArchivo(file, buffer);
        if (entrada.error) {
            return NextResponse.json({ error: entrada.error }, { status: 400 });
        }

        // Paso A: Extracción de renglones con Gemini
        const partesA = entrada.kind === 'inline'
            ? [PROMPT_EXTRACCION, entrada.part]
            : [`${PROMPT_EXTRACCION}\n\nCONTENIDO DEL ARCHIVO:\n${entrada.texto}`];

        const { texto: textoA, modelo: modeloA } = await generarConFallback(partesA, {
            json: true,
            sinPensar: true,
            timeout: 45000,
        });

        const parsedA = JSON.parse(limpiarJson(textoA));
        const crudos = Array.isArray(parsedA?.items) ? parsedA.items : [];
        const itemsLimpios = crudos
            .map((it) => {
                const desc = String(it?.descripcionLimpia || it?.textoOriginal || '').trim().slice(0, 220);
                const orig = String(it?.textoOriginal || desc).trim().slice(0, 220);
                const cantNum = Number(it?.cantidad);
                const cantidad = Number.isFinite(cantNum) && cantNum > 0 ? Math.max(1, Math.round(cantNum)) : 1;
                const precioRefNum = Number(it?.precioReferencia);
                return {
                    textoOriginal: orig,
                    descripcionLimpia: desc,
                    marcaSolicitada: it?.marcaSolicitada ? String(it.marcaSolicitada).trim().slice(0, 80) : null,
                    cantidad,
                    presentacionSolicitada: ['UNIDAD', 'CAJA', 'BULTO'].includes(it?.presentacionSolicitada)
                        ? it.presentacionSolicitada
                        : null,
                    unidadSolicitada: it?.unidadSolicitada ? String(it.unidadSolicitada).trim().slice(0, 40) : null,
                    precioReferencia: Number.isFinite(precioRefNum) && precioRefNum > 0 ? precioRefNum : null,
                };
            })
            .filter((it) => it.descripcionLimpia);

        if (itemsLimpios.length === 0) {
            return NextResponse.json(
                { error: 'No se detectaron renglones o productos en el archivo.' },
                { status: 400 },
            );
        }

        const truncado = itemsLimpios.length > MAX_ITEMS;
        const itemsExtraidos = itemsLimpios.slice(0, MAX_ITEMS);

        // Paso B: Cargar inventario real y prefiltrar candidatos por renglón
        const rowsProductos = await Producto.findAll({
            attributes: [
                'id', 'codigo', 'nombre', 'presentacion',
                'unidadesPorCaja', 'cajasPorBulto', 'unidadesPorBulto',
                'stockAlmacen', 'grupoEquivalenciaId',
            ],
            include: [
                { model: Marca, as: 'marca', attributes: ['id', 'nombre'] },
                { model: Categoria, as: 'categoria', attributes: ['id', 'nombre'] },
                { model: GrupoEquivalencia, as: 'grupoEquivalencia', attributes: ['id', 'nombre'] },
                { model: Tag, as: 'tags', attributes: ['id', 'nombre'], through: { attributes: [] } },
            ],
        });

        const productosCatalogo = rowsProductos.map((r) => r.toJSON());
        const productosById = new Map();
        const porGrupo = new Map();

        for (const p of productosCatalogo) {
            productosById.set(Number(p.id), p);
            const gid = p.grupoEquivalenciaId || p.grupoEquivalencia?.id;
            if (gid) {
                if (!porGrupo.has(gid)) porGrupo.set(gid, []);
                porGrupo.get(gid).push(p);
            }
        }

        const candidatosPorIdx = itemsExtraidos.map((it) => construirCandidatos(it, productosCatalogo, porGrupo));
        const conCandidatos = itemsExtraidos
            .map((it, idx) => ({
                idx,
                pedido: {
                    textoOriginal: it.textoOriginal,
                    descripcionLimpia: it.descripcionLimpia,
                    marcaSolicitada: it.marcaSolicitada,
                    unidadSolicitada: it.unidadSolicitada,
                    presentacionSolicitada: it.presentacionSolicitada,
                    cantidad: it.cantidad,
                },
                candidatos: candidatosPorIdx[idx].map((p) => ({
                    id: p.id,
                    nombre: p.nombre,
                    marca: p.marca?.nombre || null,
                    codigo: p.codigo || null,
                    presentacion: p.presentacion || 'unidad',
                    porCaja: Number(p.unidadesPorCaja) || null,
                    porBulto: Number(p.unidadesPorBulto) || null,
                    stock: Number(p.stockAlmacen) || 0,
                })),
            }))
            .filter((entry) => entry.candidatos.length > 0);

        // Paso C: Desambiguación compacta con Gemini sobre los mejores candidatos
        const matchesPorIdx = new Map();
        let modeloUsado = modeloA;

        if (conCandidatos.length > 0) {
            try {
                const payloadEmparejar = `${PROMPT_EMPAREJAR}\n\nRENGLONES A EMPAREJAR:\n${JSON.stringify(conCandidatos)}`;
                const { texto: textoC, modelo: modeloC } = await generarConFallback(payloadEmparejar, {
                    json: true,
                    sinPensar: true,
                    timeout: 45000,
                });
                modeloUsado = modeloC || modeloA;
                const parsedC = JSON.parse(limpiarJson(textoC));
                const listaMatches = Array.isArray(parsedC?.matches) ? parsedC.matches : [];
                for (const m of listaMatches) {
                    const idx = Number(m?.idx);
                    if (Number.isInteger(idx)) matchesPorIdx.set(idx, m);
                }
            } catch (errEmparejar) {
                console.warn('Presupuestos IA emparejar fallback:', errEmparejar?.message || errEmparejar);
            }
        }

        // Paso D: Consolidar respuesta validada
        const itemsFinales = itemsExtraidos.map((it, idx) => {
            const candidatos = candidatosPorIdx[idx];
            const matchIA = matchesPorIdx.get(idx);

            let prodElegido = null;
            let confianza = 'ninguna';
            let motivo = '';
            let presentacionSugerida = it.presentacionSolicitada || 'UNIDAD';

            if (matchIA) {
                const idIA = Number(matchIA.productoId);
                if (Number.isInteger(idIA) && productosById.has(idIA)) {
                    prodElegido = productosById.get(idIA);
                }
                confianza = ['alta', 'media', 'baja', 'ninguna'].includes(matchIA.confianza)
                    ? matchIA.confianza
                    : (prodElegido ? 'media' : 'ninguna');
                if (!prodElegido) confianza = 'ninguna';
                motivo = matchIA.motivo ? String(matchIA.motivo).trim().slice(0, 100) : '';
                presentacionSugerida = elegirPresentacionValida(
                    prodElegido,
                    matchIA.presentacion || it.presentacionSolicitada,
                );
            } else if (candidatos.length > 0) {
                // Fallback heurístico si no hubo respuesta de desambiguación para este renglón
                const palabrasPedido = normalizar(it.descripcionLimpia).split(' ').filter((w) => w.length >= 3);
                const top = candidatos[0];
                const textoTop = normalizar(`${top.nombre} ${top.marca?.nombre || ''} ${top.codigo || ''}`);
                const hits = palabrasPedido.filter((w) => textoTop.includes(w)).length;
                if (palabrasPedido.length > 0 && hits >= Math.ceil(palabrasPedido.length * 0.6)) {
                    prodElegido = top;
                    confianza = Number(top.stockAlmacen) > 0 ? 'media' : 'baja';
                    motivo = Number(top.stockAlmacen) > 0
                        ? 'Coincidencia automática (revisar)'
                        : 'Sin stock actual (revisar)';
                    presentacionSugerida = elegirPresentacionValida(top, it.presentacionSolicitada);
                } else {
                    motivo = 'Sin coincidencia clara en inventario';
                }
            } else {
                motivo = 'No encontrado en inventario';
            }

            // Construir lista de alternativas (priorizando IA + hermanos del mismo grupo + candidatos)
            const altIdsVistos = new Set();
            if (prodElegido) altIdsVistos.add(prodElegido.id);
            const poolAlternativas = [];
            const agregarAlt = (p) => {
                if (!p || altIdsVistos.has(p.id)) return;
                altIdsVistos.add(p.id);
                poolAlternativas.push(p);
            };

            if (Array.isArray(matchIA?.alternativasIds)) {
                for (const aid of matchIA.alternativasIds) {
                    const p = productosById.get(Number(aid));
                    if (p) agregarAlt(p);
                }
            }
            if (prodElegido) {
                const gid = prodElegido.grupoEquivalenciaId || prodElegido.grupoEquivalencia?.id;
                if (gid && porGrupo.has(gid)) {
                    porGrupo.get(gid).forEach(agregarAlt);
                }
            }
            candidatos.forEach(agregarAlt);

            const alternativas = poolAlternativas
                .sort((a, b) => (Number(b.stockAlmacen) > 0 ? 1 : 0) - (Number(a.stockAlmacen) > 0 ? 1 : 0)
                    || (Number(b.stockAlmacen) || 0) - (Number(a.stockAlmacen) || 0))
                .slice(0, 6)
                .map(resumenAlternativa);

            return {
                textoOriginal: it.textoOriginal,
                descripcionLimpia: it.descripcionLimpia,
                marcaSolicitada: it.marcaSolicitada,
                cantidad: it.cantidad,
                unidadSolicitada: it.unidadSolicitada,
                precioReferencia: it.precioReferencia,
                productoId: prodElegido ? prodElegido.id : null,
                presentacionSugerida,
                confianza,
                motivo,
                alternativas,
            };
        });

        return NextResponse.json({
            modelo: modeloUsado,
            archivoNombre: file.name || 'archivo',
            clienteSugerido: parsedA?.clienteSugerido ? String(parsedA.clienteSugerido).trim().slice(0, 120) : null,
            notasGenerales: parsedA?.notasGenerales ? String(parsedA.notasGenerales).trim().slice(0, 300) : null,
            truncado,
            items: itemsFinales,
        });
    } catch (error) {
        console.error('Presupuestos analizar-archivo Error:', error);
        if (error?.intentos) {
            const detalle = error.intentos.map((i) => `${i.modelo}: ${i.motivo}`).join(' · ');
            const cuota = error.status === 429;
            return NextResponse.json({
                error: `${cuota ? 'Se agotó el uso gratuito de la IA por hoy.' : 'La IA no pudo analizar el archivo.'} Inténtalo más tarde o carga los productos manualmente. (${detalle})`,
                intentos: error.intentos,
            }, { status: error.status || 502 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({
                error: 'La IA devolvió una respuesta ilegible al leer el archivo. Intenta con un archivo más claro o en PDF/Excel.',
            }, { status: 502 });
        }
        const detalleGeneral = String(error?.message || '').slice(0, 180);
        return NextResponse.json(
            { error: detalleGeneral || 'No se pudo analizar el archivo con IA.' },
            { status: 500 },
        );
    }
}
