'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@mantine/core';
import { IconList, IconPlus } from '@tabler/icons-react';
import PresupuestoImprimible from '../_components/PresupuestoImprimible';

export default function VerPresupuesto() {
    const params = useParams();
    const router = useRouter();
    const [presupuesto, setPresupuesto] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/presupuestos/${params.id}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
                setPresupuesto(data);
            } catch (e) { setError(e.message); }
        })();
    }, [params.id]);

    if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>{error}</div>;
    if (!presupuesto) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Cargando presupuesto…</div>;
    return (
        <PresupuestoImprimible presupuesto={presupuesto} accionesExtra={(
            <>
                <Button size="sm" variant="white" color="dark" leftSection={<IconList size={16} />} onClick={() => router.push('/superuser/presupuestos')}>Ver todos</Button>
                <Button size="sm" variant="white" color="teal" leftSection={<IconPlus size={16} />} onClick={() => router.push('/superuser/presupuestos/nuevo')}>Nuevo</Button>
            </>
        )} />
    );
}
