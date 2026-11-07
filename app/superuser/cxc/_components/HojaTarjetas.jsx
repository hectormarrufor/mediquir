'use client';

// Hoja de un vendedor en el teléfono: cada cliente se despliega (con lo que debe y lo que hay por pagar a la vista),
// cada factura es una tarjeta y sus abonos van dentro, sangrados (└) y plegables. Los colores son los del Excel:
// amarillo = por pagar, gris = pagada, blanco = sin cobrar (además del texto del estado).
import React from 'react';
import { ActionIcon, Badge, Box, Button, Checkbox, Collapse, Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconLinkOff, IconPencil, IconPlus } from '@tabler/icons-react';
import { Cifra } from './Piezas';
import { CobroFactura, EstadoComision, MenuLinea, cifrasDe } from './PiezasVendedores';
import { esPago, estadoLinea } from './comisiones';
import { bolivares, dolares, fmtFecha } from './utilidades';
import classes from './cxc.module.css';

const marcaTarjeta = (e) => (e === 'porpagar' ? 'porpagar' : e === 'pagada' ? 'pagada' : undefined);

function Dato({ titulo, valor, color }) {
    return (
        <Box style={{ minWidth: 0 }}>
            <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase" lh={1.2}>{titulo}</Text>
            <Text fz={13.5} fw={700} c={color} style={{ whiteSpace: 'nowrap' }}>{valor}</Text>
        </Box>
    );
}

// Un abono / pago (hijo de su factura, o suelto si su factura no está en la hoja)
function TarjetaPago({ l, hijo, hoja, acc, tasa }) {
    const e = estadoLinea(l);
    const nota = l.concepto === 'NOTA';
    return (
        <Box className={classes.tarjeta} data-hijo={hijo || undefined} data-estado={marcaTarjeta(e)}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap={8}>
                <Group gap={8} wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                    <Checkbox size="md" mt={2} checked={hoja.sel.has(l.id)} onChange={(ev) => hoja.alternarSel(l.id, ev.currentTarget.checked)} aria-label={`Seleccionar el ${nota ? 'pago' : 'abono'} del ${fmtFecha(l.fecha)}`} />
                    <Box style={{ minWidth: 0 }}>
                        <Text fz={12.5} fw={700}>{hijo ? '└ ' : ''}{nota ? 'Nota de crédito' : 'Abono'} · {fmtFecha(l.fecha) || 'sin fecha'}</Text>
                        {!hijo && <Text fz={11.5} c="#5c6675" truncate="end">de {l.documentoTexto || 'sin número'}</Text>}
                        <Text fz={15} fw={800} c={nota ? 'orange.9' : '#1971c2'}>{dolares(Math.abs(Number(l.montoUsd) || 0))}</Text>
                    </Box>
                </Group>
                <Box ta="right" style={{ flexShrink: 0 }}>
                    <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase">Comisión</Text>
                    <Text fz={15} fw={800}>{dolares(l.comisionUsd)}</Text>
                    {tasa && <Text fz={11.5} c="#5c6675" fw={600}>{bolivares((Number(l.comisionUsd) || 0) * tasa)}</Text>}
                </Box>
            </Group>
            <Group justify="space-between" wrap="nowrap" mt={6} gap={6}>
                <EstadoComision l={l} onMarcar={hoja.marcarUna} />
                <Group gap={4} wrap="nowrap">
                    <ActionIcon size={36} variant="default" radius="md" onClick={() => acc.editarLinea(l)} aria-label="Editar este abono"><IconPencil size={18} /></ActionIcon>
                    <MenuLinea l={l} acc={acc} tamano="lg" />
                </Group>
            </Group>
        </Box>
    );
}

