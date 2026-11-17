'use client';

// Recibo de cobro (constancia en físico de un pago): se eligen los abonos de un cliente que cubre ese pago (por ejemplo, varias facturas pagadas con una
// sola transferencia) y el sistema genera un recibo numerado, en bolívares, que se imprime en el mismo estilo del membrete de Mediquir.
// Si ya existe un recibo con esos mismos abonos se abre ese (reimprimir no gasta otro número).
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconReceipt } from '@tabler/icons-react';
import { Dialogo } from './Piezas';
import { dolares, enviar, fmtFecha, r2 } from './utilidades';

export function DialogoReciboCobro({ grupo, abonoInicial = null, onCerrar }) {
    const router = useRouter();
    const [marcados, setMarcados] = useState(() => new Set(abonoInicial ? [abonoInicial] : []));
    const [generando, setGenerando] = useState(false);

    // Solo abonos de facturas reales y con monto positivo (los ajustes y las cuentas manuales no llevan recibo)
    const abonos = useMemo(() => grupo.filas.filter((f) => !f.manual)
        .flatMap((f) => f.abonos.filter((a) => Number(a.monto) > 0).map((a) => ({ ...a, documento: f.documento })))
        .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(a.documento).localeCompare(String(b.documento))), [grupo]);

    const alternar = (id) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const total = r2(abonos.filter((a) => marcados.has(a.id)).reduce((t, a) => t + Number(a.monto), 0));
    // atajo: con un abono marcado, marca los demás del mismo día y misma referencia (el mismo pago repartido en varias facturas)
    const mismoPago = () => {
        const base = abonos.filter((a) => marcados.has(a.id));
        if (!base.length) return;
        setMarcados(new Set(abonos.filter((a) => base.some((b) => b.fecha === a.fecha && String(b.referencia || '') === String(a.referencia || ''))).map((a) => a.id)));
    };

    const generar = async () => {
        setGenerando(true);
        try {
            const r = await enviar('/api/finanzas/cxc/recibo', 'POST', { abonoIds: [...marcados] });
            notifications.show({ color: 'teal', message: r.yaExistia ? `Ya existía: recibo N.º ${r.numero}` : `Recibo N.º ${r.numero} generado` });
            router.push(`/superuser/recibos/${r.id}`);
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se generó el recibo', message: e.message });
            setGenerando(false);
        }
    };

    return (
        <Dialogo abierto onCerrar={onCerrar} titulo={`Recibo de cobro · ${grupo.nombre}`} ancho="lg">
            <Stack gap="sm">
                <Text size="sm" c="#5c6675">Marca los abonos que cubre este pago. El recibo sale en bolívares, con una línea por factura, y queda guardado con su número.</Text>
                {!abonos.length ? (
                    <Alert color="gray" variant="light">Este cliente no tiene abonos registrados para hacer un recibo.</Alert>
                ) : (
                    <>
                        <Group gap="xs">
                            <Button size="compact-xs" variant="light" disabled={!marcados.size} onClick={mismoPago}>Marcar los de la misma fecha y referencia</Button>
                            <Button size="compact-xs" variant="default" onClick={() => setMarcados(new Set(abonos.map((a) => a.id)))}>Todos</Button>
                            <Button size="compact-xs" variant="default" disabled={!marcados.size} onClick={() => setMarcados(new Set())}>Ninguno</Button>
                        </Group>
                        <ScrollArea.Autosize mah="52dvh" type="auto" offsetScrollbars>
                            <Stack gap={4}>
                                {abonos.map((a) => (
                                    <Checkbox
                                        key={a.id} checked={marcados.has(a.id)} onChange={() => alternar(a.id)} styles={{ root: { border: '1px solid #e1e6ee', borderRadius: 8, padding: '6px 10px' }, label: { width: '100%' } }}
                                        label={(
                                            <Group justify="space-between" wrap="nowrap" gap={8}>
                                                <Text fz={13} fw={700} style={{ minWidth: 0 }} truncate="end">{a.documento} <Text span fz={12} fw={500} c="#5c6675">· {fmtFecha(a.fecha)} · {a.metodo || 'Abono'}{a.referencia ? ` · ${a.referencia}` : ''}</Text></Text>
                                                <Text fz={13} fw={800} c="#1971c2" style={{ whiteSpace: 'nowrap' }}>{dolares(a.monto)}</Text>
                                            </Group>
                                        )}
                                    />
                                ))}
                            </Stack>
                        </ScrollArea.Autosize>
                    </>
                )}
                <Group justify="space-between" gap="xs">
                    <Text size="sm" fw={700}>{marcados.size} abono(s) · {dolares(total)}</Text>
                    <Group gap="xs">
                        <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                        <Button size="sm" color="teal" leftSection={<IconReceipt size={16} />} disabled={!marcados.size} loading={generando} onClick={generar}>Generar recibo</Button>
                    </Group>
                </Group>
            </Stack>
        </Dialogo>
    );
}

// Recibo de cobro desde la hoja de un vendedor: toma los abonos reales de la factura de la línea (los de la hoja son solo de comisión) y abre el mismo diálogo del libro.
// Si la línea es un abono, deja marcado el que coincide en fecha y monto.
export function DialogoReciboDeFactura({ linea, onCerrar }) {
    const { data: venta, isLoading, error } = useQuery({
        queryKey: ['cxc-recibo-factura', linea.ventaId],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${linea.ventaId}`);
            if (!res.ok) throw new Error('No se pudo cargar la factura');
            return res.json();
        },
    });
    const dia = (f) => String(f || '').slice(0, 10);
    const { grupo, inicial } = useMemo(() => {
        if (!venta) return {};
        const abonos = (venta.abonos || []).filter((a) => a.metodoPago !== 'Retención IVA').map((a) => ({ id: a.id, monto: Number(a.montoUsd), fecha: dia(a.fechaPago), metodo: a.metodoPago, referencia: a.referencia }));
        const coincide = linea.concepto === 'ABONO' ? abonos.find((a) => a.fecha === dia(linea.fecha) && Math.abs(a.monto - Math.abs(Number(linea.montoUsd))) < 0.01) || abonos.find((a) => Math.abs(a.monto - Math.abs(Number(linea.montoUsd))) < 0.01) : null;
        return { grupo: { nombre: venta.cliente?.nombre || linea.clienteNombre || 'Cliente', filas: [{ manual: false, documento: venta.numeroDocumento, abonos }] }, inicial: coincide?.id || null };
    }, [venta, linea]);
    if (!grupo) {
        return (
            <Dialogo abierto onCerrar={onCerrar} titulo={`Recibo de cobro · ${linea.documentoTexto || ''}`}>
                {error ? <Alert color="red" variant="light">{error.message}</Alert> : <Text size="sm" c="#5c6675">{isLoading ? 'Cargando los abonos de la factura…' : ''}</Text>}
            </Dialogo>
        );
    }
    return <DialogoReciboCobro grupo={grupo} abonoInicial={inicial} onCerrar={onCerrar} />;
}
