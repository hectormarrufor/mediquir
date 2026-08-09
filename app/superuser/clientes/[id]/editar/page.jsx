'use client';

import React, { useState, useEffect, use } from 'react';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
    Box, Button, Group, Title, TextInput, Textarea, 
    Switch, Select, Paper, Stack, Grid, Center, Loader, Text 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft } from '@tabler/icons-react';
import ImageDropzone from '@/app/components/ImageDropzone';

export default function EditarCliente({ params }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const resolvedParams = use(params);
    const { id } = resolvedParams;

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch del cliente a editar
    const { data: cliente, isLoading, isError } = useQuery({
        queryKey: ['cliente', id],
        queryFn: async () => {
            const res = await fetch(`/api/clientes/${id}`);
            if (!res.ok) throw new Error('Error al cargar cliente');
            return res.json();
        }
    });

    const form = useForm({
        initialValues: {
            identificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            direccion: '',
            notas: '',
            esContribuyenteEspecial: false,
            retencionIvaPorDefecto: '75',
            imagen: null
        },
        validate: {
            identificacion: (value) => (value.trim().length < 4 ? 'Obligatorio' : null),
            email: (value) => (value && !/^\S+@\S+\.\S+$/.test(value) ? 'Correo inválido' : null),
        }
    });

    // Cargar datos en el formulario cuando el fetch termine
    useEffect(() => {
        if (cliente) {
            form.setValues({
                identificacion: cliente.identificacion || '',
                nombre: cliente.nombre || '',
                telefono: cliente.telefono || '',
                email: cliente.email || '',
                direccion: cliente.direccion || '',
                notas: cliente.notas || '',
                esContribuyenteEspecial: cliente.esContribuyenteEspecial || false,
                retencionIvaPorDefecto: String(cliente.retencionIvaPorDefecto || 75),
                imagen: cliente.imagen || null
            });
        }
    }, [cliente]);

    if (isLoading) return <Center h="50vh"><Loader /></Center>;
    if (isError) return <Center h="50vh"><Text c="red">Error al cargar datos.</Text></Center>;

    const handleSubmit = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = {
                ...values,
                email: values.email.trim() === '' ? null : values.email.trim(),
                retencionIvaPorDefecto: Number(values.retencionIvaPorDefecto)
            };

            // Solo subimos imagen nueva si es un archivo Blob/File
            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading', message: 'Subiendo imagen...', loading: true });
                
                const fileExt = values.imagen.name.split('.').pop();
                const uniqueName = `cliente_${values.identificacion.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${fileExt}`;

                const resUpload = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueName)}`, {
                    method: 'POST', body: values.imagen,
                });

                if (resUpload.ok) {
                    payload.imagen = uniqueName;
                    notifications.update({ id: 'uploading', title: 'Éxito', message: 'Imagen actualizada.', color: 'green' });
                }
            }

            const res = await fetch(`/api/clientes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al actualizar');

            notifications.show({ title: 'Éxito', message: 'Cliente actualizado', color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['cliente', id] }); 
            queryClient.invalidateQueries({ queryKey: ['clientes'] }); 
            router.push(`/superuser/clientes/${id}`);
            
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Box p="md" maw={900} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>
                    Volver
                </Button>
                <Title order={2} c="blue.9">Editar Cliente</Title>
            </Group>

            <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack gap="lg">
                        {/* Mismos campos del form original */}
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput withAsterisk label="Identificación (RIF / Cédula)" {...form.getInputProps('identificacion')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <TextInput label="Razón Social / Nombre" {...form.getInputProps('nombre')} />
                            </Grid.Col>
                        </Grid>

                        <Grid>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <TextInput label="Teléfono" {...form.getInputProps('telefono')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <TextInput label="Correo Electrónico" {...form.getInputProps('email')} />
                            </Grid.Col>
                        </Grid>

                        <Textarea label="Dirección Fiscal o de Entrega" minRows={2} autosize {...form.getInputProps('direccion')} />

                        <Paper withBorder p="md" radius="md" bg="gray.0">
                            <Title order={5} mb="md" c="gray.7">Información Tributaria</Title>
                            <Grid align="center">
                                <Grid.Col span={{ base: 12, md: 6 }}>
                                    <Switch size="md" label="Es Contribuyente Especial" checked={form.values.esContribuyenteEspecial} {...form.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })} />
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, md: 6 }}>
                                    <Select label="Porcentaje de Retención IVA" data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} disabled={!form.values.esContribuyenteEspecial} {...form.getInputProps('retencionIvaPorDefecto')} />
                                </Grid.Col>
                            </Grid>
                        </Paper>

                        <ImageDropzone label="Logo o Foto del Cliente" form={form} fieldPath="imagen" />
                        <Textarea label="Notas Adicionales (Opcional)" minRows={2} {...form.getInputProps('notas')} />

                        <Group justify="flex-end" mt="xl">
                            <Button variant="light" color="gray" onClick={() => router.back()} disabled={isSubmitting}>Cancelar</Button>
                            <Button type="submit" color="blue" leftSection={<IconDeviceFloppy size={16} />} loading={isSubmitting}>Guardar Cambios</Button>
                        </Group>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}