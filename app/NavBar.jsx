'use client';

import { useAuth } from '@/hooks/useAuth';
import { Box, Stack, Title, UnstyledButton, rem } from '@mantine/core';
import { IconHome, IconUser, IconLogout, IconLogin, IconDashboard, IconEyeDollar } from '@tabler/icons-react';
import React from 'react';
// 1. IMPORTAMOS EL CSS AQUÍ DIRECTAMENTE
import classes from './MobileNavbar.module.css';

const NavBar = ({ router, close }) => { // Recibimos 'close' para cerrar el menú al navegar
    const { isAuthenticated, logout, nombre, loading } = useAuth();

    // Helper para navegar y cerrar el menú
    const handleNavigate = (path) => {
        router.push(path);
        if (close) close();
    };

    const handleLogout = () => {
        logout();
        if (close) close();
    };

    const handleEnableNotifications = async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            // Aquí ya puedes proceder a registrar el Service Worker y el Push Manager
            console.log("Permiso concedido");
        }
    };
    if (loading) return <Box p="md">Cargando...</Box>;
    return (
        <Stack mt="xl" gap="sm" align='stretch' px="md">

            {/* Inicio (Visible siempre o condicional según prefieras) */}
            <UnstyledButton className={classes.control} onClick={() => handleNavigate('/')}>
                <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <IconHome size={20} /> Inicio
                </Title>
            </UnstyledButton>

            {/* Usuario Autenticado */}
            {isAuthenticated && (
                <>
                    <UnstyledButton className={classes.control} onClick={() => handleNavigate('/superuser')}>
                        <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <IconUser size={20} /> Hola, {nombre?.split(' ')[0]}
                        </Title>
                    </UnstyledButton>
                    <UnstyledButton className={classes.control} onClick={() => handleNavigate('/superuser/bcv')}>
                        <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <IconEyeDollar size={20} /> Ver Grafico BCV
                        </Title>
                    </UnstyledButton>

                    <UnstyledButton className={classes.control} onClick={() => handleNavigate('/superuser')}>
                        <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <IconDashboard size={20} /> Panel Admin
                        </Title>
                    </UnstyledButton>
                    {Notification.permission !== "granted" && <UnstyledButton className={classes.control} onClick={() => handleEnableNotifications()}>
                        <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <IconDashboard size={20} /> Otorgar permiso de notificaciones
                        </Title>
                    </UnstyledButton>}
                </>
            )}

            {/* Login / Logout */}
            {!isAuthenticated ? (
                <UnstyledButton className={classes.control} onClick={() => handleNavigate('/login')}>
                    <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <IconLogin size={20} /> Iniciar Sesión
                    </Title>
                </UnstyledButton>
            ) : (
                <UnstyledButton
                    className={classes.control}
                    onClick={handleLogout}
                    style={{ color: 'var(--mantine-color-red-6)' }}
                >
                    <Title order={6} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <IconLogout size={20} /> Cerrar Sesión
                    </Title>
                </UnstyledButton>
            )}
        </Stack>
    );
};

export default NavBar;