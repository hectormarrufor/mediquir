'use client';

import React, { useState } from 'react';
import { ActionIcon, Alert, Avatar, Badge, Box, Button, Card, Center, Group, Image, Loader, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconArrowBackUp, IconHistory, IconPencil, IconSearch } from '@tabler/icons-react';
import { aBolivares } from '@/app/constants/facturacion';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import { useAuth } from '@/hooks/useAuth';
import { useEsTelefono } from '@/app/components/ui/modalMovil';
import { getProductImages, PLACEHOLDER_IMG } from '@/app/components/landing/productUtils';

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const bs = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NOMBRE_CAMPO = { precio7: 'P7 (Detal)', precio6: 'P6 (Mayor)' };
const fmtFecha = (v) => new Date(v).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' });

async function enviar(url, cuerpo) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const datos = await res.json().catch(() => null);
    if (!res.ok) throw new Error(datos?.error || 'No se pudo completar');
    return datos;
}

function Precio({ etiqueta, detalle, valor, color }) {
    return (
        <Box p={6} style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)', minWidth: 0 }}>
            <Text fz={10} c="dimmed" fw={800} tt="uppercase" lh={1.2}>{etiqueta}</Text>
            <Text fw={800} size="md" c={valor === null ? 'dimmed' : color} lh={1.3}>{valor === null ? '—' : valor}</Text>
            {detalle && <Text fz={10} c="dimmed" lh={1.2}>{detalle}</Text>}
        </Box>
    );
}

