'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, Button, Group, Menu, Text, UnstyledButton, rem, ActionIcon, Tooltip } from '@mantine/core';
import { IconKey, IconLogout, IconChevronDown, IconLayoutDashboard, IconBrandWhatsapp, IconUserCircle } from '@tabler/icons-react';
import ChangePasswordForm from './ChangePasswordForm';

const LayoutMenu = ({ router }) => {
    const { isAuthenticated, logout, nombre, imagen, changePassword, userId, loading, clienteId } = useAuth();
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);

    if (loading) return null; 

    // ESTADO: NO AUTENTICADO
    if (!isAuthenticated) {
        return (
            <Group gap="sm">
                {/* Botón de WhatsApp con el tono dinámico de Adsterra o verde corporativo, ajustado a estilo moderno */}
                <Button 
                    component="a"
                    href="https://wa.me/584146501059"
                    target="_blank"
                    variant="filled"
                    radius="xl"
                    size="sm"
                    leftSection={<IconBrandWhatsapp size={18} />}
                    style={{ 
                        backgroundColor: '#F93200', // Rojo vibrante estilo Adsterra
                        transition: 'transform 0.2s ease, background-color 0.2s ease',
                        boxShadow: '0 4px 15px rgba(249, 50, 0, 0.25)'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.backgroundColor = '#D42B00';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.backgroundColor = '#F93200';
                    }}
                >
                    Contáctanos
                </Button>

                {/* Botón Discreto de Inicio de Sesión */}
                <Tooltip label="Acceso" withArrow position="bottom">
                    <ActionIcon 
                        variant="subtle" 
                        color="gray.6" 
                        size="lg" 
                        radius="xl"
                        onClick={() => router.push("/login")}
                        style={{ transition: 'color 0.2s ease' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#F93200'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--mantine-color-gray-6)'}
                    >
                        <IconUserCircle size={26} stroke={1.2} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        );
    }

    // ESTADO: AUTENTICADO
    const handleMainMenuClick = () => {
        if (clienteId) {
            router.push('/tienda'); 
        } else {
            router.push('/superuser'); 
        }
    };

    return (
        <>
            <Group gap="xs">
                <Button 
                    variant="subtle" 
                    color="gray" 
                    radius="xl"
                    onClick={handleMainMenuClick}
                    leftSection={<IconLayoutDashboard size={18} />}
                >
                    {clienteId ? 'Ir a Tienda' : 'Menú Principal'}
                </Button>

                <Menu shadow="xl" width={220} position="bottom-end" transitionProps={{ transition: 'pop-top-right' }} withArrow>
                    <Menu.Target>
                        <UnstyledButton 
                            style={{ 
                                padding: '4px 8px', 
                                borderRadius: '30px', 
                                transition: 'background-color 0.2s',
                                border: '1px solid transparent'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
                                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.borderColor = 'transparent';
                            }}
                        >
                            <Group gap="xs">
                                <Avatar 
                                    src={imagen ? `${imagen}/?v=${process.env.NEXT_PUBLIC_APP_VERSION}` : null} 
                                    alt={nombre} 
                                    radius="xl" 
                                    size="md" 
                                    color="dark"
                                >
                                    {nombre?.charAt(0)}
                                </Avatar>
                                <div style={{ flex: 1 }}>
                                    <Text size="sm" fw={600} lh={1} mr={5} c="#0B1B3D">
                                        {nombre?.split(' ')[0]}
                                    </Text>
                                </div>
                                <IconChevronDown size={14} stroke={2} color="#0B1B3D" />
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