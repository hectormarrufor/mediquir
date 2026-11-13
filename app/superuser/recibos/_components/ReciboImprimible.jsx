'use client';

import React, { useEffect, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { MEMBRETE_MEDIQUIR } from '@/app/constants/empresa';
import { fuenteTienda } from '@/app/fonts/tienda';

// Recibo impreso en CARTA: la misma hoja lleva el ORIGINAL (arriba) y la COPIA (abajo), con el estilo del presupuesto.
// `accionesExtra` son botones (Mantine) que se agregan junto a «Imprimir».
const HOJA_PX = 816;
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaLarga = (f) => {
    if (!f) return { dia: '', mes: '', anio: '' };
    const [a, m, d] = String(f).slice(0, 10).split('-');
    return { dia: d, mes: m, anio: a };
};
const FORMAS = { EFECTIVO: 'Efectivo', CHEQUE: 'Cheque', TRANSFERENCIA: 'Transferencia', OTRO: 'Otro' };

function Pulso() {
    return (
        <svg className="rc-pulso" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="rc-grad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#0b2a6f" /><stop offset="0.55" stopColor="#0ea5e9" /><stop offset="1" stopColor="#22a55a" /></linearGradient>
            </defs>
            <polyline fill="none" stroke="url(#rc-grad)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                points="0,28 600,28 618,28 626,20 634,28 652,28 662,33 676,2 690,38 700,28 722,28 736,18 750,28 1000,28" />
        </svg>
    );
}

function Copia({ recibo, etiqueta }) {
    const f = fechaLarga(recibo.fecha);
    const pagado = recibo.tipo === 'PAGADO_A';
    const simbolo = recibo.moneda === 'USD' ? '$' : 'Bs.';
    const marcas = (k) => (recibo.formaPago === k ? '☑' : '☐');
    return (
        <section className="rc-copia">
            {recibo.anulado && <div className="rc-anulado">ANULADO</div>}
            <header className="rc-header">
                <img src={MEMBRETE_MEDIQUIR.logo} alt="Mediquir" className="rc-logo" />
                <div className="rc-titular">
                    <div className="rc-ceja">{etiqueta}</div>
                    <h1 className="rc-titulo">Recibo</h1>
                    <div className="rc-numero">N.º <b>{recibo.numero}</b></div>
                </div>
            </header>
            <Pulso />

            <div className="rc-fila-sup">
                <div className="rc-fecha">
                    <div><span>Lugar</span><b>{recibo.lugar || ''}</b></div>
                    <div><span>Día</span><b>{f.dia}</b></div>
                    <div><span>Mes</span><b>{f.mes}</b></div>
                    <div><span>Año</span><b>{f.anio}</b></div>
                </div>
                <div className="rc-monto"><span>Por {simbolo}</span><b>{nf.format(Number(recibo.monto) || 0)}</b></div>
            </div>

            <div className="rc-campos">
                <div className="rc-campo"><span>{pagado ? 'Hemos pagado a' : 'He recibido de'}</span><b>{recibo.personaNombre}{recibo.personaIdentificacion ? ` · ${recibo.personaIdentificacion}` : ''}</b></div>
                <div className="rc-campo rc-alto"><span>La cantidad de</span><b>{recibo.montoLetras || ''}</b></div>
                <div className="rc-campo rc-alto"><span>Por concepto de</span><b className="rc-concepto">{recibo.concepto || ''}</b></div>
                <div className="rc-pago">
                    <span className="rc-chk">{marcas('EFECTIVO')} Efectivo</span>
                    <span className="rc-chk">{marcas('CHEQUE')} Cheque</span>
                    <span className="rc-chk">{marcas('TRANSFERENCIA')} Transferencia</span>
                    {recibo.formaPago === 'OTRO' && <span className="rc-chk">{marcas('OTRO')} Otro</span>}
                    {recibo.referencia && <span className="rc-ref">N° <b>{recibo.referencia}</b></span>}
                    {recibo.banco && <span className="rc-ref">Banco <b>{recibo.banco}</b></span>}
                </div>
            </div>

            <div className="rc-firmas">
                <div><i />{pagado ? 'Recibí conforme' : 'Por MEDIQUIR, C.A.'}</div>
                <div><i />{pagado ? 'Por MEDIQUIR, C.A.' : 'Entregado por'}</div>
            </div>
            <footer className="rc-pie">{MEMBRETE_MEDIQUIR.nombre} · RIF {MEMBRETE_MEDIQUIR.rif} · {MEMBRETE_MEDIQUIR.telefonos}</footer>
        </section>
    );
}

export default function ReciboImprimible({ recibo, accionesExtra = null }) {
    const [zoom, setZoom] = useState(1);
    useEffect(() => {
        const ajustar = () => setZoom(Math.min(1, (window.innerWidth - 16) / HOJA_PX));
        ajustar();
        window.addEventListener('resize', ajustar);
        return () => window.removeEventListener('resize', ajustar);
    }, []);
    if (!recibo) return null;
    return (
        <div className="rc-envoltura">
            <Group className="rc-barra" justify="space-between" gap="xs">
                <Text c="white" fw={700} size="sm">Recibo N.º {recibo.numero}{recibo.anulado ? ' · ANULADO' : ''}</Text>
                <Group gap="xs">
                    {accionesExtra}
                    <Button size="sm" color="teal" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>Imprimir</Button>
                </Group>
            </Group>

            <div id="rc-print-section" className={fuenteTienda.className}>
                <div className="rc-hoja" style={{ '--rc-zoom': zoom }}>
                    <div className="rc-franja" />
                    <Copia recibo={recibo} etiqueta="Original" />
                    <div className="rc-corte" aria-hidden="true">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
                    <Copia recibo={recibo} etiqueta="Copia" />
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .rc-envoltura, .rc-envoltura * { box-sizing: border-box; }
                .rc-envoltura { background: #525659; min-height: 100vh; padding: 12px 8px; font-family: Arial, Helvetica, sans-serif; overflow-x: hidden; }
                .rc-barra { max-width: 8.5in; margin: 0 auto 10px; position: sticky; top: 0; z-index: 5; background: #525659; padding: 6px 0; }
                .rc-hoja { --navy: #0b2a6f; --azul: #1d4ed8; --cian: #0ea5e9; --verde: #22a55a; --tinta: #0f172a; --gris: #64748b; --gris-claro: #94a3b8; --linea: #e2e8f0; --fondo: #f5f8fc;
                    width: 8.5in; height: 11in; margin: 0 auto 14px; position: relative; background: #fff; color: var(--tinta); box-shadow: 0 0 10px rgba(0,0,0,.5);
                    display: flex; flex-direction: column; zoom: var(--rc-zoom, 1); font-size: 10px; line-height: 1.4; }
                .rc-franja { height: 6px; background: linear-gradient(90deg, var(--navy) 0%, var(--azul) 35%, var(--cian) 70%, var(--verde) 100%); flex-shrink: 0; }
                .rc-copia { position: relative; flex: 1; padding: 0.25in 0.55in 0.18in; display: flex; flex-direction: column; min-height: 0; }
                .rc-corte { text-align: center; color: var(--gris-claro); font-size: 8px; letter-spacing: 1px; white-space: nowrap; overflow: hidden; }
                .rc-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
                .rc-logo { height: 62px; width: auto; object-fit: contain; display: block; }
                .rc-titular { text-align: right; }
                .rc-ceja { font-size: 8px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase; color: var(--gris); }
                .rc-titulo { margin: 0; font-size: 30px; line-height: 1; font-weight: 800; letter-spacing: -.02em; color: var(--navy); }
                .rc-numero { font-size: 10px; color: var(--gris); }
                .rc-numero b { color: #c1121f; font-size: 15px; font-weight: 800; margin-left: 2px; }
                .rc-pulso { display: block; width: 100%; height: 20px; margin: 6px 0 8px; overflow: visible; }
                .rc-fila-sup { display: flex; justify-content: space-between; align-items: stretch; gap: 16px; margin-bottom: 10px; }
                .rc-fecha { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; background: var(--fondo); border-radius: 8px; padding: 6px 2px; flex: 1; max-width: 4in; }
                .rc-fecha > div { padding: 0 10px; border-left: 1px solid var(--linea); display: flex; flex-direction: column; }
                .rc-fecha > div:first-child { border-left: 0; }
                .rc-fecha span, .rc-monto span { font-size: 7px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--gris); }
                .rc-fecha b { font-size: 11px; color: var(--navy); min-height: 14px; }
                .rc-monto { border: 1.5px solid var(--navy); border-radius: 8px; padding: 5px 14px; min-width: 2.6in; display: flex; flex-direction: column; text-align: right; justify-content: center; }
                .rc-monto b { font-size: 20px; font-weight: 800; color: var(--navy); line-height: 1.1; }
                .rc-campos { border: 1px solid var(--linea); border-radius: 10px; padding: 8px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
                .rc-campo { display: flex; align-items: flex-end; gap: 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; min-height: 22px; }
                .rc-campo span { font-size: 8px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--gris); flex-shrink: 0; white-space: nowrap; }
                .rc-campo b { font-size: 11px; font-weight: 600; color: var(--tinta); }
                .rc-alto { min-height: 34px; align-items: flex-start; padding-top: 3px; }
                .rc-concepto { white-space: pre-line; }
                .rc-pago { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; font-size: 10px; margin-top: 2px; }
                .rc-chk { font-weight: 600; color: var(--navy); }
                .rc-ref { color: var(--gris); } .rc-ref b { color: var(--tinta); }
                .rc-firmas { display: flex; gap: 40px; margin-top: 18px; }
                .rc-firmas > div { flex: 1; text-align: center; font-size: 8.5px; color: var(--gris); }
                .rc-firmas i { display: block; border-top: 1px solid var(--tinta); margin-bottom: 3px; height: 22px; border-top-width: 0; border-bottom: 1px solid var(--tinta); }
                .rc-pie { margin-top: 8px; text-align: center; font-size: 7.5px; color: var(--gris-claro); letter-spacing: .04em; }
                .rc-anulado { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 70px; font-weight: 900; color: rgba(193, 18, 31, .22); transform: rotate(-12deg); pointer-events: none; letter-spacing: 8px; }
                @media print {
                    @page { size: letter portrait; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
                    body * { visibility: hidden !important; }
                    #rc-print-section, #rc-print-section * { visibility: visible !important; }
                    .rc-envoltura { padding: 0 !important; background: transparent !important; min-height: 0; }
                    #rc-print-section { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; width: 8.5in !important; }
                    .rc-hoja { margin: 0 !important; box-shadow: none !important; zoom: 1 !important; width: 8.5in !important; height: 10.97in !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
}
