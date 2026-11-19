'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, Group, Menu, Text, UnstyledButton, rem, Box } from '@mantine/core';
import { IconKey, IconLogout, IconChevronDown, IconLayoutGrid, IconBrandWhatsapp, IconLogin } from '@tabler/icons-react';
import ChangePasswordForm from './ChangePasswordForm';
import classes from './components/nav/navigation.module.css';

const LayoutMenu = ({ router }) => {
    const { isAuthenticated, logout, nombre, imagen, rol, changePassword, userId, loading, clienteId } = useAuth();
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);

    if (loading) return null;

    // ESTADO: NO AUTENTICADO
    if (!isAuthenticated) {
        return (
            <Group gap="sm" wrap="nowrap">
                <UnstyledButton className={classes.pill} onClick={() => router.push('/login')} aria-label="Iniciar sesión">
                    <IconLogin size={18} stroke={1.8} />
                    Ingresar
                </UnstyledButton>

                <UnstyledButton
                    component="a"
                    href="https://wa.me/584146501059"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classes.cta}
                >
                    <IconBrandWhatsapp size={18} />
                    Contáctanos
                </UnstyledButton>
            </Group>
        );
    }

    // ESTADO: AUTENTICADO
    const handleMainMenuClick = () => router.push(clienteId ? '/b2b' : '/superuser');
    const rolTexto = rol ? rol.charAt(0).toUpperCase() + rol.slice(1) : '';

    return (
        <>
            <Group gap={10} wrap="nowrap">
                <UnstyledButton className={classes.pill} onClick={handleMainMenuClick}>
                    <IconLayoutGrid size={17} stroke={1.8} />
                    {clienteId ? 'Mi portal' : 'Menú Principal'}
                </UnstyledButton>

                <Menu
                    shadow="xl"
                    width={240}
                    position="bottom-end"
                    radius="lg"
                    transitionProps={{ transition: 'pop-top-right' }}
                    classNames={{ dropdown: classes.menuDropdown, item: classes.menuItem }}
                >
                    <Menu.Target>
                        <UnstyledButton className={`${classes.pill} ${classes.pillUser}`} aria-label="Menú de cuenta">
                            <span className={classes.avatarWrap}>
                                <Avatar src={imagen || null} alt={nombre} radius="xl" size={32} variant="gradient" gradient={{ from: 'brand.5', to: 'sky.5', deg: 135 }} className={classes.avatar}>
                                    {nombre?.charAt(0)}
                                </Avatar>
                            </span>
                            <Box style={{ textAlign: 'left' }}>
                                <Text size="sm" fw={700} c="navy.9" lh={1.15}>{nombre?.split(' ')[0]}</Text>
                                {rolTexto && <Text fz={11} fw={500} c="dimmed" lh={1.2}>{rolTexto}</Text>}
                            </Box>
                            <IconChevronDown size={15} stroke={2} className={classes.chevron} />
                        </UnstyledButton>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Box px="sm" pt={4} pb="xs">
                            <Text size="sm" fw={800} c="navy.9" lineClamp={1}>{nombre}</Text>
                            {rolTexto && <Text size="xs" c="dimmed" lineClamp={1}>{rolTexto}</Text>}
                        </Box>
                        <Menu.Divider />

                        <Menu.Item
                            leftSection={<IconKey style={{ width: rem(16), height: rem(16) }} stroke={1.5} />}
                            onClick={() => setPasswordModalOpen(true)}
                        >
                            Cambiar contraseña
                        </Menu.Item>

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
