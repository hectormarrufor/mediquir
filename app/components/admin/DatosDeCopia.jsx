'use client';

import React from 'react';
import { Group, Stack, Text, TextInput } from '@mantine/core';

// Mientras convivan el sistema anterior y este, un documento fiscal se emite primero en el anterior y se COPIA aquí con el número, el control y la
// fecha que ya tiene allá. Los tres son opcionales: vacíos, el sistema asigna el siguiente número y la fecha de hoy.
//   valores: { numero, control, fecha }   onCambio: (nuevos) => void   etiquetaNumero: "Número de factura" | "Número de nota" | …
export default function DatosDeCopia({ valores, onCambio, etiquetaNumero = 'Número de factura', placeholderNumero = '146870', ocultarFecha = false }) {
    const poner = (campo) => (e) => onCambio({ ...valores, [campo]: e.currentTarget.value });
    return (
        <Stack gap={6} p="sm" style={{ border: '1px dashed var(--mantine-color-gray-4)', borderRadius: 8 }}>
            <Text size="xs" fw={700} c="dimmed">¿Ya lo emitiste en el sistema anterior? Copia sus datos (opcional)</Text>
            <Group grow align="flex-start">
                <TextInput size="xs" label={etiquetaNumero} placeholder={placeholderNumero} value={valores.numero || ''} onChange={poner('numero')} />
                <TextInput size="xs" label="Número de control" placeholder="00-0122657" value={valores.control || ''} onChange={poner('control')} />
            </Group>
            {!ocultarFecha && <TextInput size="xs" type="date" label="Fecha de emisión" description="Vacía = hoy" max={new Date().toISOString().slice(0, 10)} value={valores.fecha || ''} onChange={poner('fecha')} />}
        </Stack>
    );
}
