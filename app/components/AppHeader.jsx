// app/components/AppHeader.jsx
'use client';
import { AppShell, Group, Burger, Text, Button, Menu, UnstyledButton, Avatar } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import { IconChevronDown, IconLogout, IconUserCircle, IconSettings } from '@tabler/icons-react';
import classes from './AppHeader.module.css';

export default function AppHeader() {
    const [opened, { toggle }] = useDisclosure();
    const { session, logout } = useAuth();
    const user = session?.user;

    return (
        <AppShell.Header className={classes.header}>
            <Group h="100%" px="md" justify="space-between">
                {/* --- Lado Izquierdo: Logo y Burger Menu (para móvil) --- */}
                <Group>
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                    <Text
                        component={Link}
                        href="/superuser"
                        size="xl"
                        fw={700}
                        variant="gradient"
                        gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
                        style={{ textDecoration: 'none' }}
                    >
                        WR Control
                    </Text>
                </Group>

                {/* --- Lado Derecho: Menú de Usuario --- */}
                {user && (
                    <Menu shadow="md" width={200}>
                        <Menu.Target>
                            <UnstyledButton className={classes.user}>
                                <Group>
                                    <Avatar color="blue" radius="xl">
                                        {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                    </Avatar>
                                    <div style={{ flex: 1 }}>
                                        <Text size="sm" fw={500}>
                                            {user.name}
                                        </Text>
                                        <Text c="dimmed" size="xs">
                                            {user.email}
                                        </Text>
                                    </div>
                                    <IconChevronDown size="0.9rem" stroke={1.5} />
                                </Group>
                            </UnstyledButton>
                        </Menu.Target>

                        <Menu.Dropdown>
                            <Menu.Label>Aplicación</Menu.Label>
                            <Menu.Item leftSection={<IconUserCircle size={14} />}>
                                Mi Perfil
                            </Menu.Item>
                            <Menu.Item leftSection={<IconSettings size={14} />}>
                                Configuración
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={logout}>
                                Cerrar Sesión
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>
        </AppShell.Header>
    );
}