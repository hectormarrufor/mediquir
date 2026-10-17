'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTasaBcv } from '@/hooks/useTasaBcv';

// El presupuesto se arma en la misma pantalla que una venta (PosModal en modo presupuesto): una sola forma de cargar productos y precios.
const PosModal = dynamic(() => import('../../../components/admin/PosModal'), { ssr: false });

export default function NuevoPresupuesto() {
    const router = useRouter();
    const { tasa } = useTasaBcv();
    return <PosModal opened modo="presupuesto" tasaBcv={tasa || 0} onClose={() => router.push('/superuser/presupuestos')} />;
}
