'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { 
    Box, Button, Group, Title, Table, ActionIcon, 
    Center, Loader, Text, Paper, Avatar, Modal, Stack, TextInput 
} from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ImageDropzone from '@/app/components/ImageDropzone';

export default function GestionMarcas() {
    const queryClient = useQueryClient();
    const [modalEdit, setModalEdit] = useState(false);
    const [marcaSeleccionada, setMarcaSeleccionada] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: marcas, isLoading } = useQuery({
        queryKey: ['marcas'],
        queryFn: async () => {
            const res = await fetch('/api/marcas');
            if (!res.ok) throw new Error('Error al cargar');
            return res.json();
        }
    });

    const form = useForm({
        initialValues: { nombre: '', imagen: null },
        validate: { nombre: (val) => (val.trim().length < 2 ? 'Mínimo 2 caracteres' : null) }
    });

    const abrirModalEdicion = (marca) => {
        setMarcaSeleccionada(marca);
        form.setValues({
            nombre: marca.nombre,
            imagen: marca.imagen || null // Tu ImageDropzone maneja strings y renderiza el preview
        });
        setModalEdit(true);
    };

    const handleActualizarMarca = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = { nombre: values.nombre };

            // Lógica de subida de imagen al Vercel Blob
            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'upload-marca', title: 'Subiendo logo...', message: 'Espera...', loading: true });
                const fileExt = values.imagen.name.split('.').pop();
                const uniqueFilename = `marca_${Date.now()}.${fileExt}`;
                
                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, { method: 'POST', body: values.imagen });
                if (!response.ok) throw new Error('Falló la subida de la imagen');
                
                payload.imagen = uniqueFilename;
                notifications.update({ id: 'upload-marca', title: 'Éxito', message: 'Logo subido', color: 'green' });
            }

            const res = await fetch(`/api/marcas/${marcaSeleccionada.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Error al actualizar');

            queryClient.invalidateQueries({ queryKey: ['marcas'] });
            setModalEdit(false);
            notifications.show({ title: 'Éxito', message: 'Marca actualizada', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEliminar = async (id, nombre) => {
        if (confirm(`¿Eliminar la marca ${nombre}?`)) {
            try {
                const res = await fetch(`/api/marcas/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Error (Verifica si tiene productos asociados)');
                queryClient.invalidateQueries({ queryKey: ['marcas'] });
                notifications.show({ title: 'Éxito', message: 'Eliminada', color: 'green' });
            } catch (error) {
                notifications.show({ title: 'Error', message: error.message, color: 'red' });
            }
        }
    };

    if (isLoading) return <Center h="50vh"><Loader /></Center>;

    return (
        <Box p="md" maw={1000} mx="auto">
            <Title order={2} c="grape.9" mb="xl">Gestión de Marcas</Title>
            
            <Paper withBorder radius="md" p="md" bg="white">
                <Table striped highlightOnHover verticalSpacing="sm">
                    <Table.Thead bg="grape.0">
                        <Table.Tr>
                            <Table.Th w={60}>Logo</Table.Th>
                            <Table.Th>Nombre de la Marca</Table.Th>
                            <Table.Th ta="center">Acciones</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {marcas?.map((marca) => (
                            <Table.Tr key={marca.id}>
                                <Table.Td>
                                    <Avatar src={marca.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${marca.imagen}` : null} color="grape" radius="sm">
                                        {marca.nombre.charAt(0)}
                                    </Avatar>
                                </Table.Td>
                                <Table.Td><Text fw={600}>{marca.nombre}</Text></Table.Td>
                                <Table.Td ta="center">
                                    <Group gap="xs" justify="center">
                                        <ActionIcon color="blue" variant="light" onClick={() => abrirModalEdicion(marca)}><IconEdit size={16} /></ActionIcon>
                                        <ActionIcon color="red" variant="light" onClick={() => handleEliminar(marca.id, marca.nombre)}><IconTrash size={16} /></ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Paper>

            <Modal opened={modalEdit} onClose={() => setModalEdit(false)} title={<Title order={4}>Editar Marca</Title>} centered>
                <form onSubmit={form.onSubmit(handleActualizarMarca)}>
                    <Stack gap="md">
                        <TextInput label="Nombre" {...form.getInputProps('nombre')} />
                        <ImageDropzone label="Logo de la Marca" form={form} fieldPath="imagen" />
                        <Button type="submit" loading={isSubmitting} color="grape" fullWidth>Guardar Cambios</Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}