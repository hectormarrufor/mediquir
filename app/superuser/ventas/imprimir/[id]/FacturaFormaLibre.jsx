'use client';

import React, { useEffect, useState } from 'react';
import { nombreConMarca } from '@/app/constants/nombreConMarca';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import { lineasDeRenglon } from '@/app/constants/lineasFactura';
import { numeroALetras } from '@/app/utils/numeroALetras';
import { useZoomHoja } from '@/app/components/ui/useZoomHoja';

// Factura impresa SOBRE LA FORMA LIBRE PREIMPRESA (media carta horizontal: 8 in x 5.5 in).
// La forma ya trae el logo, el membrete, el N° de control en rojo, la marca de agua y, abajo, la franja de la imprenta:
// aquí NO se imprime nada de eso. Todo se posiciona en pulgadas para que caiga en su lugar; ajústalo en ZONAS si cambia la forma.
const ZONAS = {
    finPreimpresoSuperior: 0.86, // hasta aquí la forma trae el membrete: no se imprime nada
    inicioTabla: 1.799,          // línea superior del encabezado de la tabla de artículos (bajó 2 mm el 13/11/2026, igual que la cabecera del cliente)
    altoEncabezado: 0.16,
    altoFila: 0.15,              // una línea; una descripción larga ocupa 2 líneas (máximo)
    lineaSon: 4.293,             // "Son: Bs. ..."
    finTabla: 4.209,             // la última línea de la tabla debe terminar aquí (2 mm antes de «Son:»): de 1,799 a 4,209 caben cabecera + 15 líneas
    huecoTexto: 0.04,            // aire entre el texto de arriba de la tabla (notas) y su cabecera
    inicioTotales: 4.433,        // caja de totales (bajó 1,1 cm el 12/11/2026 para aprovechar la forma)
    inicioCliente: 1.159,        // cabecera con el cliente (bajó 2 mm el 12/11/2026)
    maxLineas: CONFIG_FISCAL.maxRenglonesFactura,
    inicioFranjaImprenta: 4.64,  // aquí empieza la franja de la imprenta en la forma (no se debe pisar)
    margenIzq: 0.26,
    anchoUtil: 7.34,
};

const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v) => nf.format(Number(v) || 0);
// Parte un párrafo en líneas del ancho de la hoja midiendo con el tipo de letra real (lienzo del navegador); sin lienzo (servidor) se estima por caracteres
const FUENTE_TEXTO = '600 7.8px Arial, Helvetica, sans-serif';
let lienzo = null;
const ancho = (t) => { lienzo = lienzo || document.createElement('canvas').getContext('2d'); lienzo.font = FUENTE_TEXTO; return lienzo.measureText(t).width * 1.04; };
function partirParrafo(texto, usarLienzo) {
    const maxPx = ZONAS.anchoUtil * 96 - 6;
    const cabe = (t) => (usarLienzo ? ancho(t) <= maxPx : t.length <= 130);
    const lineas = [];
    let actual = '';
    for (const palabra of String(texto).split(/ +/).filter(Boolean)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (!actual || cabe(prueba)) actual = prueba; else { lineas.push(actual); actual = palabra; }
    }
    if (actual) lineas.push(actual);
    return lineas;
}

const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '');

