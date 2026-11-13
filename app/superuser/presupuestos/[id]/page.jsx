'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@mantine/core';
import { IconEdit, IconList, IconPlus, IconReceiptTax, IconTruckDelivery } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { armarBorradorVenta, BORRADOR_VENTA } from '@/app/constants/presupuestoAVenta';
import { useTasaBcv } from '@/hooks/useTasaBcv';
import PresupuestoImprimible from '../_components/PresupuestoImprimible';

export default function VerPresupuesto() {
    const params = useParams();
    const router = useRouter();
    const [presupuesto, setPresupuesto] = useState(null);
    const [error, setError] = useState('');
    const { tasa } = useTasaBcv();

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

    // Copia cliente y renglones al formulario de venta (POS) para hacer una factura o una nota de entrega; el presupuesto no se toca
    const pasarA = (tipo) => {
        if (tipo === 'FACTURA' && presupuesto.moneda !== 'BS' && !(tasa > 0)) return notifications.show({ message: 'Todavía no hay tasa BCV: espera un momento e intenta de nuevo', color: 'red' });
        try {
            const previo = JSON.parse(localStorage.getItem(BORRADOR_VENTA) || 'null');
            if (previo && (previo.carrito?.length || previo.cola?.length) && !window.confirm('Ya hay una venta a medias en el formulario de venta: se reemplazará por este presupuesto. ¿Continuar?')) return;
            const borrador = armarBorradorVenta(presupuesto, tipo, tasa);
            localStorage.setItem(BORRADOR_VENTA, JSON.stringify(borrador));
            if (borrador.origen.de > 1) notifications.show({ title: 'Varias facturas', message: `Este presupuesto no cabe en una sola forma libre: se harán ${borrador.origen.de} facturas, una tras otra.`, color: 'blue', autoClose: 8000 });
            router.push('/superuser/ventas?nueva=1');
        } catch { notifications.show({ message: 'No se pudo pasar el presupuesto al formulario de venta', color: 'red' }); }
    };

    if (error) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>{error}</div>;
    if (!presupuesto) return <div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Cargando presupuesto…</div>;
    return (
        <PresupuestoImprimible presupuesto={presupuesto} accionesExtra={(
            <>
                <Button size="sm" variant="white" color="indigo" leftSection={<IconReceiptTax size={16} />} onClick={() => pasarA('FACTURA')}>Pasar a factura</Button>
                <Button size="sm" variant="white" color="grape" leftSection={<IconTruckDelivery size={16} />} onClick={() => pasarA('NOTA')}>Pasar a nota de entrega</Button>
                <Button size="sm" variant="white" color="blue" leftSection={<IconEdit size={16} />} onClick={() => router.push(`/superuser/presupuestos/${params.id}/editar`)}>Modificar</Button>
                <Button size="sm" variant="white" color="dark" leftSection={<IconList size={16} />} onClick={() => router.push('/superuser/presupuestos')}>Ver todos</Button>
                <Button size="sm" variant="white" color="teal" leftSection={<IconPlus size={16} />} onClick={() => router.push('/superuser/presupuestos/nuevo')}>Nuevo</Button>
            </>
        )} />
    );
}
