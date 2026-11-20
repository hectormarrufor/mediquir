'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, Burger, Box, FloatingIndicator, Group, UnstyledButton } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { tenant } from '@/config/tenant';
import BrandLogo from '../BrandLogo';
import NotificationBell from '../NotificationBell';
import LayoutMenu from '../../LayoutMenu';
import { PUBLIC_LINKS, SPY_IDS, goToLink, useScrollSpy } from './navLinks';
import classes from './navigation.module.css';

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
    const activeSection = useScrollSpy(SPY_IDS, pathname === '/' && showPublicLinks);
    const activeKey = pathname === '/' ? PUBLIC_LINKS.find((l) => (l.target ? activeSection === l.target : activeSection === null))?.key : null;

    // Indicador que se desliza bajo el enlace activo (Mantine FloatingIndicator)
    const [navRef, setNavRef] = useState(null);
    const [linkRefs, setLinkRefs] = useState({});
    const setLinkRef = (key) => (node) => { if (node && linkRefs[key] !== node) setLinkRefs((r) => ({ ...r, [key]: node })); };

    return (
        <AppShell.Header className={classes.header}>
            <Group className={classes.barra} data-scrolled={scrolled || undefined} px={{ base: 'sm', sm: 'lg' }} justify="space-between" wrap="nowrap">
                <UnstyledButton className={classes.logoBtn} onClick={() => router.push(isAuthenticated && !clienteId ? '/?tienda=1' : '/')} aria-label={`Ir al inicio de ${tenant.name}`}>
                    <BrandLogo />
                </UnstyledButton>

                {showPublicLinks && (
                    <Box component="nav" aria-label="Principal" className={classes.nav} visibleFrom="md" ref={setNavRef}>
                        <FloatingIndicator target={activeKey ? linkRefs[activeKey] : null} parent={navRef} className={classes.navIndicator} transitionDuration={260} />
                        {PUBLIC_LINKS.map((link) => {
                            const isActive = activeKey === link.key;
                            return (
                                <UnstyledButton
                                    key={link.key}
                                    ref={setLinkRef(link.key)}
                                    className={classes.navLink}
                                    data-active={isActive || undefined}
                                    aria-current={isActive ? 'true' : undefined}
                                    onClick={() => goToLink(router, pathname, link)}
                                >
                                    {link.label}
                                </UnstyledButton>
                            );
                        })}
                    </Box>
                )}

                <Group wrap="nowrap" gap={10}>
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
