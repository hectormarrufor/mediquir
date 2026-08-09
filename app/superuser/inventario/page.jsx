// app/superuser/inventario/page.js
'use client';

import { Button, Card, Title, Stack, SimpleGrid, useMantineTheme, Group, ThemeIcon, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { IconEngine } from '@tabler/icons-react';

export default function InventarioDashboardPage() {
    const router = useRouter();
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

    return (
        <Stack justify="center" align="center" h="100vh" bg="gray.0">
            <Card
                shadow="xl"
                padding="xl"
                radius="md"
                withBorder
                style={{ width: '100%', maxWidth: 800, backgroundColor: 'white' }}
            >
                <Title order={2} ta="center" mb="lg" c="dark.8">
                    Módulo de Inventario y Anatomía
                </Title>

                <SimpleGrid
                    cols={isMobile ? 1 : 2}
                    spacing="md"
                    breakpoints={[
                        { maxWidth: 'lg', cols: 2 },
                        { maxWidth: 'md', cols: 1 },
                    ]}
                >
                    <Button fullWidth variant="filled" size="md" onClick={() => router.push('/superuser/inventario/consumibles')}>
                        Gestión de Consumibles 📦
                    </Button>
                    <Button fullWidth variant="filled" size="md" onClick={() => router.push('/superuser/inventario/entradas')}>
                        Entradas de Inventario 📥
                    </Button>
                    <Button fullWidth variant="filled" size="md" onClick={() => router.push('/superuser/inventario/salidas')}>
                        Salidas de Inventario 📤
                    </Button>
                    <Button fullWidth variant="filled" size="md" onClick={() => router.push('/superuser/inventario/consumibles-usados')}>
                        Consumibles Usados 🛠️
                    </Button>
                    <Button fullWidth variant="filled" size="md" onClick={() => router.push('/superuser/inventario/tipos-consumibles')}>
                        Editar Tipos de Consumibles 🛠️
                    </Button>
                    
                    {/* 🔥 NUEVO ACCESO A SUBSISTEMAS 🔥 */}
                    <Button 
                        fullWidth 
                        variant="light" 
                        color="orange.7" 
                        size="md" 
                        leftSection={<IconEngine size={20} />}
                        onClick={() => router.push('/superuser/inventario/subsistemas')}
                    >
                        Plantillas de Subsistemas
                    </Button>
                </SimpleGrid>

                <Group justify="flex-end" mt="xl">
                    <Button variant="default" onClick={() => router.push('/superuser')}>
                        Volver al Menú Principal
                    </Button>
                </Group>
            </Card>
        </Stack>
    );
}