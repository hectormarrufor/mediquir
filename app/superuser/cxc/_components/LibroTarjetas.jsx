'use client';

// Libro de cobranza en el teléfono: cada cliente es un renglón que se despliega y cada documento una tarjeta
// (nada de tablas con desplazamiento lateral). Lo importante —cuánto debe y si está vencida— se lee de un vistazo;
// para cambiar algo se toca un botón y se abre una hoja desde abajo.
import React, { useEffect, useState } from 'react';
import { Badge, Box, Button, Collapse, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconChevronDown, IconCoin, IconPencil } from '@tabler/icons-react';
import { MenuDocumento } from './PiezasLibro';
import { bolivares, dolares, fmtFecha, usd, vencimientoEnPalabras } from './utilidades';
import classes from './cxc.module.css';

function TarjetaDocumento({ f, acc }) {
    const [verAbonos, setVerAbonos] = useState(f.abonos.length > 0); // los abonos se ven debajo de su factura, como en la hoja de los vendedores
    const venc = vencimientoEnPalabras(f.vence, f.saldo, f.dias);
    const colorVenc = venc.tono === 'vencida' ? 'red.8' : venc.tono === 'pronto' ? 'orange.9' : venc.tono === 'pagada' ? 'teal.8' : '#5c6675';
    return (
        <Box className={classes.tarjeta} data-estado={f.pagada ? 'cobrada' : f.vencida ? 'vencida' : undefined}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap={8}>
                <Box style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                        {f.manual && <Badge size="xs" color="grape" variant="light" style={{ flexShrink: 0 }}>Manual</Badge>}
                        <Text fw={800} fz={15} truncate="end">{f.documento}</Text>
                    </Group>
                    <Group gap={4} wrap="nowrap" mt={2}>
                        {venc.tono === 'vencida' && <IconAlertTriangle size={14} color="var(--mantine-color-red-8)" style={{ flexShrink: 0 }} />}
                        <Text fz={12.5} fw={venc.tono === 'vencida' ? 800 : 600} c={colorVenc}>{venc.texto}{f.vence && !f.pagada ? ` · ${fmtFecha(f.vence)}` : ''}</Text>
                    </Group>
                </Box>
                <Box ta="right" style={{ flexShrink: 0 }}>
                    <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase">{f.pagada ? 'Saldo' : 'Debe'}</Text>
                    <Text fw={800} fz={19} lh={1.1} c={f.vencida ? 'red.8' : f.pagada ? 'teal.8' : 'navy.9'}>{dolares(f.saldo)}</Text>
                </Box>
            </Group>
            <Group gap={14} mt={6}>
                <Text fz={12.5}>Monto <b>{dolares(f.monto)}</b></Text>
                <Text fz={12.5} c="#1971c2">Abonado <b>{dolares(f.abonado)}</b></Text>
            </Group>
            {/* Retención de IVA que hizo el cliente: la factura con y sin ella, en dólares y en bolívares */}
            {f.retUsd !== null && f.retUsd !== undefined ? (
                <Text fz={12} c="grape.8">Retención <b>{dolares(f.retUsd)}</b> · Monto − ret. <b>{dolares(f.montoMenosRet)}</b> · {bolivares(f.totalBs)} → <b>{bolivares(f.totalBsMenosRet)}</b></Text>
            ) : f.totalBs ? <Text fz={12} c="#5c6675">Total {bolivares(f.totalBs)}</Text> : null}
            <Text fz={12} c="#5c6675">Emitida {fmtFecha(f.emision) || '—'}{f.vendedor ? ` · Vendedor: ${f.vendedor}` : ''}</Text>
            {f.observacion && <Text fz={12.5} mt={6} px={8} py={4} style={{ background: 'rgba(11,27,61,0.05)', borderRadius: 6, wordBreak: 'break-word' }}>{f.observacion}</Text>}
            <Group gap={6} mt={8} wrap="nowrap">
                {!f.pagada && <Button flex={1} size="sm" color="teal" leftSection={<IconCoin size={16} />} onClick={() => acc.abonar(f)}>Abonar</Button>}
                <Button
                    flex={f.pagada ? 1 : undefined} size="sm" variant="default" onClick={() => setVerAbonos((v) => !v)} aria-expanded={verAbonos}
                    rightSection={<IconChevronDown size={14} style={{ transform: verAbonos ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />}
                >
                    {f.abonos.length} abono{f.abonos.length === 1 ? '' : 's'}
                </Button>
                <MenuDocumento f={f} acc={acc} tamano="lg" />
            </Group>
            <Collapse in={verAbonos}>
                <Stack gap={4} mt={8}>
                    {!f.abonos.length && <Text fz={12.5} c="#5c6675">Todavía no tiene abonos registrados.</Text>}
                    {f.abonos.map((a) => (
                        <UnstyledButton
                            key={a.id} onClick={() => acc.editarAbono(f, a)} aria-label={`Corregir el abono del ${fmtFecha(a.fecha)} por ${usd(a.monto)}`}
                            px={8} py={6} style={{ background: '#fff', border: '1px solid #e1e6ee', borderRadius: 8, minHeight: 44 }}
                        >
                            <Group justify="space-between" wrap="nowrap" gap={8}>
                                <Box style={{ minWidth: 0 }}>
                                    <Text fz={12.5} fw={700}>└ {fmtFecha(a.fecha)} · {a.metodo || 'Abono'}</Text>
                                    {(a.referencia || a.notas) && <Text fz={11.5} c="#5c6675" truncate="end">{[a.referencia, a.notas].filter(Boolean).join(' · ')}</Text>}
                                </Box>
                                <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                                    <Text fz={14} fw={800} c={a.monto < 0 ? 'orange.9' : '#1971c2'}>{dolares(a.monto)}</Text>
                                    <IconPencil size={14} color="#5c6675" />
                                </Group>
                            </Group>
                        </UnstyledButton>
                    ))}
                </Stack>
            </Collapse>
        </Box>
    );
}

export default function LibroTarjetas({ grupos, acc, buscando }) {
    const [abiertos, setAbiertos] = useState(() => new Set());
    // con una búsqueda o con pocos clientes se despliega todo: lo que se buscó debe verse sin tocar nada más
    useEffect(() => { if (buscando || grupos.length <= 2) setAbiertos(new Set(grupos.map((g) => g.id))); }, [buscando, grupos]);
    const alternar = (id) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    return (
        <Stack gap={8}>
            {grupos.map((g) => {
                const abierto = abiertos.has(g.id);
                return (
                    <section key={g.id} className={classes.grupoMovil} data-abierto={abierto || undefined}>
                        <UnstyledButton className={classes.grupoMovilCabecera} onClick={() => alternar(g.id)} aria-expanded={abierto}>
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text fw={800} fz={14.5} lh={1.25} lineClamp={2}>{g.nombre}</Text>
                                <Text fz={12} c="#5c6675">{g.filas.length} documento{g.filas.length === 1 ? '' : 's'}{g.vencidas ? ` · ${g.vencidas} vencido${g.vencidas === 1 ? '' : 's'}` : ''}</Text>
                            </Box>
                            <Box ta="right" style={{ flexShrink: 0 }}>
                                <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase">Debe</Text>
                                <Text fw={800} fz={17} lh={1.15} c={g.vencido > 0 ? 'red.8' : 'navy.9'}>{dolares(g.saldo)}</Text>
                                {g.vencido > 0 && <Text fz={11} c="red.8" fw={700}>Vencido {dolares(g.vencido)}</Text>}
                            </Box>
                            <IconChevronDown size={18} style={{ flexShrink: 0, transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                        </UnstyledButton>
                        {abierto && (
                            <Stack gap={8} p={8}>
                                {g.filas.map((f) => <TarjetaDocumento key={f.id} f={f} acc={acc} />)}
                            </Stack>
                        )}
                    </section>
                );
            })}
        </Stack>
    );
}
