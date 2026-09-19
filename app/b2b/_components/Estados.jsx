'use client';

import React from 'react';
import { Badge, Group } from '@mantine/core';
import { COLOR_COBRO, COLOR_DESPACHO } from '../_lib/formato';

// Estado del pedido (dónde está la mercancía)
export function BadgeDespacho({ estado, etiqueta }) {
    return <Badge color={COLOR_DESPACHO[estado] || 'gray'} variant="light">{etiqueta || estado}</Badge>;
}

// Estado de cobro (pagado / por vencer / vencido)
export function BadgeCobro({ cobro }) {
    if (!cobro) return null;
    return <Badge color={COLOR_COBRO[cobro.clave] || 'gray'} variant={cobro.clave === 'vencido' ? 'filled' : 'light'}>{cobro.etiqueta}</Badge>;
}

export function BadgesPedido({ pedido }) {
    return (
        <Group gap={6}>
            <BadgeDespacho estado={pedido.estado} etiqueta={pedido.estadoEtiqueta} />
            {pedido.estado !== 'Cancelado' && <BadgeCobro cobro={pedido.cobro} />}
        </Group>
    );
}
