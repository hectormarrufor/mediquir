'use client';

import React from 'react';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import { numeroALetras } from '@/app/utils/numeroALetras';

// Factura impresa SOBRE LA FORMA LIBRE PREIMPRESA (media carta horizontal: 8 in x 5.5 in).
// La forma ya trae el logo, el membrete, el N° de control en rojo, la marca de agua y, abajo, la franja de la imprenta:
// aquí NO se imprime nada de eso. Todo se posiciona en pulgadas para que caiga en su lugar; ajústalo en ZONAS si cambia la forma.
const ZONAS = {
    finPreimpresoSuperior: 0.86, // hasta aquí la forma trae el membrete: no se imprime nada
    inicioTabla: 1.72,           // línea superior del encabezado de la tabla de artículos
    altoEncabezado: 0.16,
    altoFila: 0.15,              // 13 renglones caben entre 1,88 y 3,83 in
    lineaSon: 3.86,              // "Son: Bs. ..."
    inicioTotales: 4.0,          // caja de totales: termina en ~4,54 in
    inicioFranjaImprenta: 4.64,  // aquí empieza la franja de la imprenta en la forma (no se debe pisar)
    margenIzq: 0.26,
    anchoUtil: 7.34,
};

const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v) => nf.format(Number(v) || 0);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '');

