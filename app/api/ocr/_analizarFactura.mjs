// Lectura de una factura de compra venezolana con Gemini: se sube la foto o el PDF y la IA extrae los datos para PROPONER
// el formulario de compras. Nada se registra solo: la persona revisa cada renglón y elige el producto.
// (Mismo mecanismo que el proyecto WR, adaptado a insumos médicos: código del proveedor, caja y bulto de cada renglón.)
import { generarConFallback } from "../../helpers/geminiConFallback.mjs";

const PROMPT_FACTURA = `
  Analiza esta imagen o PDF de una FACTURA (o nota de entrega) de compra emitida por un proveedor en Venezuela.
  Casi siempre es un distribuidor de insumos médicos, quirúrgicos u odontológicos, pero también puede ser un gasto de la empresa
  (servicios, comida, equipos, reparaciones): lee igual todos sus datos. EL CLIENTE es "MATERIALES Y EQUIPOS QUIRURGICOS MEDIQUIR, C.A."
  (RIF J-30487649-1): sus datos aparecen en la factura pero NO son del proveedor.

  FORMATO DE LOS NÚMEROS: cada factura usa el suyo. Unas escriben "1.234,56" (punto de miles, coma decimal) y otras "1,234.56"
  (coma de miles, punto decimal). Deduce el formato de ESTA factura: el separador decimal es el que va seguido de exactamente 2
  dígitos al final del número, y cantidad × precio unitario debe dar el monto del renglón. Ejemplos: "31,802.04" = 31802.04;
  "31.802,04" = 31802.04; "105.078,00" = 105078; "6,00" = 6. Devuelve todos los números planos con punto decimal y sin separador de miles.
  Si un dato no se ve, devuélvelo null; no lo inventes.

  MONEDA: muchas facturas imprimen los montos en dólares Y en bolívares (dos columnas de precio, o "MONTO EN DIVISAS" y "MONTO EN BS").
  Los montos FISCALES son los de BOLÍVARES: úsalos SIEMPRE para precioUnitario, totalLinea, base, exento, IVA y total, y responde
  moneda "VES", aunque la cabecera diga "Moneda: US$". Solo si la factura NO trae ningún monto en bolívares usa los dólares y moneda "USD".
  Los montos en dólares, si están, van aparte en precioUnitarioUsd y totalUsd.

  1. tipoDocumento: "FACTURA" si dice factura (lleva número de control e IVA), "NOTA_ENTREGA" si es nota de entrega, presupuesto u orden sin valor fiscal.
  2. numeroFactura: el "Nº de factura" (sin ceros de más ni prefijos como "Nro").
  3. numeroControl: el "Nº de control". En facturas de formato libre suele empezar con "00-". En las facturas emitidas por
     impresora o máquina fiscal aparece ABAJO, al final del documento, con las letras "MH" a su izquierda (por ejemplo
     "MH Z7C7005010"): devuelve SOLO el código que sigue a "MH", sin las letras "MH". Mira siempre el pie de la factura.
  4. fechaEmision: fecha de emisión en formato YYYY-MM-DD.
  5. proveedorNombre y proveedorRif: razón social y RIF de quien EMITE la factura (el vendedor, NO el cliente), RIF en formato J-12345678-9.
     También proveedorTelefono, proveedorEmail y proveedorDireccion (dirección fiscal completa en una sola línea) si se ven; si no, null.
  6. moneda: "VES" si la factura trae montos en bolívares (ver MONEDA arriba); "USD" solo si todo está en dólares.
  7. tasaBcv: la tasa de cambio en bolívares por dólar SOLO si la factura la indica ("Tasa: 883,39", "Tasa de cambio según BCV", "Tasa BCV"); si no, null.
  8. lineas: TODOS los renglones facturados, uno por cada fila de la tabla de artículos, sin omitir ninguno (incluso la primera fila).
     Antes de responder verifica que la suma de cantidad × precioUnitario de tus renglones coincida con el subtotal de la factura;
     si no coincide, revisa si te falta alguna fila. Cada renglón lleva:
       - codigo: el código o referencia del artículo del PROVEEDOR tal como está impreso (columna "Código", "Ref", "Cód."), o null.
       - descripcion: texto completo del artículo, tal como está impreso.
       - marca: la marca o el fabricante del artículo SOLO si está impresa en el renglón (dentro de la descripción, por ejemplo
         "FAJA DORSOLUMBAR TALLA L PROTEC" -> "PROTEC", o en una columna "Marca"/"Fabricante"), tal como aparece; si no aparece, null.
         No la deduzcas ni la inventes: el mismo artículo existe en varias marcas y la que vale es la que llegó.
       - cantidad: número tal como está en la columna de cantidad.
       - unidadVenta: en qué se vende ese renglón según la factura: "CAJA" si la cantidad son cajas (columna unidad "CJ", "CAJA",
         o la descripción dice "CAJA X 100", "C/100", "CJ X 50"), "BULTO" si son bultos o fardos ("BULTO", "BTO", "FARDO"),
         "UNIDAD" si son unidades sueltas ("UND", "UN", "PZA", "PAR"); null si no se puede saber.
       - unidadesPorPresentacion: cuántas unidades trae UNA caja o UN bulto según la descripción o la columna de unidad
         (por ejemplo "CAJA X 100" -> 100, "C/50" -> 50, "BULTO 10 CAJAS X 100" -> 1000), o null si no lo dice.
       - cajasPorBulto: si el renglón es un bulto y dice cuántas cajas trae (por ejemplo "BULTO 10 CAJAS"), ese número; si no, null.
       - precioUnitario: precio de UNA unidad de la cantidad facturada (de una caja si se vende por caja), SIN IVA, en la moneda de la factura
         (bolívares si los hay). Si el renglón tiene descuento, el precio ya descontado (monto del renglón ÷ cantidad).
       - precioUnitarioUsd: el precio unitario en dólares si la factura también lo imprime; si no, null.
       - exento: true si ese renglón NO lleva IVA (marca "(E)", "E", "Exento", alícuota 0%); false si lleva IVA.
       - totalLinea: el monto total de esa fila tal como está impreso (cantidad × precio), en la moneda de la factura, o null si la fila no lo trae.
     Copia los precios EXACTAMENTE como están impresos, con todos sus decimales; no redondees ni recalcules nada. Todo debe
     cuadrar al céntimo porque es un documento fiscal (SENIAT).
  9. montoExento: monto total exento o no sujeto a IVA (o null).
  10. baseImponible: base imponible sobre la que se calcula el IVA (o null).
  11. porcentajeIva: alícuota del IVA (normalmente 16) o null.
  12. montoIva: monto del IVA (o null).
  13. total: total a pagar de la factura, en la moneda de la factura (bolívares si los hay).
  14. totalUsd: el total en dólares si la factura también lo imprime; si no, null.

  Responde SOLO este JSON válido:
  {
    "tipoDocumento": "FACTURA" | "NOTA_ENTREGA",
    "numeroFactura": "string" | null,
    "numeroControl": "string" | null,
    "fechaEmision": "YYYY-MM-DD" | null,
    "proveedorNombre": "string" | null,
    "proveedorRif": "string" | null,
    "proveedorTelefono": "string" | null,
    "proveedorEmail": "string" | null,
    "proveedorDireccion": "string" | null,
    "moneda": "VES" | "USD",
    "tasaBcv": number | null,
    "lineas": [ { "codigo": "string" | null, "descripcion": "string", "marca": "string" | null, "cantidad": number, "unidadVenta": "CAJA" | "BULTO" | "UNIDAD" | null,
                  "unidadesPorPresentacion": number | null, "cajasPorBulto": number | null, "precioUnitario": number, "precioUnitarioUsd": number | null,
                  "exento": boolean, "totalLinea": number | null } ],
    "montoExento": number | null,
    "baseImponible": number | null,
    "porcentajeIva": number | null,
    "montoIva": number | null,
    "total": number | null,
    "totalUsd": number | null
  }
`;

