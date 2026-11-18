'use client';

import React from 'react';
import { Alert, Button, Center, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

// Pantalla previa a imprimir mientras se asigna el número de control: si falta decir con cuál se empieza, lo pregunta.
export default function ControlFiscalPaso({ estado, mensaje, control = null, nuevo = true, onReintentar }) {
    const { data } = useNumeracion(estado === 'pendiente');
    const serie = data?.series?.find((s) => s.clave === 'CONTROL');

    return (
        <Center mih="60vh" p="md">
            <Paper withBorder radius="md" p="lg" maw={520} w="100%">
                {estado === 'pendiente' ? (
                    <Stack>
                        <Text fw={800} size="lg">Número de control</Text>
                        {serie
                            ? <PreguntarNumero serie={serie} puedeEditar={data.puedeEditar} onListo={onReintentar} />
                            : <Loader size="sm" />}
                    </Stack>
                ) : estado === 'error' ? (
                    <Stack>
                        <Alert color="red" icon={<IconAlertTriangle size={18} />}>{mensaje}</Alert>
                        <Button onClick={onReintentar}>Reintentar</Button>
                    </Stack>
                ) : estado === 'listo' ? (
                    <Stack align="center" gap="xs">
                        <IconCircleCheck size={56} color="var(--mantine-color-teal-6)" />
                        <Text fw={800} size="xl" c="teal.8">¡Listo! {nuevo ? 'Número de control asignado' : 'Este documento ya tenía su número de control'}</Text>
                        <Text fz={34} fw={900} lh={1.2} c="navy.9" style={{ letterSpacing: 1 }}>{control}</Text>
                        <Text size="sm" c="dimmed">Enviando a la impresora…</Text>
                    </Stack>
                ) : (
                    <Stack align="center"><Loader /><Text fw={700}>Asignando número de control…</Text><Text size="sm" c="dimmed">No cierres esta pantalla.</Text></Stack>
                )}
            </Paper>
        </Center>
    );
}
