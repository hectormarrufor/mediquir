// app/superuser/inventario/consumibles/crear/page.jsx
'use client';

import { Container, Title, Paper, Group, Button, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';

// IMPORTAMOS EL MISMO COMPONENTE QUE USAS EN EL MODAL
import ConsumibleForm from '@/app/superuser/inventario/components/ConsumibleForm';

export default function CrearConsumiblePage() {
    const router = useRouter();

    return (
        <Paper size="md" py="xl">
            {/* Encabezado de la página */}
            <Group mb="lg">
                <Button 
                    variant="subtle" 
                    leftSection={<IconArrowLeft size={18}/>}
                    onClick={() => router.back()}
                >
                    Volver
                </Button>
                <Title order={2}>Registrar Nuevo Item al Inventario</Title>
            </Group>

            <Paper p="xl" radius="md" withBorder shadow="sm">
                <Text c="dimmed" size="sm" mb="md">
                    Complete los datos técnicos. Si es un item serializado (batería, neumático), 
                    se le solicitará el ingreso de los seriales aquí mismo.
                </Text>

                {/* AQUÍ ESTÁ LA REUTILIZACIÓN */}
                <ConsumibleForm 
                    onSuccess={(data) => {
                        // LÓGICA DE PÁGINA: Redirigir al listado general
                        // O podrías redirigir al detalle del item creado: router.push(`/inventario/${data.id}`)
                        router.push('/superuser/inventario/consumibles');
                    }}
                    onCancel={() => {
                        // LÓGICA DE PÁGINA: Volver atrás
                        router.back();
                    }}
                />
            </Paper>
        </Paper>
    );
}