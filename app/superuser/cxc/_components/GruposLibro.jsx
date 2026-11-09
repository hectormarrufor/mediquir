'use client';

// Pestañas del libro de cobranza: «Todos», un grupo por cada Excel de la administradora (Vendedores, Maraplus, Droguesi y Grupo Farmasi…) y «Sin grupo».
// El diálogo «Administrar grupos» crea, renombra y borra grupos y agrega o quita clientes (un cliente puede estar en varios; borrar un grupo no borra a sus clientes ni sus cuentas).
import React, { useEffect, useState } from 'react';
import { ActionIcon, Badge, Box, Button, Group, Modal, MultiSelect, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconPlus, IconSettings, IconTrash } from '@tabler/icons-react';
import { dolares, pedir } from './utilidades';

export function PestanasGrupos({ libro, onAdministrar }) {
    return (
        <Group gap={6} wrap="nowrap" align="center">
            <ScrollArea type="auto" scrollbarSize={6} offsetScrollbars style={{ flex: 1, minWidth: 0 }}>
                <Group gap={6} wrap="nowrap" role="tablist" aria-label="Grupos de clientes" pb={2}>
                    {libro.pestanas.map((p) => {
                        const activa = p.clave === libro.pestana;
                        return (
                            <Tooltip key={p.clave} withArrow label={`${p.clientes} cliente(s) · deben ${dolares(p.saldo)}`}>
                                <UnstyledButton
                                    role="tab" aria-selected={activa} onClick={() => libro.setPestana(p.clave)}
                                    px={12} py={6}
                                    style={{
                                        whiteSpace: 'nowrap', borderRadius: 999, fontSize: 13, fontWeight: activa ? 800 : 600, minHeight: 34, display: 'flex', alignItems: 'center', gap: 6,
                                        background: activa ? 'var(--mantine-color-navy-9, #0b1b3d)' : '#fff', color: activa ? '#fff' : '#1a1b1e', border: `1px solid ${activa ? 'var(--mantine-color-navy-9, #0b1b3d)' : '#cfd6e2'}`,
                                    }}
                                >
                                    {p.nombre}
                                    <Badge size="xs" variant={activa ? 'white' : 'light'} color={activa ? 'navy' : 'gray'} radius="xl">{p.clientes}</Badge>
                                </UnstyledButton>
                            </Tooltip>
                        );
                    })}
                </Group>
            </ScrollArea>
            <Tooltip label="Administrar grupos: crear, renombrar y poner o quitar clientes" withArrow>
                <ActionIcon size={34} radius="xl" variant="default" onClick={onAdministrar} aria-label="Administrar grupos"><IconSettings size={18} /></ActionIcon>
            </Tooltip>
        </Group>
    );
}

export function DialogoGrupos({ abierto, onCerrar, libro, confirmar }) {
    const [elegido, setElegido] = useState(null);
    const [nuevo, setNuevo] = useState('');
    const [nombre, setNombre] = useState('');
    const [valor, setValor] = useState([]);
    const grupos = libro.gruposCobranza;
    const actual = grupos.find((g) => g.id === elegido) || grupos[0] || null;

    const clientes = useQuery({ queryKey: ['cxc-grupos'], queryFn: () => pedir('/api/finanzas/cxc/grupos'), enabled: abierto, staleTime: 60_000 });
    const opciones = (clientes.data?.clientes || []).map((c) => ({ value: String(c.id), label: c.nombre }));

    useEffect(() => { if (actual) { setNombre(actual.nombre); setValor(actual.clienteIds.map(String)); } }, [actual?.id, actual?.nombre, actual?.clienteIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    const cambiar = (nuevos) => {
        const antes = new Set(valor), ahora = new Set(nuevos);
        setValor(nuevos);
        libro.cambiarClientes(actual.id, { agregar: nuevos.filter((v) => !antes.has(v)).map(Number), quitar: valor.filter((v) => !ahora.has(v)).map(Number) });
    };
    const crear = async () => {
        const n = nuevo.trim(); if (n.length < 2) return;
        const r = await libro.crearGrupo(n);
        if (r?.id) { setNuevo(''); setElegido(r.id); }
    };
    const borrar = async () => {
        const ok = await confirmar({
            titulo: 'Borrar grupo', textoConfirmar: 'Sí, borrar el grupo',
            mensaje: <Text size="sm">Se borra el grupo <b>{actual.nombre}</b>. Sus {actual.clienteIds.length} cliente(s) y sus cuentas <b>no se tocan</b>: siguen en «Todos» (y en «Sin grupo» si no están en otro grupo).</Text>,
        });
        if (ok) { await libro.borrarGrupo(actual.id); setElegido(null); }
    };

    return (
        <Modal opened={abierto} onClose={onCerrar} size="lg" centered title={<Text fw={800}>Grupos del libro de cobranza</Text>}>
            <Stack gap="md">
                <Text size="sm" c="dimmed">Cada grupo es una pestaña. Un cliente puede estar en varios grupos. Los clientes que no estén en ninguno aparecen en «Sin grupo».</Text>

                <Group gap={6} wrap="wrap">
                    {grupos.map((g) => (
                        <Button key={g.id} size="compact-sm" radius="xl" variant={actual?.id === g.id ? 'filled' : 'default'} color="navy.9" onClick={() => setElegido(g.id)}>
                            {g.nombre} · {g.clienteIds.length}
                        </Button>
                    ))}
                </Group>

                <Group gap={6} align="flex-end" wrap="nowrap">
                    <TextInput flex={1} label="Nuevo grupo" placeholder="Ej.: Clínicas de Maracaibo" value={nuevo} onChange={(e) => setNuevo(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') crear(); }} maxLength={80} />
                    <Button leftSection={<IconPlus size={15} />} onClick={crear} disabled={nuevo.trim().length < 2}>Crear</Button>
                </Group>

                {actual ? (
                    <Box p="sm" style={{ border: '1px solid #d5dbe5', borderRadius: 10, background: '#fafbfd' }}>
                        <Stack gap="sm">
                            <Group gap={6} align="flex-end" wrap="nowrap">
                                <TextInput flex={1} label="Nombre del grupo" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} maxLength={80} onBlur={() => { const n = nombre.trim(); if (n.length >= 2 && n !== actual.nombre) libro.renombrarGrupo(actual.id, n); else setNombre(actual.nombre); }} />
                                <Tooltip label="Borrar el grupo (no borra a sus clientes)" withArrow>
                                    <ActionIcon size={36} variant="light" color="red" onClick={borrar} aria-label={`Borrar el grupo ${actual.nombre}`}><IconTrash size={18} /></ActionIcon>
                                </Tooltip>
                            </Group>
                            <MultiSelect
                                label={`Clientes de «${actual.nombre}» (${valor.length})`} placeholder="Busca un cliente para agregarlo…" searchable clearable={false}
                                data={opciones} value={valor} onChange={cambiar} maxDropdownHeight={260} nothingFoundMessage="Ningún cliente con cuentas por cobrar coincide"
                                disabled={clientes.isLoading} description="Quita uno con la ✕ de su etiqueta. Los cambios se guardan al instante."
                            />
                        </Stack>
                    </Box>
                ) : <Text size="sm" c="dimmed" ta="center" py="md">Todavía no hay grupos. Crea el primero arriba.</Text>}

                <Group justify="flex-end"><Button variant="default" onClick={onCerrar}>Listo</Button></Group>
            </Stack>
        </Modal>
    );
}