function TarjetaFactura({ d, hoja, acc, tasa }) {
    const pa = d.padre;
    if (!pa) return <Stack gap={6}>{d.pagos.map((p) => <TarjetaPago key={p.id} l={p} hijo={false} hoja={hoja} acc={acc} tasa={tasa} />)}</Stack>;
    const e = estadoLinea(pa);
    const plegada = hoja.plegadas.has(d.k);
    const pctTxt = pa.porcentaje === null || pa.porcentaje === undefined ? '—' : `${Number(pa.porcentaje)} %`;
    const porPagarAbonos = d.pagos.filter((p) => estadoLinea(p) === 'porpagar').reduce((t, p) => t + (Number(p.comisionUsd) || 0), 0);
    return (
        <Box className={classes.tarjeta} data-estado={marcaTarjeta(e)}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap={8}>
                <Group gap={8} wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                    <Checkbox size="md" mt={2} checked={hoja.sel.has(pa.id)} onChange={(ev) => hoja.alternarSel(pa.id, ev.currentTarget.checked)} aria-label={`Seleccionar la factura ${pa.documentoTexto || ''}`} />
                    <Box style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                            <Text fw={800} fz={15} truncate="end">{esPago(pa) ? '' : 'Factura '}{pa.documentoTexto || 'sin número'}</Text>
                            {!pa.ventaId && <IconLinkOff size={15} color="#b35900" aria-label="Sin enlazar con el sistema" style={{ flexShrink: 0 }} />}
                        </Group>
                        <Text fz={12} c="#5c6675">{fmtFecha(pa.fecha) || 'sin fecha'}{pa.vencimiento ? ` · vence ${fmtFecha(pa.vencimiento)}` : ''}</Text>
                    </Box>
                </Group>
                <EstadoComision l={pa} onMarcar={hoja.marcarUna} />
            </Group>

            <SimpleGrid cols={3} spacing={6} mt={8}>
                <Dato titulo="Factura" valor={dolares(pa.montoUsd)} />
                <Dato titulo="Sin IVA" valor={dolares(pa.baseUsd)} />
                <Dato titulo="% comisión" valor={pctTxt} />
            </SimpleGrid>
            <Group justify="space-between" wrap="nowrap" mt={6} px={8} py={4} style={{ background: 'rgba(11,27,61,0.05)', borderRadius: 8 }}>
                <Box>
                    <Text fz={12} fw={700}>{e === 'enabonos' ? 'Comisión posible' : 'Comisión'}</Text>
                    {e === 'enabonos' && <Text fz={11} c="#5c6675">La real la generan sus abonos</Text>}
                </Box>
                <Box ta="right">
                    <Text fz={16} fw={800} c={e === 'enabonos' ? '#868e96' : '#1a1b1e'}>{dolares(pa.comisionUsd)}</Text>
                    {tasa && <Text fz={11.5} c="#5c6675" fw={600}>{bolivares((Number(pa.comisionUsd) || 0) * tasa)}</Text>}
                </Box>
            </Group>
            {(pa.ventaId || pa.estatusCliente) && (
                <Group gap={8} mt={6} wrap="wrap">
                    {pa.ventaId && <Text fz={12.5}>Cliente: <CobroFactura l={pa} fz={12.5} /></Text>}
                    {pa.estatusCliente && <Badge size="sm" variant="outline" color="gray" style={{ textTransform: 'none' }}>{pa.estatusCliente}</Badge>}
                </Group>
            )}
            {pa.observacion && <Text fz={12.5} mt={6} px={8} py={4} style={{ background: '#fff', border: '1px solid #e1e6ee', borderRadius: 6, wordBreak: 'break-word' }}>{pa.observacion}</Text>}

            <Group gap={6} mt={8} wrap="nowrap">
                <Button flex={1} size="sm" variant="default" leftSection={<IconPencil size={16} />} onClick={() => acc.editarLinea(pa)}>Editar</Button>
                <Button flex={1} size="sm" variant="light" leftSection={<IconPlus size={16} />} onClick={() => acc.agregarAbono(pa)}>Abono</Button>
                <MenuLinea l={pa} acc={acc} tamano="lg" />
            </Group>

            {d.pagos.length > 0 && (
                <>
                    <UnstyledButton mt={8} w="100%" px={8} py={8} onClick={() => hoja.alternarPlegada(d.k)} aria-expanded={!plegada} style={{ borderRadius: 8, background: 'rgba(11,27,61,0.05)', minHeight: 40 }}>
                        <Group justify="space-between" wrap="nowrap">
                            <Text fz={12.5} fw={700}>{d.pagos.length} abono{d.pagos.length === 1 ? '' : 's'}{porPagarAbonos > 0 ? ` · por pagar ${dolares(porPagarAbonos)}` : ''}</Text>
                            <IconChevronDown size={16} style={{ transform: plegada ? undefined : 'rotate(180deg)', transition: 'transform .15s' }} />
                        </Group>
                    </UnstyledButton>
                    <Collapse in={!plegada}>
                        <Stack gap={6} mt={6} pl={8}>
                            {d.pagos.map((p) => <TarjetaPago key={p.id} l={p} hijo hoja={hoja} acc={acc} tasa={tasa} />)}
                        </Stack>
                    </Collapse>
                </>
            )}
        </Box>
    );
}

