'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, CopyButton, Group, Modal, Paper, Stack, Text, TextInput, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconBrandWhatsapp, IconCheck, IconCopy, IconKey, IconUserPlus } from '@tabler/icons-react';

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// 0414-1234567 / 0414 1234567 / +58 414 1234567  ->  584141234567 (formato de wa.me)
export function telefonoWhatsapp(tel) {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('58')) return d;
    return `58${d.replace(/^0+/, '')}`;
}

// Acceso del cliente al portal B2B: crear su usuario o restablecer su contraseña.
// La clave temporal se muestra UNA sola vez (en la base solo queda su hash) y se puede enviar por WhatsApp.
export default function AccesoModal({ cliente, opened, onClose, credencialesIniciales = null }) {
    const queryClient = useQueryClient();
    const [estado, setEstado] = useState(null); // { usuario, sugerido }
    const [usuarioNuevo, setUsuarioNuevo] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');
    const [credenciales, setCredenciales] = useState(null); // { user, password, creado }
    const [confirmando, setConfirmando] = useState(false);

    useEffect(() => {
        if (!opened || !cliente) return;
        setCredenciales(credencialesIniciales); setError(''); setConfirmando(false);
        pedirJson(`/api/clientes/${cliente.id}/acceso`)
            .then((e) => { setEstado(e); setUsuarioNuevo(e.sugerido); })
            .catch((e) => setError(e.message));
    }, [opened, cliente, credencialesIniciales]);

    const ejecutar = async (accion) => {
        setCargando(true); setError('');
        try {
            const r = await pedirJson(`/api/clientes/${cliente.id}/acceso`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion, user: accion === 'CREAR' ? usuarioNuevo : undefined }),
            });
            setCredenciales(r); setEstado((e) => ({ ...e, usuario: r.user })); setConfirmando(false);
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            notifications.show({ color: 'teal', message: r.creado ? 'Acceso creado' : 'Contraseña restablecida' });
        } catch (e) {
            setError(e.message);
        } finally {
            setCargando(false);
        }
    };

    const mensaje = credenciales
        ? `Hola ${cliente?.nombre || ''}, este es tu acceso al portal de clientes de Mediquir:\n\nUsuario: ${credenciales.user}\nClave temporal: ${credenciales.password}\n\nIngresa en ${typeof window !== 'undefined' ? window.location.origin : ''}/login y cambia tu clave desde tu perfil.`
        : '';
    const wa = telefonoWhatsapp(cliente?.telefono);

    return (
        <Modal opened={opened} onClose={onClose} centered size="md" title={<Group gap="xs"><IconKey size={20} /><Text fw={800}>Acceso al portal B2B</Text></Group>}>
            <Stack gap="md">
                <Box>
                    <Text fw={700}>{cliente?.nombre || cliente?.identificacion}</Text>
                    <Text size="xs" c="dimmed">{cliente?.identificacion}</Text>
                </Box>

                {error && <Alert color="red" icon={<IconAlertTriangle size={16} />} p="xs">{error}</Alert>}

                {credenciales ? (
                    <Stack gap="sm">
                        <Alert color="teal" icon={<IconCheck size={16} />} title={credenciales.creado ? 'Acceso creado' : 'Contraseña restablecida'}>
                            Esta clave <b>solo se muestra ahora</b>. Cópiala o envíala al cliente; luego podrá cambiarla desde su perfil.
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
                ) : estado?.usuario ? (
                    <Stack gap="sm">
                        <Group gap="xs"><Text size="sm">Usuario actual:</Text><Badge size="lg" variant="light" tt="none" ff="monospace">{estado.usuario}</Badge></Group>
                        <Text size="sm" c="dimmed">¿El cliente olvidó su contraseña? Genera una clave temporal nueva; la anterior dejará de funcionar.</Text>
                        {!confirmando
                            ? <Button color="orange" variant="light" leftSection={<IconKey size={16} />} onClick={() => setConfirmando(true)}>Restablecer contraseña</Button>
                            : (
                                <Group grow>
                                    <Button variant="default" onClick={() => setConfirmando(false)}>Cancelar</Button>
                                    <Button color="orange" loading={cargando} onClick={() => ejecutar('RESTABLECER')}>Sí, restablecer</Button>
                                </Group>
                            )}
                    </Stack>
                ) : estado ? (
                    <Stack gap="sm">
                        <Group gap="sm" wrap="nowrap"><ThemeIcon variant="light" size={40} radius="md"><IconUserPlus size={22} /></ThemeIcon>
                            <Text size="sm" c="dimmed">Este cliente aún no puede entrar al portal para hacer pedidos y ver sus cuentas. Crea su usuario: se genera una clave temporal.</Text></Group>
                        <TextInput label="Nombre de usuario" description="3 a 30 caracteres: minúsculas, números, punto, guion o guion bajo" value={usuarioNuevo} onChange={(e) => setUsuarioNuevo(e.currentTarget.value)} />
                        <Button loading={cargando} color="navy.9" leftSection={<IconUserPlus size={16} />} onClick={() => ejecutar('CREAR')}>Crear acceso</Button>
                    </Stack>
                ) : !error && <Text size="sm" c="dimmed">Consultando…</Text>}
            </Stack>
        </Modal>
    );
}
