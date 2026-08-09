'use client';

import React, { useState, useMemo } from 'react';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { 
    Box, Button, Group, Title, TextInput, NumberInput, 
    Select, Paper, Stack, Grid, ActionIcon, Text, Divider, Switch 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-react';

export default function NuevoPedido() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 1. Fetch de Clientes y Productos para los Selects
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

    // 2. Configuración del Formulario
    const form = useForm({
        initialValues: {
            clienteId: '',
            esFacturado: false,
            costoFlete: 0,
            quienRetira: '',
            fechaHoraRetiro: '',
            renglones: [{ productoId: '', cantidadSolicitada: 1 }]
        },
        validate: {
            clienteId: (value) => (!value ? 'Debe seleccionar un cliente' : null),
            quienRetira: (value) => (!value ? 'Especifique quién retira' : null),
            fechaHoraRetiro: (value) => (!value ? 'Fecha y hora requerida' : null),
            renglones: {
                productoId: (value) => (!value ? 'Seleccione un producto' : null),
                cantidadSolicitada: (value) => (value < 1 ? 'Mínimo 1' : null),
            }
        }
    });

    // 3. Cálculos en Tiempo Real (Subtotal, IVA, Total)
    const { subtotal, iva, total } = useMemo(() => {
        let _subtotal = 0;
        let _iva = 0;

        form.values.renglones.forEach(renglon => {
            if (renglon.productoId) {
                // Buscamos el producto en caché para leer su precio e IVA
                const prod = productos?.find(p => p.id.toString() === renglon.productoId);
                if (prod) {
                    const precioRenglon = Number(prod.precio) * Number(renglon.cantidadSolicitada || 0);
                    _subtotal += precioRenglon;
                    
                    // Si el pedido es facturado, le aplicamos su porcentaje de IVA respectivo
                    if (form.values.esFacturado) {
                        _iva += precioRenglon * (Number(prod.porcentajeIva || 16) / 100);
                    }
                }
            }
        });

        const _total = _subtotal + _iva + Number(form.values.costoFlete || 0);

        return { subtotal: _subtotal, iva: _iva, total: _total };
    }, [form.values.renglones, form.values.esFacturado, form.values.costoFlete, productos]);

    // 4. Envío al Backend
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
            router.push('/superuser/pedidos');
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
                    {/* COLUMNA IZQUIERDA: Datos Generales */}
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Paper withBorder shadow="sm" p="xl" radius="md" bg="white" h="100%">
                            <Title order={4} mb="md" c="gray.7">Datos de Cabecera</Title>
                            <Stack gap="md">
                                <Select
                                    withAsterisk
                                    label="Cliente"
                                    placeholder="Buscar cliente..."
                                    searchable
                                    data={clienteOptions}
                                    {...form.getInputProps('clienteId')}
                                />
                                <TextInput
                                    withAsterisk
                                    label="Quién retira (Chofer/CI)"
                                    placeholder="Ej. Juan Perez V-123456"
                                    {...form.getInputProps('quienRetira')}
                                />
                                <TextInput
                                    withAsterisk
                                    type="datetime-local"
                                    label="Fecha y Hora de Retiro"
                                    {...form.getInputProps('fechaHoraRetiro')}
                                />
                                <Divider my="sm" />
                                <Switch
                                    label="¿Pedido Facturado?"
                                    description="Si se activa, el sistema calculará el IVA correspondiente"
                                    checked={form.values.esFacturado}
                                    {...form.getInputProps('esFacturado', { type: 'checkbox' })}
                                />
                                <NumberInput
                                    label="Costo de Flete (Ref)"
                                    placeholder="0.00"
                                    prefix="$ "
                                    decimalScale={2}
                                    {...form.getInputProps('costoFlete')}
                                />
                            </Stack>
                        </Paper>
                    </Grid.Col>

                    {/* COLUMNA DERECHA: Renglones y Totales */}
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                            <Group justify="space-between" mb="md">
                                <Title order={4} c="gray.7">Productos Solicitados</Title>
                                <Button 
                                    variant="light" size="xs" leftSection={<IconPlus size={14}/>}
                                    onClick={() => form.insertListItem('renglones', { productoId: '', cantidadSolicitada: 1 })}
                                >
                                    Agregar Línea
                                </Button>
                            </Group>

                            <Stack gap="sm">
                                {form.values.renglones.map((item, index) => (
                                    <Group key={index} align="flex-start" wrap="nowrap">
                                        <Select
                                            style={{ flex: 1 }}
                                            placeholder="Seleccione el producto"
                                            searchable
                                            data={productoOptions}
                                            {...form.getInputProps(`renglones.${index}.productoId`)}
                                        />
                                        <NumberInput
                                            w={100}
                                            placeholder="Cant."
                                            min={1}
                                            {...form.getInputProps(`renglones.${index}.cantidadSolicitada`)}
                                        />
                                        <ActionIcon 
                                            color="red" variant="subtle" size="lg" mt={4}
                                            onClick={() => form.removeListItem('renglones', index)}
                                            disabled={form.values.renglones.length === 1}
                                        >
                                            <IconTrash size={20} />
                                        </ActionIcon>
                                    </Group>
                                ))}
                            </Stack>

                            <Divider my="xl" />

                            {/* PANEL DE TOTALES */}
                            <Box bg="gray.0" p="md" style={{ borderRadius: 8 }}>
                                <Grid>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="dimmed">Subtotal Productos:</Text>
                                        <Text size="sm" c="dimmed">Impuestos (IVA):</Text>
                                        <Text size="sm" c="dimmed">Costo Flete:</Text>
                                        <Text size="lg" fw={700} mt="xs">TOTAL A PAGAR:</Text>
                                    </Grid.Col>
                                    <Grid.Col span={6} ta="right">
                                        <Text size="sm" fw={500}>${subtotal.toFixed(2)}</Text>
                                        <Text size="sm" fw={500}>${iva.toFixed(2)}</Text>
                                        <Text size="sm" fw={500}>${Number(form.values.costoFlete || 0).toFixed(2)}</Text>
                                        <Text size="xl" fw={800} c="green.7" mt="xs">${total.toFixed(2)}</Text>
                                    </Grid.Col>
                                </Grid>
                            </Box>

                            <Group justify="flex-end" mt="xl">
                                <Button variant="light" color="gray" onClick={() => router.back()} disabled={isSubmitting}>
                                    Cancelar
                                </Button>
                                <Button type="submit" color="blue.9" leftSection={<IconDeviceFloppy size={16} />} loading={isSubmitting}>
                                    Procesar Pedido
                                </Button>
                            </Group>
                        </Paper>
                    </Grid.Col>
                </Grid>
            </form>
        </Box>
    );
}