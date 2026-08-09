import { useState } from 'react';
import { PasswordInput, Button, Group, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';

export default function ChangePasswordForm({ opened, onClose, onSubmit, userId }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleSubmit = async () => {
        if (newPassword !== confirmPassword) {
            alert('Las contraseñas no coinciden');
            return;
        }
        try {
            const res = await onSubmit({ userId, currentPassword, newPassword });
            if (!res.ok) throw new Error("no se pudo cambiar la contraseña")
            onClose();
        }
        catch (error){
            
        }
    };

    return (
        <Modal centered opened={opened} onClose={onClose} title="Cambiar contraseña">
            <PasswordInput
                label="Contraseña actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                mb="sm"
            />
            <PasswordInput
                label="Nueva contraseña"
                value={newPassword}
                onChange={(e) => setNewPassword(e.currentTarget.value)}
                mb="sm"
            />
            <PasswordInput
                label="Confirmar nueva contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
                mb="sm"
            />
            <Group position="right" mt="md">
                <Button onClick={handleSubmit}>Guardar</Button>
            </Group>
        </Modal>
    );
}