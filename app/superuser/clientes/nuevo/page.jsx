'use client';

import React, { useState } from 'react';
import { useForm } from '@mantine/form';
import { useQueryClient } from '@tanstack/react-query';
import { 
    Box, Button, Group, Title, TextInput, Textarea, 
    Switch, Paper, Stack, Grid, Text 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft } from '@tabler/icons-react';
import ImageDropzone from '@/app/components/ImageDropzone'; // Tu componente de imágenes
import SelectorRetencion, { validarRetencion } from '@/app/components/admin/SelectorRetencion';

export default function NuevoCliente() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm({
        initialValues: {
            identificacion: '',
            nombre: '',
            telefono: '',
            email: '',
            direccion: '',
            notas: '',
            esContribuyenteEspecial: false,
            retencionIvaPorDefecto: null, // sin valor por defecto: si es contribuyente especial hay que elegir 75 % o 100 %
            imagen: null
        },
        validate: {
            identificacion: (value) => (value.trim().length < 4 ? 'La identificación (RIF/CI) es obligatoria' : null),
            email: (value) => (value && !/^\S+@\S+\.\S+$/.test(value) ? 'Correo inválido' : null),
            retencionIvaPorDefecto: (v, valores) => (valores.esContribuyenteEspecial ? validarRetencion(v) : null),
        }
    });

    const handleSubmit = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = {
                ...values,
                // Si el email está vacío, mandamos null para no chocar con la validación de Sequelize
                email: values.email.trim() === '' ? null : values.email.trim(),
                retencionIvaPorDefecto: values.esContribuyenteEspecial ? Number(values.retencionIvaPorDefecto) : null
            };

            // Lógica de subida de imagen usando tu ImageDropzone
            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
                
                const imagenFile = values.imagen;
                const fileExtension = imagenFile.name.split('.').pop();
                // Usamos la identificación (RIF/CI) para nombrar el archivo de forma única
                const uniqueFilename = `cliente_${values.identificacion.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.${fileExtension}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
                    method: 'POST',
                    body: imagenFile,
                });

                if (!response.ok) {
                    console.log('Falló la subida de la imagen. Probablemente ya exista una con ese nombre.');
                }

                payload.imagen = uniqueFilename;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida con éxito.', color: 'green' });
            }

            // Enviar el payload final a tu API
            const res = await fetch('/api/clientes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar el cliente');

            notifications.show({ title: 'Éxito', message: 'Cliente registrado correctamente', color: 'green' });
            // Invalida la caché por si usamos React Query en la tabla de clientes
            queryClient.invalidateQueries({ queryKey: ['clientes'] }); 
            router.push('/superuser/clientes');
            
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Box p="md" maw={900} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray.3" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>
                    Volver
                </Button>
                <Title order={2} c="white">Registrar nuevo cliente</Title>
            </Group>

            <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack gap="lg">
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    withAsterisk
                                    label="Identificación (RIF / Cédula)"
                                    placeholder="Ej. J-12345678-9 o V-12345678"
                                    {...form.getInputProps('identificacion')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <TextInput
                                    label="Razón Social / Nombre"
                                    placeholder="Nombre de la empresa o persona natural"
                                    {...form.getInputProps('nombre')}
                                />
                            </Grid.Col>
                        </Grid>

                        <Grid>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <TextInput
                                    label="Teléfono"
                                    placeholder="Ej. +58 412 1234567"
                                    {...form.getInputProps('telefono')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <TextInput
                                    label="Correo Electrónico"
                                    placeholder="ejemplo@empresa.com"
                                    {...form.getInputProps('email')}
                                />
                            </Grid.Col>
                        </Grid>

                        <Textarea
                            label="Dirección Fiscal o de Entrega"
                            placeholder="Escriba la dirección detallada del cliente..."
                            minRows={2}
                            autosize
                            {...form.getInputProps('direccion')}
                        />

                        {/* ZONA TRIBUTARIA */}
                        <Paper withBorder p="md" radius="md" bg="gray.0">
                            <Title order={5} mb="md" c="gray.7">Información Tributaria</Title>
                            <Grid align="center">
                                <Grid.Col span={{ base: 12, md: 6 }}>
                                    <Switch
                                        size="md"
                                        label="Es Contribuyente Especial"
                                        checked={form.values.esContribuyenteEspecial}
                                        {...form.getInputProps('esContribuyenteEspecial', { type: 'checkbox' })}
                                    />
                                </Grid.Col>
                                <Grid.Col span={{ base: 12, md: 6 }}>
                                    {form.values.esContribuyenteEspecial ? (
                                        <SelectorRetencion value={form.values.retencionIvaPorDefecto} error={form.errors.retencionIvaPorDefecto}
                                            onChange={(v) => form.setFieldValue('retencionIvaPorDefecto', v)} description="Cuánto del IVA nos retiene este cliente. No viene marcado: elige uno." />
                                    ) : (
                                        <Text size="sm" c="dimmed">Si es contribuyente especial, aquí eliges si retiene el 75 % o el 100 % del IVA.</Text>
                                    )}
                                </Grid.Col>
                            </Grid>
                        </Paper>

                        {/* FOTO O LOGO DEL CLIENTE */}
                        <ImageDropzone 
                            label="Logo o Foto del Cliente" 
                            form={form} 
                            fieldPath="imagen" 
                        />

                        <Textarea
                            label="Notas Adicionales (Opcional)"
                            placeholder="Instrucciones de entrega, horarios del cliente, etc."
                            minRows={2}
                            {...form.getInputProps('notas')}
                        />

                        <Group justify="flex-end" mt="xl">
                            <Button variant="light" color="gray" onClick={() => router.back()} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            <Button type="submit" color="blue" leftSection={<IconDeviceFloppy size={16} />} loading={isSubmitting}>
                                Guardar Cliente
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Paper>
        </Box>
    );
}