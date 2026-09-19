'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FacturaFormaLibre from '@/app/superuser/ventas/imprimir/[id]/FacturaFormaLibre';
import ControlFiscalPaso from '@/app/superuser/ventas/_components/ControlFiscalPaso';
import { useControlFiscal } from '@/app/superuser/ventas/_lib/useControlFiscal';
import { useAuth } from '@/hooks/useAuth';

const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');

// Nota de crédito o de débito impresa sobre la misma forma libre preimpresa que las facturas.
// Al imprimirla se le asigna el número de control (el correlativo de la forma libre, compartido con las facturas).
export default function ImprimirNota() {
    const { id } = useParams();
    const { rolUsuario } = useAuth();
    const [nota, setNota] = useState(null);
    const [cargando, setCargando] = useState(true);
    const guia = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('guia') === '1';

    useEffect(() => {
        fetch(`/api/notas/${id}`).then((r) => r.json()).then(setNota).catch(() => setNota(null)).finally(() => setCargando(false));
    }, [id]);

    // Con ?guia=1 solo se revisa cómo cae sobre la forma: no se asigna número de control ni se imprime solo
    const necesitaControl = Boolean(nota && !nota.error && nota.origen === 'VENTA' && nota.estado === 'EMITIDA' && !guia);
    const ctl = useControlFiscal({ origen: 'NOTA', id, activo: necesitaControl });

    useEffect(() => {
        if (!nota || nota.error || cargando || guia) return undefined;
        if (necesitaControl && ctl.estado !== 'listo') return undefined; // primero se asigna el número de control
        const temporizador = setTimeout(() => window.print(), 800);
        return () => clearTimeout(temporizador);
    }, [nota, cargando, guia, necesitaControl, ctl.estado]);

    if (cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando nota para imprimir...</div>;
    if (!nota || nota.error) return <div style={{ padding: '2rem', textAlign: 'center' }}>Nota no encontrada.</div>;
    if (nota.origen !== 'VENTA') return <div style={{ padding: '2rem', textAlign: 'center' }}>Solo se imprimen las notas que emite la empresa (las de proveedores se registran, no se imprimen).</div>;
    if (nota.estado !== 'EMITIDA') return <div style={{ padding: '2rem', textAlign: 'center' }}>Esta nota está anulada.</div>;
    if (necesitaControl && ctl.estado !== 'listo') return <ControlFiscalPaso estado={ctl.estado} mensaje={ctl.mensaje} onReintentar={() => ctl.asignar(false)} />;

    const esCredito = nota.tipo === 'CREDITO';
    const control = ctl.control || nota.numeroControl;
    // La forma de la factura espera un documento con estos datos: se arma uno a partir de la nota
    const documento = {
        numeroDocumento: nota.numeroDocumento, numeroControl: control, moneda: nota.moneda, tasaCambio: nota.tasaCambio,
        montoIva: nota.montoIva, totalFinal: nota.totalFinal, condicionPago: 'Contado', fechaVencimiento: null,
        createdAt: `${nota.fecha}T16:00:00Z`, // mediodía de Caracas: así la fecha impresa no se corre un día
        cliente: nota.cliente,
        detalles: (nota.detalles || []).map((d) => ({ producto: { codigo: '', nombre: d.descripcion }, precioUnitario: d.precioUnitario, cantidad: d.cantidad, subtotal: d.subtotal, aplicaIva: d.aplicaIva })),
    };
    const reasignar = rolUsuario === 'admin' && !guia
        ? () => { if (window.confirm('¿La forma libre se dañó? Se toma el siguiente número de control y el actual queda sin usar.')) ctl.asignar(true); }
        : null;

    return (
        <FacturaFormaLibre
            venta={documento}
            guia={guia}
            titulo={esCredito ? 'Nota de Crédito' : 'Nota de Débito'}
            referencia={`AFECTA FACTURA ${nota.venta?.numeroDocumento || ''} DEL ${fmtFecha(String(nota.venta?.createdAt || '').slice(0, 10))}`}
            etiquetaCondicion="Motivo"
            condicionTexto={String(nota.motivo || '').slice(0, 38)}
            sinVence
            onReasignarControl={reasignar}
        />
    );
}
