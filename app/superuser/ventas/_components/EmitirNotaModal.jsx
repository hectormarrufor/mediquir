'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Loader, Modal, NumberInput, Select, Stack, Switch, Table, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { calcularFactura } from '@/app/constants/facturacion';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

const MOTIVOS = {
    CREDITO: ['Devolución de mercancía', 'Descuento posterior a la factura', 'Error en la factura', 'Otro'],
    DEBITO: ['Intereses por mora', 'Cargos adicionales', 'Diferencia de precio', 'Otro'],
};

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const LIBRE = () => ({ clave: Math.random().toString(36).slice(2), descripcion: '', precioUnitario: '', aplicaIva: true });

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Emite una nota de crédito (devolver renglones de la factura y/o otros conceptos) o de débito (conceptos adicionales).
// El servidor vuelve a calcular todo: aquí solo se ve el total antes de emitir.
export default function EmitirNotaModal({ opened, onClose, factura, tipo, onEmitida }) {
    const esCredito = tipo === 'CREDITO';
    const simbolo = factura.moneda === 'BS' ? 'Bs' : '$';
    const { data, isLoading } = useQuery({
        queryKey: ['notas-venta', factura.id],
        enabled: opened,
        queryFn: () => pedirJson(`/api/ventas/${factura.id}/notas`),
    });

    // La numeración de las notas la fija la persona (no siempre se empieza por la 1): si falta, se pregunta antes de emitir
    const { data: numeracion } = useNumeracion(opened);
    const serie = numeracion?.series?.find((s) => s.clave === (esCredito ? 'NC' : 'ND'));

    const [cantidades, setCantidades] = useState({});
    const [libres, setLibres] = useState([LIBRE()]);
    const [motivo, setMotivo] = useState(MOTIVOS[tipo][0]);
    const [detalle, setDetalle] = useState('');
    const [devuelve, setDevuelve] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!opened) return;
        setCantidades({}); setLibres(esCredito ? [] : [LIBRE()]); setMotivo(MOTIVOS[tipo][0]); setDetalle(''); setDevuelve(false); setError(null);
    }, [opened, tipo, esCredito]);

    const lineas = useMemo(() => {
        const deFactura = (data?.renglones || []).filter((r) => Number(cantidades[r.id]) > 0)
            .map((r) => ({ ventaDetalleId: r.id, cantidad: Number(cantidades[r.id]), precioUnitario: r.precioUnitario, aplicaIva: r.aplicaIva }));
        const otras = libres.filter((l) => l.descripcion.trim() && Number(l.precioUnitario) > 0)
            .map((l) => ({ descripcion: l.descripcion.trim(), cantidad: 1, precioUnitario: Number(l.precioUnitario), aplicaIva: l.aplicaIva }));
        return [...deFactura, ...otras];
    }, [data, cantidades, libres]);

    const totales = useMemo(() => {
        if (!lineas.length) return null;
        try { return calcularFactura({ renglones: lineas.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad, aplicaIva: l.aplicaIva })) }); } catch { return null; }
    }, [lineas]);

    const hayDevolucion = lineas.some((l) => l.ventaDetalleId);
    const excede = esCredito && totales && data && totales.totalFinal > data.acreditable + 0.005;
    const motivoFinal = detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo;

    const emitir = async () => {
        setEnviando(true);
        setError(null);
        try {
            const r = await pedirJson(`/api/ventas/${factura.id}/notas`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo, motivo: motivoFinal, devuelveInventario: esCredito && hayDevolucion && devuelve,
                    renglones: lineas.map((l) => (l.ventaDetalleId ? { ventaDetalleId: l.ventaDetalleId, cantidad: l.cantidad } : { descripcion: l.descripcion, cantidad: 1, precioUnitario: l.precioUnitario, aplicaIva: l.aplicaIva })),
                }),
            });
            notifications.show({ color: 'teal', title: `${esCredito ? 'Nota de crédito' : 'Nota de débito'} emitida`, message: `${r.nota.numeroDocumento} por ${simbolo}${nf(r.nota.totalFinal)}` });
            onEmitida?.(r.nota);
            onClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    const actualizarLibre = (clave, cambio) => setLibres((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

    return (
        <Modal opened={opened} onClose={onClose} size="xl" centered title={<Text fw={800}>{esCredito ? 'Nota de crédito' : 'Nota de débito'} · factura {factura.numeroDocumento}</Text>}>
            {isLoading || !numeracion ? <Group justify="center" p="xl"><Loader /></Group> : (serie && !serie.configurado) ? (
                <PreguntarNumero serie={serie} puedeEditar={numeracion.puedeEditar} />
            ) : (
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {esCredito
                            ? `Baja lo que el cliente debe por esta factura. Puedes acreditar hasta ${simbolo}${nf(data?.acreditable)} en total.`
                            : 'Sube lo que el cliente debe por esta factura (intereses, cargos adicionales, diferencias). Lleva IVA salvo que sea un concepto exento.'}
                    </Text>

                    {esCredito && (
                        <Table verticalSpacing={4} fz="sm">
                            <Table.Thead><Table.Tr><Table.Th>Producto de la factura</Table.Th><Table.Th ta="right">Precio</Table.Th><Table.Th ta="right">Facturado</Table.Th><Table.Th ta="right">Por acreditar</Table.Th><Table.Th w={110}>A acreditar</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {(data?.renglones || []).map((r) => (
                                    <Table.Tr key={r.id}>
                                        <Table.Td>{r.nombre}{!r.aplicaIva && <Text span size="xs" c="dimmed"> · exento</Text>}</Table.Td>
                                        <Table.Td ta="right">{simbolo}{nf(r.precioUnitario)}</Table.Td>
                                        <Table.Td ta="right">{r.cantidad}</Table.Td>
                                        <Table.Td ta="right">{r.restante}</Table.Td>
                                        <Table.Td>
                                            <NumberInput size="xs" min={0} max={r.restante} allowDecimal={false} allowNegative={false} hideControls disabled={r.restante === 0}
                                                value={cantidades[r.id] ?? ''} onChange={(v) => setCantidades((c) => ({ ...c, [r.id]: v }))} placeholder="0" />
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}

                    <Stack gap="xs">
                        <Text size="sm" fw={700}>{esCredito ? 'Otros conceptos (descuentos, ajustes)' : 'Conceptos'}</Text>
                        {libres.map((l) => (
                            <Group key={l.clave} gap="xs" align="flex-end" wrap="nowrap">
                                <TextInput style={{ flex: 1 }} size="xs" label="Descripción" placeholder="Ej: Intereses por mora" value={l.descripcion} onChange={(e) => actualizarLibre(l.clave, { descripcion: e.currentTarget.value })} maxLength={200} />
                                <NumberInput w={130} size="xs" label={`Monto (${simbolo})`} min={0} decimalScale={2} hideControls value={l.precioUnitario} onChange={(v) => actualizarLibre(l.clave, { precioUnitario: v })} />
                                <Switch size="sm" label="IVA" checked={l.aplicaIva} onChange={(e) => actualizarLibre(l.clave, { aplicaIva: e.currentTarget.checked })} mb={4} />
                                <Button size="compact-sm" variant="subtle" color="red" onClick={() => setLibres((ls) => ls.filter((x) => x.clave !== l.clave))} aria-label="Quitar"><IconTrash size={14} /></Button>
                            </Group>
                        ))}
                        <Button size="compact-sm" variant="light" leftSection={<IconPlus size={14} />} w="fit-content" onClick={() => setLibres((ls) => [...ls, LIBRE()])}>Agregar concepto</Button>
                    </Stack>

                    <Group grow align="flex-start">
                        <Select label="Motivo" data={MOTIVOS[tipo]} value={motivo} onChange={(v) => setMotivo(v || MOTIVOS[tipo][0])} allowDeselect={false} />
                        <Textarea label="Detalle (opcional)" placeholder="Más información para el cliente" autosize minRows={1} value={detalle} onChange={(e) => setDetalle(e.currentTarget.value)} maxLength={200} />
                    </Group>

                    {esCredito && hayDevolucion && (
                        <Checkbox label="Devolver la mercancía al inventario" description="Suma al stock las unidades de los productos acreditados (solo si ya salieron del almacén)" checked={devuelve} onChange={(e) => setDevuelve(e.currentTarget.checked)} />
                    )}

                    {totales && (
                        <Alert color={excede ? 'red' : 'blue'} variant="light" title={`Total de la nota: ${simbolo}${nf(totales.totalFinal)}`}>
                            <Text size="xs">Base {simbolo}{nf(totales.baseImponible)} · Exento {simbolo}{nf(totales.exento)} · IVA {simbolo}{nf(totales.montoIva)}</Text>
                            {excede && <Text size="xs" fw={700} mt={4}>Supera lo que queda por acreditar ({simbolo}{nf(data.acreditable)}).</Text>}
                        </Alert>
                    )}
                    {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}

                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button color={esCredito ? 'red' : 'blue'} onClick={emitir} loading={enviando} disabled={!totales || excede || motivoFinal.length < 5}>
                            Emitir {esCredito ? 'nota de crédito' : 'nota de débito'}
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
