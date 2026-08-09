'use client';

import React from 'react';
import { AppShell, Group, Title, Button, Container, Box } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { IconShoppingBag, IconLogout } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';

export default function TiendaLayout({ children }) {
    const router = useRouter();
    const { logout, loading } = useAuth();

    if (loading) return null;

    return (
        <AppShell header={{ height: 60 }} padding="md">
            <AppShell.Header>
                <Container size="xl" h="100%">
                    <Group justify="space-between" h="100%">
                        <Title 
                            order={3} 
                            c="blue.9" 
                            style={{ cursor: 'pointer' }} 
                            onClick={() => router.push('/tienda')}
                        >
                            Mediquir B2B
                        </Title>
                        
                        <Group gap="sm">
                            <Button 
                                variant="subtle" 
                                leftSection={<IconShoppingBag size={18} />}
                                onClick={() => router.push('/tienda/pedidos/nuevo')}
                            >
                                Nuevo Pedido
                            </Button>
                            <Button 
                                variant="light" 
                                color="red" 
                                size="xs"
                                leftSection={<IconLogout size={16} />}
                                onClick={() => {
                                    logout();
                                    router.push('/login');
                                }}
                            >
                                Salir
                            </Button>
                        </Group>
                    </Group>
                </Container>
            </AppShell.Header>

            <AppShell.Main bg="gray.0">
                <Box py="md">
                    {children}
                </Box>
            </AppShell.Main>
        </AppShell>
    );
}