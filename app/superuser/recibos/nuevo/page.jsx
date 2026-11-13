'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ReciboForm from '../_components/ReciboForm';

export default function NuevoRecibo() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [guardando, setGuardando] = useState(false);
    const { data } = useQuery({ queryKey: ['recibos'], queryFn: async () => (await fetch('/api/recibos?limite=1')).json() });
    const guardar = async (datos) => {
        setGuardando(true);
        try {
            const res = await fetch('/api/recibos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
            const r = await res.json();
            if (!res.ok) throw new Error(r.error || 'No se pudo guardar');
            await queryClient.invalidateQueries({ queryKey: ['recibos'] });
            notifications.show({ color: 'teal', title: 'Recibo guardado', message: `N.º ${r.numero}` });
            router.replace(`/superuser/recibos/${r.id}`);
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); setGuardando(false); }
    };
    return (
        <Box px={{ base: 'xs', sm: 'md' }} py="sm" maw={760} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser/recibos')}>Recibos</Button>
            <Title order={2} c="white" mb="sm">Nuevo recibo</Title>
            <ReciboForm numeroSugerido={data?.siguiente} onGuardar={guardar} guardando={guardando} onCancelar={() => router.push('/superuser/recibos')} />
        </Box>
    );
}
