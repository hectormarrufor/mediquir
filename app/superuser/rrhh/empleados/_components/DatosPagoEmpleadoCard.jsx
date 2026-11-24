'use client';

import React, { useMemo, useState } from 'react';
import {
    ActionIcon, Badge, Box, Button, Card, Group, Modal, Paper, SegmentedControl,
    Select, SimpleGrid, Stack, Switch, Text, TextInput, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconBuildingBank, IconCopy, IconDeviceMobile, IconEdit, IconPlus, IconStar, IconStarFilled, IconTrash,
} from '@tabler/icons-react';
import { BANCOS_VENEZUELA } from '@/app/constants/bancosVenezuela';
import {
    TIPOS_CUENTA_BANCARIA, TIPOS_DATO_PAGO, sanitizarDatosPago, textoParaCopiarDatoPago,
} from '@/app/constants/datosPagoEmpleado';

function crearBorrador(tipo, empleado, listaActual) {
    const nombreCompleto = `${empleado?.nombre || ''} ${empleado?.apellido || ''}`.trim();
    return {
        id: '',
        tipo,
        banco: '',
        tipoCuenta: 'Corriente',
        numeroCuenta: '',
        telefono: tipo === 'PAGO_MOVIL' ? (empleado?.telefono || '') : '',
        cedula: empleado?.cedula || '',
        titular: nombreCompleto,
        notas: '',
        principal: !listaActual?.length,
    };
}

/**
 * Muestra y gestiona las cuentas bancarias y pagos móviles de un empleado.
 * - Con `empleadoId`: guarda directo en la ficha vía PATCH /api/rrhh/empleados/[id].
 * - Con `onChange` (sin `empleadoId`): modo controlado para usar dentro de EmpleadoForm.
 */
