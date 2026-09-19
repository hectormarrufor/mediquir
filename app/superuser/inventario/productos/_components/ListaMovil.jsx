'use client';

import React, { useEffect, useState } from 'react';
import { Avatar, Badge, Box, Button, Card, Drawer, Group, NumberInput, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconEdit } from '@tabler/icons-react';
import { costoPorBulto, costoPorCaja, validarCampo } from '@/app/constants/inventarioCampos';
import { estadoDe, formatearNumero } from '../_lib/columnas';
import { imagenDe } from './renderCelda';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const COLOR = { agotado: 'red', bajo: 'orange', ok: 'teal' };
const ETIQUETA = { agotado: 'Agotado', bajo: 'Bajo mínimo', ok: 'Óptimo' };

const CAMPOS_RAPIDOS = [
    { campo: 'stockAlmacen', label: 'Stock (unidades)', decimales: 2 },
    { campo: 'stockMinimo', label: 'Stock mínimo', decimales: 2, soloSueltos: true },
    { campo: 'costoUsd', label: 'Costo por unidad $', decimales: 5 },
    { campo: 'precio6', label: 'Precio 6 $', decimales: 3 },
    { campo: 'precio7', label: 'Precio 7 $', decimales: 3 },
    { campo: 'porcentajeDescuento', label: '% Descuento', decimales: 0 },
];

// Editor rápido (móvil): los mismos campos numéricos de la hoja, validados con las mismas reglas.
// Si el producto está en un grupo, su mínimo no se muestra (vale el del grupo).
function EditorRapido({ fila, onCerrar, onGuardar }) {
    const campos = CAMPOS_RAPIDOS.filter((c) => !(c.soloSueltos && fila?.grupo));
    const [valores, setValores] = useState({});
    const [errores, setErrores] = useState({});
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        setValores(fila ? Object.fromEntries(campos.map(({ campo }) => [campo, fila[campo] ?? ''])) : {});
        setErrores({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fila]);

    const guardar = async () => {
        const cambios = {};
        const errs = {};
        campos.forEach(({ campo }) => {
            const v = validarCampo(campo, valores[campo]);
            if (!v.ok) errs[campo] = v.error;
            else if (v.valor !== (fila[campo] ?? null)) cambios[campo] = v.valor;
        });
        setErrores(errs);
        if (Object.keys(errs).length) return;
        if (Object.keys(cambios).length) {
            setGuardando(true);
            await onGuardar(fila, cambios);
            setGuardando(false);
        }
        onCerrar();
    };

    return (
        <Drawer opened={Boolean(fila)} onClose={onCerrar} position="bottom" size={460} padding="md" title={<Text fw={800} size="sm" lineClamp={2}>{fila?.nombre}</Text>} styles={{ content: { borderRadius: '20px 20px 0 0' } }}>
            <Stack gap="sm" pb="md">
                <SimpleGrid cols={2} spacing="sm">
                    {campos.map(({ campo, label, decimales }) => (
                        <NumberInput
                            key={campo} label={label} size="md" hideControls decimalScale={decimales} decimalSeparator=","
                            value={valores[campo] ?? ''} error={errores[campo]}
                            onChange={(v) => setValores((s) => ({ ...s, [campo]: v }))}
                            inputMode="decimal" selectAllOnFocus
                        />
                    ))}
                </SimpleGrid>
                <Button size="md" color="navy.9" loading={guardando} onClick={guardar} tt="none">Guardar cambios</Button>
            </Stack>
        </Drawer>
    );
}

// Mínimo del grupo (móvil)
function EditorMinimoGrupo({ grupo, onCerrar, onGuardar }) {
    const [valor, setValor] = useState('');
    const [error, setError] = useState(null);
    useEffect(() => { setValor(grupo?.stockMinimoGlobal ?? ''); setError(null); }, [grupo]);

    const guardar = async () => {
        const v = validarCampo('stockMinimoGlobal', valor, { stockMinimoGlobal: { tipo: 'entero', min: 0, max: 99999999 } });
        if (!v.ok) return setError(v.error);
        await onGuardar(grupo, v.valor);
        onCerrar();
    };

    return (
        <Drawer opened={Boolean(grupo)} onClose={onCerrar} position="bottom" size={300} padding="md" title={<Text fw={800} size="sm" lineClamp={2}>Mínimo del grupo · {grupo?.nombre}</Text>} styles={{ content: { borderRadius: '20px 20px 0 0' } }}>
            <Stack gap="sm">
                <NumberInput label="Stock mínimo del grupo" size="md" hideControls allowDecimal={false} value={valor} error={error} onChange={setValor} inputMode="numeric" selectAllOnFocus />
                <Button size="md" color="navy.9" onClick={guardar} tt="none">Guardar</Button>
            </Stack>
        </Drawer>
    );
}

