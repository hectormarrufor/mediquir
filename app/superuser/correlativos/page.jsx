'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Box, Button, Group, Loader, Modal, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconChevronLeft, IconPencil } from '@tabler/icons-react';

const pedir = async (url, opciones) => {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
};

// Numeración: el número que sigue en cada serie de documentos (facturas, notas, control, recibos...) y su cambio. Solo administradores y el usuario 1.
export default function CorrelativosPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({ queryKey: ['correlativos-panel'], queryFn: () => pedir('/api/correlativos/panel'), retry: false });
    const [editando, setEditando] = useState(null);
    const [valor, setValor] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [fallo, setFallo] = useState(null);

    const abrir = (s) => { setEditando(s); setValor(''); setFallo(null); };
    const guardar = async () => {
        setGuardando(true); setFallo(null);
        try {
            await pedir('/api/correlativos/panel', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave: editando.clave, siguiente: valor }) });
            notifications.show({ color: 'teal', message: `${editando.etiqueta}: el próximo número se cambió` });
            // Los demás lugares que muestran los correlativos (POS, recibos, notas) los vuelven a pedir
            ['correlativos-panel', 'correlativos-pos', 'numeracion-pos', 'numeracion', 'recibos'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
            setEditando(null);
        } catch (e) { setFallo(e.message); } finally { setGuardando(false); }
    };

    return (
        <Box px={{ base: 'xs', sm: 'md' }} py="sm" maw={1000} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser')}>Panel</Button>
            <Title order={2} c="white" mb={4}>Numeración</Title>
            <Text size="sm" c="gray.4" mb="sm">El número con el que sale el próximo documento de cada serie. Cámbialo solo si vas a usar otro talonario o forma libre: no puede quedar por debajo de uno ya usado.</Text>
            <Paper withBorder radius="md" bg="white" p="xs">
                {isLoading ? <Group justify="center" py="xl"><Loader /></Group> : error ? <Text c="red" ta="center" py="xl">{error.message}</Text> : (
                    <Table.ScrollContainer minWidth={620}>
                        <Table verticalSpacing="sm" highlightOnHover>
                            <Table.Thead><Table.Tr><Table.Th>Serie</Table.Th><Table.Th>Próximo</Table.Th><Table.Th>Último usado</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {data.series.map((s) => (
                                    <Table.Tr key={s.clave}>
                                        <Table.Td>
                                            <Group gap={8}><Text fw={700} size="sm">{s.etiqueta}</Text>{!s.configurado && <Badge size="xs" color="orange">Falta configurar</Badge>}</Group>
                                            <Text size="xs" c="dimmed">{s.descripcion}</Text>
                                        </Table.Td>
                                        <Table.Td fw={800}>{s.configurado ? s.siguiente : '—'}</Table.Td>
                                        <Table.Td c="dimmed">{s.ultimoUsado || '—'}</Table.Td>
                                        <Table.Td ta="right"><Button size="compact-sm" variant="light" leftSection={<IconPencil size={14} />} onClick={() => abrir(s)}>{s.configurado ? 'Cambiar' : 'Configurar'}</Button></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Paper>

            <Modal opened={Boolean(editando)} onClose={() => setEditando(null)} centered title={<Text fw={800}>{editando?.etiqueta}</Text>}>
                {editando && (
                    <Stack gap="sm">
                        <Text size="sm">Ahora sigue: <b>{editando.configurado ? editando.siguiente : 'sin configurar'}</b>{editando.ultimoUsado && <Text span size="xs" c="dimmed"> · último usado: {editando.ultimoUsado}</Text>}</Text>
                        <TextInput label="Número del próximo documento" placeholder={editando.ejemplo} value={valor} onChange={(e) => setValor(e.currentTarget.value)} autoComplete="off" data-autofocus
                            description="Escribe solo el número; el prefijo y los ceros se ponen solos." />
                        {fallo && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{fallo}</Alert>}
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setEditando(null)}>Cancelar</Button>
                            <Button onClick={guardar} loading={guardando} disabled={!valor.trim()}>Guardar</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </Box>
    );
}
