'use client';

// Tutoriales (igual que en WR): un modal que explica el proceso paso a paso (con botón «Ir ahí» a cada apartado), la casilla
// «No volver a mostrar» (se recuerda en este navegador) y un botón «¿Cómo funciona?» para volver a verlo cuando quiera.
// Se abre solo la primera vez que entra a la pantalla. Cambiar la `clave` (p. ej. «-v2») lo vuelve a mostrar a todos.
import { useEffect, useState } from 'react';
import { Modal, Stack, Group, Text, Button, Checkbox, ThemeIcon, Box, Paper } from '@mantine/core';
import { IconHelpCircle, IconArrowRight } from '@tabler/icons-react';

const llave = (clave) => `mq:tutorial:${clave}`;
const yaVisto = (clave) => { try { return window.localStorage.getItem(llave(clave)) === '1'; } catch { return false; } };
const marcarVisto = (clave) => { try { window.localStorage.setItem(llave(clave), '1'); } catch { /* sin almacenamiento: se volverá a mostrar */ } };

/**
 * @param clave    identificador del tutorial (lo que se recuerda con «No volver a mostrar»)
 * @param titulo   p. ej. «Cómo es el proceso de compras»
 * @param intro    texto corto antes de los pasos
 * @param pasos    [{ icono, color, titulo, texto, accion?: { texto, onClick } }]
 * @param textoBoton  texto del botón para volver a verlo (null = sin botón)
 */
export default function GuiaTutorial({ clave, titulo, intro, pasos, textoBoton = '¿Cómo funciona?', abrirSola = true }) {
    const [abierto, setAbierto] = useState(false);
    const [paso, setPaso] = useState(0);
    const [noMostrar, setNoMostrar] = useState(false);

    useEffect(() => {
        if (abrirSola && !yaVisto(clave)) { setPaso(0); setAbierto(true); }
    }, [clave, abrirSola]);

    const cerrar = () => {
        if (noMostrar) marcarVisto(clave);
        setAbierto(false);
    };
    const abrir = () => { setPaso(0); setNoMostrar(yaVisto(clave)); setAbierto(true); };
    const p = pasos[paso];
    const Icono = p?.icono || IconHelpCircle;
    const ultimo = paso === pasos.length - 1;

    return (
        <>
            {textoBoton && <Button variant="white" color="dark" leftSection={<IconHelpCircle size={18} />} onClick={abrir}>{textoBoton}</Button>}
            <Modal opened={abierto} onClose={cerrar} centered size="lg" radius="lg" title={<Text fw={900} size="lg">{titulo}</Text>}>
                <Stack gap="md">
                    {paso === 0 && intro && <Text size="sm" c="dimmed">{intro}</Text>}
                    {p && (
                        <Paper withBorder radius="lg" p="md">
                            <Group align="flex-start" wrap="nowrap" gap="md">
                                <ThemeIcon size={46} radius="xl" color={p.color || 'teal'} variant="light"><Icono size={26} /></ThemeIcon>
                                <Box style={{ flex: 1 }}>
                                    <Text size="xs" c="dimmed" fw={700} tt="uppercase">Paso {paso + 1} de {pasos.length}</Text>
                                    <Text fw={800} size="md" mb={4}>{p.titulo}</Text>
                                    <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{p.texto}</Text>
                                    {p.accion && (
                                        <Button mt="sm" size="xs" variant="light" color={p.color || 'teal'} rightSection={<IconArrowRight size={14} />}
                                            onClick={() => { cerrar(); p.accion.onClick(); }}>{p.accion.texto}</Button>
                                    )}
                                </Box>
                            </Group>
                        </Paper>
                    )}
                    {/* Puntos de avance: también sirven para saltar a un paso */}
                    <Group gap={6} justify="center">
                        {pasos.map((_, i) => (
                            <Box key={i} onClick={() => setPaso(i)} style={{ width: i === paso ? 22 : 9, height: 9, borderRadius: 9, cursor: 'pointer', background: i === paso ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-gray-4)', transition: 'width .2s' }} />
                        ))}
                    </Group>
                    <Group justify="space-between" wrap="wrap" gap="sm">
                        <Checkbox size="sm" label="No volver a mostrar" checked={noMostrar} onChange={(e) => setNoMostrar(e.currentTarget.checked)} />
                        <Group gap="xs">
                            {paso > 0 && <Button variant="default" onClick={() => setPaso(paso - 1)}>Anterior</Button>}
                            {ultimo ? <Button color="teal" onClick={cerrar}>Entendido</Button> : <Button color="teal" onClick={() => setPaso(paso + 1)}>Siguiente</Button>}
                        </Group>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
