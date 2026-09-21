'use client';

import React from 'react';
import { ActionIcon, Avatar, Badge, Group, Paper, Text } from '@mantine/core';
import { IconBrandWhatsapp, IconCake, IconPhone } from '@tabler/icons-react';
import { normalizarWhatsApp } from '@/app/constants/contacto';
import { formatearFecha } from '@/app/constants/hora';
import { COLOR_ESTADO, ETIQUETA_ESTADO } from '../_lib/columnas';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

// Tarjeta del empleado para el teléfono
export default function EmpleadoCard({ e, acciones, onAbrir }) {
    const wa = normalizarWhatsApp(e.telefono);
    return (
        <Paper withBorder radius="md" p="sm" bg="white" onClick={onAbrir} style={{ cursor: 'pointer', opacity: e.inactivo ? 0.7 : 1 }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Avatar src={e.imagen ? `${BLOB}/${e.imagen}` : null} radius="xl" size={44} color="navy">{(e.nombre || '?').charAt(0)}</Avatar>
                    <div style={{ minWidth: 0 }}>
                        <Text fw={800} size="sm" lineClamp={1}>{e.nombreCompleto}</Text>
                        <Text size="xs" c="dimmed">{e.cedula}{e.edad !== null ? ` · ${e.edad} años` : ''}{e.antiguedad ? ` · ${e.antiguedad}` : ''}</Text>
                    </div>
                </Group>
                <div onClick={(ev) => ev.stopPropagation()}>{acciones}</div>
            </Group>

            <Group gap={6} mt="xs">
                <Badge size="sm" variant="light" color={COLOR_ESTADO[e.estado] || 'gray'}>{ETIQUETA_ESTADO[e.estado] || e.estado}</Badge>
                {e.departamento && <Badge size="sm" variant="outline" color="navy" tt="none">{e.departamento}</Badge>}
                {e.cumpleHoy && <Badge size="sm" color="pink" leftSection={<IconCake size={12} />}>¡Cumple hoy!</Badge>}
                {!e.usuario && <Badge size="sm" variant="outline" color="gray">Sin usuario</Badge>}
            </Group>

            {e.puestosTxt && <Text size="xs" mt={6} c="gray.8" lineClamp={2}>{e.puestosTxt}</Text>}

            <Group justify="space-between" mt="xs" onClick={(ev) => ev.stopPropagation()}>
                <Text size="xs" c="dimmed">{e.fechaIngreso ? `Ingresó ${formatearFecha(e.fechaIngreso)}` : ''}</Text>
                <Group gap={4}>
                    {e.telefono && <ActionIcon component="a" href={`tel:${e.telefono}`} variant="light" color="navy" aria-label="Llamar"><IconPhone size={16} /></ActionIcon>}
                    {wa && <ActionIcon component="a" href={`https://wa.me/${wa}`} target="_blank" variant="light" color="teal" aria-label="WhatsApp"><IconBrandWhatsapp size={16} /></ActionIcon>}
                </Group>
            </Group>
        </Paper>
    );
}
