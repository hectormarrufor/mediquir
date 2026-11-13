'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Box, Button, Title } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ReciboForm from '../../_components/ReciboForm';

export default function EditarRecibo() {
    const { id } = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [recibo, setRecibo] = useState(null);
    const [error, setError] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/recibos/${id}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
                setRecibo(data);
            } catch (e) { setError(e.message); }
        })();
    }, [id]);

    const guardar = async (datos) => {
        setGuardando(true);
        try {
            const res = await fetch(`/api/recibos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
            const r = await res.json();
            if (!res.ok) throw new Error(r.error || 'No se pudo guardar');
            await queryClient.invalidateQueries({ queryKey: ['recibos'] });
            notifications.show({ color: 'teal', title: 'Recibo modificado', message: `N.º ${r.numero}` });
            router.replace(`/superuser/recibos/${id}`);
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); setGuardando(false); }
    };

    if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>{error}</div>;
    if (!recibo) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Cargando recibo…</div>;
    return (
        <Box px={{ base: 'xs', sm: 'md' }} py="sm" maw={760} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push(`/superuser/recibos/${id}`)}>Volver al recibo</Button>
            <Title order={2} c="white" mb="sm">Modificar recibo N.º {recibo.numero}</Title>
            <ReciboForm inicial={recibo} onGuardar={guardar} guardando={guardando} textoGuardar="Guardar cambios" onCancelar={() => router.push(`/superuser/recibos/${id}`)} />
        </Box>
    );
}
