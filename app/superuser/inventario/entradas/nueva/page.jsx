'use client';
import { useState, useEffect } from 'react';
import { useForm } from '@mantine/form';
import { Select, Button, Group, NumberInput, TextInput, Paper, Title, Modal, ActionIcon, Box, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth'; // Importamos el hook de autenticación


export default function NuevaEntradaPage() {
    const { userId } = useAuth(); // Obtenemos el usuario de la sesión
    const [consumibles, setConsumibles] = useState([]);
    const [modalOpened, setModalOpened] = useState(false);
    const [renglonIndex, setRenglonIndex] = useState(null); // Para saber a qué renglón añadir el nuevo consumible
    const [loading, setLoading] = useState(false);

    const form = useForm({
        initialValues: {
            renglones: [
                { consumibleId: '', cantidad: 1, costoUnitario: 0, proveedor: '' }
            ],
        },
        // ... validaciones si son necesarias
    });

    const fetchConsumibles = async () => {
        const response = await fetch('/api/inventario/consumibles');
        const data = await response.json();
        setConsumibles(data.map(c => ({ value: c.id.toString(), label: c.nombre })));
    };
    useEffect(() => { fetchConsumibles(); }, []);

    const openCrearConsumibleModal = (index) => {
        setRenglonIndex(index); // Guardamos el índice del renglón que necesita el nuevo consumible
        setModalOpened(true);
    };

    const handleConsumibleCreado = async (nuevoConsumible) => {
        await fetchConsumibles();
        // Usamos el 'renglonIndex' guardado para actualizar el campo correcto
        form.setFieldValue(`renglones.${renglonIndex}.consumibleId`, nuevoConsumible.id.toString());
        setModalOpened(false);
        notifications.show({ title: 'Éxito', message: 'Consumible creado y seleccionado.', color: 'green' });
    };

    const handleSubmit = async (values) => {
        setLoading(true);
        const payload = {
            renglones: values.renglones,
            userId
        };
        console.log(`\x1b[44m [DATOS] a api/inventario/entradas: ${JSON.stringify(payload)}  \x1b[0m`);
        console.log(`\x1b[44m [DATOS] a api/inventario/entradas: ${userId}  \x1b[0m`);
        
        try {
            const response = await fetch('/api/inventario/entradas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error((await response.json()).message);
            notifications.show({ title: 'Éxito', message: 'Entradas registradas correctamente.', color: 'green' });
            // router.push('/superuser/inventario/entradas');
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setLoading(false);
        }
    };
    
    const renglonesFields = form.values.renglones.map((item, index) => (
        <Paper   p="md" mt="sm" key={index}>
            <Group justify="space-between" mb="xs">
                <Text fw={500}>Renglón #{index + 1}</Text>
                {index > 0 && <ActionIcon color="red" onClick={() => form.removeListItem('renglones', index)}><IconTrash size={16} /></ActionIcon>}
            </Group>
            <Group align="flex-end">
                <Select data={consumibles} searchable required style={{ flex: 1 }} {...form.getInputProps(`renglones.${index}.consumibleId`)} />
                <ActionIcon size="lg" variant="filled" onClick={() => openCrearConsumibleModal(index)}><IconPlus /></ActionIcon>
            </Group>
            <Group grow mt="md">
                <NumberInput label="Cantidad" required min={0.01} {...form.getInputProps(`renglones.${index}.cantidad`)} />
                <NumberInput label="Costo Unitario ($)" {...form.getInputProps(`renglones.${index}.costoUnitario`)} />
            </Group>
             <TextInput label="Proveedor (Opcional)" mt="md" {...form.getInputProps(`renglones.${index}.proveedor`)} />
        </Paper>
    ));

    return (
        <Paper   p="xl" mt={30}>
            <Title order={2} mb="xl">Registrar Entradas de Inventario (Lote)</Title>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                {renglonesFields}
                <Group mt="md">
                    <Button variant="outline" onClick={() => form.insertListItem('renglones', { consumibleId: '', cantidad: 1, costoUnitario: 0, proveedor: '' })}>
                        Añadir Renglón
                    </Button>
                </Group>
                <Button type="submit" mt="xl" size="md" loading={loading}>
                    Registrar Todas las Entradas
                </Button>
            </form>

            <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title="Crear Nuevo Consumible" size="xl" centered>
            </Modal>
        </Paper>
    );
}

 