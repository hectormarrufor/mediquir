'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    ActionIcon, Alert, Badge, Button, Card, Checkbox, Divider, Group, Loader, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery, useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';
import { buscarProductos } from '@/app/helpers/busquedaProductos';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fechaCorta = (f) => (f ? new Date(f).toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }) : '');
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
let consecutivo = 0;
const renglonVacio = () => ({ clave: `r${++consecutivo}`, productoId: null, aMano: false, nombre: '', cantidad: 1, precioUnitario: '', exento: false });

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

// Renglones de una nota que en el sistema solo tiene su total (notas migradas): se escriben y deben sumar lo que dice la nota
function RenglonesAMano({ nota, renglones, onCambio, productos, opciones }) {
    const suma = r2(renglones.reduce((a, r) => a + (Number(r.cantidad) || 0) * (Number(r.precioUnitario) || 0), 0));
    const diferencia = r2(suma - nota.subtotal);
    const poner = (clave, cambios) => onCambio(renglones.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)));
    const filtro = ({ search, limit }) => {
        if (!search.trim()) return opciones.slice(0, limit);
        return buscarProductos(productos, search).slice(0, limit).map((p) => opciones.find((o) => o.value === String(p.id))).filter(Boolean);
    };
    return (
        <Card withBorder radius="md" p="sm">
            <Group justify="space-between" mb={6} wrap="nowrap">
                <Text size="sm" fw={700}>{nota.numero} <Text span size="xs" c="dimmed">({fechaCorta(nota.fecha)})</Text></Text>
                <Badge color={Math.abs(diferencia) <= 0.01 ? 'green' : 'orange'} variant="light">
                    ${nf(suma)} de ${nf(nota.subtotal)}{Math.abs(diferencia) > 0.01 ? ` · ${diferencia > 0 ? 'sobran' : 'faltan'} $${nf(Math.abs(diferencia))}` : ' · cuadra'}
                </Badge>
            </Group>
            <Text size="xs" c="dimmed" mb="xs">Esta nota está en el sistema solo con su total. Escribe sus renglones (precio en dólares, sin IVA): deben sumar lo que dice la nota.</Text>
            <Stack gap={6}>
                {renglones.map((r) => (
                    <Group key={r.clave} gap={6} align="flex-end" wrap="wrap">
                        {r.aMano
                            ? <TextInput size="xs" style={{ flex: '1 1 220px' }} label="Producto (escrito a mano)" placeholder="Nombre como va en la factura" value={r.nombre} onChange={(e) => poner(r.clave, { nombre: e.currentTarget.value })} />
                            : <Select size="xs" style={{ flex: '1 1 220px' }} label="Producto" placeholder="Busca por nombre o código" searchable data={opciones} filter={filtro} limit={30} nothingFoundMessage="Sin coincidencias"
                                value={r.productoId ? String(r.productoId) : null}
                                onChange={(v) => { const p = productos.find((x) => String(x.id) === v); poner(r.clave, { productoId: v ? Number(v) : null, exento: p ? Number(p.porcentajeIva) === 0 : r.exento }); }} />}
                        <NumberInput size="xs" w={80} label="Cantidad" min={1} allowDecimal={false} value={r.cantidad} onChange={(v) => poner(r.clave, { cantidad: v })} />
                        <NumberInput size="xs" w={100} label="Precio $" min={0} decimalScale={3} prefix="$" value={r.precioUnitario} onChange={(v) => poner(r.clave, { precioUnitario: v })} />
                        <Checkbox size="xs" mb={6} label="Exento" checked={r.exento} onChange={(e) => poner(r.clave, { exento: e.currentTarget.checked })} />
                        <Checkbox size="xs" mb={6} label="No está en inventario" checked={r.aMano} onChange={(e) => poner(r.clave, { aMano: e.currentTarget.checked, productoId: null })} />
                        <ActionIcon mb={2} variant="subtle" color="red" onClick={() => onCambio(renglones.filter((x) => x.clave !== r.clave))} aria-label="Quitar renglón"><IconTrash size={16} /></ActionIcon>
                    </Group>
                ))}
                <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => onCambio([...renglones, renglonVacio()])} style={{ alignSelf: 'flex-start' }}>Agregar renglón</Button>
            </Stack>
        </Card>
    );
}

