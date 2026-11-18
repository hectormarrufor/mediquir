'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Loader, Modal, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PANTALLA_COMPLETA_MOVIL, useEsTelefono } from '@/app/components/ui/modalMovil';
import { useQuery } from '@tanstack/react-query';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { calcularFactura } from '@/app/constants/facturacion';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';
import DatosDeCopia from '@/app/components/admin/DatosDeCopia';

const MOTIVOS = {
    CREDITO: ['Devolución de mercancía', 'Descuento posterior a la factura', 'Error en la factura', 'Otro'],
    DEBITO: ['Intereses por mora', 'Cargos adicionales', 'Diferencia de precio', 'Otro'],
};

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fmtFecha = (v) => (v ? `${String(v).slice(8, 10)}/${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '');
const LIBRE = () => ({ clave: Math.random().toString(36).slice(2), descripcion: '', precioUnitario: '', aplicaIva: true });

async function pedirJson(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) throw new Error(cuerpo?.error || 'No se pudo completar la solicitud');
    return cuerpo;
}

// Emite una nota de crédito (devolver renglones de la factura y/o otros conceptos) o de débito (conceptos adicionales).
// El servidor vuelve a calcular todo: aquí solo se ve el total antes de emitir.
// controlInicial: número de control con el que se abre (la nota de un número que faltaba en la secuencia de la forma libre)
import { avisarNotaEmitida } from './avisoNota';

export default function EmitirNotaModal({ opened, onClose, factura, tipo, onEmitida, controlInicial = '' }) {
    const telefono = useEsTelefono();
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
    const [otras, setOtras] = useState([]); // otras facturas del cliente que también afecta la nota de débito
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [copia, setCopia] = useState({ numero: '', control: '', fecha: '' }); // datos de la nota si ya se emitió en el sistema anterior

    useEffect(() => {
        if (!opened) return;
        setCantidades({}); setLibres(esCredito ? [] : [LIBRE()]); setMotivo(MOTIVOS[tipo][0]); setDetalle(''); setDevuelve(false); setOtras([]); setError(null);
        if (controlInicial) setCopia((c) => ({ ...c, control: controlInicial }));
    }, [opened, tipo, esCredito, controlInicial]);

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
                    tipo, motivo: motivoFinal, devuelveInventario: esCredito && hayDevolucion && devuelve, otrasFacturasIds: esCredito ? [] : otras,
                    numeroNota: copia.numero, numeroControl: copia.control, fecha: copia.fecha,
                    renglones: lineas.map((l) => (l.ventaDetalleId ? { ventaDetalleId: l.ventaDetalleId, cantidad: l.cantidad } : { descripcion: l.descripcion, cantidad: 1, precioUnitario: l.precioUnitario, aplicaIva: l.aplicaIva })),
                }),
            });
            avisarNotaEmitida({ titulo: `${esCredito ? 'Nota de crédito' : 'Nota de débito'} emitida`, mensaje: `${r.nota.numeroDocumento} por ${simbolo}${nf(r.nota.totalFinal)}`, notas: [{ id: r.nota.id, numero: r.nota.numeroDocumento }], porAprobar: r.nota.porAprobar });
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
        <Modal {...PANTALLA_COMPLETA_MOVIL} opened={opened} onClose={onClose} size="xl" centered title={<Text fw={800}>{esCredito ? 'Nota de crédito' : 'Nota de débito'} · factura {factura.numeroDocumento}</Text>}>
            {isLoading || !numeracion ? <Group justify="center" p="xl"><Loader /></Group> : (serie && !serie.configurado) ? (
                <PreguntarNumero serie={serie} puedeEditar={numeracion.puedeEditar} />
            ) : (
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {esCredito
                            ? `Baja lo que el cliente debe por esta factura. Puedes acreditar hasta ${simbolo}${nf(data?.acreditable)} en total.`
                            : 'Sube lo que el cliente debe por esta factura (intereses, cargos adicionales, diferencias). Lleva IVA salvo que sea un concepto exento.'}
                    </Text>

                    {esCredito && telefono && (
                        // En el teléfono, cada producto de la factura en su tarjeta con la cantidad a acreditar a la derecha
                        <Stack gap={6}>
                            <Text size="sm" fw={700}>Productos de la factura</Text>
                            {(data?.renglones || []).map((r) => (
                                <Group key={r.id} wrap="nowrap" gap="sm" p={8} style={{ border: '1px solid #e9ecef', borderRadius: 8, opacity: r.restante === 0 ? 0.6 : 1 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text size="sm" fw={600} lh={1.25} lineClamp={2}>{r.nombre}{!r.aplicaIva && <Text span size="xs" c="dimmed"> · exento</Text>}</Text>
                                        <Text size="xs" c="dimmed">{simbolo}{nf(r.precioUnitario)} c/u · facturado {r.cantidad} · por acreditar {r.restante}</Text>
                                    </div>
                                    <NumberInput w={76} min={0} max={r.restante} allowDecimal={false} allowNegative={false} hideControls disabled={r.restante === 0} inputMode="numeric"
                                        aria-label={`Cantidad a acreditar de ${r.nombre}`} value={cantidades[r.id] ?? ''} onChange={(v) => setCantidades((c) => ({ ...c, [r.id]: v }))} placeholder="0" />
                                </Group>
                            ))}
                        </Stack>
                    )}
                    {esCredito && !telefono && (
                        <Table.ScrollContainer minWidth={560}><Table verticalSpacing={4} fz="sm">
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
                        </Table></Table.ScrollContainer>
                    )}

                    <Stack gap="xs">
                        <Text size="sm" fw={700}>{esCredito ? 'Otros conceptos (descuentos, ajustes)' : 'Conceptos'}</Text>
                        {libres.map((l) => (
                            // En el teléfono la descripción va sola en su línea y el monto, el IVA y quitar debajo
                            <Group key={l.clave} gap="xs" align="flex-end" wrap={telefono ? 'wrap' : 'nowrap'} p={telefono ? 8 : 0} style={telefono ? { border: '1px solid #e9ecef', borderRadius: 8 } : undefined}>
                                <TextInput style={{ flex: telefono ? '1 1 100%' : 1 }} size={telefono ? 'sm' : 'xs'} label="Descripción" placeholder="Ej: Intereses por mora" value={l.descripcion} onChange={(e) => actualizarLibre(l.clave, { descripcion: e.currentTarget.value })} maxLength={200} />
                                <NumberInput w={telefono ? undefined : 130} style={telefono ? { flex: 1 } : undefined} size={telefono ? 'sm' : 'xs'} label={`Monto (${simbolo})`} min={0} allowNegative={false} decimalScale={2} hideControls inputMode="decimal" value={l.precioUnitario} onChange={(v) => actualizarLibre(l.clave, { precioUnitario: v })} />
                                <Switch size="sm" label="IVA" checked={l.aplicaIva} onChange={(e) => actualizarLibre(l.clave, { aplicaIva: e.currentTarget.checked })} mb={telefono ? 8 : 4} />
                                <Button size={telefono ? 'compact-md' : 'compact-sm'} variant="subtle" color="red" onClick={() => setLibres((ls) => ls.filter((x) => x.clave !== l.clave))} aria-label="Quitar"><IconTrash size={telefono ? 18 : 14} /></Button>
                            </Group>
                        ))}
                        <Button size="compact-sm" variant="light" leftSection={<IconPlus size={14} />} w="fit-content" onClick={() => setLibres((ls) => [...ls, LIBRE()])}>Agregar concepto</Button>
                    </Stack>

                    {!esCredito && (data?.otrasFacturas?.length > 0) && (
                        <MultiSelect label="También afecta a otras facturas de este cliente (opcional)" placeholder="Elige las facturas" searchable clearable nothingFoundMessage="Sin resultados"
                            description="La nota sale con la lista de facturas; la deuda se suma a la factura desde la que la emites."
                            data={data.otrasFacturas.map((f) => ({ value: f.ventaId, label: `${f.numeroDocumento} · ${fmtFecha(f.fecha)} · ${f.moneda === 'BS' ? 'Bs' : '$'}${nf(f.totalFinal)}` }))}
                            value={otras} onChange={setOtras} />
                    )}

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <Select label="Motivo" data={MOTIVOS[tipo]} value={motivo} onChange={(v) => setMotivo(v || MOTIVOS[tipo][0])} allowDeselect={false} />
                        <Textarea label="Detalle (opcional)" placeholder="Más información para el cliente" autosize minRows={1} value={detalle} onChange={(e) => setDetalle(e.currentTarget.value)} maxLength={200} />
                    </SimpleGrid>

                    {esCredito && hayDevolucion && (
                        <Checkbox label="Devolver la mercancía al inventario" description="Suma al stock las unidades de los productos acreditados (solo si ya salieron del almacén)" checked={devuelve} onChange={(e) => setDevuelve(e.currentTarget.checked)} />
                    )}

                    {totales && (
                        <Alert color={excede ? 'red' : 'blue'} variant="light" title={`Total de la nota: ${simbolo}${nf(totales.totalFinal)}`}>
                            <Text size="xs">Base {simbolo}{nf(totales.baseImponible)} · Exento {simbolo}{nf(totales.exento)} · IVA {simbolo}{nf(totales.montoIva)}</Text>
                            {excede && <Text size="xs" fw={700} mt={4}>Supera lo que queda por acreditar ({simbolo}{nf(data.acreditable)}).</Text>}
                        </Alert>
                    )}
                    <DatosDeCopia valores={copia} onCambio={setCopia} etiquetaNumero={esCredito ? 'Número de la nota de crédito' : 'Número de la nota de débito'} placeholderNumero={serie?.siguienteNumero ? String(serie.siguienteNumero) : ''} />
                    {error && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{error}</Alert>}

                    <Group justify="flex-end" style={telefono ? { flexDirection: 'column-reverse', alignItems: 'stretch' } : undefined}>
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