function TarjetaProducto({ f, puedeEditar, onEditar, onFicha, hijo }) {
    // Un hermano de grupo solo puede estar agotado o no: el mínimo se evalúa en el grupo
    const propio = hijo ? (f.stockAlmacen > 0 ? 'ok' : 'agotado') : estadoDe(f.stockAlmacen, f.stockMinimo);
    const esCaja = f.unidadesPorCaja > 0;
    const datos = [
        ['Stock', f.stockAlmacen, [0, 2]],
        ['Costo/und', f.costoUsd, [2, 4]],
        [esCaja ? 'Costo/caja' : 'Costo/bulto', esCaja ? costoPorCaja(f) : costoPorBulto(f), [2, 3]],
        ['P7', f.precio7, [2, 3]],
    ];
    return (
        <Card withBorder radius="md" p="sm" bg="white" style={{ borderLeft: `4px solid var(--mantine-color-${COLOR[propio]}-6)` }}>
            <Group wrap="nowrap" align="flex-start" gap="sm">
                <Avatar src={imagenDe(f)} size={40} radius="sm" imageProps={{ loading: 'lazy' }} styles={{ image: { objectFit: 'contain' } }}>{f.nombre.charAt(0)}</Avatar>
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text fw={700} size="sm" lh={1.2} lineClamp={2}>{f.nombre}</Text>
                    <Text size="xs" c="dimmed">{f.codigo}{f.marca ? ` · ${f.marca.nombre}` : ''}</Text>
                </Box>
                {!hijo && <Badge color={COLOR[propio]} variant="light" size="sm">{ETIQUETA[propio]}</Badge>}
            </Group>
            <SimpleGrid cols={4} spacing={4} mt="sm">
                {datos.map(([t, v, d]) => (
                    <Box key={t}><Text fz={10} c="dimmed" tt="uppercase">{t}</Text><Text size="sm" fw={800}>{formatearNumero(v, { decimales: d })}</Text></Box>
                ))}
            </SimpleGrid>
            <Group gap="xs" mt="sm" grow>
                {puedeEditar && <Button size="xs" variant="light" color="brand.6" leftSection={<IconEdit size={14} />} onClick={() => onEditar(f)} tt="none">Editar rápido</Button>}
                <Button size="xs" variant="default" onClick={() => onFicha(f.id)} tt="none">Ficha completa</Button>
            </Group>
        </Card>
    );
}

export default function ListaMovil({ entries, puedeEditar, onGuardar, onGuardarGrupo, onFicha }) {
    const [editando, setEditando] = useState(null);
    const [editandoGrupo, setEditandoGrupo] = useState(null);

    return (
        <>
            <Stack gap="xs">
                {entries.length === 0 && <Text ta="center" c="dimmed" py="xl">No hay productos que coincidan con los filtros.</Text>}
                {entries.map((e) => {
                    if (e.tipo === 'producto') return <TarjetaProducto key={`p${e.fila.id}`} f={e.fila} puedeEditar={puedeEditar} onEditar={setEditando} onFicha={onFicha} />;
                    const g = e.grupo;
                    return (
                        <Box key={`g${g.id}`} p={6} style={{ borderRadius: 14, background: 'rgba(238,244,250,0.95)', border: '1px solid var(--mantine-color-gray-3)' }}>
                            <Group wrap="nowrap" gap="sm" p={6}>
                                <Avatar src={g.imagen ? `${BLOB}/${g.imagen}` : null} size={44} radius="md" imageProps={{ loading: 'lazy' }} styles={{ image: { objectFit: 'contain' } }}>{g.nombre.charAt(0)}</Avatar>
                                <Box style={{ flex: 1, minWidth: 0 }}>
                                    <Text fw={800} size="sm" lh={1.2} lineClamp={2} c="navy.9">{g.nombre}</Text>
                                    <Text size="xs" c="dimmed">Stock {formatearNumero(g.stockTotal, { decimales: [0, 2] })} · mínimo {formatearNumero(g.stockMinimoGlobal, { decimales: [0, 2] })}</Text>
                                </Box>
                                <Badge color={COLOR[g.estado]} variant="filled" size="sm">{ETIQUETA[g.estado]}</Badge>
                            </Group>
                            {puedeEditar && <Button size="compact-xs" variant="subtle" ml={6} mb={4} onClick={() => setEditandoGrupo(g)} tt="none">Editar mínimo del grupo</Button>}
                            <Stack gap={6} pl="sm" style={{ borderLeft: '3px solid var(--mantine-color-teal-3)', marginLeft: 8 }}>
                                {e.filas.map((f) => <TarjetaProducto key={`p${f.id}`} f={f} hijo puedeEditar={puedeEditar} onEditar={setEditando} onFicha={onFicha} />)}
                            </Stack>
                        </Box>
                    );
                })}
            </Stack>
            <EditorRapido fila={editando} onCerrar={() => setEditando(null)} onGuardar={onGuardar} />
            <EditorMinimoGrupo grupo={editandoGrupo} onCerrar={() => setEditandoGrupo(null)} onGuardar={onGuardarGrupo} />
        </>
    );
}
