'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Box, Button, Group, Image, Loader, Modal, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandGoogle, IconCamera, IconPhotoPlus, IconRefresh } from '@tabler/icons-react';
import { subirImagen } from '../../productos/_hooks/useInventario';
import { procesarFoto } from '../_lib/mejorarFoto';

const kb = (b) => `${Math.round(b.size / 1024)} kB`;

// Pone una foto nueva a un grupo, producto suelto o marca: se toma con la cámara (o se elige un archivo), se mejora en el
// navegador (sin fondo / ajustada, ~100 kB), se compara con la original y se guarda en Blob.
// Con `soloProcesar` no sube nada: le entrega el archivo ya mejorado a onGuardar(file) (para un producto que aún no existe).
export default function EditorFoto({ item, opened, onClose, onGuardar, soloProcesar = false }) {
    const camara = useRef(null);
    const archivo = useRef(null);
    const [fase, setFase] = useState('elegir'); // elegir | procesando | resultado | guardando
    const [progreso, setProgreso] = useState('');
    const [res, setRes] = useState(null); // { simple, quitado, aviso, original }
    const [urls, setUrls] = useState({});
    const [eleccion, setEleccion] = useState('quitado');
    const [arrastrando, setArrastrando] = useState(false);

    useEffect(() => { if (opened) { setFase('elegir'); setRes(null); setUrls({}); } }, [opened, item?.id, item?.tipo]);
    useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

    // Procesa una foto venga de donde venga: cámara, archivo, arrastrar y soltar o pegar (Ctrl+V)
    const procesar = async (f) => {
        if (!f || !/^image\//.test(f.type || 'image/')) { notifications.show({ color: 'orange', message: 'Eso no parece una imagen' }); return; }
        setFase('procesando');
        try {
            const r = await procesarFoto(f, setProgreso);
            setRes({ ...r, original: f });
            setUrls({ original: URL.createObjectURL(f), simple: URL.createObjectURL(r.simple), ...(r.quitado ? { quitado: URL.createObjectURL(r.quitado) } : {}) });
            setEleccion(r.quitado ? 'quitado' : 'simple');
            setFase('resultado');
        } catch (err) {
            notifications.show({ color: 'red', title: 'No se pudo procesar la foto', message: err.message });
            setFase('elegir');
        }
    };
    const elegir = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) procesar(f); };
    const soltar = (e) => { e.preventDefault(); setArrastrando(false); procesar(e.dataTransfer?.files?.[0]); };

    // Ctrl+V: pega una imagen copiada (por ejemplo "Copiar imagen" en Google)
    const procesarRef = useRef(null);
    procesarRef.current = procesar;
    useEffect(() => {
        if (!opened || !(fase === 'elegir' || fase === 'resultado')) return undefined;
        const alPegar = (e) => {
            const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            if (it) { e.preventDefault(); procesarRef.current(it.getAsFile()); }
        };
        window.addEventListener('paste', alPegar);
        return () => window.removeEventListener('paste', alPegar);
    }, [opened, fase]);

    if (!item) return null;
    const busqueda = `https://www.google.com/search?q=${encodeURIComponent(`${item.nombre} ${item.marca || ''}`.trim())}&udm=2`;

    const guardar = async () => {
        setFase('guardando');
        try {
            const blob = eleccion === 'quitado' ? res.quitado : res.simple;
            const archivo = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
            if (soloProcesar) {
                await onGuardar(archivo);
                return;
            }
            const prefijo = item.tipo === 'grupo' ? `grupo_${item.id}` : item.tipo === 'marca' ? `marca_${item.id}` : `producto_${item.id}`;
            const nombre = await subirImagen(archivo, prefijo);
            await onGuardar(nombre);
            notifications.show({ color: 'teal', message: 'Foto guardada' });
        } catch (err) {
            notifications.show({ color: 'red', title: 'No se guardó', message: err.message });
            setFase('resultado');
        }
    };

    return (
        <Modal opened={opened} onClose={fase === 'guardando' ? () => {} : onClose} centered size="lg" title={<Text fw={800} lineClamp={1}>Foto de: {item.nombre}</Text>}>
            <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={elegir} />
            <input ref={archivo} type="file" accept="image/*" hidden onChange={elegir} />
            <Stack gap="md">
                {fase === 'elegir' && (
                    <>
                        <Text size="sm" c="dimmed">Toma la foto sobre una superficie lisa y con buena luz (con el producto completo a la vista). Yo la recorto, quito el fondo y la dejo en ~100 kB.</Text>
                        <SimpleGrid cols={{ base: 1, sm: 3 }}>
                            <Button size="md" leftSection={<IconCamera size={20} />} onClick={() => camara.current?.click()}>Tomar foto</Button>
                            <Button size="md" variant="light" leftSection={<IconPhotoPlus size={20} />} onClick={() => archivo.current?.click()}>Elegir archivo</Button>
                            <Button size="md" variant="default" component="a" href={busqueda} target="_blank" leftSection={<IconBrandGoogle size={20} />}>Buscar en Google</Button>
                        </SimpleGrid>
                        <Box onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={soltar}
                            p="md" ta="center" style={{ border: `2px dashed var(--mantine-color-${arrastrando ? 'blue-6' : 'gray-4'})`, borderRadius: 12, background: arrastrando ? 'var(--mantine-color-blue-0)' : undefined }}>
                            <Text size="sm" fw={600}>Arrastra una imagen aquí, o pégala con Ctrl + V</Text>
                            <Text size="xs" c="dimmed">En Google: clic derecho sobre la imagen → "Copiar imagen", vuelve aquí y pega.</Text>
                        </Box>
                    </>
                )}

                {fase === 'procesando' && <Group justify="center" py="xl"><Loader size="sm" /><Text size="sm">{progreso || 'Procesando…'}</Text></Group>}

                {(fase === 'resultado' || fase === 'guardando') && res && (
                    <>
                        {res.aviso && <Alert color="yellow" variant="light" p="xs">No se pudo quitar el fondo ({res.aviso}). Puedes usar la versión ajustada o probar otra foto con el fondo más liso.</Alert>}
                        <SegmentedControl fullWidth value={eleccion} onChange={setEleccion} disabled={fase === 'guardando'}
                            data={[...(res.quitado ? [{ value: 'quitado', label: 'Sin fondo' }] : []), { value: 'simple', label: 'Ajustada (con su fondo)' }]} />
                        <SimpleGrid cols={2} spacing="xs">
                            <Box>
                                <Text size="xs" fw={700} c="dimmed" mb={4}>ORIGINAL</Text>
                                <Image src={urls.original} radius="md" h={260} fit="contain" bg="gray.1" />
                            </Box>
                            <Box>
                                <Group gap={6} mb={4}><Text size="xs" fw={700} c="dimmed">RESULTADO</Text><Badge size="xs" variant="light">{kb(eleccion === 'quitado' ? res.quitado : res.simple)}</Badge></Group>
                                <Image src={urls[eleccion]} radius="md" h={260} fit="contain" bg="white" style={{ border: '1px solid var(--mantine-color-gray-3)' }} />
                            </Box>
                        </SimpleGrid>
                        <Group justify="space-between">
                            <Button variant="subtle" leftSection={<IconRefresh size={16} />} disabled={fase === 'guardando'} onClick={() => setFase('elegir')}>Otra foto</Button>
                            <Button color="teal" loading={fase === 'guardando'} onClick={guardar}>Guardar esta foto</Button>
                        </Group>
                    </>
                )}
            </Stack>
        </Modal>
    );
}
