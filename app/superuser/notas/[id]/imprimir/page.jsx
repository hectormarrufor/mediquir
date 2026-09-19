'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FacturaFormaLibre from '@/app/superuser/ventas/imprimir/[id]/FacturaFormaLibre';

const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');

// Nota de crédito o de débito impresa sobre la misma forma libre preimpresa que las facturas
export default function ImprimirNota() {
    const { id } = useParams();
    const [nota, setNota] = useState(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        fetch(`/api/notas/${id}`).then((r) => r.json()).then(setNota).catch(() => setNota(null)).finally(() => setCargando(false));
    }, [id]);

    useEffect(() => {
        // Con ?guia=1 no se imprime solo: sirve para revisar cómo cae sobre la forma preimpresa
        if (nota && !nota.error && !cargando && !new URLSearchParams(window.location.search).get('guia')) setTimeout(() => window.print(), 800);
    }, [nota, cargando]);

    if (cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando nota para imprimir...</div>;
    if (!nota || nota.error) return <div style={{ padding: '2rem', textAlign: 'center' }}>Nota no encontrada.</div>;
    if (nota.origen !== 'VENTA') return <div style={{ padding: '2rem', textAlign: 'center' }}>Solo se imprimen las notas que emite la empresa (las de proveedores se registran, no se imprimen).</div>;
    if (nota.estado !== 'EMITIDA') return <div style={{ padding: '2rem', textAlign: 'center' }}>Esta nota está anulada.</div>;

    const esCredito = nota.tipo === 'CREDITO';
    // La forma de la factura espera un documento con estos datos: se arma uno a partir de la nota
    const documento = {
        numeroDocumento: nota.numeroDocumento, numeroControl: nota.numeroControl, moneda: nota.moneda, tasaCambio: nota.tasaCambio,
        montoIva: nota.montoIva, totalFinal: nota.totalFinal, condicionPago: 'Contado', fechaVencimiento: null,
        createdAt: `${nota.fecha}T16:00:00Z`, // mediodía de Caracas: así la fecha impresa no se corre un día
        cliente: nota.cliente,
        detalles: (nota.detalles || []).map((d) => ({ producto: { codigo: '', nombre: d.descripcion }, precioUnitario: d.precioUnitario, cantidad: d.cantidad, subtotal: d.subtotal, aplicaIva: d.aplicaIva })),
    };

    return (
        <FacturaFormaLibre
            venta={documento}
            guia={new URLSearchParams(window.location.search).get('guia') === '1'}
            titulo={esCredito ? 'Nota de Crédito' : 'Nota de Débito'}
            referencia={`AFECTA FACTURA ${nota.venta?.numeroDocumento || ''} DEL ${fmtFecha(String(nota.venta?.createdAt || '').slice(0, 10))}`}
            etiquetaCondicion="Motivo"
            condicionTexto={String(nota.motivo || '').slice(0, 38)}
            sinVence
        />
    );
}
