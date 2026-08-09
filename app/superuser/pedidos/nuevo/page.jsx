'use client';

import React, { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import {
    Box, Button, Group, Title, NumberInput,
    Select, Paper, Stack, Grid, ActionIcon, Text, Divider, Switch,
    Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft, IconPlus, IconTrash, IconAlertCircle } from '@tabler/icons-react';

export default function NuevoPedido() {
    const { isCliente } = useAuth(); 
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch de Clientes y Productos
    const { data: clientes } = useQuery({
        queryKey: ['clientes'],
        queryFn: async () => (await fetch('/api/clientes')).json()
    });

    const { data: productos } = useQuery({
        queryKey: ['productos'],
        queryFn: async () => (await fetch('/api/productos')).json()
    });

    const clienteOptions = clientes?.map(c => ({
        value: c.id.toString(),
        label: `${c.identificacion} - ${c.nombre || c.razonSocial}`
    })) || [];

    const productoOptions = productos?.map(p => ({
        value: p.id.toString(),
        label: `${p.codigo ? `[${p.codigo}] ` : ''}${p.nombre} - $${p.precio}`
    })) || [];

    // Formulario simplificado (Solo lo vital)
    const form = useForm({
        initialValues: {
            clienteId: '',
            esFacturado: false,
            // Valores por defecto para la DB
            costoFlete: 0,
            quienRetira: null,
            fechaHoraRetiro: null,
            renglones: [{ productoId: '', cantidadSolicitada: 1 }]
        },
        validate: {
            clienteId: (value) => (!value ? 'Debe seleccionar un cliente' : null),
            renglones: {
                productoId: (value) => (!value ? 'Seleccione un producto' : null),
                cantidadSolicitada: (value) => (value < 1 ? 'Mínimo 1' : null),
            }
        }
    });

    // Cálculos en Tiempo Real (Solo Subtotal e IVA)
    const { subtotal, iva, total } = useMemo(() => {
        let _subtotal = 0;
        let _iva = 0;

        form.values.renglones.forEach(renglon => {
            if (renglon.productoId) {
                const prod = productos?.find(p => p.id.toString() === renglon.productoId);
                if (prod) {
                    const precioRenglon = Number(prod.precio) * Number(renglon.cantidadSolicitada || 0);
                    _subtotal += precioRenglon;

                    if (form.values.esFacturado) {
                        _iva += precioRenglon * (Number(prod.porcentajeIva || 16) / 100);
                    }
                }
            }
        });

        const _total = _subtotal + _iva;
        return { subtotal: _subtotal, iva: _iva, total: _total };
    }, [form.values.renglones, form.values.esFacturado, productos]);

    const handleSubmit = async (values) => {
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Error al guardar el pedido');

            notifications.show({ title: 'Éxito', message: 'Pedido registrado correctamente', color: 'green' });

            // REDIRECCIÓN INTELIGENTE: Al crear, lo mandamos directo al Dashboard del pedido
            // para que ahí gestione la logística y los abonos.
            router.push(`/superuser/pedidos/${data.id}`);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Box p="md" maw={1000} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>
                    Volver
                </Button>
                <Title order={2} c="blue.9">Registrar Nuevo Pedido</Title>
            </Group>

            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Grid gutter="md">
                    {/* COLUMNA IZQUIERDA: Cabecera Minimalista */}
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Paper withBorder shadow="sm" p="xl" radius="md" bg="white" h="100%">
                            <Title order={4} mb="md" c="gray.7">Datos Comerciales</Title>
                            <Stack gap="md">
                                <Select
                                    withAsterisk
                                    label="Cliente"
                                    placeholder="Buscar cliente..."
                                    searchable
                                    data={clienteOptions}
                                    {...form.getInputProps('clienteId')}
                                />

                                <Divider my="sm" />

                                <Switch
                                    label="¿Pedido Facturado?"
                                    description="Si se activa, el sistema sumará el IVA correspondiente."
                                    checked={form.values.esFacturado}
                                    {...form.getInputProps('esFacturado', { type: 'checkbox' })}
                                />

                                <Text size="xs" c="dimmed" mt="xl" ta="center">
                                    * Los datos de logística (flete, fechas, quién retira) y finanzas (abonos) se gestionarán desde el Dashboard del Pedido una vez creado.
                                </Text>
                            </Stack>
                        </Paper>
                    </Grid.Col>

                    {/* COLUMNA DERECHA: Renglones y Totales */}
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                            <Group justify="space-between" mb="md">
                                <Title order={4} c="gray.7">Productos Solicitados</Title>
                                <Button
                                    variant="light" size="xs" leftSection={<IconPlus size={14} />}
                                    onClick={() => form.insertListItem('renglones', { productoId: '', cantidadSolicitada: 1 })}
                                >
                                    Agregar Línea
                                </Button>
                            </Group>

                            <Stack gap="sm">
                                {form.values.renglones.map((item, index) => {
                                    // Buscamos el producto seleccionado para saber su stock
                                    const productoSeleccionado = productos?.find(p => p.id.toString() === item.productoId);
                                    const stockDisponible = productoSeleccionado ? Number(productoSeleccionado.stockAlmacen) : 0;
                                    const excedeStock = item.productoId && item.cantidadSolicitada > stockDisponible;

                                    return (
                                        <Box key={index}>
                                            <Group align="flex-start" wrap="nowrap">
                                                <Select
                                                    style={{ flex: 1 }}
                                                    placeholder="Seleccione el producto"
                                                    searchable
                                                    data={productoOptions}
                                                    {...form.getInputProps(`renglones.${index}.productoId`)}
                                                />
                                                <NumberInput
                                                    w={120}
                                                    label={productoSeleccionado ? `Stock: ${stockDisponible}` : "Cant."}
                                                    min={1}
                                                    {...form.getInputProps(`renglones.${index}.cantidadSolicitada`)}
                                                />
                                                <ActionIcon
                                                    color="red" variant="subtle" size="lg" mt={24}
                                                    onClick={() => form.removeListItem('renglones', index)}
                                                    disabled={form.values.renglones.length === 1}
                                                >
                                                    <IconTrash size={20} />
                                                </ActionIcon>
                                            </Group>

                                            {/* ALERTA INTELIGENTE DE DECISIÓN */}
                                            {excedeStock && (
                                                <Alert variant="light" color="red" title="Atención: Stock Insuficiente" icon={<IconAlertCircle />} mt="xs">
                                                    <Text size="sm">
                                                        Estás solicitando <b>{item.cantidadSolicitada}</b> pero solo hay <b>{stockDisponible}</b> en almacén. Decide tu estrategia:
                                                    </Text>
                                                    <Group mt="xs" gap="sm">
                                                        <Button
                                                            size="xs" color="red" variant="outline"
                                                            onClick={() => form.setFieldValue(`renglones.${index}.cantidadSolicitada`, stockDisponible)}
                                                        >
                                                            Ajustar a {stockDisponible} uds
                                                        </Button>
                                                        <Button
                                                            size="xs" color="gray" variant="outline"
                                                            onClick={() => form.removeListItem('renglones', index)}
                                                        >
                                                            No facturar (Eliminar)
                                                        </Button>
                                                        <Text size="xs" c="dimmed" fs="italic">
                                                            * O ignora este mensaje para facturar completo y gestionar despachos parciales después.
                                                        </Text>
                                                    </Group>
                                                </Alert>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Stack>

                            <Divider my="xl" />

                            <Box bg="gray.0" p="md" style={{ borderRadius: 8 }}>
                                <Grid>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="dimmed">Subtotal Productos:</Text>
                                        <Text size="sm" c="dimmed">Impuestos (IVA):</Text>
                                        <Text size="lg" fw={700} mt="xs">TOTAL A PAGAR:</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6} ta="right">
                                        <Text size="sm" fw={500}>${subtotal.toFixed(2)}</Text>
                                        <Text size="sm" fw={500}>${iva.toFixed(2)}</Text>
                                        <Text size="xl" fw={800} c="green.7" mt="xs">${total.toFixed(2)}</Text>
                                    </Grid.Col>
                                </Grid>
                            </Box>

                            <Group justify="flex-end" mt="xl">
                                <Button variant="light" color="gray" onClick={() => router.back()} disabled={isSubmitting}>
                                    Cancelar
                                </Button>
                                <Button type="submit" color="blue.9" leftSection={<IconDeviceFloppy size={16} />} loading={isSubmitting}>
                                    Crear Pedido
                                </Button>
                            </Group>
                        </Paper>
                    </Grid.Col>
                </Grid>
            </form>
        </Box>
    );
}