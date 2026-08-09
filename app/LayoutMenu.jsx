'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, Button, Group, Menu, Text, UnstyledButton, rem } from '@mantine/core';
import { IconKey, IconLogout, IconChevronDown, IconLayoutDashboard } from '@tabler/icons-react';
import ChangePasswordForm from './ChangePasswordForm';

const LayoutMenu = ({ router }) => {
    // Extraemos clienteId del hook de autenticación
    const { isAuthenticated, logout, nombre, imagen, changePassword, userId, loading, clienteId } = useAuth();
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);

    if (loading) return null; 

    if (!isAuthenticated) {
        return (
            <Button onClick={() => router.push("/login")} variant="filled" color="blue" radius="xl">
                Iniciar sesión
            </Button>
        );
    }

    // Lógica dinámica para el botón de Menú Principal
    const handleMainMenuClick = () => {
        if (clienteId) {
            router.push('/tienda'); // Si es cliente, va a su tienda
        } else {
            router.push('/superuser'); // Si es empleado/admin, va al panel general
        }
    };

    // Estado: Autenticado
    return (
        <>
            <Group gap="xs">
                {/* Botón dinámico al Menú Principal / Tienda */}
                <Button 
                    variant="subtle" 
                    color="gray" 
                    onClick={handleMainMenuClick}
                    leftSection={<IconLayoutDashboard size={18} />}
                >
                    {clienteId ? 'Ir a Tienda' : 'Menú Principal'}
                </Button>

                {/* Dropdown de Usuario */}
                <Menu shadow="md" width={220} position="bottom-end" transitionProps={{ transition: 'pop-top-right' }}>
                    <Menu.Target>
                        <UnstyledButton 
                            style={{ 
                                padding: '4px 8px', 
                                borderRadius: '30px', 
                                transition: 'background-color 0.2s' 
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Group gap="xs">
                                <Avatar 
                                    src={imagen ? `${imagen}/?v=${process.env.NEXT_PUBLIC_APP_VERSION}` : null} 
                                    alt={nombre} 
                                    radius="xl" 
                                    size="md" 
                                    color="blue"
                                >
                                    {nombre?.charAt(0)}
                                </Avatar>
                                <div style={{ flex: 1 }}>
                                    <Text size="sm" fw={500} lh={1} mr={5}>
                                        {nombre?.split(' ')[0]}
                                    </Text>
                                </div>
                                <IconChevronDown size={14} stroke={1.5} color="gray" />
                            </Group>
                        </UnstyledButton>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Menu.Label>Cuenta</Menu.Label>
                        
                        <Menu.Item 
                            leftSection={<IconKey style={{ width: rem(16), height: rem(16) }} stroke={1.5} />}
                            onClick={() => setPasswordModalOpen(true)}
                        >
                            Cambiar contraseña
                        </Menu.Item>

                        <Menu.Divider />

                        <Menu.Item 
                            color="red" 
                            leftSection={<IconLogout style={{ width: rem(16), height: rem(16) }} stroke={1.5} />}
                            onClick={logout}
                        >
                            Cerrar sesión
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>

            {/* Modal de cambio de contraseña */}
            <ChangePasswordForm
                opened={passwordModalOpen}
                onClose={() => setPasswordModalOpen(false)}
                onSubmit={changePassword}
                userId={userId}
            />
        </>
    );
};

export default LayoutMenu;