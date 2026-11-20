'use client';

// Libro de cobranza en el teléfono: cada cliente es un renglón que se despliega (con acceso directo al Estado de cuenta PDF
// desde la cabecera) y cada documento es una tarjeta clara y táctil. Para cambiar algo se toca un botón y se abre una hoja inferior.
import React, { useEffect, useState } from 'react';
import { ActionIcon, Badge, Box, Button, Collapse, Group, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconChevronDown, IconCoin, IconPencil, IconReceipt } from '@tabler/icons-react';
import { MenuDocumento } from './PiezasLibro';
import NumeroFactura from './NumeroFactura';
import EstadoCuentaAcciones from '@/app/superuser/clientes/_components/EstadoCuentaAcciones';
import { bolivares, dolares, fmtFecha, usd, vencimientoEnPalabras } from './utilidades';
import classes from './cxc.module.css';

function DatoTarjeta({ titulo, valor, color = '#1a1b1e' }) {
    return (
        <Box style={{ minWidth: 0 }}>
            <Text fz={10} c="#5c6675" fw={700} tt="uppercase" lh={1.2}>{titulo}</Text>
            <Text fz={13} fw={700} c={color} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{valor}</Text>
        </Box>
    );
}

function TarjetaDocumento({ f, g, acc, iniciarPlegada }) {
    const [verAbonos, setVerAbonos] = useState(() => f.abonos.length > 0 && !iniciarPlegada);
    const venc = vencimientoEnPalabras(f.vence, f.saldo, f.dias);
    const colorVenc = venc.tono === 'vencida' ? 'red.8' : venc.tono === 'pronto' ? 'orange.9' : venc.tono === 'pagada' ? 'teal.8' : '#5c6675';
    return (
        <Box className={classes.tarjeta} data-estado={f.pagada ? 'cobrada' : f.vencida ? 'vencida' : undefined}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap={8}>
                <Box style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                        {f.manual && <Badge size="xs" color="grape" variant="light" style={{ flexShrink: 0 }}>Manual</Badge>}
                        <NumeroFactura ventaId={f.manual ? null : f.ventaId} fw={800} fz={15} truncate="end">{f.documento}</NumeroFactura>
                    </Group>
                    <Group gap={4} wrap="nowrap" mt={2}>
                        {venc.tono === 'vencida' && <IconAlertTriangle size={14} color="var(--mantine-color-red-8)" style={{ flexShrink: 0 }} />}
                        <Text fz={12} fw={venc.tono === 'vencida' ? 800 : 600} c={colorVenc}>{venc.texto}{f.vence && !f.pagada ? ` · ${fmtFecha(f.vence)}` : ''}</Text>
                    </Group>
                </Box>
                <Box ta="right" style={{ flexShrink: 0 }}>
                    <Text fz={10} c="#5c6675" fw={700} tt="uppercase">{f.pagada ? 'Saldo' : 'Debe'}</Text>
                    <Text fw={800} fz={18} lh={1.1} c={f.vencida ? 'red.8' : f.pagada ? 'teal.8' : 'navy.9'} style={{ fontVariantNumeric: 'tabular-nums' }}>{dolares(f.saldo)}</Text>
                </Box>
            </Group>

            <SimpleGrid cols={f.retUsd !== null && f.retUsd !== undefined ? 3 : 2} spacing={6} mt={8} px={8} py={6} style={{ background: 'rgba(11,27,61,0.035)', borderRadius: 8 }}>
                <DatoTarjeta titulo="Monto" valor={dolares(f.monto)} />
                <DatoTarjeta titulo="Abonado" valor={dolares(f.abonado)} color="#1971c2" />
                {f.retUsd !== null && f.retUsd !== undefined && (
                    <DatoTarjeta titulo={f.retReal ? 'Retuvo' : 'Ret. 75%'} valor={dolares(f.retUsd)} color={f.retReal ? 'grape.8' : '#5c6675'} />
                )}
            </SimpleGrid>

            {/* Detalle en bolívares y retención cuando aplica */}
            {f.retUsd !== null && f.retUsd !== undefined ? (
                <Text fz={11.5} mt={5} c={f.retReal ? 'grape.8' : '#5c6675'} fs={f.retReal ? undefined : 'italic'}>
                    Monto − ret. <b>{dolares(f.montoMenosRet)}</b> · {bolivares(f.totalBs)} → <b>{bolivares(f.totalBsMenosRet)}</b>
                </Text>
            ) : f.totalBs ? <Text fz={11.5} mt={5} c="#5c6675">Total {bolivares(f.totalBs)}</Text> : null}

            <Text fz={11.5} mt={3} c="#5c6675">Emitida {fmtFecha(f.emision) || '—'}{f.vendedor ? ` · ${f.vendedor}` : ''}</Text>

            {f.observacion && <Text fz={12} mt={6} px={8} py={4} style={{ background: 'rgba(11,27,61,0.05)', borderRadius: 6, wordBreak: 'break-word' }}>{f.observacion}</Text>}

            <Group gap={6} mt={8} wrap="nowrap">
                {!f.pagada && <Button flex={1} size="sm" color="teal" leftSection={<IconCoin size={16} />} onClick={() => acc.abonar(f)}>Abonar</Button>}
                <Button
                    flex={f.pagada ? 1 : undefined} size="sm" variant="default" onClick={() => setVerAbonos((v) => !v)} aria-expanded={verAbonos}
                    rightSection={<IconChevronDown size={14} style={{ transform: verAbonos ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />}
                >
                    {f.abonos.length} abono{f.abonos.length === 1 ? '' : 's'}{f.abonos.length > 0 ? ` · ${dolares(f.abonado)}` : ''}
                </Button>
                <MenuDocumento f={f} acc={acc} tamano="lg" />
            </Group>

            <Collapse in={verAbonos}>
                <Stack gap={5} mt={8}>
                    {!f.abonos.length && <Text fz={12} c="#5c6675">Todavía no tiene abonos registrados.</Text>}
                    {f.abonos.map((a) => (
                        <Group key={a.id} gap={6} wrap="nowrap" align="stretch">
                            <UnstyledButton
                                onClick={() => acc.editarAbono(f, a)} aria-label={`Corregir el abono del ${fmtFecha(a.fecha)} por ${usd(a.monto)}`}
                                px={8} py={6} style={{ flex: 1, minWidth: 0, background: '#fff', border: '1px solid #e1e6ee', borderRadius: 8, minHeight: 44 }}
                            >
                                <Group justify="space-between" wrap="nowrap" gap={8}>
                                    <Box style={{ minWidth: 0 }}>
                                        <Text fz={12.5} fw={700}>└ {fmtFecha(a.fecha)} · {a.metodo || 'Abono'}</Text>
                                        {(a.referencia || a.notas) && <Text fz={11.5} c="#5c6675" truncate="end">{[a.referencia, a.notas].filter(Boolean).join(' · ')}</Text>}
                                    </Box>
                                    <Group gap={5} wrap="nowrap" style={{ flexShrink: 0 }}>
                                        <Text fz={13.5} fw={800} c={a.monto < 0 ? 'orange.9' : '#1971c2'} style={{ fontVariantNumeric: 'tabular-nums' }}>{dolares(a.monto)}</Text>
                                        <IconPencil size={13} color="#5c6675" />
                                    </Group>
                                </Group>
                            </UnstyledButton>
                            {!f.manual && a.monto > 0 && (
                                <Tooltip label="Recibo de este abono">
                                    <ActionIcon size={44} radius="md" variant="light" color="teal" onClick={() => acc.recibo(g, a.id)} aria-label={`Recibo del abono de ${usd(a.monto)}`}>
                                        <IconReceipt size={18} />
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </Group>
                    ))}
                </Stack>
            </Collapse>
        </Box>
    );
}

export default function LibroTarjetas({ grupos, acc, buscando, libro }) {
    const [abiertosLocal, setAbiertosLocal] = useState(() => new Set());
    const usarLibro = Boolean(libro);
    const estaAbierto = (id) => (usarLibro ? libro.abierto(id) : abiertosLocal.has(id));
    const alternar = (id) => {
        if (usarLibro) { libro.alternarCliente(id); return; }
        setAbiertosLocal((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    };

    // Con pocos clientes se despliegan automáticamente para no obligar a tocar
    useEffect(() => {
        if (grupos.length > 0 && grupos.length <= 2) {
            if (usarLibro) libro.desplegarTodo();
            else setAbiertosLocal(new Set(grupos.map((g) => g.id)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buscando, grupos.length]);

    return (
        <Stack gap={8}>
            {grupos.map((g) => {
                const abierto = estaAbierto(g.id);
                const tieneRecibo = g.filas.some((x) => !x.manual && x.abonos.some((a) => a.monto > 0));
                return (
                    <section key={g.id} className={classes.grupoMovil} data-abierto={abierto || undefined}>
                        <Box className={classes.grupoMovilBarra}>
                            <UnstyledButton className={classes.grupoMovilCabecera} onClick={() => alternar(g.id)} aria-expanded={abierto}>
                                <Box style={{ flex: 1, minWidth: 0 }}>
                                    <Text fw={800} fz={14.5} lh={1.22} lineClamp={2}>{g.nombre}</Text>
                                    <Text fz={11.5} c="#5c6675" mt={2}>
                                        {g.filas.length} doc.{g.vencidas ? ` · ${g.vencidas} venc.` : ''}
                                        {g.rif ? ` · ${g.rif}` : ''}
                                    </Text>
                                </Box>
                                <Box ta="right" style={{ flexShrink: 0 }}>
                                    <Text fz={10} c="#5c6675" fw={700} tt="uppercase">Debe</Text>
                                    <Text fw={800} fz={16.5} lh={1.12} c={g.vencido > 0 ? 'red.8' : 'navy.9'} style={{ fontVariantNumeric: 'tabular-nums' }}>{dolares(g.saldo)}</Text>
                                    {g.vencido > 0 && <Text fz={10.5} c="red.8" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>Venc. {dolares(g.vencido)}</Text>}
                                </Box>
                                <IconChevronDown size={17} style={{ flexShrink: 0, transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                            </UnstyledButton>
                            {/* Acceso directo al Estado de cuenta PDF sin necesidad de abrir el cliente */}
                            <Box className={classes.grupoMovilPdf}>
                                <EstadoCuentaAcciones clienteId={g.id} variante="icono" />
                            </Box>
                        </Box>

                        {abierto && (
                            <Stack gap={8} p={8}>
                                <SimpleGrid cols={g.retUsd > 0 ? 3 : 2} spacing={6} px={8} py={6} style={{ background: '#f4f7fc', borderRadius: 9, border: '1px solid #dde4f0' }}>
                                    <DatoTarjeta titulo="Facturado" valor={dolares(g.monto)} />
                                    <DatoTarjeta titulo="Abonado" valor={dolares(g.abonado)} color="#1971c2" />
                                    {g.retUsd > 0 && <DatoTarjeta titulo="Retenido" valor={dolares(g.retUsd)} color="grape.8" />}
                                </SimpleGrid>

                                <Group grow gap={6}>
                                    <EstadoCuentaAcciones clienteId={g.id} size="sm" fullWidth />
                                    {tieneRecibo && (
                                        <Button size="sm" variant="light" color="teal" leftSection={<IconReceipt size={16} />} onClick={() => acc.recibo(g)}>
                                            Recibo de cobro
                                        </Button>
                                    )}
                                </Group>

                                {g.filas.map((f) => <TarjetaDocumento key={f.id} f={f} g={g} acc={acc} iniciarPlegada={g.filas.length > 2} />)}
                            </Stack>
                        )}
                    </section>
                );
            })}
        </Stack>
    );
}
