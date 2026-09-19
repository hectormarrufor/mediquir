'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, Burger, Box, Group, UnstyledButton } from '@mantine/core';
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
    const { isAuthenticated, loading } = useAuth();
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

    return (
        <AppShell.Header className={classes.header} data-scrolled={scrolled || undefined}>
            <Group h="100%" px={{ base: 'sm', sm: 'xl' }} justify="space-between" wrap="nowrap">
                <UnstyledButton onClick={() => router.push('/')} aria-label={`Ir al inicio de ${tenant.name}`}>
                    <BrandLogo />
                </UnstyledButton>

                {showPublicLinks && (
                    <Box component="nav" aria-label="Principal" className={classes.nav} visibleFrom="md">
                        {PUBLIC_LINKS.map((link) => {
                            const isActive = pathname === '/' && (link.target ? activeSection === link.target : activeSection === null);
                            return (
                                <UnstyledButton
                                    key={link.key}
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

                <Group wrap="nowrap" gap="sm">
                    <NotificationBell />

                    <Box visibleFrom="sm">
                        <LayoutMenu router={router} />
                    </Box>

                    <Burger
                        opened={opened}
                        onClick={toggle}
                        hiddenFrom="sm"
                        size="sm"
                        color="white"
                        aria-label={opened ? 'Cerrar menú' : 'Abrir menú'}
                    />
                </Group>
            </Group>
        </AppShell.Header>
    );
}
