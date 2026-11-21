'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Group, Loader, Center, Text } from '@mantine/core';
import { IconArrowLeft, IconPrinter } from '@tabler/icons-react';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';

const fmtFechaHora = (v) => (v ? new Date(v).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' }) : '—');

export default function ActaDespachoImprimirPage() {
    const { id } = useParams();
    const router = useRouter();
    const [acta, setActa] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/ventas/despachos/${id}`);
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el acta');
                setActa(data.acta);
            } catch (e) {
                setError(e.message);
            }
        })();
    }, [id]);

    if (error) {
        return (
            <Center h="60vh">
                <Text c="red" fw={700}>{error}</Text>
            </Center>
        );
    }
    if (!acta) {
        return (
            <Center h="60vh">
                <Loader color="white" />
            </Center>
        );
    }

    const ventas = Array.isArray(acta.ventas) ? acta.ventas : [];
    const totalArticulos = ventas.reduce((acc, v) => acc + (Number(v.articulos) || 0), 0);

    return (
        <div className="acta-wrap">
            <style>{`
                .acta-wrap {
                    min-height: 100vh;
                    background: #1e293b;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .acta-toolbar {
                    width: 100%;
                    max-width: 816px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 14px;
                    flex-wrap: wrap;
                }
                .acta-hoja {
                    width: 100%;
                    max-width: 816px;
                    background: #ffffff;
                    color: #0f172a;
                    padding: 28px 32px;
                    border-radius: 10px;
                    box-shadow: 0 18px 44px rgba(0,0,0,0.35);
                    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
                }
                .acta-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                    padding: 14px 18px;
                    border-radius: 10px;
                    background: linear-gradient(135deg, #e8f1fb 0%, #f4f7fb 100%);
                    border: 1px solid #cbd5e1;
                    margin-bottom: 16px;
                }
                .acta-logo {
                    height: 52px;
                    object-fit: contain;
                }
                .acta-titulo-box {
                    text-align: right;
                }
                .acta-ceja {
                    font-size: 10px;
                    font-weight: 800;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    color: #0369a1;
                }
                .acta-titulo {
                    margin: 2px 0;
                    font-size: 20px;
                    font-weight: 900;
                    color: #0b2a6f;
                }
                .acta-num {
                    font-size: 13px;
                    font-weight: 700;
                    color: #334155;
                }
                .acta-empresa {
                    font-size: 11px;
                    color: #475569;
                    margin-bottom: 14px;
                    line-height: 1.4;
                }
                .acta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px;
                    margin-bottom: 16px;
                }
                .acta-dato {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 8px 12px;
                }
                .acta-dato span {
                    display: block;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #64748b;
                }
                .acta-dato b {
                    font-size: 13px;
                    color: #0f172a;
                }
                .acta-tabla {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 16px;
                    font-size: 12px;
                }
                .acta-tabla th {
                    background: #0b2a6f;
                    color: #ffffff;
                    text-align: left;
                    padding: 8px 10px;
                    font-weight: 700;
                    font-size: 11px;
                    text-transform: uppercase;
                }
                .acta-tabla td {
                    border-bottom: 1px solid #e2e8f0;
                    padding: 8px 10px;
                    vertical-align: top;
                }
                .acta-tabla tr:nth-child(even) td {
                    background: #f8fafc;
                }
                .acta-tabla tfoot td {
                    background: #eef2ff;
                    font-weight: 800;
                    border-top: 2px solid #0b2a6f;
                }
                .acta-obs {
                    background: #fffbeb;
                    border: 1px solid #fde68a;
                    border-radius: 8px;
                    padding: 8px 12px;
                    font-size: 12px;
                    margin-bottom: 16px;
                }
                .acta-declaracion {
                    font-size: 11.5px;
                    color: #334155;
                    background: #f1f5f9;
                    border-left: 4px solid #0b2a6f;
                    padding: 10px 12px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                    line-height: 1.45;
                }
                .acta-firmas {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 24px;
                    margin-top: 12px;
                }
                .acta-firma-box {
                    border: 1px solid #cbd5e1;
                    border-radius: 8px;
                    padding: 12px;
                    text-align: center;
                }
                .acta-firma-img-wrap {
                    height: 92px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 8px;
                }
                .acta-firma-img {
                    max-height: 88px;
                    max-width: 100%;
                    object-fit: contain;
                }
                .acta-firma-linea {
                    border-top: 1px solid #475569;
                    padding-top: 6px;
                    font-size: 12px;
                    font-weight: 800;
                    color: #0f172a;
                }
                .acta-firma-sub {
                    font-size: 11px;
                    color: #475569;
                }
                @media print {
                    @page { size: letter; margin: 12mm; }
                    body { background: #ffffff !important; }
                    .acta-wrap { background: #ffffff !important; padding: 0 !important; min-height: auto !important; }
                    .acta-toolbar { display: none !important; }
                    .acta-hoja { box-shadow: none !important; padding: 0 !important; max-width: 100% !important; border-radius: 0 !important; }
                }
            `}</style>

            <div className="acta-toolbar">
                <Button variant="white" color="dark" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/ventas/despachos')}>
                    Volver a despachos
                </Button>
                <Group gap="xs">
                    <Button color="teal" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>
                        Imprimir / Descargar PDF
                    </Button>
                </Group>
            </div>

            <article className="acta-hoja">
                <header className="acta-header">
                    <img src={MEMBRETE_MEDIQUIR.logo} alt="Mediquir" className="acta-logo" />
                    <div className="acta-titulo-box">
                        <div className="acta-ceja">Constancia de entrega a agencia</div>
                        <h1 className="acta-titulo">Acta de Despacho</h1>
                        <div className="acta-num">N.º {acta.numero} · {fmtFechaHora(acta.createdAt)}</div>
                    </div>
                </header>

                <div className="acta-empresa">
                    <b>{MEMBRETE_MEDIQUIR.nombre}</b> · RIF {MEMBRETE_MEDIQUIR.rif} · {MEMBRETE_MEDIQUIR.direccion}
                </div>

                <div className="acta-grid">
                    <div className="acta-dato">
                        <span>Agencia de envíos / Transporte</span>
                        <b>{acta.agencia}</b>
                    </div>
                    <div className="acta-dato">
                        <span>Chofer que retira la mercancía</span>
                        <b>{acta.choferNombre} · C.I. {acta.choferCedula}</b>
                    </div>
                    <div className="acta-dato">
                        <span>Entregado en Mediquir por</span>
                        <b>{acta.entregadoPorNombre || 'Personal Mediquir'}</b>
                    </div>
                    <div className="acta-dato">
                        <span>Facturas / Notas impresas entregadas</span>
                        <b>✓ SÍ · Verificadas y entregadas ({ventas.length} documento{ventas.length === 1 ? '' : 's'})</b>
                    </div>
                </div>

                <table className="acta-tabla">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Documento</th>
                            <th>Tipo</th>
                            <th>Cliente</th>
                            <th>RIF / C.I.</th>
                            <th style={{ textAlign: 'right' }}>Artículos</th>
                            <th style={{ textAlign: 'center' }}>Factura entregada</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ventas.map((v, idx) => (
                            <tr key={v.id || idx}>
                                <td>{idx + 1}</td>
                                <td><b>{v.numeroDocumento}</b></td>
                                <td>{v.tipoDocumento === 'FACTURA' ? 'Factura' : 'Nota de entrega'}</td>
                                <td>{v.cliente}</td>
                                <td>{v.identificacion || '—'}</td>
                                <td style={{ textAlign: 'right' }}>{v.articulos}</td>
                                <td style={{ textAlign: 'center', color: '#0f766e', fontWeight: 800 }}>✓ Sí</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={5}>TOTAL RETIRADO POR {acta.agencia.toUpperCase()}</td>
                            <td style={{ textAlign: 'right' }}>{totalArticulos} uds.</td>
                            <td style={{ textAlign: 'center' }}>{ventas.length} paquete(s)</td>
                        </tr>
                    </tfoot>
                </table>

                {acta.observacion && (
                    <div className="acta-obs">
                        <b>Observaciones:</b> {acta.observacion}
                    </div>
                )}

                <div className="acta-declaracion">
                    <b>Conformidad de retiro:</b> Yo, <b>{acta.choferNombre}</b>, titular de la cédula de identidad <b>{acta.choferCedula}</b>, en representación de <b>{acta.choferEmpresa}</b>, declaro haber recibido de <b>{MEMBRETE_MEDIQUIR.nombre}</b> todos los paquetes empacados y las <b>{ventas.length} factura(s)/nota(s) impresas</b> detalladas en la presente acta, en buen estado y a mi entera conformidad.
                </div>

                <div className="acta-firmas">
                    <div className="acta-firma-box">
                        <div className="acta-firma-img-wrap">
                            {acta.firmaChoferUrl ? (
                                <img src={acta.firmaChoferUrl} alt="Firma del chofer" className="acta-firma-img" />
                            ) : (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Sin imagen de firma</span>
                            )}
                        </div>
                        <div className="acta-firma-linea">{acta.choferNombre}</div>
                        <div className="acta-firma-sub">C.I. {acta.choferCedula} · {acta.choferEmpresa}</div>
                        <div className="acta-firma-sub">Recibido conforme (Chofer)</div>
                    </div>

                    <div className="acta-firma-box">
                        <div className="acta-firma-img-wrap">
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0b2a6f' }}>{acta.entregadoPorNombre || 'Personal Mediquir'}</span>
                        </div>
                        <div className="acta-firma-linea">Entregado por Mediquir</div>
                        <div className="acta-firma-sub">{fmtFechaHora(acta.createdAt)}</div>
                        <div className="acta-firma-sub">Responsable de despacho</div>
                    </div>
                </div>
            </article>
        </div>
    );
}
