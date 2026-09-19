'use client';

import React from 'react';
import { Box, Group, Text } from '@mantine/core';
import { tenant } from '@/config/tenant';

// Logo del header.
// - Escritorio: logo completo, con su proporción original (antes se deformaba con objectFit: 'fill').
// - Móvil: el logo completo mide ~140px de ancho y su lema queda ilegible, así que se usa
//   el isotipo (pulso cardíaco) + el nombre en texto, que se ve nítido a cualquier densidad de pantalla.
export default function BrandLogo() {
    return (
        <>
            <Box hiddenFrom="sm">
                <Group gap={8} wrap="nowrap">
                    <img src={tenant.assets.favicon} alt="" width={34} height={34} style={{ display: 'block' }} />
                    <Text
                        component="span" fw={900} fz={20} c="white" lh={1}
                        style={{ fontStyle: 'italic', letterSpacing: '0.5px', textShadow: '0 1px 8px rgba(0,0,0,0.35)' }}
                    >
                        MEDI<Text component="span" inherit c="sky.3">QUIR</Text>
                    </Text>
                </Group>
            </Box>

            <Box visibleFrom="sm">
                <img
                    src={tenant.assets.logoHeader}
                    srcSet={`${tenant.assets.logoHeader} 1x, ${tenant.assets.logoHeader2x} 2x`}
                    alt={`Logo ${tenant.name}`}
                    height={56}
                    fetchPriority="high"
                    style={{ display: 'block', height: 56, width: 'auto' }}
                />
            </Box>
        </>
    );
}