// titulo: 'Factura' (por defecto) o 'Nota de Crédito' / 'Nota de Débito'. Para una nota, `referencia` (en lugar de "ORDEN DE COMPRA") indica la factura
// que afecta y `condicionTexto` reemplaza las condiciones de pago; `sinVence` oculta la fecha de vencimiento.
// `lineasExtra`: textos libres que salen como filas de descripción después de los artículos (facturas que afecta la nota, tasa BCV, etc.).
export default function FacturaFormaLibre({ venta, guia = false, titulo = 'Factura', referencia = null, etiquetaCondicion = 'Condiciones de la Transacción', condicionTexto = null, sinVence = false, lineasExtra = [], textoSuperior = [], onReasignarControl = null, vistaPrevia = false, onToggleGuia = null }) {
    // Papel de la impresión: CARTA vertical por defecto (la hoja va centrada arriba); MEDIA CARTA = la hoja completa en horizontal.
    // Se recuerda la última elección en este navegador.
    const [papel, setPapel] = useState('carta');
    useEffect(() => { try { const g = localStorage.getItem('papelFormaLibre'); if (g === 'carta' || g === 'media') setPapel(g); } catch { /* sin almacenamiento */ } }, []);
    const elegirPapel = (v) => { setPapel(v); try { localStorage.setItem('papelFormaLibre', v); } catch { /* sin almacenamiento */ } };
    const esCarta = papel === 'carta';
    const zoom = useZoomHoja(768, 24); // media carta horizontal (8 in): en el teléfono se achica al ancho de la pantalla
    // En la factura el número sale con el prefijo 00- (F-146870 -> 00-146870); las notas llevan el suyo (NC-, ND-)
    const numeroImpreso = titulo === 'Factura' ? String(venta.numeroDocumento || '').replace(/^F-/i, '00-') : venta.numeroDocumento;
    // Texto de arriba de la tabla (notas de crédito y débito): empuja la tabla hacia abajo y le quita líneas a la capacidad
    const [medido, setMedido] = useState(false);
    useEffect(() => { setMedido(true); }, []);
    const textoLineas = textoSuperior.flatMap((p) => partirParrafo(p, medido));
    const tablaTop = ZONAS.inicioTabla + (textoLineas.length ? textoLineas.length * ZONAS.altoFila + ZONAS.huecoTexto : 0);
    const capacidad = Math.floor((ZONAS.finTabla - tablaTop - ZONAS.altoEncabezado) / ZONAS.altoFila + 1e-6); // factura: 15; nota: menos, según su texto
    const tasa = Number(venta.tasaCambio) || 1;
    const esBs = venta.moneda === 'BS';
    const aBs = (v) => (esBs ? Number(Number(v).toFixed(2)) : aBolivares(Number(v), tasa));
    const aUsd = (v) => (esBs ? aDolares(Number(v), tasa) : Number(Number(v).toFixed(2)));

    const detalles = venta.detalles || [];
    const gravadaDoc = detalles.filter((d) => d.aplicaIva).reduce((a, d) => a + Number(d.subtotal), 0);
    const ivaDoc = Number(venta.montoIva) || 0;

    // Mismas conversiones que el libro de ventas: total, IVA y base por separado, y el exento es lo que sobra (renglones exentos + flete)
    const totalBs = aBs(venta.totalFinal), ivaBs = aBs(ivaDoc), baseBs = aBs(gravadaDoc);
    const totalUsd = aUsd(venta.totalFinal), ivaUsd = aUsd(ivaDoc), baseUsd = aUsd(gravadaDoc);
    const exentoBs = Math.max(0, Number((totalBs - baseBs - ivaBs).toFixed(2)));
    const exentoUsd = Math.max(0, Number((totalUsd - baseUsd - ivaUsd).toFixed(2)));

    const dias = venta.fechaVencimiento ? Math.max(0, Math.round((new Date(venta.fechaVencimiento) - new Date(venta.fechaEmision || venta.createdAt)) / 86400000)) : 0;
    const condicion = condicionTexto || (venta.condicionPago === 'Credito' ? `CREDITO a ${dias} Días` : 'CONTADO');
    const nombreDe = (d) => (d.isFicticio ? d.nombreFicticio : nombreConMarca(d.producto?.nombre || d.nombreFicticio, d.producto?.marca?.nombre));
    // Cada renglón ocupa 1 o 2 líneas según su descripción; las líneas extra de las notas ocupan 1
    const totalFilas = detalles.reduce((a, d) => a + lineasDeRenglon(nombreDe(d)), 0) + lineasExtra.length;
    const demasiados = totalFilas > capacidad;

    return (
        <div className="fl-envoltura">
            <div className="fl-barra">
                <span>{titulo} {venta.numeroDocumento} · media carta 8 × 5.5 in{guia ? (vistaPrevia ? ' · GUÍA de la forma preimpresa (se imprime)' : ' · GUÍA de la forma preimpresa (no se imprime)') : ''}{vistaPrevia ? ' · VISTA PREVIA: no es un documento emitido' : ''}</span>
                <span>
                    <button type="button" onClick={() => window.print()}>Imprimir</button>{' '}
                    <button type="button" className={esCarta ? 'fl-papel fl-papel-on' : 'fl-papel'} onClick={() => elegirPapel('carta')}>Carta vertical</button>
                    <button type="button" className={!esCarta ? 'fl-papel fl-papel-on' : 'fl-papel'} onClick={() => elegirPapel('media')}>Media carta horizontal</button>{' '}
                    {onReasignarControl && <><button type="button" onClick={onReasignarControl}>Forma dañada: siguiente N° de control</button>{' '}</>}
                    {vistaPrevia
                        ? (onToggleGuia && <button type="button" onClick={onToggleGuia}>{guia ? 'Ocultar guía' : 'Ver guía sobre la forma'}</button>)
                        : <a href={guia ? '?' : '?guia=1'}>{guia ? 'Ocultar guía' : 'Ver guía sobre la forma'}</a>}
                </span>
            </div>
            {demasiados && <div className="fl-aviso">Esta hoja ocupa {totalFilas} líneas (una descripción larga ocupa 2) y la forma libre admite {capacidad} en este documento: lo que sobra se saldrá de la hoja.</div>}

            <div id="print-section" className="fl-hoja" style={{ zoom }}>
                {guia && <img className={vistaPrevia ? 'fl-guia fl-guia-imprime' : 'fl-guia'} src="/tenants/mediquir/forma-libre.png" alt="" />}

                {/* Cliente */}
                <div className="fl-cliente">
                    <div className="fl-linea"><span className="fl-rojo">CLIENTE:</span><span className="fl-valor">{venta.cliente?.nombre || 'Cliente genérico'}</span></div>
                    <div className="fl-linea"><span className="fl-rojo">RIF:</span><span className="fl-valor">{venta.cliente?.identificacion || 'N/A'}</span></div>
                    <div className="fl-linea fl-dom"><span className="fl-rojo">DOMICILIO FISCAL:</span><span className="fl-valor fl-chico">{venta.cliente?.direccion || 'N/A'}</span></div>
                </div>

                {/* Datos del documento */}
                <div className="fl-doc">
                    <div className="fl-titulo"><span className="fl-azul" style={titulo.length > 8 ? { fontSize: '11px' } : undefined}>{titulo}</span><span className="fl-numero">{numeroImpreso}</span></div>
                    {venta.numeroControl && <div className="fl-control"><span className="fl-cond-t">N° de control </span><span className="fl-ctl-num">{venta.numeroControl}</span></div>}
                    <div className="fl-oc">{referencia ?? 'ORDEN DE COMPRA'}</div>
                    <div className="fl-fechas"><span>Emisión: <b>{fecha(venta.fechaEmision || venta.createdAt)}</b></span>{!sinVence && <span>Vence: <b>{fecha(venta.fechaVencimiento || venta.fechaEmision || venta.createdAt)}</b></span>}</div>
                    <div className="fl-cond">
                        <div><div className="fl-cond-t">{etiquetaCondicion}</div><div className="fl-cond-v">{condicion}</div></div>
                    </div>
                </div>

                {textoLineas.length > 0 && (
                    <div className="fl-texto">{textoLineas.map((l, i) => <div key={i}>{l}</div>)}</div>
                )}

                {/* Artículos: la factura admite 15 líneas; una nota, las que deje su texto de arriba */}
                <table className="fl-tabla" style={{ top: `${tablaTop}in` }}>
                    <thead><tr><th style={{ width: '0.62in', textAlign: 'left' }}>CÓDIGO</th><th style={{ textAlign: 'left' }}>NOMBRE DEL ARTÍCULO</th><th style={{ width: '1.05in', textAlign: 'right' }}>PRECIO UNIT</th><th style={{ width: '0.9in', textAlign: 'center' }}>CANTIDAD</th><th style={{ width: '1.3in', textAlign: 'right' }}>TOTAL NETO</th></tr></thead>
                    <tbody>
                        {detalles.map((d, i) => (
                            <tr key={i}>
                                {/* Un renglón escrito a mano se imprime con su texto aunque esté enlazado a un producto (el enlace solo cuenta lo vendido) */}
                                <td>{d.isFicticio ? 'S/C' : (d.producto?.codigo || 'S/C')}</td>
                                <td className="fl-nombre"><div className="fl-nombre-in">{nombreDe(d)}</div></td>
                                <td style={{ textAlign: 'right' }}>{fmt(aBs(d.precioUnitario))}</td>
                                <td style={{ textAlign: 'center' }}>{fmt(d.cantidad)}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(aBs(d.subtotal))}</td>
                            </tr>
                        ))}
                        {lineasExtra.map((texto, i) => (
                            <tr key={`extra-${i}`}><td colSpan={5} className="fl-extra">{texto}</td></tr>
                        ))}
                    </tbody>
                </table>

                {/* Totales (terminan antes de la franja de la imprenta) */}
                <div className="fl-son"><span className="fl-azul-b">Son: Bs. </span>{numeroALetras(totalBs)}</div>
                <div className="fl-totales">
                    <div className="fl-celda fl-c1"><div className="fl-rojo fl-et">TOTAL IMPUESTO: {CONFIG_FISCAL.alicuotaGeneral}%</div><div className="fl-par"><b>{fmt(ivaBs)} <i>Bs.</i></b><b>{fmt(ivaUsd)} <i>USD</i></b></div></div>
                    <div className="fl-celda fl-c2"><div className="fl-rojo fl-et">TOTAL EXENTO:</div><div className="fl-par"><b>{fmt(exentoBs)} <i>Bs.</i></b><b>{fmt(exentoUsd)} <i>USD</i></b></div></div>
                    <div className="fl-celda fl-c3 fl-total"><div className="fl-rojo fl-et">TOTAL GENERAL Bs.</div><div className="fl-gran">{fmt(totalBs)}</div></div>
                    <div className="fl-celda fl-c1 fl-fila2"><div className="fl-rojo fl-et">BASE IMPONIBLE:</div><div className="fl-par"><b>{fmt(baseBs)} <i>Bs.</i></b><b>{fmt(baseUsd)} <i>USD</i></b></div></div>
                    <div className="fl-celda fl-c2 fl-fila2"><div className="fl-et">Monto de Factura según Tasa BCV</div><div className="fl-par fl-centro"><b>{fmt(tasa)} <i>Bs.</i></b></div></div>
                    <div className="fl-celda fl-c3 fl-total fl-fila2"><div className="fl-rojo fl-et">TOTAL GENERAL USD$</div><div className="fl-gran">{fmt(totalUsd)}</div></div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                * { box-sizing: border-box; }
                .fl-envoltura { background: #525659; min-height: 100vh; padding: 12px; font-family: Arial, Helvetica, sans-serif; overflow: auto; }
                .fl-barra { max-width: 8in; margin: 0 auto 8px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 10px; color: #fff; font-size: 12px; }
                .fl-barra > span:last-child { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
                .fl-barra button { padding: 4px 14px; font-weight: 700; cursor: pointer; }
                /* Teléfono: botones más grandes para el dedo */
                @media (max-width: 8.4in) {
                    .fl-envoltura { padding: 8px; }
                    .fl-barra button { padding: 8px 14px; font-size: 13px; border-radius: 6px; border: 0; }
                    .fl-barra button:first-child { background: #fff; color: #0b1b3d; }
                }
                .fl-barra a { color: #9ecbff; }
                .fl-barra .fl-papel { background: #3b3f43; color: #fff; border: 1px solid #777; }
                .fl-barra .fl-papel-on { background: #fff !important; color: #0b1b3d !important; }
                .fl-aviso { max-width: 8in; margin: 0 auto 8px; background: #ffe08a; color: #5c3b00; padding: 6px 10px; font-size: 12px; font-weight: 700; }

                /* La hoja: media carta horizontal. Todo va en pulgadas desde su esquina superior izquierda. */
                .fl-hoja { position: relative; width: 8in; height: 5.5in; margin: 0 auto; background: #fff; color: #000; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,.5); font-size: 8px; }
                .fl-marca { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 900; letter-spacing: 6px; color: rgba(211, 47, 47, .28); transform: rotate(-18deg); pointer-events: none; z-index: 20; }
                .fl-guia { position: absolute; inset: 0; width: 8in; height: 5.5in; opacity: .45; pointer-events: none; z-index: 0; }
                .fl-hoja > *:not(.fl-guia) { position: absolute; z-index: 1; }

                .fl-rojo { color: #d32f2f !important; font-weight: 700; }
                .fl-azul { color: #0a1f8f !important; font-weight: 800; }
                .fl-azul-b { color: #1c4fd8 !important; font-weight: 700; }

                .fl-cliente { left: ${ZONAS.margenIzq}in; top: ${ZONAS.inicioCliente}in; width: 4.35in; }
                .fl-linea { display: flex; align-items: flex-end; gap: 6px; border-bottom: 1px solid #000; padding-bottom: 1px; margin-bottom: 3px; min-height: 0.15in; }
                .fl-linea .fl-rojo { width: 1.05in; flex-shrink: 0; font-size: 7.5px; }
                .fl-valor { font-size: 8.5px; font-weight: 500; line-height: 1.05; }
                .fl-chico { font-size: 6.4px; line-height: 1.1; max-height: 0.2in; overflow: hidden; }
                .fl-dom { min-height: 0.24in; }

                .fl-doc { left: 4.72in; top: 0.87in; width: 2.9in; }
                .fl-titulo { display: flex; justify-content: space-between; align-items: baseline; }
                .fl-titulo .fl-azul { font-size: 16px; }
                .fl-numero { color: #d32f2f !important; font-weight: 800; font-size: 16px; letter-spacing: .5px; }
                .fl-oc { font-weight: 800; font-size: 8px; margin-top: 0; }
                .fl-fechas { display: flex; justify-content: space-between; font-size: 8.5px; margin-top: 1px; }
                .fl-cond { display: flex; justify-content: space-between; margin-top: 1px; }
                .fl-cond-t { font-weight: 800; font-size: 7px; }
                .fl-cond-v { font-weight: 800; font-size: 9px; }
                .fl-control { text-align: right; line-height: 1; margin-top: 1px; }
                .fl-ctl-num { color: #d32f2f !important; font-weight: 800; font-size: 11px; letter-spacing: .4px; }

                .fl-texto { left: ${ZONAS.margenIzq}in; top: ${ZONAS.inicioTabla}in; width: ${ZONAS.anchoUtil}in; }
                .fl-texto div { height: ${ZONAS.altoFila}in; line-height: ${ZONAS.altoFila}in; font-size: 7.8px; font-weight: 600; white-space: nowrap; overflow: hidden; }
                .fl-tabla { left: ${ZONAS.margenIzq}in; width: ${ZONAS.anchoUtil}in; border-collapse: collapse; table-layout: fixed; }
                .fl-tabla th { height: ${ZONAS.altoEncabezado}in; border-top: 1.6px solid #000; border-bottom: 1.6px solid #000; font-size: 7.6px; font-weight: 800; padding: 0 3px; }
                .fl-tabla td { height: ${ZONAS.altoFila}in; padding: 0 3px; font-size: 7.6px; line-height: ${ZONAS.altoFila}in; vertical-align: top; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                /* La descripción puede tomar hasta 2 líneas (cada una de la altura de un renglón); lo que pase se corta */
                .fl-tabla td.fl-nombre { white-space: normal; }
                .fl-nombre-in { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: ${ZONAS.altoFila}in; max-height: ${ZONAS.altoFila * 2}in; }
                .fl-extra { font-weight: 700; font-style: italic; }

                .fl-son { left: ${ZONAS.margenIzq}in; top: ${ZONAS.lineaSon}in; width: ${ZONAS.anchoUtil}in; font-size: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .fl-totales { left: ${ZONAS.margenIzq}in; top: ${ZONAS.inicioTotales}in; width: ${ZONAS.anchoUtil}in; display: grid; grid-template-columns: 2.6in 2.5in 2.24in; border: 1.4px solid #000; }
                .fl-celda { padding: 2px 6px 1px; border-right: 1px solid #000; border-bottom: 1px solid #000; height: 0.27in; text-align: center; }
                .fl-c3 { border-right: 0; }
                .fl-fila2 { border-bottom: 0; }
                .fl-et { font-size: 6.6px; font-weight: 700; line-height: 1.1; }
                .fl-par { display: flex; justify-content: space-around; font-size: 9px; margin-top: 1px; }
                .fl-par i { color: #d32f2f; font-style: normal; font-size: 7px; }
                .fl-centro { justify-content: center; }
                .fl-gran { font-size: 11.5px; font-weight: 800; margin-top: 0; text-align: right; padding-right: 8px; }


                /* Impresión sin márgenes: en CARTA vertical la hoja (8 in) queda centrada arriba; en MEDIA CARTA ocupa todo el papel en horizontal */
                @media print {
                    @page { size: ${esCarta ? 'letter portrait' : '8in 5.5in'}; margin: 0 !important; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #print-section, #print-section * { visibility: visible !important; }
                    .fl-guia:not(.fl-guia-imprime) { display: none !important; } /* en la vista previa la guía sí se imprime */
                    .fl-envoltura { padding: 0 !important; background: transparent !important; min-height: 0; }
                    #print-section { position: absolute !important; left: ${esCarta ? '0.25in' : '0'} !important; top: 0 !important; margin: 0 !important; box-shadow: none !important; transform: none !important; zoom: 1 !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
}
