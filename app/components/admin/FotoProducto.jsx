'use client';

import React, { useEffect, useState } from 'react';
import { Box, Button, Group, Image, Stack, Text } from '@mantine/core';
import { IconPhotoEdit, IconPhotoOff, IconTrash } from '@tabler/icons-react';
import EditorFoto from '@/app/superuser/inventario/auditar/_components/EditorFoto';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// Foto del producto en el formulario: sube/arrastra/pega una imagen o búscala en Google (mismo editor de la auditoría).
// El valor es el nombre ya guardado (string) o un File recién mejorado que el formulario sube al guardar.
export default function FotoProducto({ form, nombre, marca }) {
    const [abierto, setAbierto] = useState(false);
    const [previa, setPrevia] = useState(null);
    const valor = form.values.imagen;

    useEffect(() => {
        if (valor && typeof valor !== 'string') {
            const url = URL.createObjectURL(valor);
            setPrevia(url);
            return () => URL.revokeObjectURL(url);
        }
        setPrevia(valor ? `${BLOB}/${valor}` : null);
        return undefined;
    }, [valor]);

    return (
        <>
            <Group align="center" gap="lg" wrap="nowrap">
                <Box w={160} h={160} bg="gray.0" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}>
                    {previa
                        ? <Image src={previa} alt="" fit="contain" h={160} />
                        : <Stack align="center" gap={4} c="dimmed"><IconPhotoOff size={40} stroke={1.2} /><Text size="xs">Sin foto</Text></Stack>}
                </Box>
                <Stack gap="xs" align="flex-start">
                    <Text size="sm" c="dimmed">Toma la foto, arrastra una imagen o pégala (Ctrl + V). También puedes buscarla en Google desde el editor: se recorta y queda en ~100 kB.</Text>
                    <Group gap="xs">
                        <Button leftSection={<IconPhotoEdit size={16} />} onClick={() => setAbierto(true)}>{valor ? 'Cambiar foto' : 'Agregar foto'}</Button>
                        {valor && <Button variant="default" leftSection={<IconTrash size={16} />} onClick={() => form.setFieldValue('imagen', null)}>Quitar</Button>}
                    </Group>
                </Stack>
            </Group>
            <EditorFoto
                soloProcesar
                item={{ tipo: 'producto', nombre: nombre?.trim() || 'Producto nuevo', marca }}
                opened={abierto}
                onClose={() => setAbierto(false)}
                onGuardar={(archivo) => { form.setFieldValue('imagen', archivo); setAbierto(false); }}
            />
        </>
    );
}
