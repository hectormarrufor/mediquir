// app/superuser/reportes/page.js
'use client';

import { Button, Card, Title, Stack, SimpleGrid, useMantineTheme, Group } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';


export default function ReportesDashboardPage() {
    const router = useRouter();
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

    return (
        <Stack justify="center" align="center" h="100vh">
            <Card
                shadow="md"
                padding="xl"
                radius="md"
                 
                style={{ width: '100%', maxWidth: 800, backgroundColor: 'white' }}
            >
                <Title order={2} align="center" mb="lg">
                    Módulo de Reportes
                </Title>

                <SimpleGrid
                    cols={isMobile ? 1 : 2}
                    spacing="md"
                    breakpoints={[
                        { maxWidth: 'lg', cols: 2 },
                        { maxWidth: 'md', cols: 1 },
                    ]}
                >
                    <Button fullWidth variant="filled" onClick={() => router.push('/superuser/reportes/compras')}>
                        Reporte de Compras 📈
                    </Button>
                    {/* Añade otros botones de reportes aquí a medida que los desarrolles */}
                    <Button fullWidth variant="filled" onClick={() => router.push('/superuser/reportes/facturacion')}>
                        Reporte de facturacion (Próximamente)
                    </Button>
                    <Button fullWidth variant="outline" disabled>
                        Reporte de Inventario (Próximamente)
                    </Button>
                    <Button fullWidth variant="outline" disabled>
                        Reporte de Tesorería (Próximamente)
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