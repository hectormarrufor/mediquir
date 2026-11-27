'use client';

import { nombreConMarca } from '@/app/constants/nombreConMarca';
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconBrandWhatsapp, IconDots, IconPrinter } from '@tabler/icons-react';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import CompartirPresupuestoModal from './CompartirWhatsapp';
import { generarPdfDeHojas } from './pdfPresupuesto';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { fuenteTienda } from '@/app/fonts/tienda';

// Presupuesto impreso en tamaño CARTA completo (no es la forma libre preimpresa: no es un documento fiscal).
// Diseño editorial: tipografía Archivo (la de la tienda, servida desde nuestro dominio), colores del logo (azul marino,
// cian del pulso y verde), la línea de pulso del logo como separador y un bloque de total destacado.
// `accionesExtra` son botones (Mantine) que se agregan junto a «Imprimir».
const HOJA_PX = 816; // 8.5in a 96 dpi
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (v) => nf.format(Number(v) || 0);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '') : '');
const sumarDias = (v, dias) => { const d = v ? new Date(v) : new Date(); d.setDate(d.getDate() + Number(dias || 0)); return d; };
const dos = (n) => String(n).padStart(2, '0');

// Línea de pulso (como la del logo) que cruza la hoja de lado a lado (sin linearGradient ni non-scaling-stroke para que html2canvas la dibuje completa en PDF)
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

// Fondo de la hoja: brillos suaves en las esquinas, una malla de puntos que se desvanece arriba a la derecha, un pulso muy tenue y el logo como marca de agua.
// Todo va MUY claro (no estorba la lectura ni gasta tinta) y se imprime/exporta igual.
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

// ---- Paginación en hojas carta: se estima la altura de cada renglón (1 a 3 líneas según su descripción y su marca, medidas con el tipo de letra)
// y se reparte en hojas. La 1.ª lleva la cabecera completa (menos espacio); las siguientes, una cabecera pequeña. Los totales y el pie van en la última
// hoja; si no caben ahí, pasan a una hoja propia.
const ANCHO_DESC_PX = 256, ANCHO_MARCA_PX = 64, ALTO_LINEA = 12.6, RELLENO_FILA = 9;
let lienzo = null;
const medir = (t, fuente) => {
    if (typeof document === 'undefined') return String(t).length * 6;
    lienzo = lienzo || document.createElement('canvas').getContext('2d');
    lienzo.font = fuente;
    return lienzo.measureText(t).width * 1.08; // margen: el tipo de letra real puede ser algo más ancho que el de medida
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
const ESPACIO = { primera: 600, siguientes: 840 }; // px de renglones por hoja (hoja carta = 1056 px)
function paginar(renglones, notas) {
    const filas = renglones.map((r, i) => ({ r, i, alto: RELLENO_FILA + ALTO_LINEA * Math.max(
        contarLineas(r.nombre, '600 9.5px Arial, sans-serif', ANCHO_DESC_PX + (r.aplicaIva ? 0 : -44)),
        contarLineas(r.marca || '—', '500 8.5px Arial, sans-serif', ANCHO_MARCA_PX),
    ) }));
    const notasPx = notas ? 28 + 12.5 * String(notas).split(/\r?\n/).reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 95)), 0) : 0;
    const cierre = 300 + notasPx; // conteo + condiciones + totales + pie
    const paginas = [[]];
    let usado = 0;
    for (const f of filas) {
        const tope = paginas.length === 1 ? ESPACIO.primera : ESPACIO.siguientes;
        if (usado + f.alto > tope && paginas[paginas.length - 1].length) { paginas.push([]); usado = 0; }
        paginas[paginas.length - 1].push(f);
        usado += f.alto;
    }
    const tope = paginas.length === 1 ? ESPACIO.primera : ESPACIO.siguientes;
    if (usado + cierre > tope + (paginas.length === 1 ? 0 : 0)) paginas.push([]); // los totales no caben: hoja propia
    return paginas;
}