export default function DatosPagoEmpleadoCard({
    empleado,
    empleadoId = null,
    datosPago = [],
    onActualizado,
    onChange,
}) {
    const lista = useMemo(() => (Array.isArray(datosPago) ? datosPago : []), [datosPago]);
    const [abierto, setAbierto] = useState(false);
    const [editandoId, setEditandoId] = useState(null);
    const [borrador, setBorrador] = useState(() => crearBorrador('CUENTA_BANCARIA', empleado, lista));
    const [guardando, setGuardando] = useState(false);

    const nombreEmpleado = `${empleado?.nombre || ''} ${empleado?.apellido || ''}`.trim();

    const opcionesBancos = useMemo(() => {
        if (borrador.banco && !BANCOS_VENEZUELA.includes(borrador.banco)) {
            return [borrador.banco, ...BANCOS_VENEZUELA];
        }
        return BANCOS_VENEZUELA;
    }, [borrador.banco]);

    const persistir = async (nuevaLista, mensajeOk) => {
        const limpia = sanitizarDatosPago(nuevaLista);
        if (onChange && !empleadoId) {
            onChange(limpia);
            return true;
        }
        setGuardando(true);
        try {
            const res = await fetch(`/api/rrhh/empleados/${empleadoId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ datosPago: limpia }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || 'No se pudieron guardar los datos de pago');
            onActualizado?.(data.datosPago || limpia);
            if (mensajeOk) notifications.show({ color: 'teal', message: mensajeOk });
            return true;
        } catch (err) {
            notifications.show({ color: 'red', title: 'Error', message: err.message });
            return false;
        } finally {
            setGuardando(false);
        }
    };

    const abrirNuevo = (tipo = 'CUENTA_BANCARIA') => {
        setEditandoId(null);
        setBorrador(crearBorrador(tipo, empleado, lista));
        setAbierto(true);
    };

    const abrirEditar = (item) => {
        setEditandoId(item.id);
        setBorrador({
            id: item.id,
            tipo: item.tipo,
            banco: item.banco || '',
            tipoCuenta: item.tipoCuenta || 'Corriente',
            numeroCuenta: item.numeroCuenta || '',
            telefono: item.telefono || '',
            cedula: item.cedula || empleado?.cedula || '',
            titular: item.titular || nombreEmpleado,
            notas: item.notas || '',
            principal: Boolean(item.principal),
        });
        setAbierto(true);
    };

    const guardarModal = async () => {
        if (!borrador.banco) {
            notifications.show({ color: 'orange', message: 'Selecciona un banco' });
            return;
        }
        if (borrador.tipo === 'CUENTA_BANCARIA' && !borrador.numeroCuenta.trim()) {
            notifications.show({ color: 'orange', message: 'Escribe el número de cuenta' });
            return;
        }
        if (borrador.tipo === 'PAGO_MOVIL' && !borrador.telefono.trim()) {
            notifications.show({ color: 'orange', message: 'Escribe el número de teléfono del pago móvil' });
            return;
        }

        let siguiente;
        if (editandoId) {
            siguiente = lista.map((x) => {
                if (x.id === editandoId) return { ...borrador, id: editandoId };
                return borrador.principal ? { ...x, principal: false } : x;
            });
        } else {
            const base = borrador.principal ? lista.map((x) => ({ ...x, principal: false })) : lista;
            siguiente = [...base, borrador];
        }

        const ok = await persistir(
            siguiente,
            editandoId ? 'Datos de pago actualizados' : 'Dato de pago agregado'
        );
        if (ok) setAbierto(false);
    };

    const eliminar = async (id) => {
        const siguiente = lista.filter((x) => x.id !== id);
        await persistir(siguiente, 'Dato de pago eliminado');
    };

    const marcarPrincipal = async (id) => {
        const siguiente = lista.map((x) => ({ ...x, principal: x.id === id }));
        await persistir(siguiente, 'Actualizado como método principal');
    };

    const copiar = async (item) => {
        const texto = textoParaCopiarDatoPago(item, nombreEmpleado, empleado?.cedula);
        try {
            await navigator.clipboard.writeText(texto);
            notifications.show({ color: 'teal', message: 'Datos copiados al portapapeles' });
        } catch {
            notifications.show({ color: 'orange', message: 'No se pudo copiar automáticamente' });
        }
    };

    return (
        <>
            <Card withBorder radius="md" p="md" shadow="sm">
                <Group justify="space-between" align="center" mb="sm" wrap="wrap" gap="xs">
                    <Group gap="xs">
                        <ThemeIcon variant="light" color="blue" size="md" radius="md">
                            <IconBuildingBank size={18} />
                        </ThemeIcon>
                        <div>
                            <Title order={4} lh={1.2}>Cuentas bancarias y Pagos móviles</Title>
                            <Text size="xs" c="dimmed">Datos para transferir nómina y beneficios al empleado</Text>
                        </div>
                    </Group>
                    <Group gap="xs">
                        <Button size="xs" variant="light" color="blue" leftSection={<IconPlus size={14} />} onClick={() => abrirNuevo('CUENTA_BANCARIA')}>
                            Cuenta bancaria
                        </Button>
                        <Button size="xs" variant="light" color="teal" leftSection={<IconPlus size={14} />} onClick={() => abrirNuevo('PAGO_MOVIL')}>
                            Pago móvil
                        </Button>
                    </Group>
                </Group>

                {!lista.length ? (
                    <Paper withBorder p="md" radius="md" bg="gray.0">
                        <Text size="sm" c="dimmed" ta="center">
                            Este empleado aún no tiene cuentas bancarias ni pagos móviles registrados.
                        </Text>
                    </Paper>
                ) : (
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        {lista.map((item) => {
                            const esPm = item.tipo === 'PAGO_MOVIL';
                            return (
                                <Paper
                                    key={item.id}
                                    withBorder
                                    p="sm"
                                    radius="md"
                                    style={{
                                        borderLeft: `4px solid var(--mantine-color-${esPm ? 'teal' : 'blue'}-6)`,
                                    }}
                                >
                                    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs" mb={6}>
                                        <Group gap={6} wrap="wrap">
                                            <Badge
                                                size="sm"
                                                variant="light"
                                                color={esPm ? 'teal' : 'blue'}
                                                leftSection={esPm ? <IconDeviceMobile size={12} /> : <IconBuildingBank size={12} />}
                                            >
                                                {TIPOS_DATO_PAGO[item.tipo]}
                                            </Badge>
                                            {item.principal && (
                                                <Badge size="sm" variant="filled" color="yellow" c="dark">
                                                    Principal
                                                </Badge>
                                            )}
                                        </Group>
                                        <Group gap={2} wrap="nowrap">
                                            <Tooltip label="Copiar datos para pagar">
                                                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => copiar(item)}>
                                                    <IconCopy size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            {!item.principal && (
                                                <Tooltip label="Marcar como principal">
                                                    <ActionIcon variant="subtle" color="yellow" size="sm" loading={guardando} onClick={() => marcarPrincipal(item.id)}>
                                                        <IconStar size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                            {item.principal && (
                                                <Tooltip label="Principal">
                                                    <ActionIcon variant="transparent" color="yellow" size="sm" style={{ cursor: 'default' }}>
                                                        <IconStarFilled size={15} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                            <Tooltip label="Editar">
                                                <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => abrirEditar(item)}>
                                                    <IconEdit size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                            <Tooltip label="Eliminar">
                                                <ActionIcon variant="subtle" color="red" size="sm" loading={guardando} onClick={() => eliminar(item.id)}>
                                                    <IconTrash size={15} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </Group>

                                    <Text fw={700} size="sm" c="navy.9" lineClamp={1}>{item.banco}</Text>

                                    {esPm ? (
                                        <Stack gap={2} mt={4}>
                                            <Text size="sm" fw={600} ff="monospace">{item.telefono}</Text>
                                            <Text size="xs" c="dimmed">
                                                C.I.: {item.cedula || empleado?.cedula || '—'}
                                                {item.titular && item.titular !== nombreEmpleado ? ` · Titular: ${item.titular}` : ''}
                                            </Text>
                                        </Stack>
                                    ) : (
                                        <Stack gap={2} mt={4}>
                                            <Text size="sm" fw={600} ff="monospace" style={{ wordBreak: 'break-all' }}>
                                                {item.numeroCuenta}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {item.tipoCuenta || 'Corriente'}
                                                {item.cedula ? ` · C.I. ${item.cedula}` : ''}
                                                {item.titular && item.titular !== nombreEmpleado ? ` · Titular: ${item.titular}` : ''}
                                            </Text>
                                        </Stack>
                                    )}

                                    {item.notas && (
                                        <Text size="xs" c="dimmed" fs="italic" mt={4} lineClamp={2}>{item.notas}</Text>
                                    )}
                                </Paper>
                            );
                        })}
                    </SimpleGrid>
                )}
            </Card>

            <Modal
                opened={abierto}
                onClose={() => setAbierto(false)}
                title={<Text fw={800}>{editandoId ? 'Editar dato de pago' : 'Agregar cuenta bancaria o pago móvil'}</Text>}
                centered
            >
                <Stack gap="sm">
                    <SegmentedControl
                        fullWidth
                        value={borrador.tipo}
                        onChange={(v) => setBorrador((b) => ({
                            ...b,
                            tipo: v,
                            telefono: v === 'PAGO_MOVIL' && !b.telefono ? (empleado?.telefono || '') : b.telefono,
                        }))}
                        data={[
                            { value: 'CUENTA_BANCARIA', label: 'Cuenta bancaria' },
                            { value: 'PAGO_MOVIL', label: 'Pago móvil' },
                        ]}
                    />

                    <Select
                        label="Banco"
                        withAsterisk
                        searchable
                        placeholder="Selecciona el banco"
                        data={opcionesBancos}
                        value={borrador.banco || null}
                        onChange={(v) => setBorrador((b) => ({ ...b, banco: v || '' }))}
                    />

                    {borrador.tipo === 'CUENTA_BANCARIA' ? (
                        <Group grow align="flex-start">
                            <Select
                                label="Tipo de cuenta"
                                allowDeselect={false}
                                data={TIPOS_CUENTA_BANCARIA}
                                value={borrador.tipoCuenta}
                                onChange={(v) => setBorrador((b) => ({ ...b, tipoCuenta: v || 'Corriente' }))}
                            />
                            <TextInput
                                label="Número de cuenta"
                                withAsterisk
                                placeholder="01340000000000000000"
                                maxLength={30}
                                value={borrador.numeroCuenta}
                                onChange={(e) => { const v = e.currentTarget.value; setBorrador((b) => ({ ...b, numeroCuenta: v })); }}
                            />
                        </Group>
                    ) : (
                        <TextInput
                            label="Teléfono (Pago móvil)"
                            withAsterisk
                            placeholder="Ej. 0412-1234567"
                            maxLength={25}
                            value={borrador.telefono}
                            onChange={(e) => { const v = e.currentTarget.value; setBorrador((b) => ({ ...b, telefono: v })); }}
                        />
                    )}

                    <Group grow align="flex-start">
                        <TextInput
                            label="Cédula del titular"
                            placeholder="Ej. V-12345678"
                            maxLength={25}
                            value={borrador.cedula}
                            onChange={(e) => { const v = e.currentTarget.value; setBorrador((b) => ({ ...b, cedula: v })); }}
                        />
                        <TextInput
                            label="Nombre del titular"
                            placeholder={nombreEmpleado || 'Nombre completo'}
                            maxLength={120}
                            value={borrador.titular}
                            onChange={(e) => { const v = e.currentTarget.value; setBorrador((b) => ({ ...b, titular: v })); }}
                        />
                    </Group>

                    <TextInput
                        label="Nota (opcional)"
                        placeholder="Ej. Cuenta nómina, cuenta de familiar, etc."
                        maxLength={160}
                        value={borrador.notas}
                        onChange={(e) => { const v = e.currentTarget.value; setBorrador((b) => ({ ...b, notas: v })); }}
                    />

                    <Switch
                        label="Usar como dato de pago principal"
                        checked={borrador.principal}
                        onChange={(e) => { const checked = e.currentTarget.checked; setBorrador((b) => ({ ...b, principal: checked })); }}
                    />

                    <Group justify="flex-end" mt="xs">
                        <Button variant="default" onClick={() => setAbierto(false)}>Cancelar</Button>
                        <Button loading={guardando} onClick={guardarModal}>
                            {editandoId ? 'Guardar cambios' : 'Agregar'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