// Consultor rápido de precios: escribes el producto y salen existencia y todos los precios (P7, P6 en dólares; P4, P5 en bolívares a la tasa del día).
// Solo las administradoras autorizadas (Jolexi y Joalex) ven el lápiz para cambiar precios: pide confirmación, deja historial y se puede deshacer.
export default function ConsultorPrecios({ opened, onClose }) {
    const [busqueda, setBusqueda] = useState('');
    const [q] = useDebouncedValue(busqueda.trim(), 300);
    const { tasa } = useTasaBcv();
    const { esVendedor } = useAuth();
    const telefono = useEsTelefono();
    const queryClient = useQueryClient();
    const [editando, setEditando] = useState(null); // { p, p7, p6 }
    const [confirmando, setConfirmando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [verHistorial, setVerHistorial] = useState(false);
    const [foto, setFoto] = useState(null); // { nombre, imagenes } para ver la imagen grande

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: ['consultor-precios', q], enabled: opened, placeholderData: keepPreviousData, staleTime: 30_000,
        queryFn: async () => {
            const res = await fetch(`/api/precios/consulta?q=${encodeURIComponent(q)}`);
            const cuerpo = await res.json().catch(() => null);
            if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo consultar');
            return cuerpo;
        },
    });
    const puedeCambiar = Boolean(data?.puedeCambiarPrecios);
    const { data: historial, isFetching: cargandoHistorial } = useQuery({
        queryKey: ['consultor-historial'], enabled: opened && puedeCambiar && verHistorial, staleTime: 0,
        queryFn: async () => {
            const r = await fetch('/api/precios/cambiar');
            const c = await r.json().catch(() => null);
            if (!r.ok) throw new Error(c?.error || 'No se pudo cargar el historial');
            return c;
        },
    });
    const refrescar = () => {
        queryClient.invalidateQueries({ queryKey: ['consultor-precios'] });
        queryClient.invalidateQueries({ queryKey: ['consultor-historial'] });
    };

    const enBs = (v) => (v === null || v === undefined || !(tasa > 0) ? null : `Bs ${bs.format(aBolivares(Number(v), tasa))}`);
    const enUsd = (v) => (v === null || v === undefined ? null : `$${usd.format(v)}`);

    // Deshacer: devuelve el precio anterior (solo si nadie lo movió después)
    const revertir = async (ids) => {
        try {
            for (const id of ids) await enviar('/api/precios/cambiar', { accion: 'REVERTIR', cambioId: id });
            notifications.show({ color: 'teal', title: 'Cambio revertido', message: 'El precio volvió a como estaba.' });
            refrescar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo revertir', message: e.message });
        }
    };
    const confirmarRevertir = (c) => {
        if (window.confirm(`¿Revertir el cambio de ${c.producto}? El ${NOMBRE_CAMPO[c.campo]} vuelve de $${c.nuevo} a $${c.anterior ?? 0}.`)) revertir([c.id]);
    };

    // Cambios del formulario respecto de lo guardado
    const cambios = editando
        ? [
            { campo: 'precio7', anterior: editando.p.precio7Guardado, nuevo: Number(editando.p7) || 0 },
            { campo: 'precio6', anterior: editando.p.precio6Guardado, nuevo: Number(editando.p6) || 0 },
        ].filter((c) => c.nuevo > 0 && Math.abs(c.nuevo - c.anterior) > 0.0004)
        : [];
    const avisos = [];
    for (const c of cambios) {
        if (c.anterior > 0 && Math.abs(c.nuevo - c.anterior) / c.anterior > 0.3) {
            avisos.push(`El ${NOMBRE_CAMPO[c.campo]} cambia ${(((c.nuevo - c.anterior) / c.anterior) * 100).toFixed(0)} %: es un cambio grande, revísalo.`);
        }
    }
    if (editando && Number(editando.p7) > 0 && Number(editando.p6) > Number(editando.p7)) avisos.push('El P6 (Mayor) quedaría más alto que el P7 (Detal): normalmente es al revés.');

    const guardar = async () => {
        setGuardando(true);
        try {
            const r = await enviar('/api/precios/cambiar', {
                productoId: editando.p.id, precio7: editando.p7, precio6: editando.p6,
                anteriores: { precio7: editando.p.precio7Guardado, precio6: editando.p.precio6Guardado },
            });
            const ids = r.cambios.map((c) => c.id);
            const idNotif = `precio-${ids.join('-')}`;
            notifications.show({
                id: idNotif, color: 'green', autoClose: 25000, withCloseButton: true, title: 'Precio cambiado',
                message: (
                    <Stack gap={6}>
                        <Text size="sm">{editando.p.nombre}: {r.cambios.map((c) => `${NOMBRE_CAMPO[c.campo]} $${c.anterior} → $${c.nuevo}`).join(' · ')}</Text>
                        <Button size="compact-sm" variant="light" color="orange" leftSection={<IconArrowBackUp size={14} />} onClick={() => { notifications.hide(idNotif); revertir(ids); }}>¿Fue un error? Deshacer</Button>
                    </Stack>
                ),
            });
            setConfirmando(false);
            setEditando(null);
            refrescar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se cambió el precio', message: e.message });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} fullScreen={telefono} size="xl" centered title={<Text fw={800}>Consultor de precios{tasa ? ` · BCV ${tasa} Bs/$` : ''}</Text>}>
            <Stack gap="sm">
                <TextInput data-autofocus size="md" placeholder="Escribe el nombre o el código del producto…" leftSection={<IconSearch size={18} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)} rightSection={isFetching ? <Loader size={16} /> : null} />
                {puedeCambiar && (
                    <Group justify="space-between" gap="xs">
                        <Text size="xs" c="dimmed">Puedes cambiar precios (lápiz): se pide confirmación y todo queda en el historial para revertirlo.</Text>
                        <Button size="compact-sm" variant={verHistorial ? 'filled' : 'light'} color="gray" leftSection={<IconHistory size={14} />} onClick={() => setVerHistorial((v) => !v)}>Cambios recientes</Button>
                    </Group>
                )}
                {puedeCambiar && verHistorial && (
                    <Card withBorder radius="md" p="sm" bg="gray.0">
                        {cargandoHistorial && !historial ? <Loader size="sm" /> : !historial?.cambios?.length ? <Text size="sm" c="dimmed">Todavía no se ha cambiado ningún precio desde aquí.</Text> : (
                            <Stack gap={6}>
                                {historial.cambios.map((c) => (
                                    <Group key={c.id} justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                                        <Box style={{ minWidth: 0 }}>
                                            <Text size="sm" fw={600} lineClamp={1}>{c.producto}</Text>
                                            <Text size="xs" c="dimmed">{NOMBRE_CAMPO[c.campo]}: ${c.anterior ?? 0} → ${c.nuevo} · {c.por} · {fmtFecha(c.cuando)}{c.esReversion ? ' · reversión' : ''}{c.revertido ? ' · revertido' : ''}</Text>
                                        </Box>
                                        {c.revertible && <Button size="compact-xs" variant="light" color="orange" leftSection={<IconArrowBackUp size={12} />} onClick={() => confirmarRevertir(c)}>Revertir</Button>}
                                    </Group>
                                ))}
                            </Stack>
                        )}
                    </Card>
                )}
                {error && <Alert color="red">{error.message}</Alert>}
                {isLoading ? <Center py="xl"><Loader /></Center> : !data?.productos?.length ? <Center py="xl"><Text c="dimmed">No hay productos con ese nombre.</Text></Center> : (
                    <Stack gap="xs">
                        {data.productos.map((p) => (
                            <Card key={p.id} withBorder radius="md" p="sm">
                                <Group justify="space-between" wrap="nowrap" align="flex-start" mb={6}>
                                    <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                                        {/* miniatura: al tocarla se ve la imagen grande */}
                                        <UnstyledButton aria-label={`Ver imagen de ${p.nombre}`} onClick={() => setFoto({ nombre: p.nombre, imagenes: getProductImages({ imagen: p.imagen, grupoEquivalencia: p.grupoEquivalencia, marca: { imagen: p.marcaImagen } }) })} style={{ flexShrink: 0 }}>
                                            <Avatar src={getProductImages({ imagen: p.imagen, grupoEquivalencia: p.grupoEquivalencia, marca: { imagen: p.marcaImagen } })[0].src} size={56} radius="md" bg="gray.0" imageProps={{ style: { objectFit: 'contain' }, loading: 'lazy' }}>
                                                <img src={PLACEHOLDER_IMG} alt="" width={56} />
                                            </Avatar>
                                        </UnstyledButton>
                                        <Box style={{ minWidth: 0 }}>
                                            <Text fw={700} size="sm" lineClamp={2}>{p.nombre}</Text>
                                            <Text size="xs" c="dimmed">{[p.codigo, p.marca, p.presentacion].filter(Boolean).join(' · ')}</Text>
                                        </Box>
                                    </Group>
                                    <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                                        {p.stock <= 0 ? <Badge color="red" variant="light">Agotado</Badge> : <Badge color={p.bajo ? 'orange' : 'teal'} variant="light">{p.stock}{p.bajo ? ' · bajo' : ''}</Badge>}
                                        {puedeCambiar && (
                                            <Tooltip label="Cambiar precios">
                                                <ActionIcon variant="light" color="blue" aria-label="Cambiar precios" onClick={() => setEditando({ p, p7: p.precio7Guardado, p6: p.precio6Guardado })}><IconPencil size={16} /></ActionIcon>
                                            </Tooltip>
                                        )}
                                    </Group>
                                </Group>
                                <SimpleGrid cols={{ base: 2, sm: esVendedor ? 4 : 5 }} spacing={6}>
                                    <Precio etiqueta="P7 · Detal" detalle={p.descuento > 0 ? `oferta -${p.descuento}%` : 'dólares'} valor={enUsd(p.precio7)} color="navy.9" />
                                    <Precio etiqueta="P6 · Mayor" detalle="dólares" valor={enUsd(p.precio6)} color="navy.9" />
                                    <Precio etiqueta="P4 · Detal Bs" detalle="P7 en bolívares" valor={enBs(p.precio7)} color="teal.8" />
                                    <Precio etiqueta="P5 · Mayor Bs" detalle="P6 en bolívares" valor={enBs(p.precio6)} color="teal.8" />
                                    {!esVendedor && <Precio etiqueta="P1" detalle="35 % sobre costo, Bs" valor={enBs(p.precio1)} color="grape.8" />}
                                </SimpleGrid>
                            </Card>
                        ))}
                        {data.hayMas && <Text size="xs" c="dimmed" ta="center">Se muestran los primeros 30: escribe más del nombre para afinar.</Text>}
                    </Stack>
                )}
            </Stack>

            {foto && (
                <Modal opened onClose={() => setFoto(null)} zIndex={600} centered size="lg" fullScreen={telefono} title={<Text fw={700} size="sm" lineClamp={2}>{foto.nombre}</Text>}>
                    <Stack gap="sm">
                        {foto.imagenes.map((im) => (
                            <Box key={im.src}>
                                <Image src={im.src} alt={foto.nombre} fit="contain" mah={telefono ? '70vh' : 520} fallbackSrc={PLACEHOLDER_IMG} />
                                {foto.imagenes.length > 1 && <Text size="xs" c="dimmed" ta="center" mt={4}>{im.label}</Text>}
                            </Box>
                        ))}
                        {foto.imagenes[0]?.isPlaceholder && <Text size="sm" c="dimmed" ta="center">Este producto todavía no tiene foto.</Text>}
                    </Stack>
                </Modal>
            )}
            {editando && (
                <Modal opened onClose={() => { setEditando(null); setConfirmando(false); }} zIndex={400} centered size="md" fullScreen={telefono} title={<Text fw={800}>Cambiar precios</Text>}>
                    <Stack gap="sm">
                        <Box>
                            <Text fw={700}>{editando.p.nombre}</Text>
                            <Text size="xs" c="dimmed">{[editando.p.codigo, editando.p.marca].filter(Boolean).join(' · ')}</Text>
                        </Box>
                        <NumberInput label="P7 · Detal (USD)" decimalScale={3} min={0} allowNegative={false} hideControls data-autofocus value={editando.p7}
                            onChange={(v) => setEditando((e) => ({ ...e, p7: v }))} description={enBs(Number(editando.p7) || 0) && Number(editando.p7) > 0 ? `P4 quedaría en ${enBs(Number(editando.p7))}` : undefined} />
                        <NumberInput label="P6 · Mayor (USD)" decimalScale={3} min={0} allowNegative={false} hideControls value={editando.p6}
                            onChange={(v) => setEditando((e) => ({ ...e, p6: v }))} description={enBs(Number(editando.p6) || 0) && Number(editando.p6) > 0 ? `P5 quedaría en ${enBs(Number(editando.p6))}` : undefined} />
                        <Text size="xs" c="dimmed">P4 y P5 salen de estos dos en bolívares a la tasa del día. El P1 sale del costo y no se cambia aquí.</Text>
                        {avisos.map((a) => <Alert key={a} color="orange" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">{a}</Alert>)}
                        <Group justify="flex-end">
                            <Button variant="subtle" color="gray" onClick={() => setEditando(null)}>Cancelar</Button>
                            <Button disabled={!cambios.length} onClick={() => setConfirmando(true)}>Revisar el cambio</Button>
                        </Group>
                    </Stack>
                </Modal>
            )}
            {editando && confirmando && (
                <Modal opened onClose={() => setConfirmando(false)} zIndex={500} centered size="md" title={<Text fw={800}>Confirma el cambio de precio</Text>}>
                    <Stack gap="sm">
                        <Text fw={700}>{editando.p.nombre}</Text>
                        {cambios.map((c) => (
                            <Box key={c.campo} p="xs" style={{ borderRadius: 8, background: 'var(--mantine-color-gray-0)' }}>
                                <Text size="sm" fw={700}>{NOMBRE_CAMPO[c.campo]}</Text>
                                <Text size="lg" fw={800}>
                                    ${usd.format(c.anterior)} → ${usd.format(c.nuevo)}{' '}
                                    <Text span size="sm" c={c.nuevo >= c.anterior ? 'teal.8' : 'red.7'}>({c.anterior > 0 ? `${c.nuevo >= c.anterior ? '+' : ''}${(((c.nuevo - c.anterior) / c.anterior) * 100).toFixed(1)} %` : 'nuevo'})</Text>
                                </Text>
                                {enBs(c.nuevo) && <Text size="xs" c="dimmed">{c.campo === 'precio7' ? 'P4' : 'P5'}: {enBs(c.anterior) || '—'} → {enBs(c.nuevo)}</Text>}
                            </Box>
                        ))}
                        {avisos.map((a) => <Alert key={a} color="orange" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">{a}</Alert>)}
                        <Text size="xs" c="dimmed">Aplica a las ventas nuevas desde ya (las facturas hechas no cambian). Queda en el historial y podrás deshacerlo.</Text>
                        <Group justify="flex-end">
                            <Button variant="subtle" color="gray" onClick={() => setConfirmando(false)} disabled={guardando}>Volver</Button>
                            <Button color="green.8" loading={guardando} onClick={guardar}>Sí, cambiar el precio</Button>
                        </Group>
                    </Stack>
                </Modal>
            )}
        </Modal>
    );
}
