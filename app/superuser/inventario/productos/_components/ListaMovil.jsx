'use client';

import React, { useEffect, useState } from 'react';
import { Avatar, Badge, Box, Button, Card, Drawer, Group, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconBarcode, IconEdit, IconScan } from '@tabler/icons-react';
import { presentacionesDe } from '@/app/constants/presentaciones';
import EscanerCodigo, { escanerDisponible } from '../../../ventas/_components/EscanerCodigo';
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

// Códigos de barras por presentación (unidad, caja, bulto): abre la cámara, lee el código y lo guarda. En el teléfono es lo más rápido para cargarlos.
const CAMPO_DE_NIVEL = { UNIDAD: 'codigoBarras', CAJA: 'codigoBarrasCaja', BULTO: 'codigoBarrasBulto' };

function EditorCodigos({ fila, onCerrar, onGuardar }) {
    const [escaneando, setEscaneando] = useState(null); // nivel al que se le está leyendo el código
    const [borrador, setBorrador] = useState(null);     // { nivel, codigo } por confirmar
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { setEscaneando(null); setBorrador(null); }, [fila?.id]);
    if (!fila) return null;
    const niveles = presentacionesDe(fila);

    const guardar = async (nivel, codigo) => {
        setGuardando(true);
        await onGuardar(fila, { [CAMPO_DE_NIVEL[nivel]]: String(codigo || '').replace(/\s/g, '') || null });
        setGuardando(false);
        setBorrador(null);
    };

    return (
        <>
            <Drawer opened={Boolean(fila)} onClose={onCerrar} position="bottom" size={430} padding="md" title={<Text fw={800} size="sm" lineClamp={2}>Códigos de barras · {fila.nombre}</Text>} styles={{ content: { borderRadius: '20px 20px 0 0' } }}>
                <Stack gap="sm" pb="md">
                    {niveles.map((n) => {
                        const actual = fila[CAMPO_DE_NIVEL[n.clave]];
                        const editando = borrador?.nivel === n.clave;
                        return (
                            <Box key={n.clave} p="xs" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 10 }}>
                                <Group justify="space-between" wrap="nowrap">
                                    <Box style={{ minWidth: 0 }}>
                                        <Text size="sm" fw={700}>{n.etiqueta}</Text>
                                        {actual ? <Badge size="sm" color="teal" variant="light" tt="none" leftSection={<IconBarcode size={12} />}>{actual}</Badge> : <Text size="xs" c="dimmed">Sin código</Text>}
                                    </Box>
                                    {!editando && (
                                        <Group gap={6} wrap="nowrap">
                                            {escanerDisponible() && <Button size="sm" variant={actual ? 'light' : 'filled'} color={actual ? 'gray' : 'blue'} leftSection={<IconScan size={16} />} onClick={() => setEscaneando(n.clave)}>{actual ? 'Cambiar' : 'Escanear'}</Button>}
                                            <Button size="sm" variant="subtle" color="gray" onClick={() => setBorrador({ nivel: n.clave, codigo: actual || '' })}>Escribir</Button>
                                        </Group>
                                    )}
                                </Group>
                                {editando && (
                                    <Stack gap={6} mt="xs">
                                        <TextInput size="md" inputMode="numeric" data-autofocus value={borrador.codigo} onChange={(e) => setBorrador({ ...borrador, codigo: e.currentTarget.value.replace(/\s/g, '') })} description="Revisa que sea el de esta presentación, no el de otra" />
                                        <Group grow>
                                            <Button color={borrador.codigo ? 'teal' : 'red'} loading={guardando} disabled={!borrador.codigo && !actual} onClick={() => guardar(n.clave, borrador.codigo)}>{borrador.codigo ? 'Guardar' : 'Quitar código'}</Button>
                                            <Button variant="default" onClick={() => setBorrador(null)}>Cancelar</Button>
                                        </Group>
                                    </Stack>
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            </Drawer>
            {/* Al leer el código se muestra para confirmarlo antes de guardar */}
            <EscanerCodigo
                opened={Boolean(escaneando)} titulo={escaneando ? `Escanea: ${niveles.find((n) => n.clave === escaneando)?.etiqueta || ''}` : ''}
                onClose={() => setEscaneando(null)}
                onDetectar={(valor) => { const nivel = escaneando; setEscaneando(null); setBorrador({ nivel, codigo: valor }); }}
            />
        </>
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

function TarjetaProducto({ f, puedeEditar, onEditar, onCodigos, onFicha, hijo }) {
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
                    <Text fz={10} c="dimmed">Cód. barras: {presentacionesDe(f).map((n) => `${n.clave === 'UNIDAD' ? 'Unidad' : n.clave === 'CAJA' ? 'Caja' : 'Bulto'} ${f[CAMPO_DE_NIVEL[n.clave]] ? '✓' : '✗'}`).join(' · ')}</Text>
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
                {puedeEditar && <Button size="xs" variant="light" color="blue" leftSection={<IconBarcode size={14} />} onClick={() => onCodigos(f.id)} tt="none">Códigos</Button>}
                <Button size="xs" variant="default" onClick={() => onFicha(f.id)} tt="none">Ficha completa</Button>
            </Group>
        </Card>
    );
}

export default function ListaMovil({ entries, puedeEditar, onGuardar, onGuardarGrupo, onFicha }) {
    const [editando, setEditando] = useState(null);
    const [editandoGrupo, setEditandoGrupo] = useState(null);
    const [codigosId, setCodigosId] = useState(null);
    // La fila se busca de nuevo en cada pintado: así el drawer muestra el código recién guardado
    const filaCodigos = codigosId ? entries.flatMap((e) => (e.tipo === 'producto' ? [e.fila] : e.filas)).find((f) => f.id === codigosId) || null : null;

    return (
        <>
            <Stack gap="xs">
                {entries.length === 0 && <Text ta="center" c="dimmed" py="xl">No hay productos que coincidan con los filtros.</Text>}
                {entries.map((e) => {
                    if (e.tipo === 'producto') return <TarjetaProducto key={`p${e.fila.id}`} f={e.fila} puedeEditar={puedeEditar} onEditar={setEditando} onCodigos={setCodigosId} onFicha={onFicha} />;
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
                                {e.filas.map((f) => <TarjetaProducto key={`p${f.id}`} f={f} hijo puedeEditar={puedeEditar} onEditar={setEditando} onCodigos={setCodigosId} onFicha={onFicha} />)}
                            </Stack>
                        </Box>
                    );
                })}
            </Stack>
            <EditorCodigos fila={filaCodigos} onCerrar={() => setCodigosId(null)} onGuardar={onGuardar} />
            <EditorRapido fila={editando} onCerrar={() => setEditando(null)} onGuardar={onGuardar} />
            <EditorMinimoGrupo grupo={editandoGrupo} onCerrar={() => setEditandoGrupo(null)} onGuardar={onGuardarGrupo} />
        </>
    );
}
