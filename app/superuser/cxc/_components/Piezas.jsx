'use client';

// Piezas de presentación que comparten el libro, la hoja de vendedores y el resumen: cifras, indicadores,
// estados vacíos y de carga, y un diálogo que en el teléfono sale como hoja desde abajo (más cómodo con el pulgar).
import React, { useCallback, useState } from 'react';
import { Box, Button, Drawer, Group, Modal, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { bolivares, dolares, useEsTelefono } from './utilidades';

// Una cifra con su título: dólares en grande y, si hay tasa, bolívares debajo
export function Cifra({ titulo, valor, color = '#1a1b1e', tasa = null, alinear = 'right', grande = false, ayuda }) {
    return (
        <Box ta={alinear} style={{ minWidth: 0 }} title={ayuda}>
            {titulo && <Text fz={10} c="#5c6675" fw={700} tt="uppercase" lh={1.2} truncate="end">{titulo}</Text>}
            <Text fz={grande ? 18 : 13} fw={800} c={color} lh={1.3} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{valor === null ? '—' : dolares(valor)}</Text>
            {tasa > 0 && valor !== null && <Text fz={11} c="#5c6675" fw={600} lh={1.2} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{bolivares((Number(valor) || 0) * tasa)}</Text>}
        </Box>
    );
}

// Indicador compacto (un número que se lee de un vistazo). `destacado` (un color) le pone un filete: es la cifra que pide acción.
// Con `onClick` el indicador es un atajo (p. ej. «Vencido» filtra las vencidas).
export function Kpi({ titulo, valor, detalle, color = 'navy.9', icono: Icono, colorIcono = 'blue', destacado, cargando, ayuda, onClick, activo }) {
    return (
        <Box
            component={onClick ? 'button' : 'div'}
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            aria-pressed={onClick ? Boolean(activo) : undefined}
            p={{ base: 8, sm: 10 }}
            title={ayuda}
            style={{
                background: destacado ? '#fffbe0' : '#fff', color: '#1a1b1e', borderRadius: 10, minWidth: 0, textAlign: 'left', width: '100%',
                border: `1px solid ${activo ? 'var(--mantine-color-navy-6)' : destacado ? '#ecd77a' : '#d5dbe5'}`,
                boxShadow: [destacado ? `inset 4px 0 0 ${destacado}` : null, activo ? '0 0 0 2px var(--mantine-color-navy-3)' : null].filter(Boolean).join(', ') || undefined,
                cursor: onClick ? 'pointer' : undefined, font: 'inherit',
            }}
        >
            <Group gap={8} wrap="nowrap" align="flex-start">
                {Icono && <ThemeIcon size={30} radius="md" variant="light" color={colorIcono} visibleFrom="sm" style={{ flexShrink: 0 }}><Icono size={18} /></ThemeIcon>}
                <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase" lh={1.25} lineClamp={2}>{titulo}</Text>
                    {cargando ? <Skeleton h={22} w="70%" mt={4} /> : <Text fz={{ base: 17, sm: 20 }} fw={800} c={color} lh={1.2} style={{ whiteSpace: 'nowrap' }}>{valor}</Text>}
                    {detalle && !cargando && <Text fz={11.5} c="#5c6675" fw={600} lh={1.3}>{detalle}</Text>}
                </Box>
            </Group>
        </Box>
    );
}

// Cuando no hay nada que mostrar: qué pasó y qué se puede hacer
export function EstadoVacio({ icono: Icono, titulo, texto, accion }) {
    return (
        <Stack align="center" gap={6} py={36} px="md" style={{ background: '#fff', color: '#1a1b1e', borderRadius: 10, border: '1px dashed #b9c7e4', textAlign: 'center' }}>
            {Icono && <ThemeIcon size={46} radius="xl" variant="light" color="navy"><Icono size={26} /></ThemeIcon>}
            <Text fw={800}>{titulo}</Text>
            {texto && <Text size="sm" c="#5c6675" maw={520}>{texto}</Text>}
            {accion}
        </Stack>
    );
}

// Carga: la forma de lo que viene (indicadores + renglones), sin saltos cuando llegan los datos
export function Esqueleto({ indicadores = 4, filas = 8 }) {
    return (
        <Stack gap={8} aria-busy="true" aria-label="Cargando">
            <Box style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 8 }}>
                {Array.from({ length: indicadores }).map((_, i) => <Skeleton key={i} h={64} radius={10} />)}
            </Box>
            <Skeleton h={46} radius={10} />
            {Array.from({ length: filas }).map((_, i) => <Skeleton key={i} h={34} radius={6} />)}
        </Stack>
    );
}

// Diálogo: ventana centrada en la computadora y hoja que sube desde abajo en el teléfono
export function Dialogo({ abierto, onCerrar, titulo, children, ancho = 'md' }) {
    const telefono = useEsTelefono();
    if (telefono) {
        return (
            <Drawer
                opened={abierto} onClose={onCerrar} position="bottom" title={<Text fw={800} c="navy.9">{titulo}</Text>}
                styles={{ content: { height: 'auto', maxHeight: '92dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }, body: { paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' } }}
                overlayProps={{ backgroundOpacity: 0.45, blur: 2 }}
            >
                {children}
            </Drawer>
        );
    }
    return (
        <Modal opened={abierto} onClose={onCerrar} centered size={ancho} title={<Text fw={800} c="navy.9">{titulo}</Text>}>
            {children}
        </Modal>
    );
}

// Confirmación clara (en vez de window.confirm): `await confirmar({ titulo, mensaje, textoConfirmar, color })` devuelve true/false
export function useConfirmar() {
    const [pedido, setPedido] = useState(null);
    const confirmar = useCallback((opciones) => new Promise((resolver) => setPedido({ ...opciones, resolver })), []);
    const responder = (ok) => { pedido?.resolver(ok); setPedido(null); };
    const dialogo = (
        <Dialogo abierto={Boolean(pedido)} onCerrar={() => responder(false)} titulo={pedido?.titulo || '¿Seguro?'} ancho="sm">
            <Stack gap="md">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon size={38} radius="xl" variant="light" color={pedido?.color || 'red'} style={{ flexShrink: 0 }}><IconAlertTriangle size={20} /></ThemeIcon>
                    <Box style={{ flex: 1 }}>{typeof pedido?.mensaje === 'string' ? <Text size="sm">{pedido.mensaje}</Text> : pedido?.mensaje}</Box>
                </Group>
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={() => responder(false)}>Cancelar</Button>
                    <Button size="sm" color={pedido?.color || 'red'} onClick={() => responder(true)} data-autofocus>{pedido?.textoConfirmar || 'Sí, continuar'}</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
    return { confirmar, dialogo };
}