// titulo: 'Factura' (por defecto) o 'Nota de Crédito' / 'Nota de Débito'. Para una nota, `referencia` (en lugar de "ORDEN DE COMPRA") indica la factura
// que afecta y `condicionTexto` reemplaza las condiciones de pago; `sinVence` oculta la fecha de vencimiento.
export default function FacturaFormaLibre({ venta, guia = false, titulo = 'Factura', referencia = null, etiquetaCondicion = 'Condiciones de la Transacción', condicionTexto = null, sinVence = false, onReasignarControl = null, vistaPrevia = false }) {
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
    const demasiados = detalles.length > CONFIG_FISCAL.maxRenglonesFactura;

    return (
        <div className="fl-envoltura">
            <div className="fl-barra">
                <span>{titulo} {venta.numeroDocumento} · media carta 8 × 5.5 in{guia ? ' · GUÍA de la forma preimpresa (no se imprime)' : ''}{vistaPrevia ? ' · VISTA PREVIA: no es un documento emitido' : ''}</span>
                <span>
                    <button type="button" onClick={() => window.print()}>Imprimir</button>{' '}
                    {onReasignarControl && <><button type="button" onClick={onReasignarControl}>Forma dañada: siguiente N° de control</button>{' '}</>}
                    {!vistaPrevia && <a href={guia ? '?' : '?guia=1'}>{guia ? 'Ocultar guía' : 'Ver guía sobre la forma'}</a>}
                </span>
            </div>
            {demasiados && <div className="fl-aviso">Esta factura tiene {detalles.length} renglones y la forma libre admite {CONFIG_FISCAL.maxRenglonesFactura}: los que sobran se saldrán de la hoja.</div>}

            <div id="print-section" className="fl-hoja">
                {vistaPrevia && <div className="fl-marca">VISTA PREVIA</div>}
                {guia && <img className="fl-guia" src="/tenants/mediquir/forma-libre.png" alt="" />}

                {/* Cliente */}
                <div className="fl-cliente">
                    <div className="fl-linea"><span className="fl-rojo">CLIENTE:</span><span className="fl-valor">{venta.cliente?.nombre || 'Cliente genérico'}</span></div>
                    <div className="fl-linea"><span className="fl-rojo">RIF:</span><span className="fl-valor">{venta.cliente?.identificacion || 'N/A'}</span></div>
                    <div className="fl-linea fl-dom"><span className="fl-rojo">DOMICILIO FISCAL:</span><span className="fl-valor fl-chico">{venta.cliente?.direccion || 'N/A'}</span></div>
                </div>

                {/* Datos del documento */}
                <div className="fl-doc">
                    <div className="fl-titulo"><span className="fl-azul" style={titulo.length > 8 ? { fontSize: '11px' } : undefined}>{titulo}</span><span className="fl-numero">{venta.numeroDocumento}</span></div>
                    <div className="fl-oc">{referencia || 'ORDEN DE COMPRA'}</div>
                    <div className="fl-fechas"><span>Emisión: <b>{fecha(venta.fechaEmision || venta.createdAt)}</b></span>{!sinVence && <span>Vence: <b>{fecha(venta.fechaVencimiento || venta.fechaEmision || venta.createdAt)}</b></span>}</div>
                    <div className="fl-cond">
                        <div><div className="fl-cond-t">{etiquetaCondicion}</div><div className="fl-cond-v">{condicion}</div></div>
                        <div className="fl-control"><div className="fl-cond-t">Control</div><div className="fl-cond-v">{venta.numeroControl || ''}</div></div>
                    </div>
                </div>

                {/* Artículos (hasta 13) */}
                <table className="fl-tabla">
                    <thead><tr><th style={{ width: '0.62in', textAlign: 'left' }}>CÓDIGO</th><th style={{ textAlign: 'left' }}>NOMBRE DEL ARTÍCULO</th><th style={{ width: '1.05in', textAlign: 'right' }}>PRECIO UNIT</th><th style={{ width: '0.9in', textAlign: 'center' }}>CANTIDAD</th><th style={{ width: '1.3in', textAlign: 'right' }}>TOTAL NETO</th></tr></thead>
                    <tbody>
                        {detalles.map((d, i) => (
                            <tr key={i}>
                                <td>{d.producto?.codigo || 'S/C'}</td>
                                <td className="fl-nombre">{d.producto?.nombre || d.nombreFicticio}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(aBs(d.precioUnitario))}</td>
                                <td style={{ textAlign: 'center' }}>{fmt(d.cantidad)}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(aBs(d.subtotal))}</td>
                            </tr>
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
                .fl-barra { max-width: 8in; margin: 0 auto 8px; display: flex; justify-content: space-between; gap: 10px; color: #fff; font-size: 12px; }
                .fl-barra button { padding: 4px 14px; font-weight: 700; cursor: pointer; }
                .fl-barra a { color: #9ecbff; }
                .fl-aviso { max-width: 8in; margin: 0 auto 8px; background: #ffe08a; color: #5c3b00; padding: 6px 10px; font-size: 12px; font-weight: 700; }

                /* La hoja: media carta horizontal. Todo va en pulgadas desde su esquina superior izquierda. */
                .fl-hoja { position: relative; width: 8in; height: 5.5in; margin: 0 auto; background: #fff; color: #000; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,.5); font-size: 8px; }
                .fl-marca { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 900; letter-spacing: 6px; color: rgba(211, 47, 47, .28); transform: rotate(-18deg); pointer-events: none; z-index: 20; }
                .fl-guia { position: absolute; inset: 0; width: 8in; height: 5.5in; opacity: .45; pointer-events: none; z-index: 0; }
                .fl-hoja > *:not(.fl-guia) { position: absolute; z-index: 1; }

                .fl-rojo { color: #d32f2f !important; font-weight: 700; }
                .fl-azul { color: #0a1f8f !important; font-weight: 800; }
                .fl-azul-b { color: #1c4fd8 !important; font-weight: 700; }

                .fl-cliente { left: ${ZONAS.margenIzq}in; top: 1.08in; width: 4.35in; }
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
                .fl-control { text-align: right; }

                .fl-tabla { left: ${ZONAS.margenIzq}in; top: ${ZONAS.inicioTabla}in; width: ${ZONAS.anchoUtil}in; border-collapse: collapse; table-layout: fixed; }
                .fl-tabla th { height: ${ZONAS.altoEncabezado}in; border-top: 1.6px solid #000; border-bottom: 1.6px solid #000; font-size: 7.6px; font-weight: 800; padding: 0 3px; }
                .fl-tabla td { height: ${ZONAS.altoFila}in; padding: 0 3px; font-size: 7.6px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .fl-nombre { text-overflow: ellipsis; }

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

                @media (max-width: 8.4in) { .fl-hoja { transform: scale(.85); transform-origin: top left; } }

                /* Impresión: media carta horizontal, sin márgenes; el diálogo ya propone este tamaño de hoja */
                @media print {
                    @page { size: 8in 5.5in; margin: 0 !important; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #print-section, #print-section * { visibility: visible !important; }
                    .fl-guia { display: none !important; }
                    .fl-envoltura { padding: 0 !important; background: transparent !important; min-height: 0; }
                    #print-section { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; box-shadow: none !important; transform: none !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
}
