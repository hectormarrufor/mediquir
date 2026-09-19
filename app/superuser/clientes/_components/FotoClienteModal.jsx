'use client';

import React, { useState } from 'react';
import { Box, Button, FileButton, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { IconPhotoEdit, IconPhotoOff, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { subirImagen } from '../../inventario/productos/_hooks/useInventario';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// Ver y cambiar el logo o la foto de un cliente. `onCambiar(nombreArchivo | null)` guarda el cambio en la hoja.
export default function FotoClienteModal({ cliente, puedeEditar, onCerrar, onCambiar }) {
    const [subiendo, setSubiendo] = useState(false);
    if (!cliente) return null;

    const src = cliente.imagen ? `${BLOB}/${cliente.imagen}` : null;

    const subir = async (archivo) => {
        if (!archivo) return;
        setSubiendo(true);
        try {
            const nombre = await subirImagen(archivo, `cliente_${cliente.id}`);
            await onCambiar(nombre);
            notifications.show({ color: 'teal', message: 'Imagen actualizada' });
            onCerrar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo cambiar la imagen', message: e.message });
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <Modal opened onClose={onCerrar} centered size="md" title={<Text fw={800} lineClamp={2}>{cliente.nombre || cliente.identificacion}</Text>}>
            <Stack gap="md">
                <Box bg="gray.0" h={280} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' }}>
                    {src
                        ? <Image src={src} alt="" fit="contain" h={260} />
                        : <Stack align="center" gap={4} c="dimmed"><IconPhotoOff size={48} stroke={1.2} /><Text size="sm">Sin imagen</Text></Stack>}
                </Box>
                {puedeEditar && (
                    <Group gap="sm">
                        <FileButton onChange={subir} accept="image/png,image/jpeg,image/webp">
                            {(props) => <Button {...props} loading={subiendo} leftSection={src ? <IconPhotoEdit size={16} /> : <IconUpload size={16} />} tt="none" color="navy.9">{src ? 'Cambiar imagen' : 'Subir imagen'}</Button>}
                        </FileButton>
                        {src && <Button variant="default" tt="none" loading={subiendo} onClick={async () => { await onCambiar(null); onCerrar(); }}>Quitar imagen</Button>}
                    </Group>
                )}
            </Stack>
        </Modal>
    );
}