export default function HojaTarjetas({ hoja, acc }) {
    const tasa = hoja.tasa;
    return (
        <Stack gap={8}>
            {hoja.grupos.map((g) => {
                const abierto = hoja.abiertos.has(g.k);
                return (
                    <section key={g.k} className={classes.grupoMovil} data-abierto={abierto || undefined}>
                        <UnstyledButton className={classes.grupoMovilCabecera} onClick={() => hoja.alternarGrupo(g.k)} aria-expanded={abierto}>
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text fw={800} fz={14.5} lh={1.25} lineClamp={2}>{g.nombre}</Text>
                                <Text fz={12} c="#5c6675">
                                    {g.facturas} factura{g.facturas === 1 ? '' : 's'} · debe{' '}
                                    {g.deuda === null ? <Text span fw={700} title="Sin facturas enlazadas: el cobro se lleva a mano">— (a mano)</Text> : <Text span fw={800} c={g.deuda > 0 ? 'red.8' : 'teal.8'}>{dolares(g.deuda)}</Text>}
                                </Text>
                            </Box>
                            <Box ta="right" style={{ flexShrink: 0 }}>
                                <Text fz={10.5} c="#5c6675" fw={700} tt="uppercase">Por pagar</Text>
                                <Text fw={800} fz={17} lh={1.15} c={g.t.porPagar > 0 ? '#b35900' : 'teal.8'}>{dolares(g.t.porPagar)}</Text>
                                {tasa && <Text fz={11} c="#5c6675" fw={600}>{bolivares(g.t.porPagar * tasa)}</Text>}
                            </Box>
                            <IconChevronDown size={18} style={{ flexShrink: 0, transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                        </UnstyledButton>
                        {abierto && (
                            <Box p={8}>
                                <SimpleGrid cols={2} spacing={8} px={4} pb={8} mb={8} style={{ borderBottom: '1px dashed #d5dbe5' }}>
                                    {cifrasDe(g.t, g.deuda, tasa).filter((c) => c.clave !== 'porpagar').map((c) => <Cifra key={c.clave} titulo={c.titulo} valor={c.valor} color={c.color} tasa={c.tasa} alinear="left" ayuda={c.ayuda} />)}
                                </SimpleGrid>
                                <Stack gap={8}>
                                    {g.items.map((d) => <TarjetaFactura key={d.k} d={d} hoja={hoja} acc={acc} tasa={tasa} />)}
                                </Stack>
                            </Box>
                        )}
                    </section>
                );
            })}
            <Box p="sm" style={{ background: '#fff', color: '#1a1b1e', border: '2px solid var(--mantine-color-navy-7)', borderRadius: 12 }} aria-label="Total general">
                <Text fw={900} fz={13.5}>TOTAL GENERAL</Text>
                <Text fz={11.5} c="#5c6675" mb={6}>{hoja.grupos.length} cliente(s) · {hoja.lineas.length} línea(s) con este filtro</Text>
                <SimpleGrid cols={2} spacing={8}>
                    {cifrasDe(hoja.totalVisible, hoja.deudaVisible, tasa).map((c) => <Cifra key={c.clave} titulo={c.titulo} valor={c.valor} color={c.color} tasa={c.tasa} alinear="left" ayuda={c.ayuda} />)}
                </SimpleGrid>
            </Box>
        </Stack>
    );
}
