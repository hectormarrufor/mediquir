'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useTasaBcv } from '@/hooks/useTasaBcv';

// Modificar un presupuesto guardado: la misma pantalla de armar presupuestos, con sus renglones ya cargados.
const PosModal = dynamic(() => import('../../../../components/admin/PosModal'), { ssr: false });

export default function EditarPresupuesto() {
    const params = useParams();
    const router = useRouter();
    const { tasa } = useTasaBcv();
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
    return <PosModal opened modo="presupuesto" presupuestoEditar={presupuesto} tasaBcv={tasa || 0} onClose={() => router.push(`/superuser/presupuestos/${params.id}`)} />;
}
