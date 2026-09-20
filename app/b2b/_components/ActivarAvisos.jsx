'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBell } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { suscribirsePush } from '@/app/handlers/push';

// Invita al cliente a activar los avisos en su teléfono o computadora para enterarse de cada paso de su pedido
// (empacado, transporte, despacho, pagos y retenciones). Solo aparece si todavía no dio el permiso.
export default function ActivarAvisos() {
    const { user } = useAuth();
    const [estado, setEstado] = useState('oculto'); // oculto | pedir | bloqueado
    const [activando, setActivando] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return;
        if (Notification.permission === 'granted') return;
        setEstado(Notification.permission === 'denied' ? 'bloqueado' : 'pedir');
    }, []);

    if (estado === 'oculto') return null;

    const activar = async () => {
        setActivando(true);
        try {
            const permiso = await Notification.requestPermission();
            if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'pedir'); return; }
            await suscribirsePush(user);
            setEstado('oculto');
            notifications.show({ color: 'teal', title: 'Avisos activados', message: 'Te avisaremos de cada paso de tus pedidos.' });
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudieron activar', message: 'Inténtalo de nuevo o revisa los permisos del navegador.' });
        } finally {
            setActivando(false);
        }
    };

    return (
        <Alert color="blue" variant="light" icon={<IconBell size={20} />} title="Entérate de cada paso de tu pedido">
            <Group justify="space-between" wrap="wrap" gap="sm">
                <Text size="sm" maw={560}>
                    {estado === 'bloqueado'
                        ? 'Bloqueaste los avisos en este navegador. Para recibirlos, permite las notificaciones de este sitio desde la configuración del navegador.'
                        : 'Activa los avisos y te diremos cuando tu pedido se empaque, tenga transporte o salga, y cuando confirmemos tus pagos y retenciones.'}
                </Text>
                {estado === 'pedir' && <Button size="xs" loading={activando} onClick={activar} leftSection={<IconBell size={14} />}>Activar avisos</Button>}
            </Group>
        </Alert>
    );
}
