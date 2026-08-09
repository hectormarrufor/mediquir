import { Button, Group, Modal, PasswordInput, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import React, { useEffect, useState } from "react";

/**
 * EditUsuarioModal.jsx
 *
 * Props:
 * - show (bool): whether modal is visible
 * - onClose (fn): called to close modal
 * - usuario (object): user object to edit (must contain id and editable fields)
 * - onUpdated (fn): called with updated user after successful save
 *
 * Example usage:
 * <EditUsuarioModal
 *   show={showEdit}
 *   onClose={() => setShowEdit(false)}
 *   usuario={selectedUser}
 *   onUpdated={(u) => refreshList()}
 * />
 */

export default function EditUsuarioModal({ show, onClose, usuario, onUpdated, opened }) {
    const form = useForm({
        initialValues: {
            user: '',
            password: '',
            confirmPassword: '',
        },
        // 'validate' es el lugar para TODAS las funciones de validación.
        validate: {
            user: (value) => (value.trim().length >= 3 ? null : 'El usuario debe tener al menos 3 caracteres'),
            password: (value) => (value.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres'),
            // La validación de campos cruzados se hace así:
            confirmPassword: (value, values) => (value !== values.password ? 'Las contraseñas no coinciden' : null),
        },
    });

    useEffect(() => {
        if (usuario) {
            form.setValues({
                // Reinicia los otros campos para evitar datos de un empleado anterior
                user: usuario.user || '',
                password: '',
                confirmPassword: '',
            });
        }
    }, [usuario, opened]); // Se añade 'opened' para que resetee el form cada vez que se abre

    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState(null);

    // populate form when usuario changes or modal opens
    const handleSubmit = async (values) => {
        const { confirmPassword, password, ...payload } = values;
        let body = { ...payload };
        if (password) {
            body.password = password;
        }
        setSaving(true);
        try {
            const response = await fetch(`/api/users/${usuario.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudo actualizar el usuario');
            }
            const updatedUser = await response.json();
            setSaving(false);
            onUpdated(updatedUser);
            onClose();
        } catch (error) {
            setSaving(false);
            setErrors(error.message);
        }
    };



    return (
        <Modal opened={opened} centered onClose={onClose} title={`Editar Usuario`}>


            <form onSubmit={form.onSubmit(handleSubmit)}>
                <TextInput label="User" required {...form.getInputProps('user')} />
                <PasswordInput label="Contraseña" required mt="md" {...form.getInputProps('password')} />
                <PasswordInput
                    label="Repetir Contraseña"
                    required
                    mt="md"
                    {...form.getInputProps('confirmPassword')}
                />
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Guardar Cambios</Button>
                </Group>
            </form>
        </Modal>
    );
}