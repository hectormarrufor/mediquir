'use client';

import React, { useState } from 'react';
import {
    ActionIcon, Alert, Badge, Box, Button, Center, Container, Group, Image, Loader, Modal, Paper, Progress, SegmentedControl, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconArrowLeft, IconBarcode, IconCheck, IconPencil, IconPhotoOff, IconScan, IconSearch } from '@tabler/icons-react';
import EscanerCodigo, { escanerDisponible } from '../../ventas/_components/EscanerCodigo';

const POR_PAGINA = 30;

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

function Foto({ src }) {
    return (
        <Box w={56} h={56} style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'var(--mantine-color-gray-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {src ? <Image src={src} w={56} h={56} fit="contain" alt="" /> : <IconPhotoOff size={22} color="var(--mantine-color-gray-5)" />}
        </Box>
    );
}

// Carga rápida de códigos de barras desde el teléfono: se elige un producto, se escanea el código de su empaque y se guarda.
// Después el empaque de pedidos usa ese código para comprobar que se tomó el producto correcto.
export default function CodigosDeBarrasPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [filtro, setFiltro] = useState('sin');
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 300);
    const [limite, setLimite] = useState(POR_PAGINA);

    const [camaraPara, setCamaraPara] = useState(null);     // producto al que se le va a escanear el código
    const [camaraBusqueda, setCamaraBusqueda] = useState(false); // escanear para BUSCAR a qué producto pertenece un código
    const [confirmar, setConfirmar] = useState(null);       // { producto, codigo }
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const { data, isLoading, error: errorCarga } = useQuery({
        queryKey: ['codigos-barras', filtro, q, limite],
        placeholderData: (previa) => previa,
        queryFn: () => pedirJson(`/api/inventario/productos/codigos?filtro=${filtro}&q=${encodeURIComponent(q)}&limite=${limite}`),
    });

    const productos = data?.productos || [];
    const puedeEditar = data?.puedeEditar !== false;
    const avance = data?.total ? Math.round((data.conCodigo / data.total) * 100) : 0;

    const abrirConfirmacion = (producto, codigo = '') => { setError(null); setConfirmar({ producto, codigo }); };

    const guardar = async () => {
        if (!confirmar) return;
        setGuardando(true);
        setError(null);
        try {
            await pedirJson(`/api/inventario/productos/${confirmar.producto.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cambios: { codigoBarras: confirmar.codigo.trim() || null } }),
            });
            notifications.show({ color: 'teal', icon: <IconCheck size={16} />, message: `Código guardado: ${confirmar.producto.nombre}` });
            setConfirmar(null);
            queryClient.invalidateQueries({ queryKey: ['codigos-barras'] });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
        } catch (e) {
            setError(e.message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Container size="sm" px="xs" py="md">
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap">
                    <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/inventario/productos')} px={6}>Inventario</Button>
                </Group>
                <Box>
                    <Title order={2} c="white" fz={24}><IconBarcode size={26} style={{ verticalAlign: 'middle' }} /> Códigos de barras</Title>
                    <Text size="sm" c="gray.4">Elige un producto, escanea el código de su empaque y guárdalo. Luego el empaque de pedidos lo usa para confirmar que se tomó el producto correcto.</Text>
                </Box>

                <Paper withBorder radius="md" p="sm">
                    <Group justify="space-between" mb={6}>
                        <Text size="sm" fw={700}>{data ? `${data.conCodigo} de ${data.total} productos con código de barras` : 'Cargando…'}</Text>
                        <Badge variant="light" color={avance === 100 ? 'teal' : 'blue'}>{avance}%</Badge>
                    </Group>
                    <Progress value={avance} size="lg" radius="xl" color={avance === 100 ? 'teal' : 'blue'} />
                    <Text size="xs" c="dimmed" mt={6}>Los productos que no traen código de barras se verifican eligiendo su marca: déjalos sin código.</Text>
                </Paper>

                {!puedeEditar && <Alert color="orange" icon={<IconAlertTriangle size={18} />}>No tienes permiso para editar el inventario: puedes ver los códigos pero no guardarlos.</Alert>}

                <SegmentedControl fullWidth color="navy.9" value={filtro} onChange={(v) => { setFiltro(v); setLimite(POR_PAGINA); }} data={[{ value: 'sin', label: 'Sin código' }, { value: 'todos', label: 'Todos' }]} />
                <TextInput
                    size="md" placeholder="Buscar por nombre, código o marca…" leftSection={<IconSearch size={16} />} value={busqueda}
                    onChange={(e) => { setBusqueda(e.currentTarget.value); setLimite(POR_PAGINA); }}
                    rightSection={escanerDisponible() ? <ActionIcon variant="light" size="lg" onClick={() => setCamaraBusqueda(true)} aria-label="Escanear para buscar"><IconScan size={18} /></ActionIcon> : null}
                    rightSectionWidth={44}
                    description="También puedes escanear un código para ver a qué producto pertenece"
                />

                {errorCarga && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{errorCarga.message}</Alert>}

                {isLoading && !data ? <Center py="xl"><Loader /></Center> : !productos.length ? (
                    <Center py="xl"><Text c="gray.4" ta="center">{filtro === 'sin' && !q ? '¡Todos los productos ya tienen su código de barras!' : 'No hay productos con esa búsqueda.'}</Text></Center>
                ) : (
                    <Stack gap="xs">
                        {productos.map((p) => (
                            <Paper key={p.id} withBorder radius="md" p="sm">
                                <Group wrap="nowrap" align="center" gap="sm">
                                    <Foto src={p.imagen} />
                                    <Box style={{ minWidth: 0, flex: 1 }}>
                                        <Text fw={700} size="sm" lineClamp={2}>{p.nombre}</Text>
                                        <Text size="xs" c="dimmed" truncate>Cód. {p.codigo}{p.marca ? ` · ${p.marca}` : ''}</Text>
                                        {p.codigoBarras && <Badge mt={4} size="sm" color="teal" variant="light" tt="none" leftSection={<IconBarcode size={12} />}>{p.codigoBarras}</Badge>}
                                    </Box>
                                    <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
                                        {escanerDisponible() && (
                                            <Button size="sm" color={p.codigoBarras ? 'gray' : 'blue'} variant={p.codigoBarras ? 'light' : 'filled'} leftSection={<IconScan size={16} />} disabled={!puedeEditar} onClick={() => setCamaraPara(p)}>
                                                {p.codigoBarras ? 'Cambiar' : 'Escanear'}
                                            </Button>
                                        )}
                                        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconPencil size={12} />} disabled={!puedeEditar} onClick={() => abrirConfirmacion(p, p.codigoBarras || '')}>Escribir</Button>
                                    </Stack>
                                </Group>
                            </Paper>
                        ))}
                        {data?.hayMas && <Button variant="light" color="gray.3" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más productos</Button>}
                    </Stack>
                )}
            </Stack>

            {/* Cámara para un producto: al leer el código se pide confirmarlo antes de guardar */}
            <EscanerCodigo
                opened={Boolean(camaraPara)} titulo={camaraPara ? `Escanea: ${camaraPara.nombre}` : ''} onClose={() => setCamaraPara(null)}
                onDetectar={(valor) => { const producto = camaraPara; setCamaraPara(null); if (producto) abrirConfirmacion(producto, valor); }}
            />
            {/* Cámara para BUSCAR: el código leído llena el buscador */}
            <EscanerCodigo
                opened={camaraBusqueda} titulo="Escanea un código para buscarlo" onClose={() => setCamaraBusqueda(false)}
                onDetectar={(valor) => { setCamaraBusqueda(false); setFiltro('todos'); setBusqueda(valor); setLimite(POR_PAGINA); }}
            />

            <Modal opened={Boolean(confirmar)} onClose={() => setConfirmar(null)} centered title={<Text fw={800}>Código de barras</Text>}>
                {confirmar && (
                    <Stack>
                        <Group wrap="nowrap" gap="sm">
                            <Foto src={confirmar.producto.imagen} />
                            <Box style={{ minWidth: 0 }}>
                                <Text fw={700} size="sm" lineClamp={2}>{confirmar.producto.nombre}</Text>
                                <Text size="xs" c="dimmed">Cód. {confirmar.producto.codigo}{confirmar.producto.marca ? ` · ${confirmar.producto.marca}` : ''}</Text>
                            </Box>
                        </Group>
                        <TextInput
                            label="Código de barras" description="Revisa que sea el del empaque de ESTE producto" size="md" inputMode="numeric" data-autofocus
                            value={confirmar.codigo} onChange={(e) => setConfirmar({ ...confirmar, codigo: e.currentTarget.value.replace(/\s/g, '') })}
                        />
                        {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}
                        <Button size="md" color={confirmar.codigo.trim() ? 'teal' : 'red'} loading={guardando} disabled={!confirmar.codigo.trim() && !confirmar.producto.codigoBarras} onClick={guardar} leftSection={<IconCheck size={18} />}>
                            {confirmar.codigo.trim() ? 'Guardar código' : 'Quitar el código'}
                        </Button>
                        <Group grow>
                            {escanerDisponible() && <Button variant="default" leftSection={<IconScan size={16} />} onClick={() => { const p = confirmar.producto; setConfirmar(null); setCamaraPara(p); }}>Escanear otra vez</Button>}
                            <Button variant="default" onClick={() => setConfirmar(null)}>Cancelar</Button>
                        </Group>
                        {confirmar.producto.codigoBarras && (
                            <Button variant="subtle" color="red" size="compact-sm" onClick={() => setConfirmar({ ...confirmar, codigo: '' })}>Quitar el código (el producto no trae)</Button>
                        )}
                    </Stack>
                )}
            </Modal>
        </Container>
    );
}
