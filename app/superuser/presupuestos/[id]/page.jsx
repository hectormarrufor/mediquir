'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PresupuestoImprimible from '../_components/PresupuestoImprimible';

export default function VerPresupuesto() {
    const params = useParams();
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
    return <PresupuestoImprimible presupuesto={presupuesto} />;
}
