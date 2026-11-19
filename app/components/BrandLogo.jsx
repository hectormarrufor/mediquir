'use client';

import React from 'react';
import { Box } from '@mantine/core';
import { tenant } from '@/config/tenant';

// Logo del header: el logo completo de Mediquir (con el RIF, que es obligatorio) en escritorio y en el teléfono, con su proporción
// original. PNG transparente sacado del logo en alta: logo-header.png (112 px de alto) y @2x (224 px), así que el navegador siempre
// lo reduce y nunca lo amplía: se ve nítido también en pantallas de alta densidad.
// Es el logo ORIGINAL (azul marino): el header es claro para que contraste, y se le sube un poco el contraste y la saturación para que las letras se vean firmes.
export default function BrandLogo() {
    return (
        <Box
            component="img"
            src={tenant.assets.logoHeader}
            srcSet={`${tenant.assets.logoHeader} 1x, ${tenant.assets.logoHeader2x} 2x`}
            alt={`Logo ${tenant.name}`}
            fetchPriority="high"
            display="block"
            h={{ base: 42, sm: 50 }}
            w="auto"
            style={{ filter: 'contrast(1.15) saturate(1.2)' }}
        />
    );
}