const numero = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param {Buffer|Uint8Array} buffer   contenido del archivo (imagen o PDF)
 * @param {string} mimeType
 * @returns lectura limpia: números como número (o null) y renglones sin filas vacías
 */
export async function analizarFactura(buffer, mimeType) {
    const { texto, modelo } = await generarConFallback(
        [PROMPT_FACTURA, { inlineData: { data: Buffer.from(buffer).toString("base64"), mimeType } }],
        { json: true, timeout: 55000 },
    );
    const d = JSON.parse(texto.replace(/```json|```/g, "").trim());
    const lineas = (Array.isArray(d.lineas) ? d.lineas : [])
        .map((l) => ({
            codigo: l?.codigo ? String(l.codigo).trim().slice(0, 60) : null,
            descripcion: String(l?.descripcion || '').trim().slice(0, 300),
            marca: l?.marca ? String(l.marca).trim().slice(0, 80) : null,
            cantidad: numero(l?.cantidad),
            unidadVenta: ['CAJA', 'BULTO', 'UNIDAD'].includes(l?.unidadVenta) ? l.unidadVenta : null,
            unidadesPorPresentacion: numero(l?.unidadesPorPresentacion),
            cajasPorBulto: numero(l?.cajasPorBulto),
            precioUnitario: numero(l?.precioUnitario),
            precioUnitarioUsd: numero(l?.precioUnitarioUsd),
            exento: Boolean(l?.exento),
            totalLinea: numero(l?.totalLinea),
        }))
        .filter((l) => l.descripcion && l.cantidad > 0);
    return {
        tipoDocumento: d.tipoDocumento === 'NOTA_ENTREGA' ? 'NOTA_ENTREGA' : 'FACTURA',
        numeroFactura: d.numeroFactura ? String(d.numeroFactura).trim() : null,
        numeroControl: d.numeroControl ? String(d.numeroControl).trim() : null,
        fechaEmision: /^\d{4}-\d{2}-\d{2}$/.test(d.fechaEmision || '') ? d.fechaEmision : null,
        proveedorNombre: d.proveedorNombre ? String(d.proveedorNombre).trim() : null,
        proveedorRif: d.proveedorRif ? String(d.proveedorRif).trim() : null,
        proveedorTelefono: d.proveedorTelefono ? String(d.proveedorTelefono).trim() : null,
        proveedorEmail: d.proveedorEmail ? String(d.proveedorEmail).trim() : null,
        proveedorDireccion: d.proveedorDireccion ? String(d.proveedorDireccion).trim() : null,
        moneda: d.moneda === 'USD' ? 'USD' : 'VES',
        tasaBcv: numero(d.tasaBcv),
        lineas,
        montoExento: numero(d.montoExento),
        baseImponible: numero(d.baseImponible),
        porcentajeIva: numero(d.porcentajeIva),
        montoIva: numero(d.montoIva),
        total: numero(d.total),
        totalUsd: numero(d.totalUsd),
        modelo,
    };
}
