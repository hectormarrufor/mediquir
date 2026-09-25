'use client';

import React, { useState } from 'react';
import { Badge, Box, Button, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { IconPhotoEdit, IconPhotoOff, IconUpload } from '@tabler/icons-react';
import EditorFoto from '../../auditar/_components/EditorFoto';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// Ver y cambiar la foto de un producto o de un grupo. Si el producto no tiene foto propia se muestra
// la de su marca (igual que en la tienda) y se puede subir una propia sin tocar la de la marca.
// Subir/cambiar abre el editor de la auditoría: cámara, archivo, arrastrar, pegar o buscar en Google.
export default function FotoModal({ item, onCerrar, onCambiarImagen, onCambiarMarca }) {
    const [editor, setEditor] = useState(null); // 'principal' | 'marca'
    const [quitando, setQuitando] = useState(false);
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

    // Lo que el editor está cambiando: la foto de la marca o la del producto/grupo
    const objetivo = editor === 'marca'
        ? { tipo: 'marca', id: marca.id, nombre: marca.nombre }
        : esGrupo ? { tipo: 'grupo', id: grupo.id, nombre: grupo.nombre } : { tipo: 'producto', id: fila.id, nombre: fila.nombre, marca: marca?.nombre };

    // El editor ya subió la foto: solo queda guardarla en el producto, grupo o marca
    const guardar = async (nombre) => {
        if (editor === 'marca') await onCambiarMarca(marca, nombre);
        else await onCambiarImagen(item, nombre);
        setEditor(null);
        if (editor !== 'marca') onCerrar();
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
                    <Button onClick={() => setEditor('principal')} leftSection={propia ? <IconPhotoEdit size={16} /> : <IconUpload size={16} />} tt="none" color="navy.9">{propia ? 'Cambiar foto' : usaMarca ? 'Subir foto propia del producto' : 'Subir foto'}</Button>
                    {propia && (
                        <Button variant="default" color="red" tt="none" loading={quitando} onClick={async () => { setQuitando(true); try { await onCambiarImagen(item, null); onCerrar(); } finally { setQuitando(false); } }}>
                            Quitar foto{usaMarca ? '' : esGrupo ? '' : ' (volverá la de la marca)'}
                        </Button>
                    )}
                </Group>

                {marca && (
                    <Box p="sm" bg="gray.0" style={{ borderRadius: 8 }}>
                        <Text size="xs" c="dimmed" mb={6}>
                            La marca <b>{marca.nombre}</b> {marca.imagen ? 'tiene foto' : 'no tiene foto'}. Cambiarla afecta a todos los productos de esa marca que no tengan foto propia.
                        </Text>
                        <Button size="xs" variant="light" color="grape" onClick={() => setEditor('marca')} tt="none">Cambiar la foto de la marca</Button>
                    </Box>
                )}
            </Stack>
            <EditorFoto item={objetivo} opened={Boolean(editor)} onClose={() => setEditor(null)} onGuardar={guardar} />
        </Modal>
    );
}
