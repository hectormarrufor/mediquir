'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconBrandWhatsapp, IconPrinter } from '@tabler/icons-react';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import CompartirWhatsappModal from '@/app/superuser/presupuestos/_components/CompartirWhatsapp';
import { generarPdfDeHojas } from '@/app/superuser/presupuestos/_components/pdfPresupuesto';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { nombreConMarca } from '@/app/constants/nombreConMarca';
import { fuenteTienda } from '@/app/fonts/tienda';

const HOJA_PX = 816; // 8.5in a 96 dpi
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v) => nf.format(Number(v) || 0);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '') : '');
const dos = (n) => String(n).padStart(2, '0');

function Pulso({ mini = false }) {
    return (
        <svg className={mini ? 'pp-pulso pp-pulso-mini' : 'pp-pulso'} viewBox="0 0 710 26" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <polyline fill="none" stroke="#0b2a6f" strokeWidth="2" strokeLinecap="round" points="0,18 220,18" />
            <polyline fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" points="220,18 426,18" />
            <polyline
                fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                points="426,18 439,18 444.5,13 450,18 463,18 470,21.5 480,1.5 490,24.5 497,18 513,18 522.5,11.5 532.5,18 570,18"
            />
            <polyline fill="none" stroke="#22a55a" strokeWidth="2" strokeLinecap="round" points="570,18 710,18" />
        </svg>
    );
}

function Decor() {
    return (
        <>
            <svg className="pp-decor" viewBox="0 0 816 1056" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <defs>
                    <pattern id="pp-puntos" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.15" fill="#0ea5e9" fillOpacity="0.22" /></pattern>
                    <linearGradient id="pp-desvanece" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#ffffff" stopOpacity="1" /></linearGradient>
                    <radialGradient id="pp-brillo-cian"><stop offset="0" stopColor="#0ea5e9" stopOpacity="0.17" /><stop offset="1" stopColor="#0ea5e9" stopOpacity="0" /></radialGradient>
                    <radialGradient id="pp-brillo-verde"><stop offset="0" stopColor="#22a55a" stopOpacity="0.15" /><stop offset="1" stopColor="#22a55a" stopOpacity="0" /></radialGradient>
                </defs>
                <rect x="376" y="0" width="440" height="340" fill="url(#pp-puntos)" />
                <rect x="376" y="0" width="440" height="340" fill="url(#pp-desvanece)" />
                <circle cx="790" cy="70" r="330" fill="url(#pp-brillo-cian)" />
                <circle cx="20" cy="1030" r="360" fill="url(#pp-brillo-verde)" />
                <polyline fill="none" stroke="#0ea5e9" strokeOpacity="0.09" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"
                    points="0,880 300,880 330,880 346,862 362,880 400,880 420,892 450,800 480,918 500,880 540,880 566,858 592,880 816,880" />
            </svg>
            <img src={MEMBRETE_MEDIQUIR.logo} alt="" className="pp-marca" />
        </>
    );
}

const ANCHO_DESC_PX = 256, ANCHO_MARCA_PX = 64, ALTO_LINEA = 12.6, RELLENO_FILA = 9;
let lienzo = null;
const medir = (t, fuente) => {
    if (typeof document === 'undefined') return String(t).length * 6;
    lienzo = lienzo || document.createElement('canvas').getContext('2d');
    lienzo.font = fuente;
    return lienzo.measureText(t).width * 1.08;
};
const contarLineas = (texto, fuente, ancho) => {
    let lineas = 1, actual = '';
    for (const palabra of String(texto || '').split(/\s+/).filter(Boolean)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (!actual || medir(prueba, fuente) <= ancho) actual = prueba;
        else { lineas++; actual = palabra; }
    }
    return Math.min(3, lineas);
};
const ESPACIO = { primera: 600, siguientes: 840 };
function paginar(renglones, notas) {
    const filas = renglones.map((r, i) => ({
        r,
        i,
        alto: RELLENO_FILA + ALTO_LINEA * Math.max(
            contarLineas(r.nombre, '600 9.5px Arial, sans-serif', ANCHO_DESC_PX + (r.aplicaIva ? 0 : -44)),
            contarLineas(r.marca || '—', '500 8.5px Arial, sans-serif', ANCHO_MARCA_PX),
        ),
    }));
    const notasPx = notas ? 28 + 12.5 * String(notas).split(/\r?\n/).reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 95)), 0) : 0;
    const cierre = 300 + notasPx;
    const paginas = [[]];
    let usado = 0;
    for (const f of filas) {
        const tope = paginas.length === 1 ? ESPACIO.primera : ESPACIO.siguientes;
        if (usado + f.alto > tope && paginas[paginas.length - 1].length) { paginas.push([]); usado = 0; }
        paginas[paginas.length - 1].push(f);
        usado += f.alto;
    }
    const tope = paginas.length === 1 ? ESPACIO.primera : ESPACIO.siguientes;
    if (usado + cierre > tope) paginas.push([]);
    return paginas;
}

