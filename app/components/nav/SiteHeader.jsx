'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, Badge, Burger, Box, FloatingIndicator, Group, UnstyledButton } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { tenant } from '@/config/tenant';
import BrandLogo from '../BrandLogo';
import NotificationBell from '../NotificationBell';
import LayoutMenu from '../../LayoutMenu';
import { PUBLIC_LINKS, SPY_IDS, goToLink, useScrollSpy } from './navLinks';
import classes from './navigation.module.css';

const SECCIONES = [
    ['/superuser/ventas', 'Ventas'],
    ['/superuser/compras', 'Compras'],
    ['/superuser/inventario', 'Inventario'],
    ['/superuser/clientes', 'Clientes'],
    ['/superuser/proveedores', 'Proveedores'],
    ['/superuser/presupuestos', 'Presupuestos'],
    ['/superuser/finanzas', 'Finanzas'],
    ['/superuser/cxc', 'Cuentas por cobrar'],
    ['/superuser/cxp', 'Cuentas por pagar'],
    ['/superuser/rrhh', 'RRHH'],
    ['/superuser/bcv', 'Tasa BCV'],
    ['/superuser/notificaciones', 'Notificaciones'],
    ['/superuser/pedidos', 'Pedidos'],
    ['/superuser/empaque', 'Empaque'],
    ['/superuser/pagos-recibidos', 'Pagos recibidos'],
    ['/superuser/notas', 'Notas'],
    ['/superuser/recibos', 'Recibos'],
    ['/superuser/marcas', 'Marcas'],
    ['/superuser/correlativos', 'Correlativos'],
    ['/superuser/grupos-equivalencias', 'Equivalencias'],
    ['/superuser', 'Panel Principal'],
    ['/b2b/catalogo', 'Catálogo B2B'],
    ['/b2b/pedidos', 'Mis pedidos'],
    ['/b2b/cuentas', 'Cuentas por pagar'],
    ['/b2b/carrito', 'Carrito B2B'],
    ['/b2b', 'Portal B2B'],
];

function etiquetaSeccion(pathname) {
    if (pathname === '/') return 'Tienda pública';
    const match = SECCIONES.find(([prefijo]) => pathname === prefijo || pathname.startsWith(`${prefijo}/`));
    return match ? match[1] : null;
}

export default function SiteHeader({ opened, toggle }) {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, loading, clienteId } = useAuth();
    const [scrolled, setScrolled] = useState(false);

    // Solo cambia el estado cuando cruza el umbral, así que no re-renderiza en cada evento de scroll
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const showPublicLinks = !loading && !isAuthenticated;
    const seccionActual = !loading && isAuthenticated ? etiquetaSeccion(pathname) : null;
    const activeSection = useScrollSpy(SPY_IDS, pathname === '/' && showPublicLinks);
    const activeKey = pathname === '/' ? PUBLIC_LINKS.find((l) => (l.target ? activeSection === l.target : activeSection === null))?.key : null;

    // Indicador que se desliza bajo el enlace activo (Mantine FloatingIndicator)
    const [navRef, setNavRef] = useState(null);
    const [linkRefs, setLinkRefs] = useState({});
    const setLinkRef = (key) => (node) => { if (node && linkRefs[key] !== node) setLinkRefs((r) => ({ ...r, [key]: node })); };

    return (
        <AppShell.Header className={classes.header}>
            <Group className={classes.barra} data-scrolled={scrolled || undefined} px={{ base: 'sm', sm: 'lg' }} justify="space-between" align="center" wrap="nowrap" gap="md">
                <Group gap="sm" wrap="nowrap" align="center">
                    <UnstyledButton className={classes.logoBtn} onClick={() => router.push(isAuthenticated && !clienteId ? '/?tienda=1' : '/')} aria-label={`Ir al inicio de ${tenant.name}`}>
                        <BrandLogo />
                    </UnstyledButton>

                    {seccionActual && (
                        <>
                            <Box className={classes.separador} visibleFrom="md" />
                            <Badge
                                visibleFrom="md"
                                variant="light"
                                color="brand"
                                size="md"
                                radius="md"
                                className={classes.contextBadge}
                                leftSection={<span className={classes.contextDot} />}
                            >
                                {seccionActual}
                            </Badge>
                        </>
                    )}
                </Group>

                {showPublicLinks && (
                    <Box component="nav" aria-label="Principal" className={classes.nav} visibleFrom="md" ref={setNavRef}>
                        <FloatingIndicator target={activeKey ? linkRefs[activeKey] : null} parent={navRef} className={classes.navIndicator} transitionDuration={240} />
                        {PUBLIC_LINKS.map((link) => {
                            const isActive = activeKey === link.key;
                            const Icon = link.icon;
                            return (
                                <UnstyledButton
                                    key={link.key}
                                    ref={setLinkRef(link.key)}
                                    className={classes.navLink}
                                    data-active={isActive || undefined}
                                    aria-current={isActive ? 'true' : undefined}
                                    onClick={() => goToLink(router, pathname, link)}
                                >
                                    <Icon size={15} stroke={2} className={classes.navIcon} />
                                    {link.label}
                                </UnstyledButton>
                            );
                        })}
                    </Box>
                )}

                <Group wrap="nowrap" gap={8} align="center">
                    <NotificationBell />

                    {!showPublicLinks && <Box className={classes.separador} visibleFrom="sm" />}

                    <Box visibleFrom="sm">
                        <LayoutMenu router={router} />
                    </Box>

                    <Burger
                        opened={opened}
                        onClick={toggle}
                        hiddenFrom="sm"
                        size="sm"
                        color="navy.9"
                        aria-label={opened ? 'Cerrar menú' : 'Abrir menú'}
                    />
                </Group>
            </Group>
        </AppShell.Header>
    );
}
