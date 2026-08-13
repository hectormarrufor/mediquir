'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { numeroALetras } from '@/app/utils/numeroALetras';

export default function ImprimirRecibo() {
    const params = useParams();
    const [venta, setVenta] = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        const fetchVenta = async () => {
            try {
                const res = await fetch(`/api/ventas/${params.id}`);
                const data = await res.json();
                setVenta(data);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setCargando(false);
            }
        };
        fetchVenta();
    }, [params.id]);

    useEffect(() => {
        if (venta && !cargando) {
            setTimeout(() => window.print(), 800); 
        }
    }, [venta, cargando]);

    if (cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando documento para imprimir...</div>;
    if (!venta || venta.error) return <div style={{ padding: '2rem', textAlign: 'center' }}>Venta no encontrada.</div>;

    const esFactura = venta.tipoDocumento === 'FACTURA';
    const esNotaEntrega = venta.tipoDocumento === 'NOTA_ENTREGA';
    
    const tituloDocumento = esFactura ? 'Factura' : (esNotaEntrega ? 'Nota de Entrega' : 'Recibo de Venta');
    
    const totalBs = venta.moneda === 'BS' ? Number(venta.totalFinal) : Number(venta.totalFinal) * Number(venta.tasaCambio);
    const totalUsd = venta.moneda === 'USD' ? Number(venta.totalFinal) : Number(venta.totalFinal) / Number(venta.tasaCambio);
    
    const ivaBs = venta.moneda === 'BS' ? Number(venta.montoIva) : Number(venta.montoIva) * Number(venta.tasaCambio);
    const ivaUsd = venta.moneda === 'USD' ? Number(venta.montoIva) : Number(venta.montoIva) / Number(venta.tasaCambio);

    const baseBs = totalBs - ivaBs;
    const baseUsd = totalUsd - ivaUsd;

    const formatoNumero = (num) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num || 0);
    const fechaEmision = new Date(venta.createdAt).toLocaleDateString('es-VE');
    const fechaVence = venta.fechaVencimiento ? new Date(venta.fechaVencimiento).toLocaleDateString('es-VE') : fechaEmision;

    // 🔥 MAGIA DINÁMICA: EVALUAMOS LA CANTIDAD DE ARTÍCULOS 🔥
    const limiteMediaCarta = 8; // Hasta 8 artículos caben perfecto en Media Carta
    const cantidadArticulos = venta.detalles?.length || 0;
    const altoPapel = cantidadArticulos <= limiteMediaCarta ? '5.5in' : '10.5in'; // Media Carta vs Carta Completa

    return (
        <div className="print-wrapper">
            <div id="print-section" className="print-container">
                
                <img src="/tenants/mediquir/logo.png" alt="Fondo Mediquir" className="watermark" />

                <header className="header-grid">
                    <div className="logo-section">
                        <img src="/tenants/mediquir/logo.png" alt="Logo" className="logo" />
                    </div>
                    <div className="membrete-section">
                        <h3>{MEMBRETE_MEDIQUIR.nombre}</h3>
                        <p className="rif">RIF.: {MEMBRETE_MEDIQUIR.rif}</p>
                        <p className="direccion">{MEMBRETE_MEDIQUIR.direccion}</p>
                        <p className="telefonos">TELF.: {MEMBRETE_MEDIQUIR.telefonos}, E-mail: {MEMBRETE_MEDIQUIR.email}</p>
                    </div>
                </header>

                <section className="info-grid">
                    <div className="cliente-box">
                        <div className="line-item">
                            <span className="label-red">CLIENTE:</span>
                            <span className="value-line">{venta.cliente?.nombre || 'Cliente Genérico'}</span>
                        </div>
                        <div className="line-item">
                            <span className="label-red">RIF:</span>
                            <span className="value-line">{venta.cliente?.identificacion || 'N/A'}</span>
                        </div>
                        <div className="line-item">
                            <span className="label-red">DOMICILIO FISCAL:</span>
                            <span className="value-line">{venta.cliente?.direccion || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div className="doc-box">
                        <h2 className="doc-title">{tituloDocumento}</h2>
                        <h1 className="doc-number">{venta.numeroDocumento}</h1>
                        <table className="doc-meta">
                            <tbody>
                                <tr>
                                    <td className="text-right fw-bold" style={{ width: '60%' }}>ORDEN DE COMPRA</td>
                                    <td>Emisión: {fechaEmision}</td>
                                </tr>
                                <tr>
                                    <td className="text-right">Condiciones de la Transacción<br/><strong>{venta.condicionPago}</strong></td>
                                    <td className="valign-bottom">Vence: {fechaVence}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <table className="items-table">
                    <thead>
                        <tr>
                            <th style={{width: '10%'}}>CÓDIGO</th>
                            <th style={{width: '50%', textAlign: 'left'}}>NOMBRE DEL ARTÍCULO</th>
                            <th style={{width: '15%', textAlign: 'right'}}>PRECIO UNIT</th>
                            <th style={{width: '10%', textAlign: 'center'}}>CANTIDAD</th>
                            <th style={{width: '15%', textAlign: 'right'}}>TOTAL NETO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {venta.detalles?.map((d, index) => {
                            const pu = venta.moneda === 'BS' ? d.precioUnitario : d.precioUnitario * venta.tasaCambio;
                            const sub = venta.moneda === 'BS' ? d.subtotal : d.subtotal * venta.tasaCambio;
                            
                            return (
                                <tr key={index}>
                                    <td>{d.producto?.codigo || 'S/C'}</td>
                                    <td style={{textAlign: 'left'}}>{d.producto?.nombre}</td>
                                    <td style={{textAlign: 'right'}}>{formatoNumero(pu)}</td>
                                    <td style={{textAlign: 'center'}}>{formatoNumero(d.cantidad)}</td>
                                    <td style={{textAlign: 'right'}}>{formatoNumero(sub)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <footer className="footer-section">
                    <table className="totals-table">
                        <tbody>
                            <tr>
                                <td className="total-cell border-right text-center">
                                    {esFactura ? (
                                        <>
                                            <span className="label-red">TOTAL IMPUESTO: 16%</span><br/>
                                            <div className="monto-split">
                                                <strong>{formatoNumero(ivaBs)} <span className="label-red">Bs.</span></strong>
                                                <strong>{formatoNumero(ivaUsd)} <span className="label-red">USD</span></strong>
                                            </div>
                                        </>
                                    ) : (
                                        <span className="label-red">OPERACIÓN NO GRAVADA (SIN IVA)</span>
                                    )}
                                </td>
                                <td className="total-cell border-right text-center">
                                    <span className="label-red">TOTAL EXENTO:</span><br/>
                                    <div className="monto-split">
                                        <strong>0,00 <span className="label-red">Bs.</span></strong>
                                        <strong>0,00 <span className="label-red">USD</span></strong>
                                    </div>
                                </td>
                                <td className="total-cell text-center" style={{ backgroundColor: '#f9f9f9' }}>
                                    <span className="label-red">TOTAL GENERAL Bs.</span><br/>
                                    <strong style={{fontSize: '1.1rem'}}>{formatoNumero(totalBs)}</strong>
                                </td>
                            </tr>
                            <tr>
                                <td className="total-cell border-right text-center">
                                    {esFactura ? (
                                        <>
                                            <span className="label-red">BASE IMPONIBLE:</span><br/>
                                            <div className="monto-split">
                                                <strong>{formatoNumero(baseBs)} <span className="label-red">Bs.</span></strong>
                                                <strong>{formatoNumero(baseUsd)} <span className="label-red">USD</span></strong>
                                            </div>
                                        </>
                                    ) : (
                                        <span>-</span>
                                    )}
                                </td>
                                <td className="total-cell border-right text-center">
                                    <span className="text-black">Monto de Operación segun Tasa BCV</span><br/>
                                    <strong>{formatoNumero(venta.tasaCambio)} <span className="label-red">Bs.</span></strong>
                                </td>
                                <td className="total-cell text-center" style={{ backgroundColor: '#f9f9f9' }}>
                                    <span className="label-red">TOTAL GENERAL USD$</span><br/>
                                    <strong style={{fontSize: '1.1rem'}}>{formatoNumero(totalUsd)}</strong>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="monto-letras">
                        <span className="label-blue">Son: Bs. </span>
                        <span className="text-black">{numeroALetras(totalBs)}</span>
                    </div>

                    <div className="original-label label-red text-center">ORIGINAL - CLIENTE</div>

                    {esFactura && (
                        <div className="legal-box">
                            <div className="legal-left"><strong>FORMA LIBRE</strong></div>
                            <div className="legal-mid">
                                IMPRENTA AUTORIZADA RIF: J-XXXXXXX-X <br/>
                                FECHA 11-12-2025
                            </div>
                            <div className="legal-right">
                                MATERIALES Y EQUIPOS QUIRURGICOS C.A.
                            </div>
                        </div>
                    )}
                </footer>
            </div>

            {/* 🔥 CSS CON ALTURA DINÁMICA INYECTADA Y ESTILOS AJUSTADOS 🔥 */}
            <style dangerouslySetInnerHTML={{ __html: `
                * { box-sizing: border-box; }

                .print-wrapper {
                    display: flex;
                    justify-content: center;
                    padding: 20px;
                    background: #525659;
                    min-height: 100vh;
                }

                .print-container {
                    background: white;
                    color: black;
                    width: 8.5in;
                    height: ${altoPapel}; /* 🔥 AQUÍ APLICA LA MAGIA DINÁMICA 🔥 */
                    padding: 0.3in 0.4in;
                    position: relative;
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 11px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.5);
                    overflow: hidden;
                    transition: height 0.3s ease;
                }

                @media print {
                    @page {
                        size: letter portrait;
                        margin: 0 !important;
                    }

                    body * { visibility: hidden !important; }
                    #print-section, #print-section * { visibility: visible !important; }
                    
                    #print-section {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 8.5in !important;
                        height: ${altoPapel} !important; /* 🔥 SE RESPETA EN LA IMPRESORA 🔥 */
                        margin: 0 !important;
                        padding: 0.3in 0.4in !important;
                        box-shadow: none !important;
                        border: none !important;
                    }
                    
                    html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
                    .print-wrapper { padding: 0 !important; background: transparent !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }

                .label-red { color: #d32f2f !important; font-weight: bold; }
                .label-blue { color: #1976d2 !important; font-weight: bold; }
                .text-black { color: #000 !important; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .fw-bold { font-weight: bold; }
                .valign-bottom { vertical-align: bottom; }

                .watermark {
                    position: absolute !important;
                    top: 50% !important;
                    left: 50% !important;
                    transform: translate(-50%, -50%) !important;
                    width: 50% !important; 
                    opacity: 0.08 !important; 
                    z-index: 0 !important;
                    pointer-events: none !important;
                }

                .header-grid, .info-grid, .items-table, .footer-section {
                    position: relative;
                    z-index: 1; 
                }

                .header-grid {
                    display: grid;
                    grid-template-columns: 25% 75%;
                    align-items: center;
                    border-bottom: 2px solid #ccc;
                    padding-bottom: 5px;
                    margin-bottom: 5px;
                }

                /* 🔥 TUS CORRECCIONES DE LOGO Y MEMBRETE 🔥 */
                .logo { padding: 0; margin-left: 15px; max-width: 100%; max-height: 100px; object-fit: contain; }
                .membrete-section { text-align: left; padding-left: 0px; margin-left: 0px; }
                
                .membrete-section h3 { color: #1976d2 !important; margin: 0 0 2px 0; font-size: 14px; }
                .membrete-section p { margin: 0; font-size: 9px; font-weight: bold; }
                .membrete-section .rif { font-size: 11px; }
                
                .info-grid {
                    display: grid;
                    grid-template-columns: 60% 40%;
                    margin-bottom: 10px;
                }
                .cliente-box { padding-right: 15px; }
                .line-item { margin-bottom: 4px; display: flex; align-items: flex-end; border-bottom: 1px solid #000; padding-bottom: 2px; }
                .line-item .label-red { width: 120px; flex-shrink: 0; }
                .value-line { flex-grow: 1; font-weight: bold; font-size: 12px; }

                .doc-box { text-align: right; }
                .doc-title { font-size: 20px; margin: 0; font-weight: 900; color: #222; text-transform: uppercase; }
                .doc-number { color: #d32f2f !important; font-size: 16px; margin: 0 0 5px 0; letter-spacing: 1px; }
                .doc-meta { width: 100%; font-size: 10px; }
                .doc-meta td { padding: 1px 4px; }

                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px;
                }
                .items-table th {
                    border-top: 2px solid #000;
                    border-bottom: 2px solid #000;
                    padding: 4px 2px;
                    font-size: 10px;
                }
                .items-table td {
                    padding: 4px 2px;
                    font-size: 10px;
                    vertical-align: top;
                }

                .footer-section {
                    position: absolute;
                    bottom: 0.3in;
                    left: 0.4in;
                    right: 0.4in;
                }

                .totals-table {
                    width: 100%;
                    border-collapse: collapse;
                    border: 1.5px solid #000;
                    margin-bottom: 5px;
                }
                .totals-table td {
                    padding: 4px;
                    border-bottom: 1px solid #000;
                }
                .border-right { border-right: 1px solid #000; }
                .monto-split { display: flex; justify-content: space-around; margin-top: 2px; font-size: 11px; }

                .monto-letras {
                    font-size: 10px;
                    margin-bottom: 8px;
                    padding-left: 5px;
                }
                .original-label { font-size: 10px; margin-bottom: 2px; }

                .legal-box {
                    display: flex;
                    justify-content: space-between;
                    border: 1px solid #1976d2 !important;
                    border-radius: 8px;
                    padding: 4px 8px;
                    font-size: 7px;
                    color: #1976d2 !important;
                    text-align: center;
                    align-items: center;
                }
                .legal-left { font-size: 9px; }
            `}} />
        </div>
    );
}