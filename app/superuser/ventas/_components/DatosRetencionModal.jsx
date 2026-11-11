'use client';

// «El cliente ya pasó los datos»: completa una retención de IVA ya declarada (desde el abono o la factura). Lo que el sistema ya sabe
// (factura, cliente, RIF, porcentaje y monto calculado) se muestra; solo se pide lo que trae el comprobante y el sistema no puede deducir:
// su número y su fecha (y el monto, solo si el comprobante trae otro). El número de control solo si la factura todavía no lo tiene.
// Lo usan la ficha de la factura y «Retenciones y seguimiento» de cuentas por cobrar.
import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';

const bs = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());

/**
 * retencion: { ventaId, documento, numeroControl, cliente, rif, pct, ivaRetenidoBs (calculado al declararla), estado,
 *              comprobante?, fecha?, montoDeclarado? (lo que subió el cliente desde su portal, si lo hizo) }
 */
export default function DatosRetencionModal({ opened, onClose, retencion, onListo }) {
    const [comprobante, setComprobante] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [monto, setMonto] = useState('');
    const [control, setControl] = useState('');
    const [diferencia, setDiferencia] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const subidoPorCliente = retencion?.estado === 'POR_REVISAR';

    useEffect(() => {
        if (!opened || !retencion) return;
        setComprobante(subidoPorCliente ? (retencion.comprobante || '') : '');
        setFecha(subidoPorCliente && retencion.fecha ? String(retencion.fecha).slice(0, 10) : hoy());
        setMonto(subidoPorCliente && Number(retencion.montoDeclarado) > 0 ? Number(retencion.montoDeclarado) : Number(retencion.ivaRetenidoBs));
        setControl('');
        setDiferencia(null);
        // Solo al abrirse (o al cambiar de factura): quien la usa arma `retencion` en cada render y no debe borrar lo que se escribe
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, retencion?.ventaId, retencion?.estado]);

    if (!retencion) return null;
    const pctDeclarado = Number(retencion.pct) === 100 ? 100 : 75;
    const ivaBs = Number(retencion.ivaRetenidoBs) / (pctDeclarado / 100); // IVA de la factura en bolívares
    // Si el comprobante trae el 100 % del IVA en vez del 75 % (o al revés), el porcentaje sale del monto
    const pct = Math.abs(Number(monto) - ivaBs) < Math.abs(Number(monto) - ivaBs * 0.75) ? 100 : 75;

    const guardar = async () => {
        setGuardando(true);
        try {
            const res = await fetch(`/api/ventas/${retencion.ventaId}/retencion`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comprobante, fecha, porcentaje: pct, ivaRetenidoBs: Number(monto), numeroControl: control || null, aceptarDiferencia: Boolean(diferencia?.aceptada) }),
            });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (cuerpo.diferencia) { setDiferencia({ mensaje: cuerpo.error, aceptada: false }); return; }
                throw new Error(cuerpo.error || 'No se pudo guardar');
            }
            notifications.show({ color: 'teal', title: 'Retención registrada', message: `${retencion.documento}: comprobante ${comprobante}. Ya entra al libro de ventas.${cuerpo.aviso ? ` ${cuerpo.aviso}` : ''}`, autoClose: 8000 });
            onClose();
            onListo?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se guardó', message: e.message });
        } finally { setGuardando(false); }
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} opened={opened} onClose={onClose} centered title={<Text fw={800}>Datos del comprobante de retención</Text>}>
            <Stack gap="sm">
                <Paper withBorder p="sm" radius="md" bg="gray.0">
                    <Text size="sm"><b>{retencion.documento}</b>{retencion.numeroControl ? ` · control ${retencion.numeroControl}` : ''}</Text>
                    <Text size="sm">{retencion.cliente} <Text span size="xs" c="dimmed">{retencion.rif}</Text></Text>
                    <Text size="sm">Retención del <b>{pctDeclarado} %</b> del IVA: <b>Bs {bs(retencion.ivaRetenidoBs)}</b> <Text span size="xs" c="dimmed">(ya descontada de lo que debe)</Text></Text>
                </Paper>
                {subidoPorCliente && <Alert color="blue" variant="light" p="xs">El cliente ya subió su comprobante desde el portal: revisa los datos y confírmalos.</Alert>}
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    <TextInput label="N° de comprobante" placeholder="20261100001835" withAsterisk value={comprobante} onChange={(e) => setComprobante(e.currentTarget.value)} data-autofocus />
                    <TextInput type="date" label="Fecha del comprobante" withAsterisk max={hoy()} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                </SimpleGrid>
                <NumberInput label="Monto retenido según el comprobante (Bs)" description="Ya viene con lo calculado: cámbialo solo si el comprobante trae otro monto"
                    value={monto} onChange={(v) => { setMonto(v); setDiferencia(null); }} decimalScale={2} thousandSeparator="." decimalSeparator="," hideControls inputMode="decimal" />
                {pct !== pctDeclarado && <Text size="xs" c="orange.8">Ese monto es el {pct} % del IVA: la retención queda registrada al {pct} %.</Text>}
                {!retencion.numeroControl && (
                    <TextInput label="N° de control de la factura" description="La factura todavía no lo tiene en el sistema" placeholder="00-0122676" value={control} onChange={(e) => setControl(e.currentTarget.value)} />
                )}
                {diferencia && (
                    <Alert color="orange" variant="light" p="xs" title="No coincide con lo calculado">
                        <Text size="xs">{diferencia.mensaje}</Text>
                        <Button size="compact-xs" mt={6} color="orange" variant={diferencia.aceptada ? 'filled' : 'light'} onClick={() => setDiferencia({ ...diferencia, aceptada: true })}>
                            {diferencia.aceptada ? 'Confirmado: se registra con ese monto' : 'Es correcto, registrar con ese monto'}
                        </Button>
                    </Alert>
                )}
                <Group justify="flex-end" mt="xs">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button color="grape" loading={guardando} disabled={!comprobante.trim() || !fecha || !(Number(monto) > 0) || (diferencia && !diferencia.aceptada)} onClick={guardar}>Guardar los datos</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
