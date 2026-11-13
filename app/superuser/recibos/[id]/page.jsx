'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@mantine/core';
import { IconBan, IconEdit, IconList, IconPlus, IconRestore } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import ReciboImprimible from '../_components/ReciboImprimible';

export default function VerRecibo() {
    const { id } = useParams();
    const router = useRouter();
    const [recibo, setRecibo] = useState(null);
    const [error, setError] = useState('');

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

    const anular = async (anulado) => {
        if (anulado && !window.confirm('¿Anular este recibo? Seguirá en la lista, marcado como anulado.')) return;
        try {
            const res = await fetch(`/api/recibos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anulado }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo cambiar');
            setRecibo(data);
        } catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };

    if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>{error}</div>;
    if (!recibo) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Cargando recibo…</div>;
    return (
        <ReciboImprimible recibo={recibo} accionesExtra={(
            <>
                <Button size="sm" variant="white" color="blue" leftSection={<IconEdit size={16} />} onClick={() => router.push(`/superuser/recibos/${id}/editar`)}>Modificar</Button>
                {recibo.anulado
                    ? <Button size="sm" variant="white" color="teal" leftSection={<IconRestore size={16} />} onClick={() => anular(false)}>Reactivar</Button>
                    : <Button size="sm" variant="white" color="red" leftSection={<IconBan size={16} />} onClick={() => anular(true)}>Anular</Button>}
                <Button size="sm" variant="white" color="dark" leftSection={<IconList size={16} />} onClick={() => router.push('/superuser/recibos')}>Ver todos</Button>
                <Button size="sm" variant="white" color="teal" leftSection={<IconPlus size={16} />} onClick={() => router.push('/superuser/recibos/nuevo')}>Nuevo</Button>
            </>
        )} />
    );
}
