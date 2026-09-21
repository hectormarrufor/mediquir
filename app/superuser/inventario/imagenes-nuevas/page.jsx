'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Anchor, Badge, Box, Button, Card, Group, Image, Loader, Paper, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconArrowBackUp, IconBrandGoogle, IconCamera, IconCheck, IconChevronLeft, IconPhotoEdit, IconPlayerSkipForward, IconTrash } from '@tabler/icons-react';
import EditorFoto from './_components/EditorFoto';

const TIPO = { grupo: ['Grupo de equivalencia', 'violet'], producto: ['Producto suelto', 'blue'], marca: ['Marca', 'orange'] };

async function api(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Revisión foto por foto. "Revisar": ¿esta foto está bien? · "Faltan": entidades sin foto propia (grupos y productos sueltos; un producto
// dentro de un grupo usa la foto del grupo y no se pregunta).
export default function ImagenesNuevasPage() {
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 48em)');
    const [modo, setModo] = useState('revisar');
    const [cola, setCola] = useState([]);
    const [conteo, setConteo] = useState(null);
    const [puedeEditar, setPuedeEditar] = useState(false);
    const [cargando, setCargando] = useState(true);
    const [ocupado, setOcupado] = useState(false);
    const [editor, setEditor] = useState(false);
    const [error, setError] = useState('');
    const omitidos = useRef(new Set());
    const hechos = useRef(0);

    const cargar = useCallback(async (m) => {
        setCargando(true); setError('');
        try {
            const d = await api(`/api/inventario/imagenes-auditoria?modo=${m}&limite=25&excluir=${[...omitidos.current].join(',')}`);
            setCola(d.items); setConteo(d.conteo); setPuedeEditar(d.puedeEditar);
        } catch (e) { setError(e.message); } finally { setCargando(false); }
    }, []);

    useEffect(() => { omitidos.current = new Set(); hechos.current = 0; cargar(modo); }, [modo, cargar]);

    const actual = cola[0];
    const siguiente = useCallback(() => {
        setCola((c) => { const r = c.slice(1); if (r.length === 0) setTimeout(() => cargar(modo), 0); return r; });
        hechos.current += 1;
    }, [cargar, modo]);

    const actuar = useCallback(async (accion, extra = {}) => {
        if (!actual || ocupado) return;
        setOcupado(true);
        try {
            await api('/api/inventario/imagenes-auditoria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: actual.tipo, id: actual.id, accion, ...extra }) });
            siguiente();
            setConteo((c) => (c ? { ...c, por_revisar: Math.max(0, c.por_revisar - (modo === 'revisar' ? 1 : 0)), aprobadas: c.aprobadas + (accion !== 'QUITAR' ? 1 : 0) } : c));
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); } finally { setOcupado(false); }
    }, [actual, ocupado, siguiente, modo]);

    const saltar = useCallback(() => { if (!actual) return; omitidos.current.add(`${actual.tipo}:${actual.id}`); siguiente(); }, [actual, siguiente]);

    // Teclado (escritorio): Enter = está bien · → = saltar · C = cambiar foto
    useEffect(() => {
        const f = (e) => {
            if (editor || !actual || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
            if (e.key === 'Enter' && modo === 'revisar' && puedeEditar) { e.preventDefault(); actuar('APROBAR'); }
            else if (e.key === 'ArrowRight') saltar();
            else if (e.key.toLowerCase() === 'c' && puedeEditar) setEditor(true);
        };
        window.addEventListener('keydown', f);
        return () => window.removeEventListener('keydown', f);
    }, [editor, actual, modo, puedeEditar, actuar, saltar]);

    const faltan = conteo ? conteo.faltan_grupos + conteo.faltan_productos + conteo.faltan_marcas : 0;
    const [etiquetaTipo, colorTipo] = actual ? TIPO[actual.tipo] : [];
    const pt = actual?.puntaje;
    const colorPt = pt === null || pt === undefined ? 'gray' : pt >= 0.9 ? 'teal' : pt >= 0.7 ? 'yellow' : 'red';
    const busqueda = useMemo(() => (actual ? `https://www.google.com/search?q=${encodeURIComponent(`${actual.nombre} ${actual.marca || ''}`.trim())}&udm=2` : '#'), [actual]);

    return (
        <Box px={isMobile ? 'xs' : 'md'} py="sm" maw={980} mx="auto">
            <Group justify="space-between" align="flex-end" mb="sm">
                <Box>
                    <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser/inventario/productos')}>Inventario</Button>
                    <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" pb={0}>Auditar fotos</Title>
                    <Text size="sm" c="gray.4">Te muestro una foto a la vez: dime si está bien, cámbiala o agrega las que faltan.</Text>
                </Box>
            </Group>

            <SegmentedControl fullWidth mb="sm" color="navy.9" bg="white" value={modo} onChange={setModo}
                data={[{ value: 'revisar', label: `Revisar fotos nuevas${conteo ? ` (${conteo.por_revisar})` : ''}` }, { value: 'faltan', label: `Fotos que faltan${conteo ? ` (${faltan})` : ''}` }]} />

            {conteo && (
                <Group gap="xs" mb="sm">
                    <Badge color="teal" variant="light">Aprobadas: {conteo.aprobadas}</Badge>
                    <Badge color="violet" variant="light">Grupos sin foto: {conteo.faltan_grupos}</Badge>
                    <Badge color="blue" variant="light">Productos sueltos sin foto: {conteo.faltan_productos}</Badge>
                    <Badge color="orange" variant="light">Marcas sin logo: {conteo.faltan_marcas}</Badge>
                </Group>
            )}

            {!puedeEditar && !cargando && <Alert color="yellow" variant="light" mb="sm">Puedes ver las fotos pero no cambiarlas: pide al administrador el permiso de edición de inventario.</Alert>}
            {error && <Alert color="red" mb="sm">{error}</Alert>}

            {cargando && !actual ? <Group justify="center" py={80}><Loader /></Group> : !actual ? (
                <Paper withBorder radius="md" p="xl" ta="center" bg="white">
                    <IconCheck size={48} color="var(--mantine-color-teal-6)" />
                    <Title order={3} mt="xs">{modo === 'revisar' ? '¡No hay más fotos por revisar!' : '¡No falta ninguna foto!'}</Title>
                    <Text c="dimmed" mt={4}>{hechos.current ? `Esta sesión atendiste ${hechos.current}.` : 'Todo al día.'}</Text>
                    {omitidos.current.size > 0 && <Button mt="md" variant="light" onClick={() => { omitidos.current = new Set(); cargar(modo); }}>Volver a ver las {omitidos.current.size} que salté</Button>}
                </Paper>
            ) : (
                <Card withBorder radius="md" p={isMobile ? 'sm' : 'md'} bg="white">
                    <Stack gap="sm">
                        <Group gap={6}>
                            <Badge color={colorTipo} variant="light">{etiquetaTipo}</Badge>
                            {actual.categoria && <Badge color="gray" variant="outline">{actual.categoria}</Badge>}
                            {modo === 'revisar' && <Badge color={colorPt} variant="filled">{pt === null || pt === undefined ? 'Sin puntaje' : `Coincidencia ${Math.round(pt * 100)} %`}</Badge>}
                            <Text size="xs" c="dimmed" ml="auto">Quedan {cola.length}+</Text>
                        </Group>

                        {actual.url ? (
                            <Image src={actual.url} alt={actual.nombre} h={isMobile ? 300 : 420} fit="contain" bg="gray.0" radius="md" />
                        ) : (
                            <Box h={isMobile ? 220 : 300} bg="gray.0" style={{ border: '2px dashed var(--mantine-color-gray-4)', borderRadius: 12, display: 'grid', placeItems: 'center' }}>
                                <Stack align="center" gap={4}><IconCamera size={44} color="var(--mantine-color-gray-5)" /><Text c="dimmed" fw={600}>Todavía no tiene foto</Text></Stack>
                            </Box>
                        )}

                        <Box>
                            <Text fw={800} fz={isMobile ? 'lg' : 'xl'} lh={1.2}>{actual.nombre}</Text>
                            <Text size="sm" c="dimmed">{[actual.codigo && `Código ${actual.codigo}`, actual.marca].filter(Boolean).join(' · ')}</Text>
                            {modo === 'revisar' && actual.fuente && (
                                <Text size="xs" c="dimmed" mt={4}>Salió de: <Anchor href={actual.pagina || actual.fuente} target="_blank" size="xs">{dominio(actual.pagina || actual.fuente)}</Anchor></Text>
                            )}
                        </Box>

                        {modo === 'revisar' ? (
                            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                                <Button size="lg" color="teal" leftSection={<IconCheck size={22} />} disabled={!puedeEditar} loading={ocupado} onClick={() => actuar('APROBAR')}>Está bien</Button>
                                <Button size="lg" color="orange" variant="light" leftSection={<IconPhotoEdit size={22} />} disabled={!puedeEditar} onClick={() => setEditor(true)}>Cambiar foto</Button>
                                <Button size="lg" variant="default" leftSection={<IconPlayerSkipForward size={22} />} onClick={saltar}>Saltar</Button>
                            </SimpleGrid>
                        ) : (
                            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                                <Button size="lg" leftSection={<IconCamera size={22} />} disabled={!puedeEditar} onClick={() => setEditor(true)}>Agregar foto</Button>
                                <Button size="lg" variant="light" component="a" href={busqueda} target="_blank" leftSection={<IconBrandGoogle size={22} />}>Buscar en Google</Button>
                                <Button size="lg" variant="default" leftSection={<IconPlayerSkipForward size={22} />} onClick={saltar}>Saltar</Button>
                            </SimpleGrid>
                        )}
                        {modo === 'revisar' && puedeEditar && (
                            <Button variant="subtle" color="red" size="compact-sm" leftSection={<IconTrash size={14} />} loading={ocupado} onClick={() => { if (window.confirm('¿Quitar esta foto? Pasará a la lista de "Fotos que faltan".')) actuar('QUITAR'); }}>Quitar esta foto (está muy mal)</Button>
                        )}
                        {!isMobile && <Text size="xs" c="dimmed"><IconArrowBackUp size={12} style={{ verticalAlign: 'middle' }} /> Atajos: <b>Enter</b> está bien · <b>C</b> cambiar · <b>→</b> saltar</Text>}
                    </Stack>
                </Card>
            )}

            <EditorFoto item={actual} opened={editor} onClose={() => setEditor(false)} onGuardar={async (nombre) => { await actuar('CAMBIAR', { imagen: nombre }); setEditor(false); }} />
        </Box>
    );
}
