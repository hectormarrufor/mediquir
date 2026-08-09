'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { 
    Box, Button, Group, Title, Table, ActionIcon, 
    Center, Loader, Text, Paper, Avatar, Modal, Stack, TextInput, NumberInput, Select 
} from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ImageDropzone from '@/app/components/ImageDropzone';

export default function GestionGrupos() {
    const queryClient = useQueryClient();
    const [modalEdit, setModalEdit] = useState(false);
    const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Grupos y Categorías (para el Select)
    const { data: grupos, isLoading } = useQuery({ queryKey: ['grupos'], queryFn: async () => (await fetch('/api/grupos-equivalencia')).json() });
    const { data: categorias } = useQuery({ queryKey: ['categorias'], queryFn: async () => (await fetch('/api/categorias')).json() });
    const catOptions = categorias?.map(c => ({ value: c.id.toString(), label: c.nombre })) || [];

    const form = useForm({
        initialValues: { nombre: '', stockMinimoGlobal: 0, categoriaId: '', imagen: null },
        validate: { 
            nombre: (val) => (val.trim().length < 2 ? 'Mínimo 2 caracteres' : null),
            categoriaId: (val) => (!val ? 'Seleccione categoría' : null)
        }
    });

    const abrirModalEdicion = (grupo) => {
        setGrupoSeleccionado(grupo);
        form.setValues({
            nombre: grupo.nombre,
            stockMinimoGlobal: grupo.stockMinimoGlobal,
            categoriaId: grupo.categoriaId?.toString(),
            imagen: grupo.imagen || null
        });
        setModalEdit(true);
    };

    const handleActualizarGrupo = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = { ...values };

            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'upload-grupo', title: 'Subiendo imagen...', message: 'Espera...', loading: true });
                const fileExt = values.imagen.name.split('.').pop();
                const uniqueFilename = `grupo_${Date.now()}.${fileExt}`;
                
                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, { method: 'POST', body: values.imagen });
                if (!response.ok) throw new Error('Falló la subida');
                
                payload.imagen = uniqueFilename;
                notifications.update({ id: 'upload-grupo', title: 'Éxito', message: 'Imagen subida', color: 'green' });
            }

            const res = await fetch(`/api/grupos-equivalencia/${grupoSeleccionado.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Error al actualizar');

            queryClient.invalidateQueries({ queryKey: ['grupos'] });
            setModalEdit(false);
            notifications.show({ title: 'Éxito', message: 'Grupo actualizado', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEliminar = async (id, nombre) => {
        if (confirm(`¿Eliminar el grupo ${nombre}?`)) {
            try {
                const res = await fetch(`/api/grupos-equivalencia/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Error (Verifica si tiene productos asociados)');
                queryClient.invalidateQueries({ queryKey: ['grupos'] });
                notifications.show({ title: 'Éxito', message: 'Eliminado', color: 'green' });
            } catch (error) {
                notifications.show({ title: 'Error', message: error.message, color: 'red' });
            }
        }
    };

    if (isLoading) return <Center h="50vh"><Loader /></Center>;

    return (
        <Box p="md" maw={1000} mx="auto">
            <Title order={2} c="teal.9" mb="xl">Gestión de Grupos de Equivalencia</Title>
            
            <Paper withBorder radius="md" p="md" bg="white">
                <Table striped highlightOnHover verticalSpacing="sm">
                    <Table.Thead bg="teal.0">
                        <Table.Tr>
                            <Table.Th w={60}>Imagen</Table.Th>
                            <Table.Th>Nombre del Grupo</Table.Th>
                            <Table.Th>Categoría Padre</Table.Th>
                            <Table.Th>Stock Mínimo</Table.Th>
                            <Table.Th ta="center">Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {grupos?.map((grupo) => (
                            <Table.Tr key={grupo.id}>
                                <Table.Td>
                                    <Avatar src={grupo.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${grupo.imagen}` : null} color="teal" radius="sm">
                                        {grupo.nombre.charAt(0)}
                                    </Avatar>
                                </Table.Td>
                                <Table.Td><Text fw={600}>{grupo.nombre}</Text></Table.Td>
                                <Table.Td><Text size="sm" c="dimmed">{grupo.categoria?.nombre || 'N/A'}</Text></Table.Td>
                                <Table.Td><Text fw={700} c="teal.8">{grupo.stockMinimoGlobal}</Text></Table.Td>
                                <Table.Td ta="center">
                                    <Group gap="xs" justify="center">
                                        <ActionIcon color="blue" variant="light" onClick={() => abrirModalEdicion(grupo)}><IconEdit size={16} /></ActionIcon>
                                        <ActionIcon color="red" variant="light" onClick={() => handleEliminar(grupo.id, grupo.nombre)}><IconTrash size={16} /></ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            <Modal opened={modalEdit} onClose={() => setModalEdit(false)} title={<Title order={4}>Editar Grupo</Title>} centered>
                <form onSubmit={form.onSubmit(handleActualizarGrupo)}>
                    <Stack gap="md">
                        <TextInput label="Nombre del Grupo" {...form.getInputProps('nombre')} />
                        <Select label="Categoría" data={catOptions} searchable {...form.getInputProps('categoriaId')} />
                        <NumberInput label="Stock Mínimo Global" {...form.getInputProps('stockMinimoGlobal')} />
                        <ImageDropzone label="Imagen de Portada" form={form} fieldPath="imagen" />
                        <Button type="submit" loading={isSubmitting} color="teal" fullWidth>Guardar Cambios</Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}