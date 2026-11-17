'use client';

// Número de factura que se puede tocar: abre un modal con el detalle de la factura; en el modal, el número lleva al detalle completo en Ventas.
// Sin `ventaId` (cuenta manual o línea sin enlazar) se muestra como texto normal.
import React, { useState } from 'react';
import Link from 'next/link';
import { Badge, Group, Loader, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { aBolivares, aDolares } from '@/app/constants/facturacion';
import { desgloseFactura } from '@/app/helpers/desgloseFactura';
import { Dialogo } from './Piezas';
import { bolivares, dolares, fmtFecha } from './utilidades';

const num = (v) => Number(v) || 0;

// Los montos de una factura pueden estar guardados en bolívares (moneda BS) o en dólares: se muestran SIEMPRE los dos, cada uno en su moneda
// (convertido con la tasa de la factura), para no confundir $ con Bs.
function Monto({ usd, bs, fuerte = false, derecha = true }) {
    return (
        <div style={{ textAlign: derecha ? 'right' : 'left', whiteSpace: 'nowrap' }}>
            <Text fz={fuerte ? 14 : 12.5} fw={fuerte ? 800 : 600} lh={1.15}>{dolares(usd)}</Text>
            <Text fz={fuerte ? 12 : 11} c="#5c6675" lh={1.15}>{bolivares(bs)}</Text>
        </div>
    );
}

function Detalle({ ventaId, onCerrar }) {
    const { data: v, isLoading, error } = useQuery({
        queryKey: ['cxc-factura-detalle', ventaId],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${ventaId}`);
            if (!res.ok) throw new Error('No se pudo cargar la factura');
            return res.json();
        },
    });
    // conversiones: el documento está en Bs o en USD según su moneda; la otra se calcula con su tasa
    const tasa = num(v?.tasaCambio) || 1;
    const esBs = v?.moneda === 'BS';
    const aBs = (x) => (esBs ? Number(num(x).toFixed(2)) : aBolivares(num(x), tasa));
    const aUsd = (x) => (esBs ? aDolares(num(x), tasa) : Number(num(x).toFixed(2)));
    const cxc = v?.cuentaPorCobrar;
    const saldoUsd = cxc ? (cxc.moneda === 'BS' ? aDolares(num(cxc.saldoPendiente), num(cxc.tasaCambio) || tasa) : num(cxc.saldoPendiente)) : 0;
    const saldoBs = cxc ? (cxc.moneda === 'BS' ? num(cxc.saldoPendiente) : aBolivares(num(cxc.saldoPendiente), num(cxc.tasaCambio) || tasa)) : 0;
    const titulo = (
        <Link href={`/superuser/ventas/${ventaId}`} onClick={onCerrar} style={{ color: 'inherit', textDecoration: 'underline' }} title="Ver el detalle completo en Ventas">
            <Group gap={6} wrap="nowrap" component="span">Factura {v?.numeroDocumento || ''}<IconExternalLink size={16} /></Group>
        </Link>
    );
    return (
        <Dialogo abierto onCerrar={onCerrar} titulo={titulo} ancho="lg">
            {isLoading && <Group justify="center" p="lg"><Loader size="sm" /></Group>}
            {error && <Text c="red.8" size="sm">{error.message}</Text>}
            {v && (
                <Stack gap="sm">
                    <Group justify="space-between" wrap="wrap">
                        <div>
                            <Text fw={800}>{v.cliente?.nombre}</Text>
                            <Text fz={12} c="#5c6675">{v.cliente?.identificacion} · Emisión {fmtFecha(v.fechaEmision || v.createdAt)}</Text>
                        </div>
                        {cxc && num(cxc.saldoPendiente) > 0.005
                            ? <div><Badge variant="light" color="orange">Debe</Badge><Monto usd={saldoUsd} bs={saldoBs} fuerte /></div>
                            : <Badge variant="light" color="teal">Cobrada</Badge>}
                    </Group>
                    <Table.ScrollContainer minWidth={380}>
                        <Table fz={12.5} verticalSpacing={4}>
                            <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Cant.</Table.Th><Table.Th ta="right">Precio</Table.Th><Table.Th ta="right">Subtotal</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {(v.detalles || []).map((d) => (
                                    <Table.Tr key={d.id}>
                                        <Table.Td>{d.isFicticio ? d.nombreFicticio : d.producto?.nombre || d.nombreFicticio}</Table.Td>
                                        <Table.Td ta="right">{num(d.cantidad)}</Table.Td>
                                        <Table.Td><Monto usd={aUsd(d.precioUnitario)} bs={aBs(d.precioUnitario)} /></Table.Td>
                                        <Table.Td><Monto usd={aUsd(d.subtotal)} bs={aBs(d.subtotal)} /></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    <Stack gap={3}>
                        {(() => {
                            const g = desgloseFactura(v);
                            const fila = (rotulo, valor, extra = {}) => (
                                <Group justify="space-between" align="flex-start" wrap="nowrap" key={rotulo}>
                                    <Text fz={extra.fuerte ? 14 : 12.5} fw={extra.fuerte ? 800 : 500} pt={2} c={extra.c}>{rotulo}</Text>
                                    <Monto usd={aUsd(valor)} bs={aBs(valor)} fuerte={extra.fuerte} />
                                </Group>
                            );
                            return (
                                <>
                                    {fila('Subtotal (suma de los renglones)', g.subtotal)}
                                    {g.exento > 0.004 && fila('Monto exento (sin IVA)', g.exento, { c: '#a16207' })}
                                    {g.exento > 0.004 && fila('Base gravable', g.gravable)}
                                    {g.conIva && fila('IVA 16 %', g.iva)}
                                    {g.flete > 0.004 && fila('Flete / delivery', g.flete)}
                                    {fila('Total', g.total, { fuerte: true })}
                                </>
                            );
                        })()}
                        <Text fz={11} c="#5c6675" ta="right">Tasa aplicada ese día: {bolivares(tasa)} por $1 · documento en {esBs ? 'bolívares' : 'dólares'}</Text>
                    </Stack>
                    {(v.abonos || []).length > 0 && (
                        <div>
                            <Text fw={700} fz={12.5} mb={2}>Abonos</Text>
                            {v.abonos.map((a) => <Text key={a.id} fz={12.5} c="#1971c2">{fmtFecha(a.fechaPago)} · {dolares(a.montoUsd)} · {bolivares(num(a.montoBs) > 0 ? a.montoBs : aBolivares(num(a.montoUsd), num(a.tasaCambio) || tasa))}{a.metodoPago ? ` · ${a.metodoPago}` : ''}</Text>)}
                        </div>
                    )}
                </Stack>
            )}
        </Dialogo>
    );
}

export default function NumeroFactura({ ventaId, children, ...textoProps }) {
    const [abierto, setAbierto] = useState(false);
    if (!ventaId) return <Text {...textoProps}>{children}</Text>;
    return (
        <>
            <UnstyledButton onClick={(e) => { e.stopPropagation(); setAbierto(true); }} title="Ver el detalle de la factura" style={{ minWidth: 0, overflow: 'hidden' }}>
                <Text {...textoProps} td="underline" c="blue.8" style={{ cursor: 'pointer' }}>{children}</Text>
            </UnstyledButton>
            {abierto && <Detalle ventaId={ventaId} onCerrar={() => setAbierto(false)} />}
        </>
    );
}
