'use client';

import React, { useState } from 'react';
import { Alert, Button, Center, Checkbox, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconPrinter } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

// El número de control que se asignará al imprimir (el siguiente libre), leído al momento: no se reserva hasta que se confirma
export function useControlPrevisto(activo) {
    const { data } = useQuery({
        queryKey: ['control-previsto'], enabled: activo, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
        queryFn: async () => { const r = await fetch('/api/numeracion'); return r.ok ? r.json() : null; },
    });
    return data?.series?.find((s) => s.clave === 'CONTROL')?.siguiente || null;
}

// Antes de imprimir: quien imprime debe verificar que la forma que está en la impresora lleve el MISMO número de control que va a salir impreso.
// El control se asigna recién cuando se confirma (si se cancela, no se gasta ningún número).
export default function ConfirmarFormaControl({ tipo, documento, control, nuevo, onConfirmar, onCancelar }) {
    const [verificado, setVerificado] = useState(false);
    return (
        <Center mih="60vh" p="md">
            <Paper withBorder radius="md" p="lg" maw={560} w="100%">
                <Stack>
                    <Text fw={800} size="lg">Verifica la forma antes de imprimir</Text>
                    <Text size="sm" c="dimmed">{tipo} {documento}</Text>
                    {control ? (
                        <>
                            <Paper bg="yellow.0" withBorder radius="md" p="md" ta="center">
                                <Text size="xs" c="dimmed" fw={700} tt="uppercase">N° de control que saldrá impreso</Text>
                                <Text fz={34} fw={900} lh={1.2} c="navy.9" style={{ letterSpacing: 1 }}>{control}</Text>
                                <Text size="xs" c="dimmed">{nuevo ? 'Es el siguiente libre: se le asigna al confirmar.' : 'Este documento ya lo tiene asignado.'}</Text>
                            </Paper>
                            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />}>
                                Mira la forma preimpresa que está en la impresora: su número de control debe ser <b>exactamente {control}</b>. Si no coincide, cambia la forma (o avisa a administración) antes de continuar.
                            </Alert>
                            <Checkbox size="md" checked={verificado} onChange={(e) => setVerificado(e.currentTarget.checked)} label={`Verifiqué que la forma en la impresora tiene el control ${control}`} />
                            <Button size="lg" leftSection={<IconPrinter size={20} />} disabled={!verificado} onClick={() => onConfirmar(control)}>Coincide: imprimir</Button>
                        </>
                    ) : <Stack align="center"><Loader /><Text size="sm" c="dimmed">Buscando el número de control…</Text></Stack>}
                    <Button variant="subtle" color="gray" onClick={onCancelar}>Cancelar (no se gasta ningún número)</Button>
                </Stack>
            </Paper>
        </Center>
    );
}
