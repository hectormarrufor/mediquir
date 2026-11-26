'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FacturaFormaLibre from './FacturaFormaLibre';
import NotaEntregaImprimible from './NotaEntregaImprimible';
import ControlFiscalPaso from '../../_components/ControlFiscalPaso';
import ConfirmarFormaControl, { useControlPrevisto } from '../../_components/ConfirmarFormaControl';
import { useControlFiscal, usePausaListo } from '../../_lib/useControlFiscal';
import { useAuth } from '@/hooks/useAuth';

export default function ImprimirRecibo() {
    const params = useParams();
    const [venta, setVenta] = useState(null);
    const [cargando, setCargando] = useState(true);
    const { rolUsuario } = useAuth();
    const guia = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('guia') === '1';
    const pendiente = Boolean(venta?.aprobacionPendiente);
    const necesitaControl = Boolean(venta && venta.tipoDocumento === 'FACTURA' && venta.statusDespacho !== 'Cancelado' && !guia && !pendiente);
    const [confirmado, setConfirmado] = useState(null);
    const [decisionHueco, setDecisionHueco] = useState(null);
    const previsto = useControlPrevisto(necesitaControl && !venta?.numeroControl);
    const ctl = useControlFiscal({ origen: 'VENTA', id: venta?.id, activo: necesitaControl && confirmado !== null, decision: decisionHueco });
    const listoVisto = usePausaListo(necesitaControl && ctl.estado === 'listo' && ctl.control === confirmado);
    const controlAVerificar = ctl.estado === 'listo' ? ctl.control : (venta?.numeroControl || previsto);
    const hayQueConfirmar = necesitaControl && (confirmado === null || (ctl.estado === 'listo' && ctl.control !== confirmado));

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
        if (!venta || cargando || guia || pendiente) return undefined;
        if (necesitaControl && (confirmado === null || ctl.estado !== 'listo' || ctl.control !== confirmado || !listoVisto)) return undefined;
        const temporizador = setTimeout(() => {
            if (venta.tipoDocumento === 'FACTURA' && venta.statusDespacho !== 'Cancelado') fetch(`/api/ventas/${venta.id}/impresa`, { method: 'POST' }).catch(() => {});
            window.print();
        }, 800);
        return () => clearTimeout(temporizador);
    }, [venta, cargando, guia, pendiente, necesitaControl, ctl.estado, ctl.control, confirmado, listoVisto]);

    useEffect(() => {
        if (!venta) return;
        const esFac = venta.tipoDocumento === 'FACTURA';
        const esNE = venta.tipoDocumento === 'NOTA_ENTREGA' || /^NE-/i.test(String(venta.numeroDocumento || ''));
        const tit = esFac ? 'Factura' : (esNE ? 'Nota de Entrega' : 'Recibo de Venta');
        const num = esNE
            ? (/^NE-\d{2}-/i.test(String(venta.numeroDocumento || ''))
                ? String(venta.numeroDocumento).toUpperCase()
                : `NE-00-${String(venta.numeroDocumento || '').replace(/^NE-/i, '').replace(/\D/g, '').padStart(5, '0')}`)
            : venta.numeroDocumento;
        document.title = `${tit} ${num || ''}`.trim();
    }, [venta]);

    if (cargando) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando documento para imprimir...</div>;
    if (!venta || venta.error) return <div style={{ padding: '2rem', textAlign: 'center' }}>Venta no encontrada.</div>;

    if (pendiente) return <div style={{ padding: '2rem', textAlign: 'center' }}>Esta factura está por aprobar: se podrá imprimir cuando la apruebe Jolexi.</div>;
    const esFactura = venta.tipoDocumento === 'FACTURA';
    if (esFactura) {
        if (hayQueConfirmar) return <ConfirmarFormaControl tipo="Factura" documento={venta.numeroDocumento} origen="VENTA" idDocumento={venta.id} control={controlAVerificar} nuevo={!venta.numeroControl} onConfirmar={(c, d) => { setDecisionHueco(d || null); setConfirmado(c); }} onCancelar={() => { if (window.history.length > 1) window.history.back(); else window.close(); }} />;
        if (necesitaControl && ctl.estado !== 'listo') return <ControlFiscalPaso estado={ctl.estado} mensaje={ctl.mensaje} onReintentar={() => ctl.asignar(false)} />;
        if (necesitaControl && !listoVisto) return <ControlFiscalPaso estado="listo" control={ctl.control} nuevo={ctl.nuevo} />;
        const reasignar = rolUsuario === 'admin' && !guia
            ? () => { if (window.confirm('¿La forma libre se dañó? Se toma el siguiente número de control y el actual queda sin usar.')) ctl.asignar(true); }
            : null;
        return <FacturaFormaLibre venta={ctl.control ? { ...venta, numeroControl: ctl.control } : venta} guia={guia} onReasignarControl={reasignar} />;
    }

    return <NotaEntregaImprimible venta={venta} />;
}
