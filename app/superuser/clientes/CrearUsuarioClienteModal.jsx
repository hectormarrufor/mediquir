'use client';
import { useForm } from '@mantine/form';
import { Modal, TextInput, Button, Group, PasswordInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import bcrypt from 'bcryptjs';

export default function CrearUsuarioClienteModal({ cliente, opened, onClose, onUserCreated }) {
    const form = useForm({
        initialValues: {
            user: '',
            password: '',
            confirmPassword: '',
            clienteId: '', // <-- Ahora usamos clienteId
        },
        validate: {
            user: (value) => (value.trim().length >= 3 ? null : 'El usuario debe tener al menos 3 caracteres'),
            password: (value) => (value.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres'),
            confirmPassword: (value, values) => (value !== values.password ? 'Las contraseñas no coinciden' : null),
            clienteId: (value) => (value ? null : 'El ID del cliente no se ha cargado'),
        },
    });

    useEffect(() => {
        if (cliente) {
            form.setValues({
                clienteId: cliente.id || null,
                user: '',
                password: '',
                confirmPassword: '',
            });
        }
    }, [cliente, opened]);

    const handleSubmit = async (values) => {
        const { confirmPassword, password, ...payload } = values;
        // Reutilizamos la lógica correcta de encriptado que trabajamos antes

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: confirmPassword, ...payload }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudo crear el usuario');
            }
            notifications.show({ title: 'Éxito', message: 'Usuario creado y enlazado al cliente.', color: 'green' });
            onUserCreated();
            onClose();
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    };

    return (
        <Modal opened={opened} centered onClose={onClose} title={`Crear Usuario para ${cliente?.nombre || cliente?.identificacion}`}>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <TextInput label="Usuario" required {...form.getInputProps('user')} />
                <PasswordInput label="Contraseña" required mt="md" {...form.getInputProps('password')} />
                <PasswordInput
                    label="Repetir Contraseña" required mt="md"
                    {...form.getInputProps('confirmPassword')}
                />
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Crear Usuario</Button>
                </Group>
            </form>
        </Modal>
    );
}