'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { 
    Box, Button, Group, Title, TextInput, NumberInput, 
    Select, MultiSelect, Paper, Stack, Grid, Modal, ActionIcon 
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft, IconPlus } from '@tabler/icons-react';
import ImageDropzone from '@/app/components/ImageDropzone';

export default function NuevoProducto() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estados para el Modal de nueva categoría
    const [modalCategoriaAbierto, setModalCategoriaAbierto] = useState(false);
    const [nombreNuevaCategoria, setNombreNuevaCategoria] = useState('');

    // Fetch de categorías
    const { data: categorias } = useQuery({
        queryKey: ['categorias'],
        queryFn: async () => {
            const res = await fetch('/api/categorias');
            if (!res.ok) return [];
            return res.json();
        }
    });

    // Fetch de tags
    const { data: tagsList } = useQuery({
        queryKey: ['tags'],
        queryFn: async () => {
            const res = await fetch('/api/tags');
            if (!res.ok) return [];
            return res.json();
        }
    });

    const categoriaOptions = categorias?.map(cat => ({
        value: cat.id.toString(),
        label: cat.nombre
    })) || [];

    const tagOptions = tagsList?.map(t => ({
        value: t.id.toString(),
        label: t.nombre
    })) || [];

    // Formulario principal del Producto con VALIDACIONES COMPLETAS
    const form = useForm({
        initialValues: {
            nombre: '',
            categoriaId: '',
            precio: '',
            stockAlmacen: '',
            stockMinimo: '',
            imagen: null,
            tags: [],
            codigo: ''  // Nuevo campo para el código del producto
        },
        validate: {
            nombre: (value) => (!value || value.trim().length < 3 ? 'El nombre es obligatorio y debe tener al menos 3 caracteres' : null),
            categoriaId: (value) => (!value ? 'Debe seleccionar una categoría obligatoriamente' : null),
            precio: (value) => (value === '' || value === undefined || Number(value) < 0 ? 'El precio es obligatorio y no puede ser negativo' : null),
            stockAlmacen: (value) => (value === '' || value === undefined || Number(value) < 0 ? 'El stock en almacén es obligatorio' : null),
            stockMinimo: (value) => (value === '' || value === undefined || Number(value) < 0 ? 'El stock mínimo es obligatorio' : null),
            codigo: (value) => (!value || value.trim().length < 3 ? 'El código es obligatorio y debe tener al menos 3 caracteres' : null),
        }
    });

    // Mutación para crear nueva categoría
    const mutationCategoria = useMutation({
        mutationFn: async (nombreCat) => {
            const res = await fetch('/api/categorias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombreCat })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al crear categoría');
            return data;
        },
        onSuccess: (nuevaCat) => {
            queryClient.invalidateQueries({ queryKey: ['categorias'] });
            form.setFieldValue('categoriaId', nuevaCat.id.toString());
            setModalCategoriaAbierto(false);
            setNombreNuevaCategoria('');
            notifications.show({ title: 'Éxito', message: 'Categoría creada', color: 'green' });
        },
        onError: (error) => {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    });

    const handleCrearCategoria = (e) => {
        e.preventDefault();
        if (nombreNuevaCategoria.trim().length < 3) {
            notifications.show({ title: 'Aviso', message: 'El nombre de la categoría es muy corto', color: 'yellow' });
            return;
        }
        mutationCategoria.mutate(nombreNuevaCategoria);
    };

    const handleSubmitProducto = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = {
                ...values,
                categoriaId: Number(values.categoriaId)
            };

            // Lógica de subida de imagen con el componente ImageDropzone
            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
                
                const imagenFile = values.imagen;
                const fileExtension = imagenFile.name.split('.').pop();
                const slugName = values.nombre.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const uniqueFilename = `${slugName}_${Date.now()}.${fileExtension}`;

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

            // Enviar el payload final a la API de productos
            const res = await fetch('/api/productos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar el producto');

            notifications.show({ title: 'Éxito', message: 'Producto registrado correctamente', color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
            router.push('/superuser/inventario/productos');
            
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Box p="md" maw={800} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>
                    Volver
                </Button>
                <Title order={2} c="blue.9">Registrar Nuevo Producto</Title>
            </Group>

            <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                <form onSubmit={form.onSubmit(handleSubmitProducto)}>
                    <Stack gap="md">
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <TextInput
                                    withAsterisk
                                    label="Nombre del Producto"
                                    placeholder="Ej. Guantes Quirúrgicos Talla L"
                                    {...form.getInputProps('nombre')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    label="Código del Producto"
                                    placeholder="Ej. GQ-L-001"
                                    {...form.getInputProps('codigo')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select
                                        style={{ flex: 1 }}
                                        withAsterisk
                                        label="Categoría"
                                        placeholder="Seleccione..."
                                        data={categoriaOptions}
                                        searchable
                                        nothingFoundMessage="No se encontraron resultados"
                                        {...form.getInputProps('categoriaId')}
                                    />
                                    <ActionIcon 
                                        size="lg" 
                                        color="blue" 
                                        variant="light" 
                                        onClick={() => setModalCategoriaAbierto(true)} 
                                        title="Agregar nueva categoría"
                                    >
                                        <IconPlus size={18} />
                                    </ActionIcon>
                                </Group>
                            </Grid.Col>
                        </Grid>

                        {/* Campo MultiSelect para Tags */}
                        <MultiSelect
                            label="Etiquetas (Tags)"
                            placeholder="Selecciona o escribe nuevas etiquetas y presiona Enter"
                            data={tagOptions}
                            searchable
                            creatable
                            getCreateLabel={(query) => `+ Crear tag "${query}"`}
                            onCreate={(query) => {
                                const item = { value: query, label: query };
                                queryClient.setQueryData(['tags'], (old) => [...(old || []), { id: query, nombre: query }]);
                                return item;
                            }}
                            clearable
                            {...form.getInputProps('tags')}
                        />

                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput
                                    withAsterisk
                                    label="Precio (Ref)"
                                    placeholder="0.00"
                                    decimalScale={2}
                                    prefix="$ "
                                    {...form.getInputProps('precio')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput
                                    withAsterisk
                                    label="Stock en Almacén"
                                    placeholder="0"
                                    {...form.getInputProps('stockAlmacen')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput
                                    withAsterisk
                                    label="Stock Mínimo (Alerta)"
                                    placeholder="0"
                                    {...form.getInputProps('stockMinimo')}
                                />
                            </Grid.Col>
                        </Grid>

                        {/* Componente ImageDropzone */}
                        <ImageDropzone 
                            label="Foto del Producto" 
                            form={form} 
                            fieldPath="imagen" 
                        />

                        <Group justify="flex-end" mt="xl">
                            <Button variant="light" color="gray" onClick={() => router.back()} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            <Button type="submit" color="blue" leftSection={<IconDeviceFloppy size={16} />} loading={isSubmitting}>
                                Guardar Producto
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Paper>

            {/* Modal para Crear Categoría Rápida */}
            <Modal 
                opened={modalCategoriaAbierto} 
                onClose={() => setModalCategoriaAbierto(false)} 
                title={<Title order={4}>Nueva Categoría</Title>}
                centered
            >
                <form onSubmit={handleCrearCategoria}>
                    <Stack gap="md">
                        <TextInput
                            label="Nombre de la categoría"
                            placeholder="Ej. Descartables"
                            value={nombreNuevaCategoria}
                            onChange={(e) => setNombreNuevaCategoria(e.currentTarget.value)}
                            autoFocus
                            required
                        />
                        <Button 
                            type="submit" 
                            color="blue" 
                            fullWidth 
                            loading={mutationCategoria.isPending}
                        >
                            Guardar Categoría
                        </Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}