'use client';

import React from 'react';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { aBolivares } from '@/app/constants/facturacion';

// Presupuesto impreso en tamaño CARTA completo (no es la forma libre preimpresa: no es un documento fiscal).
// Usa el mismo membrete y estilo visual que la Nota de Entrega, pero con su propio encabezado ("Presupuesto")
// y un aviso de que es solo informativo. `presupuesto` puede venir de la base (ya guardado) o de una vista previa
// armada en el navegador (sin guardar todavía): en ese caso pasa `vistaPrevia`.
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v) => nf.format(Number(v) || 0);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '');
const sumarDias = (v, dias) => { const d = v ? new Date(v) : new Date(); d.setDate(d.getDate() + Number(dias || 0)); return d; };

export default function PresupuestoImprimible({ presupuesto, vistaPrevia = false, accionesExtra = null }) {
    if (!presupuesto) return null;
    const tasa = Number(presupuesto.tasaCambio) || 1;
    const renglones = presupuesto.renglones || [];
    const subtotalUsd = Number(presupuesto.subtotal) || 0;
    const ivaUsd = Number(presupuesto.montoIva) || 0;
    const totalUsd = Number(presupuesto.totalFinal) || 0;
    const subtotalBs = aBolivares(subtotalUsd, tasa);
    const ivaBs = aBolivares(ivaUsd, tasa);
    const totalBs = aBolivares(totalUsd, tasa);
    const creado = presupuesto.createdAt || new Date().toISOString();
    const vence = sumarDias(creado, presupuesto.validoDias ?? 15);
    const cliente = presupuesto.cliente || { nombre: presupuesto.clienteNombre, identificacion: presupuesto.clienteIdentificacion, direccion: presupuesto.clienteDireccion };

    return (
        <div className="pp-envoltura">
            <div className="pp-barra">
                <span>Presupuesto {presupuesto.numero || ''}{vistaPrevia ? ' · VISTA PREVIA: aún no se ha guardado' : ''}</span>
                <span>
                    <button type="button" onClick={() => window.print()}>Imprimir</button>
                    {accionesExtra}
                </span>
            </div>

            <div id="pp-print-section" className="pp-hoja">
                <header className="pp-header">
                    <img src={MEMBRETE_MEDIQUIR.logo} alt="Logo" className="pp-logo" />
                    <div className="pp-membrete">
                        <h3>{MEMBRETE_MEDIQUIR.nombre}</h3>
                        <p className="pp-rif">RIF.: {MEMBRETE_MEDIQUIR.rif}</p>
                        <p>{MEMBRETE_MEDIQUIR.direccion}</p>
                        <p>TELF.: {MEMBRETE_MEDIQUIR.telefonos}, E-mail: {MEMBRETE_MEDIQUIR.email}</p>
                    </div>
                </header>

                <section className="pp-info">
                    <div className="pp-cliente">
                        <div className="pp-linea"><span className="pp-rojo">CLIENTE:</span><span className="pp-valor">{cliente?.nombre || 'Cliente'}</span></div>
                        <div className="pp-linea"><span className="pp-rojo">RIF / CÉDULA:</span><span className="pp-valor">{cliente?.identificacion || 'N/A'}</span></div>
                        <div className="pp-linea"><span className="pp-rojo">DIRECCIÓN:</span><span className="pp-valor">{cliente?.direccion || 'N/A'}</span></div>
                    </div>
                    <div className="pp-doc">
                        <h2 className="pp-titulo">Presupuesto</h2>
                        <div className="pp-numero">{presupuesto.numero || '—'}</div>
                        <table className="pp-meta"><tbody>
                            <tr><td className="pp-et">Fecha de emisión</td><td>{fecha(creado)}</td></tr>
                            <tr><td className="pp-et">Válido hasta</td><td>{fecha(vence)}</td></tr>
                            <tr><td className="pp-et">Tasa de cambio</td><td>{fmt(tasa)} Bs/$</td></tr>
                        </tbody></table>
                    </div>
                </section>

                <table className="pp-tabla">
                    <thead><tr><th style={{ width: '10%' }}>CÓDIGO</th><th style={{ width: '45%', textAlign: 'left' }}>ARTÍCULO</th><th style={{ width: '15%', textAlign: 'right' }}>PRECIO UNIT $</th><th style={{ width: '10%', textAlign: 'center' }}>CANT.</th><th style={{ width: '20%', textAlign: 'right' }}>SUBTOTAL $</th></tr></thead>
                    <tbody>
                        {renglones.map((r, i) => (
                            <tr key={i}>
                                <td>{r.codigo || 'S/C'}</td>
                                <td style={{ textAlign: 'left' }}>{r.nombre}{!r.aplicaIva && <span className="pp-exento"> (exento)</span>}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(r.precioUnitario)}</td>
                                <td style={{ textAlign: 'center' }}>{fmt(r.cantidad).replace(/,00$/, '')}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(r.subtotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <footer className="pp-footer">
                    {presupuesto.notas && <div className="pp-notas"><b>Observaciones:</b> {presupuesto.notas}</div>}
                    <table className="pp-totales"><tbody>
                        <tr>
                            <td className="pp-tcelda"><span className="pp-rojo">SUBTOTAL</span><div className="pp-par"><b>{fmt(subtotalBs)} <i>Bs.</i></b><b>{fmt(subtotalUsd)} <i>USD</i></b></div></td>
                            <td className="pp-tcelda"><span className="pp-rojo">IVA 16%</span><div className="pp-par"><b>{fmt(ivaBs)} <i>Bs.</i></b><b>{fmt(ivaUsd)} <i>USD</i></b></div></td>
                            <td className="pp-tcelda pp-total"><span className="pp-rojo">TOTAL</span><div className="pp-gran">{fmt(totalBs)} Bs.</div><div className="pp-gran-usd">{fmt(totalUsd)} USD</div></td>
                        </tr>
                    </tbody></table>
                    <div className="pp-aviso">Este presupuesto es solo informativo: no es una factura ni un documento fiscal. Precios sujetos a cambio sin previo aviso, válido hasta la fecha indicada.</div>
                </footer>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                * { box-sizing: border-box; }
                .pp-envoltura { background: #525659; min-height: 100vh; padding: 12px; font-family: Arial, Helvetica, sans-serif; overflow: auto; }
                .pp-barra { max-width: 8.5in; margin: 0 auto 8px; display: flex; justify-content: space-between; gap: 10px; color: #fff; font-size: 12px; }
                .pp-barra button { padding: 4px 14px; font-weight: 700; cursor: pointer; margin-left: 8px; }

                .pp-hoja { width: 8.5in; min-height: 11in; height: max-content; margin: 0 auto; background: #fff; color: #000; padding: 0.35in 0.4in; font-size: 11px; box-shadow: 0 0 10px rgba(0,0,0,.5); display: flex; flex-direction: column; }
                .pp-rojo { color: #d32f2f !important; font-weight: 700; }

                .pp-header { display: grid; grid-template-columns: 25% 75%; align-items: center; border-bottom: 2px solid #ccc; padding-bottom: 6px; margin-bottom: 8px; }
                .pp-logo { max-width: 100%; max-height: 90px; object-fit: contain; }
                .pp-membrete h3 { color: #1976d2; margin: 0 0 2px; font-size: 14px; }
                .pp-membrete p { margin: 0; font-size: 9px; font-weight: 700; }
                .pp-membrete .pp-rif { font-size: 11px; }

                .pp-info { display: grid; grid-template-columns: 58% 42%; margin-bottom: 10px; gap: 8px; }
                .pp-linea { display: flex; align-items: flex-end; gap: 6px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px; }
                .pp-linea .pp-rojo { width: 120px; flex-shrink: 0; font-size: 9px; }
                .pp-valor { font-weight: 700; font-size: 11px; }
                .pp-doc { text-align: right; }
                .pp-titulo { font-size: 20px; margin: 0; font-weight: 900; text-transform: uppercase; }
                .pp-numero { color: #d32f2f; font-size: 15px; font-weight: 800; margin-bottom: 4px; }
                .pp-meta { width: 100%; font-size: 10px; margin-left: auto; }
                .pp-meta td { padding: 1px 0; }
                .pp-et { font-weight: 700; padding-right: 8px !important; }

                .pp-tabla { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
                .pp-tabla th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 3px; font-size: 10px; }
                .pp-tabla td { padding: 4px 3px; font-size: 10px; border-bottom: 1px dashed #ddd; vertical-align: top; }
                .pp-exento { color: #888; font-size: 9px; }

                .pp-footer { margin-top: auto; }
                .pp-notas { font-size: 9.5px; margin-bottom: 6px; }
                .pp-totales { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 8px; }
                .pp-tcelda { padding: 4px 8px; border-right: 1px solid #000; text-align: center; width: 33%; }
                .pp-tcelda:last-child { border-right: 0; }
                .pp-par { display: flex; justify-content: space-around; font-size: 10px; margin-top: 2px; }
                .pp-par i { color: #d32f2f; font-style: normal; font-size: 8px; }
                .pp-total { background: #f9f9f9; }
                .pp-gran { font-size: 13px; font-weight: 800; margin-top: 2px; }
                .pp-gran-usd { font-size: 10px; font-weight: 700; color: #444; }
                .pp-aviso { font-size: 8.5px; color: #555; text-align: center; }

                @media (max-width: 8.9in) { .pp-hoja { transform: scale(.85); transform-origin: top left; } }

                @media print {
                    @page { size: letter portrait; margin: 0 !important; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #pp-print-section, #pp-print-section * { visibility: visible !important; }
                    .pp-envoltura { padding: 0 !important; background: transparent !important; min-height: 0; }
                    #pp-print-section { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; box-shadow: none !important; transform: none !important; width: 8.5in !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
}