/**
 * Formato editorial carta para Nota de Entrega y Recibo de Venta (idéntico al diseño de Presupuesto)
 * con soporte de impresión y descarga/compartir PDF por WhatsApp.
 */
export default function NotaEntregaImprimible({ venta }) {
    const telefono = useEsTelefono();
    const [compartiendo, setCompartiendo] = useState(false);
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        const ajustar = () => setZoom(Math.min(1, (window.innerWidth - 16) / HOJA_PX));
        ajustar();
        window.addEventListener('resize', ajustar);
        return () => window.removeEventListener('resize', ajustar);
    }, []);

    const esNotaEntrega = venta.tipoDocumento === 'NOTA_ENTREGA' || /^NE-/i.test(String(venta.numeroDocumento || ''));
    const tituloDocumento = esNotaEntrega ? 'Nota de Entrega' : 'Recibo de Venta';
    const numeroImpreso = esNotaEntrega
        ? (/^NE-\d{2}-/i.test(String(venta.numeroDocumento || ''))
            ? String(venta.numeroDocumento).toUpperCase()
            : `NE-00-${String(venta.numeroDocumento || '').replace(/^NE-/i, '').replace(/\D/g, '').padStart(5, '0')}`)
        : venta.numeroDocumento;

    const renglones = useMemo(() => (venta.detalles || []).map((d) => ({
        codigo: d.isFicticio ? 'S/C' : (d.producto?.codigo || 'S/C'),
        nombre: d.isFicticio ? d.nombreFicticio : nombreConMarca(d.producto?.nombre || d.nombreFicticio, d.producto?.marca?.nombre),
        marca: d.isFicticio ? '—' : (d.producto?.marca?.nombre || '—'),
        aplicaIva: d.isFicticio ? Boolean(d.aplicaIva) : Number(d.producto?.porcentajeIva ?? 16) > 0,
        cantidad: Number(d.cantidad) || 0,
        precioUnitario: Number(d.precioUnitario) || 0,
        subtotal: Number(d.subtotal) || 0,
    })), [venta.detalles]);

    const notas = venta.observaciones || venta.notas || '';
    const paginas = useMemo(() => paginar(renglones, notas), [renglones, notas]);

    const tasa = Number(venta.tasaCambio) || 1;
    const enBs = venta.moneda === 'BS';
    const simbolo = enBs ? 'Bs.' : '$';
    const otroSimbolo = enBs ? '$' : 'Bs.';
    const principal = (v) => `${simbolo} ${fmt(v)}`;
    const equivalente = (v) => { const n = Number(v) || 0; return `${otroSimbolo} ${fmt(enBs ? aDolares(n, tasa) : aBolivares(n, tasa))}`; };

    const referencial = (esNotaEntrega || venta.tipoDocumento === 'VENTA_RAPIDA') && Number(venta.montoIva) === 0;
    const ivaReferencial = referencial
        ? Math.round((venta.detalles || []).reduce((a, d) => a + Number(d.subtotal) * (d.isFicticio ? (d.aplicaIva ? 16 : 0) : Number(d.producto?.porcentajeIva ?? 16)) / 100, 0) * 100) / 100
        : 0;
    const ivaDoc = referencial ? ivaReferencial : Number(venta.montoIva || 0);
    const fleteDoc = Number(venta.costoFlete || 0);
    const totalDoc = Number(venta.totalFinal || 0) + (referencial ? ivaDoc : 0);
    const baseDoc = Math.max(0, totalDoc - ivaDoc - fleteDoc);

    const creado = venta.fechaEmision || venta.createdAt || new Date().toISOString();
    const vence = venta.fechaVencimiento || creado;
    const cliente = venta.cliente;
    const sinCliente = !cliente?.nombre;
    const unidades = renglones.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
    const nombreArchivo = `${esNotaEntrega ? 'Nota-Entrega' : 'Recibo'}-${String(numeroImpreso || 'Mediquir').replace(/[^\w-]+/g, '')}.pdf`;
    const mensajeWhatsapp = `Hola${cliente?.nombre ? ` ${cliente.nombre}` : ''}, ¡un gusto saludarte! 👋\n\n`
        + `Te comparto tu ${tituloDocumento.toLowerCase()} *${numeroImpreso}* de *Mediquir* por un total de *${principal(totalDoc)}* (${equivalente(totalDoc)}).\n\n`
        + `Cualquier duda quedo atento. ¡Gracias por preferirnos! 🙌\n\n— Equipo Mediquir`;
    const obtenerPdf = () => generarPdfDeHojas(document.getElementById('pp-print-section'), fuenteTienda.className);

    return (
        <div className="pp-envoltura">
            <Group className="pp-barra" justify="space-between" gap="xs">
                <Text c="white" fw={700} size="sm">{tituloDocumento} {numeroImpreso}</Text>
                {!telefono && (
                    <Group gap="xs" className="pp-acciones">
                        <Button size="sm" color="green" leftSection={<IconBrandWhatsapp size={16} />} onClick={() => setCompartiendo(true)}>WhatsApp</Button>
                        <Button size="sm" color="teal" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Imprimir</Button>
                    </Group>
                )}
            </Group>

            {telefono && (
                <div className="pp-movil-barra" role="toolbar" aria-label="Acciones del documento">
                    <Button size="md" color="teal" leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>Imprimir</Button>
                    <Button size="md" color="green" leftSection={<IconBrandWhatsapp size={18} />} onClick={() => setCompartiendo(true)}>WhatsApp</Button>
                </div>
            )}

            <CompartirWhatsappModal
                opened={compartiendo}
                onClose={() => setCompartiendo(false)}
                mensajeInicial={mensajeWhatsapp}
                telefonoInicial={cliente?.telefono || ''}
                nombreArchivo={nombreArchivo}
                generarPdf={obtenerPdf}
            />

            <div id="pp-print-section" className={fuenteTienda.className}>
                {paginas.map((filas, n) => {
                    const primera = n === 0;
                    const ultima = n === paginas.length - 1;
                    return (
                        <div className="pp-hoja" key={n} style={{ '--pp-zoom': zoom }}>
                            <div className="pp-franja" />
                            <Decor />
                            <div className="pp-cuerpo">
                                {primera ? (
                                    <>
                                        <header className="pp-header">
                                            <img src={MEMBRETE_MEDIQUIR.logo} alt="Mediquir" className="pp-logo" />
                                            <div className="pp-titular">
                                                <div className="pp-ceja">{esNotaEntrega ? 'Documento no fiscal' : 'Comprobante no fiscal'}</div>
                                                <h1 className="pp-titulo">{tituloDocumento}</h1>
                                                <div className="pp-numero">N.º <b>{numeroImpreso}</b></div>
                                            </div>
                                        </header>

                                        <Pulso />

                                        <section className="pp-meta">
                                            <div><span>Emisión</span><b>{fecha(creado)}</b></div>
                                            <div><span>Vence</span><b>{fecha(vence)}</b></div>
                                            <div><span>Condición</span><b>{venta.condicionPago === 'Credito' ? 'Crédito' : 'Contado'}</b></div>
                                            <div><span>Tasa BCV</span><b>{fmt(tasa)} Bs/$</b></div>
                                        </section>

                                        <section className="pp-partes">
                                            <div className="pp-parte pp-cliente">
                                                <div className="pp-et">Entregado a</div>
                                                {sinCliente ? (
                                                    <div className="pp-amano">
                                                        <div><span>Cliente</span><i /></div>
                                                        <div><span>RIF / C.I.</span><i /></div>
                                                        <div><span>Dirección</span><i /></div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="pp-nombre">{cliente.nombre}</div>
                                                        <div className="pp-dato"><span>RIF / C.I.</span>{cliente.identificacion || 'N/A'}</div>
                                                        <div className="pp-dato"><span>Dirección</span>{cliente.direccion || 'N/A'}</div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="pp-parte pp-emisor">
                                                <div className="pp-et">Emitido por</div>
                                                <div className="pp-nombre pp-nombre-sm">{MEMBRETE_MEDIQUIR.nombre}</div>
                                                <div className="pp-dato"><span>RIF</span>{MEMBRETE_MEDIQUIR.rif}</div>
                                                <div className="pp-dato pp-dir">{MEMBRETE_MEDIQUIR.direccion}</div>
                                            </div>
                                        </section>
                                    </>
                                ) : (
                                    <>
                                        <header className="pp-mini">
                                            <img src={MEMBRETE_MEDIQUIR.logo} alt="Mediquir" className="pp-logo-mini" />
                                            <div className="pp-mini-txt">
                                                <b>{tituloDocumento} N.º {numeroImpreso}</b>
                                                <span>{sinCliente ? 'Cliente: ________________' : cliente.nombre} · continuación</span>
                                            </div>
                                        </header>
                                        <Pulso mini />
                                    </>
                                )}

                                {filas.length > 0 && (
                                    <table className="pp-tabla">
                                        <thead>
                                            <tr>
                                                <th className="pp-c-n">#</th>
                                                <th className="pp-c-cod">Código</th>
                                                <th className="pp-c-desc">Descripción</th>
                                                <th className="pp-c-marca">Marca</th>
                                                <th className="pp-c-num pp-c-cant">Cant.</th>
                                                <th className="pp-c-num pp-c-pu">Precio unit.</th>
                                                <th className="pp-c-num pp-c-imp">Importe</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filas.map(({ r, i }) => (
                                                <tr key={i}>
                                                    <td className="pp-c-n">{dos(i + 1)}</td>
                                                    <td className="pp-c-cod">{r.codigo}</td>
                                                    <td className="pp-c-desc">
                                                        <span className="pp-art">{r.nombre}</span>
                                                        {!r.aplicaIva && <span className="pp-chip">Exento</span>}
                                                    </td>
                                                    <td className="pp-c-marca">{r.marca}</td>
                                                    <td className="pp-c-num pp-c-cant">{fmt(r.cantidad).replace(/,00$/, '')}</td>
                                                    <td className="pp-c-num pp-c-pu">{principal(r.precioUnitario)}</td>
                                                    <td className="pp-c-num pp-c-imp pp-importe">{principal(r.subtotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {ultima && (
                                    <>
                                        <div className="pp-conteo">{renglones.length} {renglones.length === 1 ? 'artículo' : 'artículos'} · {fmt(unidades).replace(/,00$/, '')} unidades</div>

                                        <div className="pp-final">
                                            <section className="pp-cierre">
                                                <div className="pp-condiciones">
                                                    {notas && (
                                                        <div className="pp-bloque">
                                                            <div className="pp-et">Observaciones</div>
                                                            <p className="pp-notas">{notas}</p>
                                                        </div>
                                                    )}
                                                    <div className="pp-bloque">
                                                        <div className="pp-et">Condiciones</div>
                                                        <ul>
                                                            <li>Modalidad de pago: <b>{venta.condicionPago === 'Credito' ? 'Crédito' : 'Contado'}</b>{venta.fechaVencimiento ? ` (vence ${fecha(venta.fechaVencimiento)})` : ''}.</li>
                                                            <li>Moneda de operación: <b>{enBs ? 'Bolívares (Bs.)' : 'Dólares (US$)'}</b> a tasa {fmt(tasa)} Bs/$.</li>
                                                            <li>{esNotaEntrega ? 'Documento no fiscal: nota de entrega interna para control de despacho.' : 'Comprobante no fiscal de venta.'}</li>
                                                        </ul>
                                                    </div>
                                                </div>

                                                <div className="pp-resumen">
                                                    <div className="pp-fila">
                                                        <span>Subtotal</span>
                                                        <div><b>{principal(baseDoc)}</b><small>{equivalente(baseDoc)}</small></div>
                                                    </div>
                                                    {fleteDoc > 0 && (
                                                        <div className="pp-fila">
                                                            <span>Flete / Delivery</span>
                                                            <div><b>{principal(fleteDoc)}</b><small>{equivalente(fleteDoc)}</small></div>
                                                        </div>
                                                    )}
                                                    {ivaDoc > 0 && (
                                                        <div className="pp-fila">
                                                            <span>IVA 16 %</span>
                                                            <div><b>{principal(ivaDoc)}</b><small>{equivalente(ivaDoc)}</small></div>
                                                        </div>
                                                    )}
                                                    <div className="pp-total">
                                                        <div className="pp-total-et">Total</div>
                                                        <div className="pp-total-monto">{principal(totalDoc)}</div>
                                                        <div className="pp-total-eq">Equivale a {equivalente(totalDoc)}</div>
                                                    </div>
                                                </div>
                                            </section>

                                            <footer className="pp-pie">
                                                <span className="pp-pie-marca">Mediquir</span>
                                                <span>{MEMBRETE_MEDIQUIR.telefonos}</span>
                                                <span>{MEMBRETE_MEDIQUIR.email}</span>
                                                <span>RIF {MEMBRETE_MEDIQUIR.rif}</span>
                                            </footer>
                                        </div>
                                    </>
                                )}
                            </div>
                            {paginas.length > 1 && <div className="pp-num">Hoja {n + 1} de {paginas.length}</div>}
                        </div>
                    );
                })}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .pp-envoltura, .pp-envoltura * { box-sizing: border-box; }
                .pp-envoltura { background: #525659; min-height: 100vh; padding: 12px 8px; font-family: Arial, Helvetica, sans-serif; overflow-x: hidden; }
                .pp-barra { max-width: 8.5in; margin: 0 auto 10px; position: sticky; top: 0; z-index: 5; background: #525659; padding: 6px 0; }
                @media (max-width: 48em) {
                    .pp-envoltura { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
                    .pp-barra { position: static; }
                }
                .pp-movil-barra { position: fixed; left: 0; right: 0; bottom: 0; z-index: 200; display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
                    background: rgba(8, 21, 48, 0.94); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border-top: 1px solid rgba(255,255,255,.14); }
                .pp-movil-barra > * { flex: 1 1 0; min-width: 0; height: 48px; padding-inline: 8px; }

                .pp-hoja {
                    --navy: #0b2a6f; --azul: #1d4ed8; --cian: #0ea5e9; --verde: #22a55a;
                    --tinta: #0f172a; --gris: #64748b; --gris-claro: #94a3b8; --linea: #e2e8f0; --fondo: #f5f8fc;
                    width: 8.5in; min-height: 11in; height: max-content; margin: 0 auto 14px; position: relative; background: linear-gradient(180deg, #ffffff 0%, #f6f9fe 100%); color: var(--tinta); overflow: hidden;
                    box-shadow: 0 0 10px rgba(0,0,0,.5); display: flex; flex-direction: column; zoom: var(--pp-zoom, 1);
                    font-size: 10px; line-height: 1.45; font-feature-settings: "tnum" 1, "lnum" 1;
                }
                .pp-franja { height: 6px; background: linear-gradient(90deg, var(--navy) 0%, var(--azul) 35%, var(--cian) 70%, var(--verde) 100%); flex-shrink: 0; }
                .pp-cuerpo { flex: 1; display: flex; flex-direction: column; padding: 0.42in 0.55in 0.35in; position: relative; z-index: 1; }
                .pp-decor { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
                .pp-marca { position: absolute; left: 50%; top: 47%; width: 6.2in; height: auto; transform: translate(-50%, -50%) rotate(-12deg); opacity: .06; pointer-events: none; z-index: 0; }

                .pp-et { font-size: 7.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--cian); margin-bottom: 6px; }

                .pp-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
                .pp-logo { height: 86px; width: auto; object-fit: contain; display: block; }
                .pp-titular { text-align: right; }
                .pp-ceja { font-size: 8px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--gris); }
                .pp-titulo { margin: 2px 0 4px; font-size: 36px; line-height: .95; font-weight: 800; font-stretch: 112%; letter-spacing: -.02em; color: var(--navy); }
                .pp-numero { display: inline-block; font-size: 10px; color: var(--gris); letter-spacing: .04em; }
                .pp-numero b { color: var(--tinta); font-weight: 700; font-size: 12px; margin-left: 2px; }

                .pp-pulso { display: block; width: 100%; height: 26px; margin: 10px 0 12px; overflow: visible; }

                .pp-meta { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--fondo); border-radius: 10px; padding: 10px 4px; margin-bottom: 18px; }
                .pp-meta > div { padding: 0 14px; border-left: 1px solid var(--linea); display: flex; flex-direction: column; gap: 2px; }
                .pp-meta > div:first-child { border-left: 0; }
                .pp-meta span { font-size: 7px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--gris); }
                .pp-meta b { font-size: 11.5px; font-weight: 650; color: var(--navy); white-space: nowrap; }

                .pp-partes { display: grid; grid-template-columns: 1.15fr 1fr; gap: 28px; margin-bottom: 22px; }
                .pp-parte { min-width: 0; }
                .pp-emisor { padding-left: 28px; border-left: 1px solid var(--linea); }
                .pp-nombre { font-size: 15px; font-weight: 750; letter-spacing: -.01em; color: var(--tinta); line-height: 1.2; margin-bottom: 5px; }
                .pp-nombre-sm { font-size: 11.5px; }
                .pp-dato { font-size: 9.5px; color: #334155; margin-bottom: 2px; }
                .pp-dato span { display: inline-block; min-width: 64px; font-size: 7.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--gris-claro); }
                .pp-emisor .pp-dato span { min-width: 30px; }
                .pp-dir { font-size: 8.5px; color: var(--gris); line-height: 1.4; margin-top: 3px; }
                .pp-amano > div { display: flex; align-items: flex-end; gap: 8px; height: 22px; }
                .pp-amano span { width: 64px; flex-shrink: 0; font-size: 7.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--gris-claro); }
                .pp-amano i { flex: 1; border-bottom: 1px solid #cbd5e1; height: 1px; margin-bottom: 3px; }

                .pp-pulso-mini { height: 16px; margin: 6px 0 10px; }
                .pp-mini { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
                .pp-logo-mini { height: 38px; width: auto; object-fit: contain; display: block; }
                .pp-mini-txt { text-align: right; display: flex; flex-direction: column; font-size: 9px; color: var(--gris); }
                .pp-mini-txt b { font-size: 11px; color: var(--navy); }
                .pp-num { position: absolute; right: 0.55in; bottom: 0.14in; font-size: 7.5px; color: var(--gris-claro); letter-spacing: .06em; }
                .pp-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; }
                .pp-tabla thead th { font-size: 7.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--gris); padding: 0 6px 8px; border-bottom: 1.5px solid var(--navy); text-align: left; }
                .pp-tabla tbody tr { break-inside: avoid; page-break-inside: avoid; }
                .pp-tabla tbody td { padding: 4px 6px; border-bottom: 1px solid var(--linea); vertical-align: middle; overflow: hidden; }
                .pp-tabla tbody tr:nth-child(even) td { background: rgba(241, 246, 253, .72); }
                .pp-tabla .pp-c-n { width: 30px; padding-left: 2px; color: var(--cian); font-weight: 700; font-size: 9px; }
                .pp-tabla thead .pp-c-n { color: var(--gris); }
                .pp-tabla .pp-c-desc { width: auto; }
                .pp-tabla .pp-c-cod { width: 74px; white-space: nowrap; text-overflow: ellipsis; font-size: 8px; color: var(--gris-claro); letter-spacing: .02em; }
                .pp-tabla .pp-c-marca { width: 78px; font-size: 8.5px; font-weight: 500; line-height: 12.6px; color: #475569; }
                .pp-tabla tbody .pp-c-marca { display: table-cell; max-height: 38px; }
                .pp-tabla .pp-c-desc .pp-chip { margin-left: 6px; white-space: nowrap; }
                .pp-tabla .pp-c-num { text-align: right; white-space: nowrap; }
                .pp-tabla .pp-c-cant { width: 44px; }
                .pp-tabla .pp-c-pu { width: 100px; }
                .pp-tabla .pp-c-imp { width: 112px; }
                .pp-tabla td.pp-c-num { font-size: 10px; color: #334155; }
                .pp-tabla td.pp-importe { font-weight: 700; color: var(--tinta); }
                .pp-art { font-size: 9.5px; font-weight: 600; color: var(--tinta); line-height: 12.6px; }
                .pp-chip { font-size: 7px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #15803d; background: #dcfce7; border-radius: 999px; padding: 1px 7px; }
                .pp-conteo { text-align: right; font-size: 8px; color: var(--gris-claro); letter-spacing: .04em; padding: 6px 8px 0; }

                .pp-final { margin-top: auto; break-inside: avoid; page-break-inside: avoid; }
                .pp-cierre { padding-top: 22px; display: grid; grid-template-columns: 1fr 260px; gap: 32px; align-items: end; break-inside: avoid; page-break-inside: avoid; }
                .pp-bloque + .pp-bloque { margin-top: 14px; }
                .pp-notas { margin: 0; font-size: 9.5px; color: #334155; white-space: pre-line; }
                .pp-condiciones ul { margin: 0; padding: 0; list-style: none; }
                .pp-condiciones li { position: relative; padding-left: 12px; font-size: 8.5px; color: var(--gris); margin-bottom: 3px; }
                .pp-condiciones li::before { content: ''; position: absolute; left: 0; top: 5px; width: 5px; height: 5px; border-radius: 50%; background: linear-gradient(135deg, var(--cian), var(--verde)); }
                .pp-condiciones li b { color: var(--tinta); }

                .pp-fila { display: flex; justify-content: space-between; align-items: flex-start; padding: 7px 4px; border-bottom: 1px solid var(--linea); }
                .pp-fila > span { font-size: 8px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--gris); padding-top: 2px; }
                .pp-fila > div { text-align: right; display: flex; flex-direction: column; }
                .pp-fila b { font-size: 11px; font-weight: 650; color: var(--tinta); }
                .pp-fila small { font-size: 8px; color: var(--gris-claro); }
                .pp-total { margin-top: 10px; border-radius: 12px; padding: 14px 16px 13px; color: #fff; text-align: right; position: relative; overflow: hidden;
                    background: radial-gradient(120% 140% at 0% 0%, #1d4ed8 0%, rgba(29,78,216,0) 55%), radial-gradient(90% 120% at 100% 100%, rgba(14,165,233,.55) 0%, rgba(14,165,233,0) 60%), var(--navy); }
                .pp-total::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(90deg, var(--cian), var(--verde)); }
                .pp-total-et { font-size: 7.5px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #bae6fd; text-align: left; }
                .pp-total-monto { font-size: 25px; font-weight: 800; font-stretch: 108%; letter-spacing: -.02em; line-height: 1.1; margin-top: 4px; white-space: nowrap; }
                .pp-total-eq { font-size: 8.5px; color: #cbd5e1; margin-top: 2px; }

                .pp-pie { margin-top: 22px; padding-top: 10px; border-top: 1px solid var(--linea); display: flex; justify-content: space-between; gap: 12px; font-size: 7.5px; color: var(--gris-claro); letter-spacing: .04em; }
                .pp-pie-marca { font-weight: 800; font-stretch: 112%; color: var(--navy); letter-spacing: .12em; text-transform: uppercase; }

                @media print {
                    @page { size: letter portrait; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #pp-print-section, #pp-print-section * { visibility: visible !important; }
                    .pp-envoltura { padding: 0 !important; background: transparent !important; min-height: 0; }
                    #pp-print-section { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; width: 8.5in !important; }
                    .pp-hoja { margin: 0 !important; box-shadow: none !important; zoom: 1 !important; width: 8.5in !important; min-height: 10.97in !important; break-after: page; page-break-after: always; }
                    .pp-hoja:last-child { break-after: auto; page-break-after: auto; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
}