// «Pasar a factura»: una o varias notas de entrega del mismo cliente -> una o varias facturas (hasta lo que cabe en la forma libre por factura)
export default function FacturarNotasModal({ opened, onClose, pedido, onListo }) {
    const router = useRouter();
    const [seleccion, setSeleccion] = React.useState([pedido.id]);
    const [manuales, setManuales] = React.useState({});
    const [porFactura, setPorFactura] = React.useState(null);
    const [copias, setCopias] = React.useState([]);
    const [fecha, setFecha] = React.useState('');
    const [moverInventario, setMoverInventario] = React.useState(true);

    const { data: info, isLoading, error } = useQuery({
        queryKey: ['facturar-notas', pedido.id], enabled: opened, gcTime: 0,
        queryFn: () => pedir(`/api/ventas/facturar-notas?nota=${pedido.id}`),
    });
    const { data: productos = [] } = useQuery({ queryKey: ['productos-facturar-notas'], staleTime: 60_000, enabled: opened, queryFn: () => pedir('/api/productos').catch(() => []) });
    const opciones = React.useMemo(() => productos.map((p) => ({ value: String(p.id), label: `${p.codigo || ''} · ${p.nombre}${p.marca?.nombre ? ` · ${p.marca.nombre}` : ''}` })), [productos]);

    const maximo = info?.maxRenglones || 13;
    const candidatas = info?.candidatas || [];
    const elegidas = candidatas.filter((c) => seleccion.includes(c.id));
    const sinRenglones = elegidas.filter((c) => c.renglones === 0);
    // Una nota sin renglones arranca con uno vacío para escribir
    React.useEffect(() => {
        const faltan = sinRenglones.filter((n) => !manuales[n.id]);
        if (faltan.length) setManuales((m) => ({ ...m, ...Object.fromEntries(faltan.map((n) => [n.id, [renglonVacio()]])) }));
    }, [sinRenglones, manuales]);

    const listos = sinRenglones.every((n) => (manuales[n.id] || []).length && (manuales[n.id] || []).every((r) => (r.productoId || (r.aMano && r.nombre.trim())) && Number(r.cantidad) >= 1 && Number(r.precioUnitario) > 0));
    const cuerpo = {
        notaIds: elegidas.map((n) => n.id), porFactura: porFactura || maximo, fecha: fecha || null, moverInventario,
        manuales: Object.fromEntries(sinRenglones.map((n) => [n.id, (manuales[n.id] || []).map((r) => ({ productoId: r.aMano ? null : r.productoId, nombre: r.nombre, cantidad: Number(r.cantidad), precioUnitario: Number(r.precioUnitario), exento: r.exento }))])),
    };
    const [cuerpoDiferido] = useDebouncedValue(JSON.stringify(cuerpo), 500);
    const { data: plan, error: errorPlan, isFetching } = useQuery({
        queryKey: ['plan-facturar-notas', cuerpoDiferido], enabled: opened && Boolean(info) && elegidas.length > 0 && listos, gcTime: 0, retry: false,
        queryFn: () => pedir('/api/ventas/facturar-notas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(cuerpoDiferido), vistaPrevia: true }) }),
    });

    const emitir = useMutation({
        mutationFn: () => pedir('/api/ventas/facturar-notas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, copias }) }),
        onSuccess: (r) => {
            const nums = r.facturas.map((f) => f.numeroDocumento).join(', ');
            notifications.show({ title: r.facturas.length > 1 ? 'Facturas emitidas' : 'Factura emitida', message: `${nums}. ${r.notas.length > 1 ? 'Las notas quedaron anuladas' : 'La nota quedó anulada'} (se conservan en el historial)${r.faltantes?.length ? `. ${r.faltantes.length} producto(s) no tenían existencia suficiente en el sistema: se descontó lo que había.` : '.'}`, color: 'green', autoClose: 9000 });
            onClose();
            onListo?.();
            if (r.facturas[0]?.ventaId) router.push(`/superuser/ventas/${r.facturas[0].ventaId}`);
        },
        onError: (e) => notifications.show({ title: 'No se emitió', message: e.message, color: 'red' }),
    });

    const alternar = (id, marcado) => setSeleccion((s) => (marcado ? [...new Set([...s, id])] : s.filter((x) => x !== id || x === pedido.id)));
    const ponerCopia = (i, campo, valor) => setCopias((c) => { const n = [...c]; n[i] = { ...(n[i] || {}), [campo]: valor }; return n; });
    const bloqueado = !plan || isFetching || plan.avisos?.some((a) => a.bloquea) || !listos;

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} size="xl" opened={opened} onClose={onClose} title={<Text fw={800}>Pasar a factura</Text>} centered>
            {isLoading ? <Group justify="center" py="md"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : (
                <Stack gap="md">
                    <Text size="sm">Las notas elegidas se <b>anulan</b> (conservan su número y quedan en el historial) y sus renglones pasan a <b>facturas nuevas</b>, en dólares con el IVA de cada producto y la tasa del día de emisión. Si no caben en una sola forma libre ({maximo} renglones), se reparten en varias. La deuda, los abonos y la comisión del vendedor pasan a las facturas.</Text>

                    <div>
                        <Text size="sm" fw={700} mb={6}>Notas de entrega del cliente</Text>
                        <Paper withBorder radius="md">
                            <Table fz="sm" verticalSpacing={6}>
                                <Table.Tbody>
                                    {candidatas.map((c) => (
                                        <Table.Tr key={c.id}>
                                            <Table.Td w={36}><Checkbox checked={seleccion.includes(c.id)} disabled={c.id === pedido.id} onChange={(e) => alternar(c.id, e.currentTarget.checked)} aria-label={`Incluir ${c.numero}`} /></Table.Td>
                                            <Table.Td><b>{c.numero}</b> <Text span size="xs" c="dimmed">{fechaCorta(c.fecha)}</Text></Table.Td>
                                            <Table.Td>{c.renglones ? `${c.renglones} renglones` : <Badge size="xs" color="orange" variant="light">solo el total</Badge>}{!c.entregada && <Badge ml={4} size="xs" color="gray" variant="light">sin despachar</Badge>}</Table.Td>
                                            <Table.Td ta="right">${nf(c.subtotal)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Paper>
                        <Text size="xs" c="dimmed" mt={4}>Marca las otras notas pendientes de este cliente que van en la(s) misma(s) factura(s). Deben estar despachadas.</Text>
                    </div>

                    {sinRenglones.map((n) => (
                        <RenglonesAMano key={n.id} nota={n} renglones={manuales[n.id] || []} onCambio={(lista) => setManuales((m) => ({ ...m, [n.id]: lista }))} productos={productos} opciones={opciones} />
                    ))}

                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <NumberInput label="Renglones por factura" description={`Máximo ${maximo} (lo que cabe en la forma libre)`} min={1} max={maximo} allowDecimal={false} value={porFactura || maximo} onChange={(v) => setPorFactura(Number(v) || maximo)} />
                        <TextInput type="date" label="Fecha de emisión" description="Vacía = hoy (la tasa es la de ese día)" max={new Date().toISOString().slice(0, 10)} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
                    </SimpleGrid>

                    {errorPlan && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{errorPlan.message}</Alert>}
                    {!listos && sinRenglones.length > 0 && <Alert color="gray">Completa los renglones de las notas que solo tienen su total para ver las facturas.</Alert>}
                    {plan && (
                        <Stack gap="sm">
                            {plan.avisos.map((a) => <Alert key={a.texto} color={a.bloquea ? 'red' : 'yellow'} icon={<IconAlertTriangle size={18} />}>{a.texto}</Alert>)}
                            <Group justify="space-between">
                                <Text size="sm" fw={700}>{plan.facturas.length === 1 ? 'Se emite 1 factura' : `Se emiten ${plan.facturas.length} facturas`} {isFetching && <Loader size="xs" ml={6} />}</Text>
                                {plan.tasa && <Text size="xs" c="dimmed">Tasa {nf(plan.tasa)} Bs/$</Text>}
                            </Group>
                            {plan.facturas.map((f, i) => (
                                <Card key={i} withBorder radius="md" p="sm">
                                    <Group justify="space-between" wrap="nowrap" mb={4}>
                                        <Text size="sm" fw={700}>Factura {i + 1} · {f.renglones} renglones</Text>
                                        <Text size="xs" c="dimmed" ta="right">de {f.notas}</Text>
                                    </Group>
                                    <Table fz="xs" withRowBorders={false}>
                                        <Table.Tbody>
                                            <Table.Tr><Table.Td c="dimmed">Base imponible</Table.Td><Table.Td ta="right">${nf(f.base)}</Table.Td><Table.Td c="dimmed">Exento</Table.Td><Table.Td ta="right">${nf(f.exento)}</Table.Td></Table.Tr>
                                            <Table.Tr><Table.Td c="dimmed">IVA</Table.Td><Table.Td ta="right">${nf(f.iva)}</Table.Td><Table.Td fw={700}>Total</Table.Td><Table.Td ta="right" fw={700}>${nf(f.totalUsd)}{f.totalBs !== null && <Text span size="xs" c="dimmed"> · Bs {nf(f.totalBs)}</Text>}</Table.Td></Table.Tr>
                                        </Table.Tbody>
                                    </Table>
                                    <Group grow mt={6} align="flex-start">
                                        <TextInput size="xs" label="Número (si ya la emitiste en el sistema anterior)" placeholder="146883" value={copias[i]?.numero || ''} onChange={(e) => ponerCopia(i, 'numero', e.currentTarget.value)} />
                                        <TextInput size="xs" label="Número de control" placeholder="00-0122676" value={copias[i]?.control || ''} onChange={(e) => ponerCopia(i, 'control', e.currentTarget.value)} />
                                    </Group>
                                </Card>
                            ))}
                            {plan.porSacar > 0 || !moverInventario ? (
                                <Checkbox checked={moverInventario} onChange={(e) => setMoverInventario(e.currentTarget.checked)}
                                    label={`Descontar del inventario lo que nunca salió con la nota (${plan.porSacar} renglones)`}
                                    description="Notas migradas sin renglones o que no movieron inventario. Lo que ya salió con la nota no se descuenta otra vez." />
                            ) : null}
                            {plan.faltantes.length > 0 && (
                                <Alert color="yellow" title={`${plan.faltantes.length} producto(s) sin existencia suficiente en el sistema`}>
                                    <Text size="xs" mb={4}>La mercancía ya se entregó: se descuenta lo que haya y el stock queda en cero (nunca negativo).</Text>
                                    {plan.faltantes.slice(0, 12).map((x) => <Text key={`${x.codigo}-${x.nombre}`} size="xs">{x.codigo} {x.nombre}: hay {x.hay}, salen {x.salen}</Text>)}
                                    {plan.faltantes.length > 12 && <Text size="xs" c="dimmed">…y {plan.faltantes.length - 12} más</Text>}
                                </Alert>
                            )}
                        </Stack>
                    )}
                    <Divider />
                    <Text size="xs" c="dimmed">Si el cliente te retiene el IVA, lo declaras después al registrar su abono. El número de control se asigna al imprimir si no lo escribes. Esta acción no se puede deshacer.</Text>
                    <Button loading={emitir.isPending} disabled={bloqueado} fullWidth color="indigo" onClick={() => emitir.mutate()}>
                        {plan && plan.facturas.length > 1 ? `Sí, emitir las ${plan.facturas.length} facturas` : 'Sí, emitir la factura'}
                    </Button>
                </Stack>
            )}
        </Modal>
    );
}
