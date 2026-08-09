'use client';
import { useForm } from '@mantine/form';
import { Modal, TextInput, Button, Group, PasswordInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import bcrypt from 'bcryptjs';

export default function CrearUsuarioModal({ empleado, opened, onClose, onUserCreated }) {
    
    // ✨ --- CORRECCIÓN PRINCIPAL AQUÍ --- ✨
    const form = useForm({
        initialValues: {
            user: '',
            password: '',
            confirmPassword: '',
            empleadoId: '',
        },
        // 'validate' es el lugar para TODAS las funciones de validación.
        validate: {
            user: (value) => (value.trim().length >= 3 ? null : 'El usuario debe tener al menos 3 caracteres'),
            password: (value) => (value.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres'),
            // La validación de campos cruzados se hace así:
            confirmPassword: (value, values) => (value !== values.password ? 'Las contraseñas no coinciden' : null),
            empleadoId: (value) => (value ? null : 'El ID de empleado no se ha cargado'),
            // Se eliminó la validación para 'rol' porque no existe en el formulario.
        },
    });

    useEffect(() => {
        if (empleado) {
            form.setValues({
                empleadoId: empleado.id || null,
                // Reinicia los otros campos para evitar datos de un empleado anterior
                user: '',
                password: '',
                confirmPassword: '',
            });
        }
    }, [empleado, opened]); // Se añade 'opened' para que resetee el form cada vez que se abre

    const handleSubmit = async (values) => {
        // Excluimos confirmPassword del objeto que se envía a la API
        const { confirmPassword, password, ...payload } = values;
        const encryptedPassword = await bcrypt.hash(confirmPassword, 10);

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({password: encryptedPassword, ...payload}),
            });
            if (!response.ok) {
                const errorData = await response.json();
                console.log(errorData)
                throw new Error(errorData.error || 'No se pudo crear el usuario');
            }
            notifications.show({ title: 'Éxito', message: 'Usuario creado y enlazado al empleado.', color: 'green' });
            onUserCreated();
            onClose();
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    };

    return (
        <Modal opened={opened} centered onClose={onClose} title={`Crear Usuario para ${empleado?.nombre}`}>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <TextInput label="Usuario" required {...form.getInputProps('user')} />
                <PasswordInput label="Contraseña" required mt="md" {...form.getInputProps('password')} />
                <PasswordInput
                    label="Repetir Contraseña"
                    required
                    mt="md"
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