// `acciones`: [{ clave, label, icono, color, onClick }]. En la computadora van como botones junto a «Imprimir»; en el teléfono, en una barra fija abajo
// (Imprimir, WhatsApp y «Más», que abre la lista completa con botones grandes). `accionesExtra` sigue admitiendo botones sueltos.
export default function PresupuestoImprimible({ presupuesto, accionesExtra = null, acciones = [] }) {
    const telefono = useEsTelefono();
    const [masAbierto, setMasAbierto] = useState(false);
    const [compartiendo, setCompartiendo] = useState(false);
    // En un teléfono la hoja carta no cabe: se achica (zoom) al ancho de la pantalla. Al imprimir vuelve a tamaño real.
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
        const ajustar = () => setZoom(Math.min(1, (window.innerWidth - 16) / HOJA_PX));
        ajustar();
        window.addEventListener('resize', ajustar);
        return () => window.removeEventListener('resize', ajustar);
    }, []);

    const paginas = useMemo(() => paginar(presupuesto?.renglones || [], presupuesto?.notas), [presupuesto]);
    if (!presupuesto) return null;
    const tasa = Number(presupuesto.tasaCambio) || 1;
    const renglones = presupuesto.renglones || [];
    // Los precios y totales guardados están en la moneda del presupuesto (P4/P5 en Bs; P7/P6 en $); la otra sale a la tasa
    const enBs = presupuesto.moneda === 'BS';
    const simbolo = enBs ? 'Bs.' : '$';
    const otroSimbolo = enBs ? '$' : 'Bs.';
    const principal = (v) => `${simbolo} ${fmt(v)}`;
    const equivalente = (v) => { const n = Number(v) || 0; return `${otroSimbolo} ${fmt(enBs ? aDolares(n, tasa) : aBolivares(n, tasa))}`; };
    const creado = presupuesto.createdAt || new Date().toISOString();
    const validoDias = presupuesto.validoDias ?? 15;
    const vence = sumarDias(creado, validoDias);
    const cliente = presupuesto.cliente || { nombre: presupuesto.clienteNombre, identificacion: presupuesto.clienteIdentificacion, direccion: presupuesto.clienteDireccion };
    // Sin cliente: las líneas salen en blanco para llenarlas a mano
    const sinCliente = !cliente?.nombre;
    const unidades = renglones.reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
    const nombreArchivo = `Presupuesto-${String(presupuesto.numero || 'Mediquir').replace(/[^\w-]+/g, '')}.pdf`;
    const mensajeWhatsapp = `Hola${cliente?.nombre ? ` ${cliente.nombre}` : ''}, ¡un gusto saludarte! 👋\n\n`
        + `Te comparto el presupuesto *${presupuesto.numero || ''}* de *Mediquir* con los productos que conversamos, por un total de *${principal(presupuesto.totalFinal)}* (${equivalente(presupuesto.totalFinal)} a la tasa del día).\n\n`
        + `Ten en cuenta que el precio que se mantiene es el expresado en dólares; el monto en bolívares solo es válido por 1 día.\n\n`
        + `Es válido hasta el ${fecha(vence)}. Quedo atento a cualquier duda o para coordinar tu pedido. ¡Gracias por preferirnos! 🙌\n\n— Equipo Mediquir`;
    const obtenerPdf = () => generarPdfDeHojas(document.getElementById('pp-print-section'), fuenteTienda.className);

    return (
        <div className="pp-envoltura">
            <Group className="pp-barra" justify="space-between" gap="xs">
                <Text c="white" fw={700} size="sm">Presupuesto {presupuesto.numero || ''}</Text>
                {!telefono && (
                    <Group gap="xs" className="pp-acciones">
                        {accionesExtra}
                        {acciones.map((a) => (
                            <Button key={a.clave} size="sm" variant="white" color={a.color || 'dark'} leftSection={a.icono ? <a.icono size={16} /> : null} onClick={a.onClick}>{a.label}</Button>
                        ))}
                        <Button size="sm" color="green" leftSection={<IconBrandWhatsapp size={16} />} onClick={() => setCompartiendo(true)}>WhatsApp</Button>
                        <Button size="sm" color="teal" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Imprimir</Button>
                    </Group>
                )}
            </Group>

            {telefono && (
                <>
                    <div className="pp-movil-barra" role="toolbar" aria-label="Acciones del presupuesto">
                        <Button size="md" color="teal" leftSection={<IconPrinter size={18} />} onClick={() => window.print()}>Imprimir</Button>
                        <Button size="md" color="green" leftSection={<IconBrandWhatsapp size={18} />} onClick={() => setCompartiendo(true)}>WhatsApp</Button>
                        {(acciones.length > 0 || accionesExtra) && <Button size="md" variant="white" color="dark" leftSection={<IconDots size={18} />} onClick={() => setMasAbierto(true)}>Más</Button>}
                    </div>
                    <Drawer opened={masAbierto} onClose={() => setMasAbierto(false)} position="bottom" title={<Text fw={800}>Presupuesto {presupuesto.numero || ''}</Text>}
                        styles={{ content: { height: 'auto', maxHeight: '88dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }, body: { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } }}>
                        <Stack gap={8}>
                            {acciones.map((a) => (
                                <UnstyledButton key={a.clave} onClick={() => { setMasAbierto(false); a.onClick(); }} className="pp-fila-accion">
                                    {a.icono ? <a.icono size={22} /> : null}
                                    <span>{a.label}</span>
                                </UnstyledButton>
                            ))}
                        </Stack>
                    </Drawer>
                </>
            )}

            <CompartirPresupuestoModal
                opened={compartiendo} onClose={() => setCompartiendo(false)} mensajeInicial={mensajeWhatsapp}
                telefonoInicial={cliente?.telefono || ''} nombreArchivo={nombreArchivo} generarPdf={obtenerPdf}
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
                                                <div className="pp-ceja">Cotización comercial</div>
                                                <h1 className="pp-titulo">Presupuesto</h1>
                                                <div className="pp-numero">N.º <b>{presupuesto.numero || '—'}</b></div>
                                            </div>
                                        </header>

                                        <Pulso />

                                        <section className="pp-meta">
                                            <div><span>Emitido</span><b>{fecha(creado)}</b></div>
                                            <div><span>Válido hasta</span><b>{fecha(vence)}</b></div>
                                            <div><span>Moneda</span><b>{enBs ? 'Bolívares (Bs.)' : 'Dólares (US$)'}</b></div>
                                            <div><span>Tasa de cambio</span><b>{fmt(tasa)} Bs/$</b></div>
                                        </section>

                                        <section className="pp-partes">
                                            <div className="pp-parte pp-cliente">
                                                <div className="pp-et">Preparado para</div>
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
                                                <b>Presupuesto N.º {presupuesto.numero || '—'}</b>
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
                                                    <td className="pp-c-cod">{r.codigo || 'S/C'}</td>
                                                    <td className="pp-c-desc">
                                                        <span className="pp-art">{r.nombre}</span>
                                                        {!r.aplicaIva && <span className="pp-chip">Exento</span>}
                                                    </td>
                                                    <td className="pp-c-marca">{r.marca || '—'}</td>
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

                                        {/* Totales y pie van juntos: nunca se separan entre páginas */}
                                        <div className="pp-final">
                                            <section className="pp-cierre">
                                                <div className="pp-condiciones">
                                                    {presupuesto.notas && (
                                                        <div className="pp-bloque">
                                                            <div className="pp-et">Observaciones</div>
                                                            <p className="pp-notas">{presupuesto.notas}</p>
                                                        </div>
                                                    )}
                                                    <div className="pp-bloque">
                                                        <div className="pp-et">Condiciones</div>
                                                        <ul>
                                                            <li>Oferta válida por <b>{validoDias} días</b>, hasta el {fecha(vence)}.</li>
                                                            <li><b>El precio que se mantiene es el expresado en dólares (US$).</b> El monto en bolívares es referencial, calculado a la tasa de {fmt(tasa)} Bs/$ del {fecha(creado)}, y <b>solo se mantiene por 1 día</b>: pasado ese día se recalcula a la tasa vigente.</li>
                                                            <li>Precios y disponibilidad sujetos a cambio sin previo aviso.</li>
                                                            <li>Documento informativo: no es una factura ni un documento fiscal.</li>
                                                        </ul>
                                                    </div>
                                                </div>

                                                <div className="pp-resumen">
                                                    <div className="pp-fila">
                                                        <span>Subtotal</span>
                                                        <div><b>{principal(presupuesto.subtotal)}</b><small>{equivalente(presupuesto.subtotal)}</small></div>
                                                    </div>
                                                    <div className="pp-fila">
                                                        <span>IVA 16 %</span>
                                                        <div><b>{principal(presupuesto.montoIva)}</b><small>{equivalente(presupuesto.montoIva)}</small></div>
                                                    </div>
                                                    <div className="pp-total">
                                                        <div className="pp-total-et">Total</div>
                                                        <div className="pp-total-monto">{principal(presupuesto.totalFinal)}</div>
                                                        <div className="pp-total-eq">Equivale a {equivalente(presupuesto.totalFinal)}</div>
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
                /* En el teléfono las acciones van en una barra fija abajo (con el dedo se alcanzan) y la hoja deja espacio para que no la tape */
                @media (max-width: 48em) {
                    .pp-envoltura { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)); }
                    .pp-barra { position: static; }
                }
                .pp-movil-barra { position: fixed; left: 0; right: 0; bottom: 0; z-index: 200; display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
                    background: rgba(8, 21, 48, 0.94); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border-top: 1px solid rgba(255,255,255,.14); }
                .pp-movil-barra > * { flex: 1 1 0; min-width: 0; height: 48px; padding-inline: 8px; }
                .pp-fila-accion { display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 0 14px; border-radius: 12px; background: #f1f5f9; font-weight: 700; font-size: 15px; color: #0b2a6f; }
                .pp-fila-accion:active { background: #e2e8f0; }

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
                .pp-titulo { margin: 2px 0 4px; font-size: 38px; line-height: .95; font-weight: 800; font-stretch: 112%; letter-spacing: -.02em; color: var(--navy); }
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
                .pp-sub { display: flex; align-items: center; gap: 8px; margin-top: 2px; font-size: 8px; color: var(--gris-claro); letter-spacing: .02em; }
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
                    /* La 1.ª página va a sangre (franja arriba); las siguientes llevan margen arriba y abajo para que la tabla no quede pegada al borde */
                    @page { size: letter portrait; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #pp-print-section, #pp-print-section * { visibility: visible !important; }
                    .pp-envoltura { padding: 0 !important; background: transparent !important; min-height: 0; }
                    #pp-print-section { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; width: 8.5in !important; }
                    /* Cada hoja es una página carta completa: salto de página entre una y otra */
                    .pp-hoja { margin: 0 !important; box-shadow: none !important; zoom: 1 !important; width: 8.5in !important; min-height: 10.97in !important; break-after: page; page-break-after: always; }
                    .pp-hoja:last-child { break-after: auto; page-break-after: auto; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
}
