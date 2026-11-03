'use client';

import React from 'react';
import { Alert, Button, Group, Radio, Stack, Text } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { normRif, URL_SENIAT_RIF } from '@/app/constants/rif';

// Porcentaje de retención de IVA de un proveedor o cliente: SIN valor predeterminado, la persona tiene que elegir 75 % o 100 %
// (el SENIAT es quien dice cuál le corresponde). `rif` habilita el botón para consultarlo en el portal del SENIAT.
//   value: '75' | '100' | null      onChange(valor)      error: texto del formulario
export const OPCIONES_RETENCION = ['75', '100'];
export const validarRetencion = (v) => (OPCIONES_RETENCION.includes(String(v ?? '')) ? null : 'Elige 75 % o 100 %');

export default function SelectorRetencion({ value, onChange, error, rif, label = 'Retención de IVA', description, size = 'sm' }) {
    const rifLimpio = normRif(rif);
    return (
        <Stack gap={6}>
            <Radio.Group
                label={label} withAsterisk size={size} error={error}
                description={description || 'Lo que dice el SENIAT al consultar su RIF. No viene marcado: elige uno.'}
                value={value === null || value === undefined ? null : String(value)}
                onChange={onChange}
            >
                <Group gap="xl" mt={6}>
                    <Radio value="75" label="75 %" />
                    <Radio value="100" label="100 %" />
                </Group>
            </Radio.Group>
            {rif !== undefined && (
                <Alert color="blue" variant="light" p="xs">
                    <Text size="xs" mb={6}>El portal del SENIAT dice su porcentaje de retención y si es contribuyente especial. Al abrirlo se copia el RIF para que lo pegues.</Text>
                    <Button size="xs" variant="white" leftSection={<IconExternalLink size={14} />}
                        onClick={() => {
                            if (rifLimpio) navigator.clipboard?.writeText(rifLimpio).catch(() => {});
                            window.open(URL_SENIAT_RIF, '_blank', 'noopener');
                        }}>
                        Consultar RIF en el SENIAT{rifLimpio ? ` (${rifLimpio})` : ''}
                    </Button>
                </Alert>
            )}
        </Stack>
    );
}
