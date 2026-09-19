'use client';

import React from 'react';
import { Alert, Button, Center, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

// Pantalla previa a imprimir mientras se asigna el número de control: si falta decir con cuál se empieza, lo pregunta.
export default function ControlFiscalPaso({ estado, mensaje, onReintentar }) {
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
                ) : (
                    <Stack align="center"><Loader /><Text size="sm" c="dimmed">Asignando el número de control…</Text></Stack>
                )}
            </Paper>
        </Center>
    );
}
