'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from '@mantine/form';
import { Select, Button, Group, NumberInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/hooks/useAuth';

export default function SalidaForm() {
    const router = useRouter();
    const { user } = useAuth();
    const [consumibles, setConsumibles] = useState([]);
    const [activos, setActivos] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Cargar consumibles y activos para los selects
        fetch('/api/inventario/consumibles').then(res => res.json()).then(data => setConsumibles(data.map(c => ({ value: c.id.toString(), label: c.nombre }))));
        fetch('/api/gestionMantenimiento/activos').then(res => res.json()).then(data => setActivos(data.map(a => ({ value: a.id.toString(), label: a.codigoActivo }))));
    }, []);

    const form = useForm({
        initialValues: {
            consumibleId: '',
            activoId: '',
            cantidad: 1,
            justificacion: ''
        },
        validate: {
            consumibleId: (v) => (v ? null : 'Requerido'),
            activoId: (v) => (v ? null : 'Requerido'),
            cantidad: (v) => (v > 0 ? null : 'Debe ser mayor a 0'),
            justificacion: (v) => (v.trim().length > 0 ? null : 'La justificación es obligatoria'),
        }
    });

    const handleSubmit = async (values) => {
        setLoading(true);
        const payload = { ...values, userId: user.userId }; // Se podría añadir el userId

        try {
            const response = await fetch('/api/inventario/salidas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error((await response.json()).message);
            notifications.show({ title: 'Éxito', message: 'Salida de inventario registrada.', color: 'green' });
            router.push('/superuser/inventario/salidas');
            router.refresh();
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            <Select label="Consumible a Retirar" data={consumibles} searchable required {...form.getInputProps('consumibleId')} />
            <Group grow mt="md">
                <NumberInput label="Cantidad" required min={1} {...form.getInputProps('cantidad')} />
                <Select label="Asignar a Activo" data={activos} searchable required {...form.getInputProps('activoId')} />
            </Group>
            <Textarea
                label="Justificación / Motivo de la Salida"
                placeholder="Ej: Reemplazo por mantenimiento preventivo 5000 KM."
                required
                mt="md"
                autosize
                minRows={3}
                {...form.getInputProps('justificacion')}
            />
            <Button type="submit" mt="xl" loading={loading}>Registrar Salida</Button>
        </form>
    );
}