'use client';

import React from 'react';

// Comprobante de retención del Impuesto al Valor Agregado (retención que practica la empresa, como agente de retención, a un proveedor).
// Mismo formato del comprobante que ya se entregaba. Todo en bolívares. Se usa para verlo, imprimirlo y generar el PDF.
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bs = (n) => nf.format(Number(n) || 0);
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

const ANCHOS = [28, 78, 80, 86, 66, 66, 46, 38, 100, 84, 90, 44, 86, 88];
const Columnas = () => <colgroup>{ANCHOS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;

export const ESTILOS_COMPROBANTE = `
.cr-hoja { width: 1040px; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 13px; padding: 14px 16px 18px; box-sizing: border-box; position: relative; }
.cr-hoja * { box-sizing: border-box; }
.cr-titulo { font-size: 15px; font-weight: 700; margin: 6px 0 4px; white-space: nowrap; }
.cr-ley { font-size: 12px; line-height: 1.35; width: 545px; }
.cr-caja { border: 1.5px solid #000; }
.cr-etq { font-size: 12.5px; padding: 2px 8px; }
.cr-val { padding: 4px 10px 6px; }
.cr-fila { display: flex; gap: 14px; margin-top: 10px; }
.cr-cabecera { display: flex; justify-content: space-between; align-items: flex-start; }
.cr-nro { display: flex; gap: 8px; }
.cr-nro .cr-caja { text-align: center; }
.cr-tabla { margin-top: 14px; border: 1.5px solid #000; border-radius: 14px; }
.cr-tabla table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.cr-tabla th { font-weight: 400; font-size: 11.5px; padding: 6px 2px; text-align: center; line-height: 1.25; vertical-align: middle; }
.cr-tabla th.cr-b { font-weight: 700; }
.cr-datos { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 8px; font-size: 12.5px; }
.cr-datos td { padding: 4px 4px; text-align: center; }
.cr-datos td.d { text-align: right; }
.cr-total td { padding-top: 2px; }
.cr-firmas { display: flex; justify-content: space-between; margin-top: 30px; padding: 0 30px; }
.cr-firma { width: 410px; text-align: center; font-size: 13px; position: relative; }
.cr-firma .cr-linea { border-top: 2.5px solid #000; margin-top: 104px; padding-top: 6px; }
.cr-sello { position: absolute; left: 50%; top: 0; width: 200px; transform: translateX(-52%); opacity: .95; pointer-events: none; }
@media print {
  @page { size: letter landscape; margin: 7mm; }
  body * { visibility: hidden !important; }
  #comprobante-retencion, #comprobante-retencion * { visibility: visible !important; }
  #comprobante-retencion { position: absolute !important; left: 0; top: 0; zoom: 0.93; padding: 0; }
}
`;

export default function ComprobanteRetencion({ datos, conSello = true }) {
    if (!datos) return null;
    const { agente, sujeto, lineas, totales } = datos;
    return (
        <div className="cr-hoja" id="comprobante-retencion">
            <style>{ESTILOS_COMPROBANTE}</style>

            <div className="cr-cabecera">
                <div>
                    <h1 className="cr-titulo">COMPROBANTE DE RETENCIÓN DEL IMPUESTO AL VALOR AGREGADO</h1>
                    <div className="cr-ley">(Ley IVA-Art. 11. &quot;Serán responsables del pago del impuesto en calidad de agentes de retención, los compradores o adquirientes de determinados bienes muebles y los receptores de ciertos servicios, a quienes la Administración Tributaria designe como tal&quot;</div>
                </div>
                <div className="cr-nro">
                    <div className="cr-caja" style={{ width: 290 }}>
                        <div className="cr-etq" style={{ borderBottom: '1.5px solid #000' }}>Nro. Comprobante</div>
                        <div className="cr-val" style={{ fontSize: 19 }}>{datos.comprobante}</div>
                    </div>
                    <div className="cr-caja" style={{ width: 150 }}>
                        <div className="cr-etq" style={{ borderBottom: '1.5px solid #000' }}>Fecha:</div>
                        <div className="cr-val" style={{ fontSize: 19 }}>{dmy(datos.fecha)}</div>
                    </div>
                </div>
            </div>

            <div className="cr-fila">
                <div className="cr-caja" style={{ flex: 1 }}>
                    <div className="cr-etq" style={{ borderBottom: '1.5px solid #000' }}>Nombre o razón del Agente de Retención:</div>
                    <div className="cr-val" style={{ fontSize: 16 }}>{agente.nombre}</div>
                </div>
                <div className="cr-caja" style={{ width: 455 }}>
                    <div className="cr-etq" style={{ borderBottom: '1.5px solid #000' }}>Registro de Información Fiscal del Agente de Retención</div>
                    <div className="cr-val"><b>RIF: {agente.rif}</b></div>
                </div>
            </div>

            <div className="cr-caja" style={{ marginTop: 8 }}>
                <div className="cr-etq" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1.5px solid #000' }}>
                    <span>Dirección Fiscal del Agente de Retención</span><span style={{ marginRight: 250 }}>Periodo Fiscal :</span>
                </div>
                <div className="cr-val" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 58 }}>
                    <div style={{ textAlign: 'center', flex: 1, lineHeight: 1.5 }}>
                        {agente.direccion}<br />ZONA POSTAL {agente.zonaPostal} &nbsp;Teléfonos: {agente.telefonos} &nbsp;Fax:
                    </div>
                    <div style={{ width: 300, textAlign: 'left', paddingLeft: 40 }}>AÑO: &nbsp;&nbsp;&nbsp;&nbsp; {datos.ano} / &nbsp;MES : {datos.mes}</div>
                </div>
            </div>

            <div className="cr-fila" style={{ marginTop: 10 }}>
                <div className="cr-caja" style={{ flex: 1 }}>
                    <div className="cr-etq" style={{ borderBottom: '1.5px solid #000' }}>Nombre o Razón Social del Sujeto Retenido</div>
                    <div className="cr-val">{sujeto.nombre}</div>
                </div>
                <div className="cr-caja" style={{ width: 405 }}>
                    <div className="cr-etq" style={{ borderBottom: '1.5px solid #000' }}>Registro de Información Fiscal del Sujeto Retenido</div>
                    <div className="cr-val">RIF: {sujeto.rif}</div>
                </div>
            </div>

            <div className="cr-caja" style={{ marginTop: 8, width: 1000 }}>
                <div className="cr-etq" style={{ display: 'flex', borderBottom: '1.5px solid #000' }}>
                    <span style={{ flex: 1 }}>Dirección del Sujeto Retenido</span><span style={{ width: 400 }}>Teléfonos del Sujeto Retenido</span>
                </div>
                <div className="cr-val" style={{ display: 'flex', minHeight: 44 }}>
                    <span style={{ flex: 1, textTransform: 'uppercase' }}>{sujeto.direccion}</span><span style={{ width: 400 }}>{sujeto.telefono}</span>
                </div>
            </div>

            <div className="cr-tabla">
                <table>
                    <Columnas />
                    <thead>
                        <tr>
                            <th>Oper.<br />Nro.</th><th>Fecha del<br />Documento</th><th>Número de<br />Factura</th><th>Número de<br />Control Doc.</th>
                            <th>Número de<br />N/D</th><th>Número de<br />N/C</th><th>Tipo de<br />Trans</th><th>Fact<br />Afect</th>
                            <th>Monto Total<br />con I.V.A</th><th>Monto<br />Exento</th><th>Base<br />Imponible</th><th>% I.V.A.</th><th>Monto<br />I.V.A</th><th className="cr-b">I.V.A<br />Retenido</th>
                        </tr>
                    </thead>
                </table>
            </div>
            <table className="cr-datos">
                <Columnas />
                <tbody>
                    {lineas.map((l) => (
                        <tr key={l.oper}>
                            <td>{l.oper}</td><td>{dmy(l.fechaDocumento)}</td><td style={{ fontSize: 11 }}>{l.numeroFactura}</td><td>{l.numeroControl}</td>
                            <td /><td /><td>{l.tipoTrans}</td><td />
                            <td className="d">{bs(l.total)}</td><td className="d">{bs(l.exento)}</td><td className="d">{bs(l.base)}</td>
                            <td>{l.alicuota}%</td><td className="d">{bs(l.iva)}</td><td className="d">{bs(l.retenido)}</td>
                        </tr>
                    ))}
                    <tr>
                        <td colSpan={10} />
                        <td style={{ borderTop: '3px solid #000', height: 6 }} />
                        <td />
                        <td colSpan={2} style={{ borderTop: '3px solid #000', height: 6 }} />
                    </tr>
                    <tr className="cr-total">
                        <td colSpan={10} /><td className="d">{bs(totales.base)}</td><td /><td className="d">{bs(totales.iva)}</td><td className="d">{bs(totales.retenido)}</td>
                    </tr>
                </tbody>
            </table>

            <div className="cr-firmas">
                <div className="cr-firma">
                    {conSello && agente.sello && <img className="cr-sello" src={agente.sello} alt="Sello y firma autorizada" crossOrigin="anonymous" />}
                    <div className="cr-linea">Firma y Sello del Agente de Retención</div>
                </div>
                <div className="cr-firma">
                    <div className="cr-linea">Firma y Sello del Agente Retenido</div>
                    <div style={{ marginTop: 8 }}>Fecha de Recepción _____ / _____ / _____</div>
                </div>
            </div>
        </div>
    );
}
