'use client';

import React, { useState } from 'react';
import { Alert, Badge, Box, Button, Checkbox, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconDeviceFloppy, IconFileInvoice, IconTruckDelivery, IconUserCheck } from '@tabler/icons-react';
import FirmaPad from '@/app/components/ui/FirmaPad';

// Entrega de la mercancía al chofer o agencia: permite elegir un chofer frecuente guardado en Mediquir o escribir uno nuevo
// (que queda guardado automáticamente para próximas entregas), su firma y la confirmación de entrega de la factura impresa.
export default function EntregaChoferForm({ numeroDocumento, empresaInicial = '', cargando, onConfirmar, children }) {
    const queryClient = useQueryClient();
    const [choferId, setChoferId] = useState(null);
    const [v, setV] = useState({ choferNombre: '', choferCedula: '', choferEmpresa: empresaInicial || '', facturaEntregada: false });
    const [firma, setFirma] = useState(null);
    const [errores, setErrores] = useState({});
    const [guardandoChofer, setGuardandoChofer] = useState(false);

    const { data: dataChoferes } = useQuery({
        queryKey: ['choferes-frecuentes'],
        queryFn: async () => {
            const r = await fetch('/api/ventas/choferes');
            const c = await r.json().catch(() => null);
            return r.ok ? c : { choferes: [] };
        },
    });
    const listaChoferes = dataChoferes?.choferes || [];

    const set = (campo) => (e) => {
        const val = e.currentTarget.value;
        setV((p) => ({ ...p, [campo]: val }));
    };

    const seleccionarChofer = (idStr) => {
        setChoferId(idStr);
        if (!idStr) return;
        const ch = listaChoferes.find((c) => String(c.id) === String(idStr));
        if (ch) {
            setV((p) => ({
                ...p,
                choferNombre: ch.nombre || '',
                choferCedula: ch.cedula || '',
                choferEmpresa: ch.empresa || p.choferEmpresa || '',
            }));
            setErrores((e) => ({ ...e, choferNombre: null, choferCedula: null, choferEmpresa: null }));
        }
    };

    const guardarChoferActual = async () => {
        if (v.choferNombre.trim().length < 3 || v.choferCedula.trim().length < 5 || v.choferEmpresa.trim().length < 2) {
            notifications.show({ color: 'orange', title: 'Faltan datos del chofer', message: 'Completa nombre, cédula y empresa antes de guardarlo en la lista.' });
            return;
        }
        setGuardandoChofer(true);
        try {
            const r = await fetch('/api/ventas/choferes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: v.choferNombre,
                    cedula: v.choferCedula,
                    empresa: v.choferEmpresa,
                }),
            });
            const c = await r.json().catch(() => null);
            if (!r.ok) throw new Error(c?.error || 'No se pudo guardar el chofer');
            await queryClient.invalidateQueries({ queryKey: ['choferes-frecuentes'] });
            if (c?.chofer?.id) setChoferId(String(c.chofer.id));
            notifications.show({ color: 'teal', title: 'Chofer guardado', message: `${v.choferNombre} quedó registrado en la lista de choferes habituales.` });
        } catch (e) {
            notifications.show({ color: 'red', title: 'Error', message: e.message });
        } finally {
            setGuardandoChofer(false);
        }
    };

    const enviar = () => {
        const err = {};
        if (v.choferNombre.trim().length < 3) err.choferNombre = 'Escribe el nombre completo del chofer';
        if (v.choferCedula.trim().length < 5) err.choferCedula = 'Escribe la cédula del chofer';
        if (v.choferEmpresa.trim().length < 2) err.choferEmpresa = 'Escribe la empresa o agencia para la que trabaja';
        if (!firma) err.firma = 'Falta la firma del chofer';
        if (!v.facturaEntregada) err.facturaEntregada = 'Confirma que le entregas la factura';
        setErrores(err);
        if (Object.keys(err).length) return;
        onConfirmar({ ...v, firma });
    };

    return (
        <Stack gap="sm">
            <Alert color="grape" variant="light" icon={<IconTruckDelivery size={18} />} p="xs">
                Vas a entregar el pedido <b>{numeroDocumento}</b>. Selecciona un chofer habitual o registra sus datos (quedarán guardados para próximas entregas junto con su firma).
            </Alert>

            <Paper withBorder radius="md" p="xs" bg="gray.0">
                <Group justify="space-between" mb={4} wrap="wrap" gap={4}>
                    <Group gap={6}>
                        <IconUserCheck size={16} color="var(--mantine-color-grape-7)" />
                        <Text size="xs" fw={800} c="navy.9">Choferes que retiran normalmente en Mediquir</Text>
                    </Group>
                    <Badge size="xs" variant="light" color="grape">{listaChoferes.length} registrado(s)</Badge>
                </Group>
                <Select
                    placeholder={listaChoferes.length ? 'Buscar chofer por nombre, cédula o empresa…' : 'Aún no hay choferes guardados: llena los datos abajo'}
                    searchable
                    clearable
                    value={choferId}
                    onChange={seleccionarChofer}
                    data={listaChoferes.map((c) => ({
                        value: String(c.id),
                        label: `${c.nombre} · C.I. ${c.cedula} · ${c.empresa}`,
                    }))}
                    nothingFoundMessage="No está en la lista: escríbelo abajo y se guardará automáticamente"
                />
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                <TextInput label="Nombre del chofer" withAsterisk placeholder="Nombre y apellido" value={v.choferNombre} onChange={set('choferNombre')} error={errores.choferNombre} maxLength={120} autoComplete="off" />
                <TextInput label="Cédula del chofer" withAsterisk placeholder="V-12345678" value={v.choferCedula} onChange={set('choferCedula')} error={errores.choferCedula} maxLength={30} autoComplete="off" />
            </SimpleGrid>
            <Group align="flex-end" gap="xs" wrap="wrap">
                <Box style={{ flex: '1 1 220px' }}>
                    <TextInput label="Empresa o agencia para la que trabaja" withAsterisk placeholder="Ej: MRW, Zoom, Tealca, transporte del cliente" value={v.choferEmpresa} onChange={set('choferEmpresa')} error={errores.choferEmpresa} maxLength={120} autoComplete="off" />
                </Box>
                <Button
                    variant="light"
                    color="grape"
                    size="sm"
                    loading={guardandoChofer}
                    leftSection={<IconDeviceFloppy size={16} />}
                    onClick={guardarChoferActual}
                >
                    Guardar chofer frecuente
                </Button>
            </Group>

            {children}

            <Text size="sm" fw={600}>Firma del chofer *</Text>
            <FirmaPad onChange={setFirma} error={errores.firma} />
            <Checkbox
                color="grape" size="md" error={errores.facturaEntregada}
                checked={v.facturaEntregada} onChange={(e) => { const checked = e.currentTarget.checked; setV((p) => ({ ...p, facturaEntregada: checked })); }}
                label={<Text size="sm" fw={600}><IconFileInvoice size={16} style={{ verticalAlign: 'middle' }} /> ¿Estás seguro de que le estás entregando al chofer la factura impresa ({numeroDocumento})? Marca la casilla para confirmarlo.</Text>}
            />
            <Button fullWidth size="md" color="grape" loading={cargando} onClick={enviar} leftSection={<IconTruckDelivery size={18} />}>
                Entregar mercancía al chofer y marcar como despachado
            </Button>
        </Stack>
    );
}
