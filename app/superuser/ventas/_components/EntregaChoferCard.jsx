'use client';

import React from 'react';
import { Badge, Box, Group, Paper, Text } from '@mantine/core';
import { IconSignature } from '@tabler/icons-react';
import { formatearFechaHora } from '@/app/constants/hora';

// Evidencia de la entrega de la mercancía al chofer: quién se la llevó, su firma y quién de Mediquir la entregó
export default function EntregaChoferCard({ pedido }) {
    if (!pedido?.firmaChoferUrl) return null;
    return (
        <Paper withBorder radius="md" p="sm">
            <Text fw={700} mb="xs" c="blue.9"><IconSignature size={16} style={{ verticalAlign: 'middle' }} /> Entrega al chofer</Text>
            <Text size="sm"><b>{pedido.choferNombre}</b> · C.I. {pedido.choferCedula}</Text>
            <Text size="sm" c="dimmed">{pedido.choferEmpresa}</Text>
            <Text size="xs" c="dimmed" mt={4}>
                {pedido.fechaHoraRetiro ? formatearFechaHora(pedido.fechaHoraRetiro) : ''}{pedido.entregadoPorNombre ? ` · Entregó: ${pedido.entregadoPorNombre}` : ''}
            </Text>
            <Group gap="xs" mt="xs">
                <Badge size="sm" color={pedido.facturaEntregadaChofer ? 'teal' : 'gray'} variant="light">{pedido.facturaEntregadaChofer ? 'Factura entregada al chofer' : 'Factura sin confirmar'}</Badge>
            </Group>
            <Box mt="xs" style={{ background: '#fff', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 6, padding: 4 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pedido.firmaChoferUrl} alt="Firma del chofer" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', display: 'block' }} />
            </Box>
        </Paper>
    );
}
