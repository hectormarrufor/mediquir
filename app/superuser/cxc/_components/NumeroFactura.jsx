'use client';

// Número de factura que se puede tocar: abre un modal con el detalle de la factura; en el modal, el número lleva al detalle completo en Ventas.
// Sin `ventaId` (cuenta manual o línea sin enlazar) se muestra como texto normal.
import React, { useState } from 'react';
import Link from 'next/link';
import { Badge, Group, Loader, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Dialogo } from './Piezas';
import { dolares, fmtFecha } from './utilidades';

const num = (v) => Number(v) || 0;

function Detalle({ ventaId, onCerrar }) {
    const { data: v, isLoading, error } = useQuery({
        queryKey: ['cxc-factura-detalle', ventaId],
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${ventaId}`);
            if (!res.ok) throw new Error('No se pudo cargar la factura');
            return res.json();
        },
    });
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
                        <Badge variant="light" color={v.cuentaPorCobrar && num(v.cuentaPorCobrar.saldoPendiente) > 0.005 ? 'orange' : 'teal'}>
                            {v.cuentaPorCobrar && num(v.cuentaPorCobrar.saldoPendiente) > 0.005 ? `Debe ${dolares(v.cuentaPorCobrar.saldoPendiente)}` : 'Cobrada'}
                        </Badge>
                    </Group>
                    <Table.ScrollContainer minWidth={380}>
                        <Table fz={12.5} verticalSpacing={4}>
                            <Table.Thead><Table.Tr><Table.Th>Producto</Table.Th><Table.Th ta="right">Cant.</Table.Th><Table.Th ta="right">Precio</Table.Th><Table.Th ta="right">Subtotal</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {(v.detalles || []).map((d) => (
                                    <Table.Tr key={d.id}>
                                        <Table.Td>{d.isFicticio ? d.nombreFicticio : d.producto?.nombre || d.nombreFicticio}</Table.Td>
                                        <Table.Td ta="right">{num(d.cantidad)}</Table.Td>
                                        <Table.Td ta="right">{dolares(d.precioUnitario)}</Table.Td>
                                        <Table.Td ta="right">{dolares(d.subtotal)}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    <Stack gap={2} ta="right">
                        <Text fz={12.5}>IVA <b>{dolares(v.montoIva)}</b></Text>
                        <Text fw={800}>Total {dolares(v.totalFinal)}</Text>
                    </Stack>
                    {(v.abonos || []).length > 0 && (
                        <div>
                            <Text fw={700} fz={12.5} mb={2}>Abonos</Text>
                            {v.abonos.map((a) => <Text key={a.id} fz={12.5} c="#1971c2">{fmtFecha(a.fechaPago)} · {dolares(a.montoUsd)}{a.metodoPago ? ` · ${a.metodoPago}` : ''}</Text>)}
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
