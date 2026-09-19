'use client';

import React, { useState } from 'react';
import { Badge, Box, Button, FileButton, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { IconPhotoEdit, IconPhotoOff, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { subirImagen } from '../_hooks/useInventario';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// Ver y cambiar la foto de un producto o de un grupo. Si el producto no tiene foto propia se muestra
// la de su marca (igual que en la tienda) y se puede subir una propia sin tocar la de la marca.
export default function FotoModal({ item, onCerrar, onCambiarImagen, onCambiarMarca }) {
    const [subiendo, setSubiendo] = useState(false);
    if (!item) return null;

    const esGrupo = item.k === 'grupo';
    const fila = item.fila;
    const grupo = item.grupo;
    const propia = esGrupo ? grupo.imagen : fila.imagen;
    const marca = !esGrupo ? fila.marca : null;
    const usaMarca = !esGrupo && !propia && Boolean(marca?.imagen);
    const src = propia ? `${BLOB}/${propia}` : usaMarca ? `${BLOB}/${marca.imagen}` : null;

    const origen = esGrupo
        ? (propia ? 'Foto del grupo' : 'El grupo no tiene foto')
        : propia ? 'Foto del producto' : usaMarca ? `Foto de la marca ${marca.nombre} (el producto no tiene foto propia)` : 'Sin foto';

    // destino: 'principal' (producto o grupo) o 'marca'
    const subir = async (archivo, destino) => {
        if (!archivo) return;
        setSubiendo(true);
        try {
            const prefijo = destino === 'marca' ? `marca_${marca.id}` : esGrupo ? `grupo_${grupo.id}` : `producto_${fila.id}`;
            const nombre = await subirImagen(archivo, prefijo);
            if (destino === 'marca') await onCambiarMarca(marca, nombre);
            else await onCambiarImagen(item, nombre);
            notifications.show({ color: 'teal', message: 'Foto actualizada' });
            if (destino !== 'marca') onCerrar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo cambiar la foto', message: e.message });
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <Modal opened onClose={onCerrar} centered size="lg" title={<Text fw={800} lineClamp={2}>{esGrupo ? `Grupo: ${grupo.nombre}` : fila.nombre}</Text>}>
            <Stack gap="md">
                <Box bg="gray.0" h={360} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' }}>
                    {src
                        ? <Image src={src} alt="" fit="contain" h={340} />
                        : <Stack align="center" gap={4} c="dimmed"><IconPhotoOff size={48} stroke={1.2} /><Text size="sm">Sin foto</Text></Stack>}
                </Box>

                <Badge variant="light" color={propia ? 'teal' : usaMarca ? 'grape' : 'gray'} size="lg" style={{ alignSelf: 'flex-start' }}>{origen}</Badge>

                <Group gap="sm">
                    <FileButton onChange={(f) => subir(f, 'principal')} accept="image/png,image/jpeg,image/webp">
                        {(props) => <Button {...props} loading={subiendo} leftSection={propia ? <IconPhotoEdit size={16} /> : <IconUpload size={16} />} tt="none" color="navy.9">{propia ? 'Cambiar foto' : usaMarca ? 'Subir foto propia del producto' : 'Subir foto'}</Button>}
                    </FileButton>
                    {propia && (
                        <Button variant="default" color="red" tt="none" loading={subiendo} onClick={async () => { await onCambiarImagen(item, null); onCerrar(); }}>
                            Quitar foto{usaMarca ? '' : esGrupo ? '' : ' (volverá la de la marca)'}
                        </Button>
                    )}
                </Group>

                {marca && (
                    <Box p="sm" bg="gray.0" style={{ borderRadius: 8 }}>
                        <Text size="xs" c="dimmed" mb={6}>
                            La marca <b>{marca.nombre}</b> {marca.imagen ? 'tiene foto' : 'no tiene foto'}. Cambiarla afecta a todos los productos de esa marca que no tengan foto propia.
                        </Text>
                        <FileButton onChange={(f) => subir(f, 'marca')} accept="image/png,image/jpeg,image/webp">
                            {(props) => <Button {...props} size="xs" variant="light" color="grape" loading={subiendo} tt="none">Cambiar la foto de la marca</Button>}
                        </FileButton>
                    </Box>
                )}
            </Stack>
        </Modal>
    );
}
