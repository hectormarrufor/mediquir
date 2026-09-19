'use client';

import React from 'react';
import { Box } from '@mantine/core';
import { usePathname } from 'next/navigation';
import { tenant } from '@/config/tenant';

// Rutas de trabajo (panel admin y gráfico BCV) conservan un fondo oscuro, sobre el que ya están
// pensadas sus tarjetas translúcidas. Todo lo demás (landing, tienda, login) usa la variante clara.
const DARK_ROUTES = ['/superuser', '/bcv'];

export default function AppBackground() {
    const pathname = usePathname() || '/';
    const variant = DARK_ROUTES.some((r) => pathname.startsWith(r)) ? 'dark' : 'light';

    return (
        <Box className="app-bg" data-variant={variant} aria-hidden="true">
            {variant === 'dark' && (
                <Box className="app-bg__photo" style={{ backgroundImage: `url(${tenant.assets.fondoGlobal})` }} />
            )}
            <Box className="app-bg__blob app-bg__blob--a" />
            <Box className="app-bg__blob app-bg__blob--b" />
            <Box className="app-bg__blob app-bg__blob--c" />
            <Box className="app-bg__grid" />
            <Box className="app-bg__noise" />
        </Box>
    );
}
