'use client';

import React, { useState } from 'react';
import { Alert, Button, Center, Loader, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconPrinter } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

// El número de control que se asignará al imprimir (el siguiente libre), leído al momento: no se reserva hasta que se confirma
export function useControlPrevisto(activo) {
    const { data } = useQuery({
        queryKey: ['control-previsto'], enabled: activo, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
        queryFn: async () => { const r = await fetch('/api/numeracion'); return r.ok ? r.json() : null; },
    });
    return data?.series?.find((s) => s.clave === 'CONTROL')?.siguiente || null;
}

// "00-0122741", "0122741" o "122741" -> 122741 (null si no hay dígitos)
const numeroDe = (texto) => {
    const d = String(texto ?? '').replace(/^\s*00-/, '').replace(/\D/g, '');
    return d ? Number(d) : null;
};

// Antes de imprimir: quien imprime ESCRIBE el número de control que lleva la forma preimpresa que tiene en la impresora y solo si coincide con el que va a
// salir impreso se puede continuar. El control se asigna recién cuando se confirma (si se cancela, no se gasta ningún número).
// Un número equivocado en la forma es un documento fiscal mal impreso: por eso no basta una casilla.
export default function ConfirmarFormaControl({ tipo, documento, control, nuevo, origen, idDocumento, onConfirmar, onCancelar }) {
    const [escrito, setEscrito] = useState('');
    const [danando, setDanando] = useState(false);
    const queryClient = useQueryClient();
    // La forma que iba a usarse se dañó (se arrugó, se atascó…): ese número se anota como forma anulada y se pasa al siguiente
    const danada = async () => {
        if (!window.confirm(`¿Este número de control (${control}) se dañó? Quedará anotado como forma anulada y se usará el siguiente.`)) return;
        setDanando(true);
        try {
            const res = await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'DANAR_SIGUIENTE', origen, id: idDocumento, control, documento: `${tipo} ${documento}` }) });
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo marcar la forma como dañada');
            notifications.show({ color: 'orange', title: 'Forma anotada como dañada', message: `El control ${cuerpo.danada} quedó como forma anulada. Ahora toca el ${cuerpo.siguiente}: pon la forma que lleva ese número.`, autoClose: 9000 });
            setEscrito('');
            await queryClient.invalidateQueries({ queryKey: ['control-previsto'] });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo', message: e.message });
        } finally { setDanando(false); }
    };
    // Cuántos documentos esperan su control (solo informativo; para un vendedor son los suyos)
    const { data: pendientes } = useQuery({
        queryKey: ['por-imprimir-conteo'], staleTime: 0, retry: false,
        queryFn: async () => { const r = await fetch('/api/ventas/por-imprimir'); return r.ok ? r.json() : null; },
    });
    // Seguidilla: si hay un documento anterior sin imprimir, éste no puede imprimirse todavía (el servidor también lo impide)
    const { data: orden } = useQuery({
        queryKey: ['control-orden', origen, idDocumento], enabled: Boolean(nuevo && origen && idDocumento), staleTime: 0, gcTime: 0, refetchOnMount: 'always', retry: false,
        queryFn: async () => { const r = await fetch(`/api/control?origen=${origen}&id=${idDocumento}`); return r.ok ? r.json() : null; },
    });
    const esperaPor = orden?.esperaPor || null;
    const otros = Math.max(0, Number(pendientes?.total || 0) - (nuevo ? 1 : 0));
    const hayEscrito = numeroDe(escrito) !== null;
    const coincide = hayEscrito && numeroDe(escrito) === numeroDe(control);
    return (
        <Center mih="60vh" p="md">
            <Paper withBorder radius="md" p="lg" maw={560} w="100%">
                <Stack>
                    <Text fw={800} size="lg">Verifica la forma antes de imprimir</Text>
                    <Text size="sm" c="dimmed">{tipo} {documento}</Text>
                    {esperaPor ? (
                        <Stack>
                            <Alert color="red" variant="filled" icon={<IconAlertTriangle size={20} />} title="Falta una factura anterior por imprimir">
                                Antes de imprimir {documento} hay que imprimir <b>{esperaPor}</b>: los números de control se dan en el orden de los documentos y {esperaPor} todavía no tiene su control. Revisa «Documentos por imprimir» (si está por aprobar, hay que aprobarla primero; si no va a salir, elimínala).
                            </Alert>
                            <Button component="a" href="/superuser/ventas/por-imprimir" size="lg">Ir a Documentos por imprimir</Button>
                        </Stack>
                    ) : control ? (
                        <>
                            <Paper bg="yellow.0" withBorder radius="md" p="md" ta="center">
                                <Text size="xs" c="dimmed" fw={700} tt="uppercase">N° de control que saldrá impreso</Text>
                                <Text fz={34} fw={900} lh={1.2} c="navy.9" style={{ letterSpacing: 1 }}>{control}</Text>
                                <Text size="xs" c="dimmed">{nuevo ? 'Es el siguiente libre: se le asigna al confirmar.' : 'Este documento ya lo tiene asignado.'}</Text>
                            </Paper>
                            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>
                                Mira la forma preimpresa que está en la impresora y <b>escribe abajo el número de control que lleva</b>. Debe ser <b>exactamente {control}</b>.
                            </Alert>
                            <TextInput
                                size="lg" label="Número de control de la forma que tienes en la impresora" placeholder="Ejemplo: 0122741" inputMode="numeric" autoComplete="off"
                                value={escrito} onChange={(e) => setEscrito(e.currentTarget.value)} error={hayEscrito && !coincide ? 'No coincide con el que va a imprimir el sistema' : null} data-autofocus
                            />
                            {hayEscrito && !coincide && (
                                <Alert color="red" variant="filled" icon={<IconAlertTriangle size={20} />} title="NO imprimas todavía">
                                    La forma que tienes lleva el <b>{escrito.trim()}</b> y el sistema va a imprimir el <b>{control}</b>. Antes de continuar, <b>cerciórate con Jolexi de que no tenga ningún documento pendiente por imprimir</b>: otro documento pudo haber tomado el número de la forma que tienes. No cambies ni fuerces el número.
                                </Alert>
                            )}
                            {coincide && otros > 0 && (
                                <Alert color="blue" variant="light">Hay {otros} documento{otros === 1 ? '' : 's'} más esperando su número de control. Imprime en el orden en que están las formas.</Alert>
                            )}
                            <Button size="lg" leftSection={<IconPrinter size={20} />} disabled={!coincide} onClick={() => onConfirmar(control)}>Coincide: imprimir</Button>
                            {nuevo && origen && idDocumento && (
                                <Button variant="light" color="orange" loading={danando} onClick={danada}>Este número de control se dañó: usar el siguiente</Button>
                            )}
                        </>
                    ) : <Stack align="center"><Loader /><Text size="sm" c="dimmed">Buscando el número de control…</Text></Stack>}
                    <Button variant="subtle" color="gray" onClick={onCancelar}>Cancelar (no se gasta ningún número)</Button>
                </Stack>
            </Paper>
        </Center>
    );
}
