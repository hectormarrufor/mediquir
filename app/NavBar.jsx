'use client';

import React from 'react';
import { Avatar, Box, Group, Loader, Text, UnstyledButton } from '@mantine/core';
import { usePathname } from 'next/navigation';
import {
    IconLogout, IconLogin, IconDashboard, IconEyeDollar, IconBell,
    IconBrandWhatsapp, IconHome, IconShoppingBag, IconReceipt
} from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';
import { tenant } from '@/config/tenant';
import { PUBLIC_LINKS, SPY_IDS, goToLink, useScrollSpy } from './components/nav/navLinks';
import classes from './components/nav/navigation.module.css';

function DrawerItem({ icon: Icon, label, onClick, active, danger, index = 0 }) {
    return (
        <UnstyledButton
            className={classes.drawerLink}
            data-active={active || undefined}
            data-danger={danger || undefined}
            style={{ '--i': index }}
            onClick={onClick}
        >
            <span className={classes.drawerIcon}><Icon size={20} stroke={1.7} /></span>
            <span>{label}</span>
        </UnstyledButton>
    );
}

const NavBar = ({ router, close, opened }) => {
    const { isAuthenticated, logout, nombre, imagen, rol, loading, clienteId } = useAuth();
    const pathname = usePathname();
    const esInvitado = !loading && !isAuthenticated;
    const activeSection = useScrollSpy(SPY_IDS, Boolean(opened) && pathname === '/' && esInvitado);

    // Navega y cierra el menú
    const go = (path) => {
        router.push(path);
        if (close) close();
    };

    const goSection = (link) => {
        goToLink(router, pathname, link);
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
            console.log('Permiso concedido');
        }
    };

    if (loading) {
        return (
            <Group justify="center" mt="xl">
                <Loader size="sm" color="white" type="dots" />
            </Group>
        );
    }

    const rolTexto = rol ? rol.charAt(0).toUpperCase() + rol.slice(1) : '';
    const puedePedirNotificaciones = typeof Notification !== 'undefined' && Notification.permission !== 'granted';
    let i = 0; // índice para la entrada escalonada

    return (
        <Box className={classes.drawerBody} data-opened={opened || undefined} component="nav" aria-label="Menú principal">
            {isAuthenticated && (
                <Box className={classes.userCard} style={{ '--i': i++ }}>
                    <Avatar
                        src={imagen ? `${imagen}/?v=${process.env.NEXT_PUBLIC_APP_VERSION}` : null}
                        alt={nombre}
                        radius="xl"
                        size={46}
                        color="blue"
                        style={{ border: '2px solid rgba(108,192,255,0.6)' }}
                    >
                        {nombre?.charAt(0)}
                    </Avatar>
                    <Box style={{ minWidth: 0 }}>
                        <Text c="white" fw={800} size="sm" lineClamp={1}>{nombre}</Text>
                        {rolTexto && <Text c="rgba(255,255,255,0.6)" size="xs" lineClamp={1}>{rolTexto}</Text>}
                    </Box>
                </Box>
            )}

            {/* INVITADO: secciones de la landing */}
            {esInvitado && (
                <>
                    <Text className={classes.drawerSection}>Explorar</Text>
                    {PUBLIC_LINKS.map((link) => (
                        <DrawerItem
                            key={link.key}
                            icon={link.icon}
                            label={link.label}
                            index={i++}
                            active={pathname === '/' && (link.target ? activeSection === link.target : activeSection === null)}
                            onClick={() => goSection(link)}
                        />
                    ))}
                    <Text className={classes.drawerSection}>Cuenta</Text>
                    <DrawerItem icon={IconLogin} label="Iniciar sesión" index={i++} active={pathname === '/login'} onClick={() => go('/login')} />
                </>
            )}

            {/* CLIENTE */}
            {isAuthenticated && clienteId && (
                <>
                    <Text className={classes.drawerSection}>Mi cuenta</Text>
                    <DrawerItem icon={IconShoppingBag} label="Tienda" index={i++} active={pathname === '/tienda'} onClick={() => go('/tienda')} />
                    <DrawerItem icon={IconReceipt} label="Mis pedidos" index={i++} active={pathname.startsWith('/tienda/pedidos')} onClick={() => go('/tienda/pedidos')} />
                </>
            )}

            {/* PERSONAL */}
            {isAuthenticated && !clienteId && (
                <>
                    <Text className={classes.drawerSection}>Navegación</Text>
                    <DrawerItem icon={IconHome} label="Inicio" index={i++} active={pathname === '/'} onClick={() => go('/')} />
                    <DrawerItem icon={IconDashboard} label="Panel admin" index={i++} active={pathname === '/superuser'} onClick={() => go('/superuser')} />
                    <DrawerItem icon={IconEyeDollar} label="Gráfico BCV" index={i++} active={pathname.startsWith('/superuser/bcv')} onClick={() => go('/superuser/bcv')} />
                    {puedePedirNotificaciones && (
                        <DrawerItem icon={IconBell} label="Activar notificaciones" index={i++} onClick={handleEnableNotifications} />
                    )}
                </>
            )}

            <Box className={classes.drawerFooter}>
                {isAuthenticated ? (
                    <DrawerItem icon={IconLogout} label="Cerrar sesión" danger index={i++} onClick={handleLogout} />
                ) : (
                    <UnstyledButton
                        component="a"
                        href="https://wa.me/584146501059"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={classes.cta}
                        style={{ width: '100%', justifyContent: 'center', padding: '12px 18px' }}
                    >
                        <IconBrandWhatsapp size={20} />
                        Escríbenos por WhatsApp
                    </UnstyledButton>
                )}
                <Text ta="center" size="xs" c="rgba(255,255,255,0.35)" mt="md">{tenant.name} C.A.</Text>
            </Box>
        </Box>
    );
};

export default NavBar;
