'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Container, Title, Text, SimpleGrid, Card, Image, 
    Button, Group, TextInput, Stack, Center, Loader, Badge, Box 
} from '@mantine/core';
import { IconSearch, IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

export default function TiendaPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');

    // Consumimos el endpoint general de productos
    const { data: productos, isLoading, isError } = useQuery({
        queryKey: ['productos-tienda-catalogo'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar catálogo');
            return res.json();
        }
    });

    const productosFiltrados = productos?.filter(p => 
        p.nombre.toLowerCase().includes(search.toLowerCase()) ||
        (p.codigo && p.codigo.toLowerCase().includes(search.toLowerCase()))
    );

    if (isLoading) return <Center h="60vh"><Loader size="lg" /></Center>;
    if (isError) return <Center h="60vh"><Text c="red">Ocurrió un error al cargar los productos.</Text></Center>;

    return (
        <Container size="xl">
            {/* ENCABEZADO Y BUSCADOR */}
            <Group justify="space-between" mb="xl" align="flex-end">
                <Stack gap={4}>
                    <Title order={2} c="blue.9">Catálogo de Productos</Title>
                    <Text size="sm" c="dimmed">Selecciona los insumos médicos que requieras para tu centro de salud.</Text>
                </Stack>
                <Button 
                    color="blue" 
                    leftSection={<IconPlus size={16} />}
                    onClick={() => router.push('/tienda/pedidos/nuevo')}
                >
                    Crear Pedido
                </Button>
            </Group>

            <TextInput
                placeholder="Buscar por nombre o código de producto..."
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                mb="xl"
                size="md"
            />

            {/* GRILLA DE PRODUCTOS */}
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
                {productosFiltrados?.map((prod) => (
                    <Card key={prod.id} shadow="sm" padding="lg" radius="md" withBorder>
                        <Card.Section>
                            <Box h={160} pos="relative" bg="gray.1">
                                <Image
                                    src={prod.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${prod.imagen}` : null}
                                    height={160}
                                    alt={prod.nombre}
                                    fallbackSrc="https://placehold.co/400x300?text=Sin+Imagen"
                                    fit="cover"
                                />
                            </Box>
                        </Card.Section>

                        <Stack mt="md" justify="space-between" h={120}>
                            <div>
                                <Badge size="xs" variant="light" mb={4}>{prod.categoria?.nombre || 'General'}</Badge>
                                <Text fw={700} size="sm" lineClamp={2}>{prod.nombre}</Text>
                            </div>

                            <Group justify="space-between" align="center">
                                <Text fw={900} size="lg" c="green.7">${Number(prod.precio).toFixed(2)}</Text>
                                <Button 
                                    size="xs" 
                                    variant="light"
                                    onClick={() => router.push('/tienda/pedidos/nuevo')}
                                >
                                    Solicitar
                                </Button>
                            </Group>
                        </Stack>
                    </Card>
                ))}
            </SimpleGrid>
        </Container>
    );
}