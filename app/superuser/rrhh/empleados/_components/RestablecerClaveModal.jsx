'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, CopyButton, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconBrandWhatsapp, IconCheck, IconCopy, IconKey } from '@tabler/icons-react';
import { normalizarWhatsApp } from '@/app/constants/contacto';

// Restablecer la contraseña de un empleado: genera una clave temporal que se muestra UNA sola vez
// (en la base solo queda su hash) y se puede copiar o mandar por WhatsApp.
export default function RestablecerClaveModal({ empleado, opened, onClose, onListo }) {
    const [confirmando, setConfirmando] = useState(false);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [credenciales, setCredenciales] = useState(null);

    useEffect(() => { if (opened) { setConfirmando(false); setError(''); setCredenciales(null); } }, [opened, empleado?.id]);

    const restablecer = async () => {
        setCargando(true); setError('');
        try {
            const res = await fetch(`/api/users/${empleado.usuario.id}/restablecer`, { method: 'POST' });
            const cuerpo = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(cuerpo.error || 'No se pudo restablecer');
            setCredenciales(cuerpo);
            onListo?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setCargando(false);
        }
    };

    const mensaje = credenciales
        ? `Hola ${empleado?.nombre || ''}, este es tu acceso al sistema de Mediquir:\n\nUsuario: ${credenciales.user}\nClave temporal: ${credenciales.password}\n\nIngresa en ${typeof window !== 'undefined' ? window.location.origin : ''}/login y cambia tu clave desde tu perfil.`
        : '';
    const wa = normalizarWhatsApp(empleado?.telefono);

    return (
        <Modal opened={opened} onClose={onClose} centered title={<Group gap="xs"><IconKey size={20} /><Text fw={800}>Restablecer contraseña</Text></Group>}>
            <Stack gap="md">
                <div>
                    <Text fw={700}>{empleado?.nombreCompleto}</Text>
                    <Text size="xs" c="dimmed">Usuario: {empleado?.usuario?.user}</Text>
                </div>
                {error && <Alert color="red" icon={<IconAlertTriangle size={16} />} p="xs">{error}</Alert>}

                {credenciales ? (
                    <Stack gap="sm">
                        <Alert color="teal" icon={<IconCheck size={16} />} title="Contraseña restablecida">
                            Esta clave <b>solo se muestra ahora</b>. Cópiala o envíala al empleado; la anterior ya no funciona.
                        </Alert>
                        <Paper withBorder p="md" radius="md" bg="gray.0">
                            <Group justify="space-between"><Text size="sm" c="dimmed">Usuario</Text><Text ff="monospace" fw={700}>{credenciales.user}</Text></Group>
                            <Group justify="space-between" mt={6}><Text size="sm" c="dimmed">Clave temporal</Text><Text ff="monospace" fw={800} fz="lg">{credenciales.password}</Text></Group>
                        </Paper>
                        <Group grow>
                            <CopyButton value={mensaje}>{({ copied, copy }) => (
                                <Button variant="default" leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>{copied ? 'Copiado' : 'Copiar datos'}</Button>
                            )}</CopyButton>
                            <Button color="green" leftSection={<IconBrandWhatsapp size={18} />} disabled={!wa} component="a" target="_blank" rel="noopener noreferrer"
                                href={wa ? `https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}` : undefined}>
                                {wa ? 'Enviar por WhatsApp' : 'Sin teléfono'}
                            </Button>
                        </Group>
                        <Button variant="subtle" onClick={onClose}>Listo</Button>
                    </Stack>
                ) : (
                    <Stack gap="sm">
                        <Text size="sm" c="dimmed">¿Olvidó su contraseña? Se genera una clave temporal nueva y la anterior deja de funcionar.</Text>
                        {!confirmando
                            ? <Button color="orange" variant="light" leftSection={<IconKey size={16} />} onClick={() => setConfirmando(true)}>Restablecer contraseña</Button>
                            : (
                                <Group grow>
                                    <Button variant="default" onClick={() => setConfirmando(false)}>Cancelar</Button>
                                    <Button color="orange" loading={cargando} onClick={restablecer}>Sí, restablecer</Button>
                                </Group>
                            )}
                    </Stack>
                )}
            </Stack>
        </Modal>
    );
}
