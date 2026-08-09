'use client';

import React, { useState, useMemo } from 'react';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth'; // Tu hook de autenticación
import { 
    Box, Button, Group, Title, NumberInput, 
    Select, Paper, Stack, Grid, ActionIcon, Text, Divider, Switch, Center, Loader 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft, IconPlus, IconTrash } from '@tabler/icons-react';

export default function ClienteNuevoPedido() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch de productos disponibles
    const { data: productos, isLoading: productsLoading } = useQuery({
        queryKey: ['productos-tienda'],
        queryFn: async () => (await fetch('/api/productos')).json()
    });

    const productoOptions = productos?.map(p => ({
        value: p.id.toString(),
        label: `${p.codigo ? `[${p.codigo}] ` : ''}${p.nombre} - $${p.precio}`
    })) || [];

    // Formulario limpio para el cliente (Sin stock visible)
    const form = useForm({
        initialValues: {
            esFacturado: true, // Por defecto para empresas/clientes B2B
            renglones: [{ productoId: '', cantidadSolicitada: 1 }]
        },
        validate: {
            renglones: {
                productoId: (value) => (!value ? 'Seleccione un producto' : null),
                cantidadSolicitada: (value) => (value < 1 ? 'Mínimo 1' : null),
            }
        }
    });

    // Cálculos de totales en tiempo real
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

        return { subtotal: _subtotal, iva: _iva, total: _subtotal + _iva };
    }, [form.values.renglones, form.values.esFacturado, productos]);

    const handleSubmit = async (values) => {
        if (!user?.clienteId) {
            notifications.show({ title: 'Error', message: 'No se reconoció el perfil de cliente asociado a tu cuenta.', color: 'red' });
            return;
        }

        setIsSubmitting(true);
        try {
            // Inyectamos automáticamente el clienteId del usuario logueado
            const payload = {
                ...values,
                clienteId: user.clienteId,
                costoFlete: 0,
                quienRetira: null,
                fechaHoraRetiro: null
            };

            const res = await fetch('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Error al procesar el pedido');

            notifications.show({ title: '¡Pedido Exitoso!', message: 'Tu solicitud ha sido enviada correctamente.', color: 'green' });
            router.push('/tienda/pedidos'); // Redirige a su historial de compras en el portal
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authLoading || productsLoading) return <Center h="60vh"><Loader size="lg" /></Center>;

    return (
        <Box p="md" maw={900} mx="auto" mt={50}>
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>
                    Volver a la tienda
                </Button>
                <Title order={2} c="blue.9">Crear Nuevo Pedido</Title>
            </Group>

            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Grid gutter="md">
                    {/* PANEL IZQUIERDO: Opciones de Facturación */}
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Paper withBorder shadow="sm" p="xl" radius="md" bg="white" h="100%">
                            <Title order={4} mb="md" c="gray.7">Opciones</Title>
                            <Stack gap="md">
                                <Switch
                                    label="Requerir Factura Fiscal"
                                    checked={form.values.esFacturado}
                                    {...form.getInputProps('esFacturado', { type: 'checkbox' })}
                                />
                                <Text size="xs" c="dimmed" mt="md">
                                    Al enviar este pedido, nuestro equipo de operaciones se pondrá en contacto contigo para coordinar la logística de entrega y los métodos de pago o abono.
                                </Text>
                            </Stack>
                        </Paper>
                    </Grid.Col>

                    {/* PANEL DERECHO: Productos (Sin ver stock) */}
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                            <Group justify="space-between" mb="md">
                                <Title order={4} c="gray.7">Selecciona tus Productos</Title>
                                <Button 
                                    variant="light" size="xs" leftSection={<IconPlus size={14}/>}
                                    onClick={() => form.insertListItem('renglones', { productoId: '', cantidadSolicitada: 1 })}
                                >
                                    Agregar otro producto
                                </Button>
                            </Group>

                            <Stack gap="sm">
                                {form.values.renglones.map((item, index) => (
                                    <Group key={index} align="flex-start" wrap="nowrap">
                                        <Select
                                            style={{ flex: 1 }}
                                            placeholder="Busca y selecciona un producto..."
                                            searchable
                                            data={productoOptions}
                                            {...form.getInputProps(`renglones.${index}.productoId`)}
                                        />
                                        <NumberInput
                                            w={110}
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

                            <Box bg="gray.0" p="md" style={{ borderRadius: 8 }}>
                                <Grid>
                                    <Grid.Col span={6}>
                                        <Text size="sm" c="dimmed">Subtotal:</Text>
                                        <Text size="sm" c="dimmed">IVA Estimado:</Text>
                                        <Text size="lg" fw={700} mt="xs">TOTAL ESTIMADO:</Text>
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
                                    Enviar Pedido a Mediquir
                                </Button>
                            </Group>
                        </Paper>
                    </Grid.Col>
                </Grid>
            </form>
        </Box>
    );
}