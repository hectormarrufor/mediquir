'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Loader, Modal, NumberInput, SegmentedControl, Select, Stack, Text, TextInput, ActionIcon, Paper } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';
import { buscarProductos } from '@/app/helpers/busquedaProductos';
import { calcularFactura } from '@/app/constants/facturacion';
import { CONFIG_FISCAL } from '@/app/constants/empresa';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const METODOS = ['Efectivo ($)', 'Efectivo (Bs)', 'Transferencia', 'Pago Móvil', 'Punto de venta', 'Zelle', 'No especificado'];

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
let contador = 0;
const clave = () => `r${++contador}`;

// Corregir o eliminar una factura que todavía no se imprimió en la forma libre (solo usuario 1 y jolexi):
// agregar o quitar renglones, cambiar cantidades y precios, pasar de contado a crédito (o al revés) y los días de crédito.
export default function CorregirFacturaModal({ opened, onClose, pedido, onListo, onEliminada }) {
    const [renglones, setRenglones] = useState([]);
    const [condicion, setCondicion] = useState(pedido.condicionPago);
    const [dias, setDias] = useState('');
    const [metodo, setMetodo] = useState('');
    const [referencia, setReferencia] = useState('');
    const [enviando, setEnviando] = useState(false);

    const { data: estado, isLoading, error } = useQuery({
        queryKey: ['corregir-factura', pedido.id], enabled: opened, gcTime: 0, retry: false,
        queryFn: () => pedir(`/api/ventas/${pedido.id}/corregir`),
    });
    const { data: productos = [] } = useQuery({ queryKey: ['productos-corregir-factura'], staleTime: 60_000, enabled: opened, queryFn: () => pedir('/api/productos').catch(() => []) });
    const opciones = useMemo(() => productos.map((p) => ({ value: String(p.id), label: `${p.codigo || ''} · ${p.nombre}${p.marca?.nombre ? ` · ${p.marca.nombre}` : ''}` })), [productos]);
    const filtro = ({ search, limit }) => (!search.trim() ? opciones.slice(0, limit) : buscarProductos(productos, search).slice(0, limit).map((p) => opciones.find((o) => o.value === String(p.id))).filter(Boolean));

    // Estado inicial: lo que tiene la factura hoy
    useEffect(() => {
        setRenglones((pedido.detalles || []).map((d) => ({
            clave: clave(), productoId: d.productoId ? String(d.productoId) : null, aMano: Boolean(d.isFicticio), nombre: d.nombreFicticio || '',
            cantidad: Number(d.cantidad), precioUnitario: Number(d.precioUnitario), aplicaIva: Boolean(d.aplicaIva), afectaInventario: d.afectaInventario !== false,
            etiqueta: d.producto ? `${d.producto.codigo || ''} · ${d.producto.nombre}` : d.nombreFicticio,
        })));
        setCondicion(pedido.condicionPago);
        if (pedido.condicionPago === 'Credito' && pedido.fechaVencimiento) {
            const base = new Date(pedido.fechaEmision || pedido.createdAt).getTime();
            setDias(String(Math.round((new Date(pedido.fechaVencimiento).getTime() - base) / 86400000)));
        } else setDias('');
    }, [pedido]);
    useEffect(() => { if (condicion === 'Credito' && dias === '' && estado) setDias(String(estado.diasCreditoCliente || 15)); }, [condicion, dias, estado]);

    const poner = (k, cambios) => setRenglones((l) => l.map((r) => (r.clave === k ? { ...r, ...cambios } : r)));
    const completos = renglones.length > 0 && renglones.every((r) => (r.aMano ? r.nombre.trim() : r.productoId) && Number(r.cantidad) >= 1 && Number(r.precioUnitario) > 0);
    const totales = useMemo(() => {
        if (!completos) return null;
        try {
            return calcularFactura({ renglones: renglones.map((r) => ({ precioUnitario: r.precioUnitario, cantidad: r.cantidad, aplicaIva: r.aplicaIva, porcentajeIva: 16 })), costoFlete: Number(pedido.costoFlete) || 0 });
        } catch { return null; }
    }, [renglones, completos, pedido.costoFlete]);
    const simbolo = pedido.moneda === 'BS' ? 'Bs ' : '$';
    const bloqueado = Boolean(estado?.bloqueo);
    const cambiaPago = condicion !== pedido.condicionPago;

    const guardar = async () => {
        setEnviando(true);
        try {
            const r = await pedir(`/api/ventas/${pedido.id}/corregir`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    condicionPago: condicion, diasCredito: condicion === 'Credito' ? Number(dias) : undefined,
                    metodoPago: condicion === 'Contado' && cambiaPago ? (metodo || undefined) : undefined, referencia: condicion === 'Contado' && cambiaPago ? (referencia || undefined) : undefined,
                    detalles: renglones.map((x) => ({ productoId: x.aMano ? null : Number(x.productoId), isFicticio: x.aMano, nombreFicticio: x.aMano ? x.nombre : undefined, cantidad: Number(x.cantidad), precioUnitario: Number(x.precioUnitario), aplicaIva: x.aplicaIva, afectaInventario: x.afectaInventario })),
                }),
            });
            notifications.show({ title: 'Factura corregida', message: `${r.numeroDocumento}: ${r.condicionPago === 'Credito' ? `a crédito, vence el ${r.fechaVencimiento}` : 'de contado'} · total ${simbolo}${nf(r.totalFinal)}`, color: 'green', autoClose: 7000 });
            onListo?.();
            onClose();
        } catch (e) {
            notifications.show({ title: 'No se pudo corregir', message: e.message, color: 'red' });
        } finally { setEnviando(false); }
    };

    const eliminar = async () => {
        if (!window.confirm(`¿Eliminar la factura ${pedido.numeroDocumento} con todo su rastro (renglones, inventario, ingresos o cuenta por cobrar)? No se puede deshacer.`)) return;
        setEnviando(true);
        try {
            const r = await pedir(`/api/ventas/${pedido.id}/corregir`, { method: 'DELETE' });
            notifications.show({ title: 'Factura eliminada', message: r.message, color: 'green', autoClose: 10000 });
            onEliminada?.();
            onClose();
        } catch (e) {
            notifications.show({ title: 'No se pudo eliminar', message: e.message, color: 'red' });
        } finally { setEnviando(false); }
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} opened={opened} onClose={onClose} size="xl" title={<Text fw={700}>Corregir factura {pedido.numeroDocumento}</Text>}>
            {isLoading ? <Group justify="center" p="xl"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : bloqueado ? (
                <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="No se puede corregir">{estado.bloqueo}</Alert>
            ) : (
                <Stack gap="md">
                    <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
                        Solo se puede corregir mientras la factura no se haya impreso en la forma libre. Al guardar se rehacen los totales, el inventario, el ingreso en caja o la cuenta por cobrar y la comisión del vendedor.
                    </Alert>

                    <div>
                        <Text size="sm" fw={600} mb={4}>Condición de pago</Text>
                        <Group align="flex-end" gap="md">
                            <SegmentedControl value={condicion} onChange={setCondicion} data={[{ value: 'Contado', label: 'Contado' }, { value: 'Credito', label: 'Crédito' }]} disabled={!pedido.clienteId && condicion === 'Contado'} />
                            {condicion === 'Credito' && <NumberInput w={140} label="Días de crédito" min={0} max={365} allowDecimal={false} value={dias} onChange={(v) => setDias(v === '' ? '' : String(v))} />}
                            {condicion === 'Contado' && cambiaPago && <>
                                <Select w={190} label="Método de pago" data={METODOS} value={metodo || null} onChange={(v) => setMetodo(v || '')} placeholder="No especificado" clearable />
                                <TextInput w={170} label="Referencia" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />
                            </>}
                        </Group>
                        {cambiaPago && <Text size="xs" c="dimmed" mt={4}>{condicion === 'Credito' ? 'Se eliminan los ingresos de caja de esta factura y se crea su cuenta por cobrar.' : 'Se elimina la cuenta por cobrar y se registran los ingresos en caja.'}</Text>}
                    </div>

                    <div>
                        <Group justify="space-between" mb={6}>
                            <Text size="sm" fw={600}>Renglones ({renglones.length}/{CONFIG_FISCAL.maxRenglonesFactura})</Text>
                            <Group gap="xs">
                                <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={renglones.length >= CONFIG_FISCAL.maxRenglonesFactura} onClick={() => setRenglones((l) => [...l, { clave: clave(), productoId: null, aMano: false, nombre: '', cantidad: 1, precioUnitario: '', aplicaIva: true, afectaInventario: true }])}>Agregar producto</Button>
                                <Button size="xs" variant="subtle" disabled={renglones.length >= CONFIG_FISCAL.maxRenglonesFactura} onClick={() => setRenglones((l) => [...l, { clave: clave(), productoId: null, aMano: true, nombre: '', cantidad: 1, precioUnitario: '', aplicaIva: true, afectaInventario: false }])}>Renglón a mano</Button>
                            </Group>
                        </Group>
                        <Stack gap={6}>
                            {renglones.map((r) => (
                                <Paper key={r.clave} withBorder p="xs" radius="md">
                                    <Group gap={6} align="flex-end" wrap="wrap">
                                        {r.aMano
                                            ? <TextInput size="xs" style={{ flex: '1 1 220px' }} label="Descripción (a mano)" value={r.nombre} onChange={(e) => poner(r.clave, { nombre: e.currentTarget.value })} />
                                            : <Select size="xs" style={{ flex: '1 1 220px' }} label="Producto" placeholder={r.etiqueta || 'Busca por nombre o código'} searchable data={opciones} filter={filtro} limit={30} nothingFoundMessage="Sin coincidencias"
                                                value={r.productoId} onChange={(v) => { const p = productos.find((x) => String(x.id) === v); poner(r.clave, { productoId: v, etiqueta: p ? `${p.codigo || ''} · ${p.nombre}` : r.etiqueta, aplicaIva: p ? Number(p.porcentajeIva) > 0 : r.aplicaIva }); }} />}
                                        <NumberInput size="xs" w={80} label="Cantidad" min={1} allowDecimal={false} value={r.cantidad} onChange={(v) => poner(r.clave, { cantidad: v })} />
                                        <NumberInput size="xs" w={110} label={`Precio ${pedido.moneda === 'BS' ? 'Bs' : '$'}`} min={0} decimalScale={4} value={r.precioUnitario} onChange={(v) => poner(r.clave, { precioUnitario: v })} />
                                        <Checkbox size="xs" mb={6} label="Con IVA" checked={r.aplicaIva} onChange={(e) => poner(r.clave, { aplicaIva: e.currentTarget.checked })} />
                                        <ActionIcon mb={2} variant="subtle" color="red" onClick={() => setRenglones((l) => l.filter((x) => x.clave !== r.clave))} aria-label="Quitar renglón"><IconTrash size={16} /></ActionIcon>
                                    </Group>
                                </Paper>
                            ))}
                        </Stack>
                        {totales && (
                            <Text size="sm" mt="xs" ta="right">Subtotal {simbolo}{nf(totales.subtotal)} · IVA {simbolo}{nf(totales.montoIva)}{totales.flete > 0 ? ` · Flete ${simbolo}${nf(totales.flete)}` : ''} · <b>Total {simbolo}{nf(totales.totalFinal)}</b></Text>
                        )}
                    </div>

                    <Group justify="space-between" mt="sm">
                        <Button color="red" variant="outline" leftSection={<IconTrash size={16} />} loading={enviando} onClick={eliminar}>Eliminar factura</Button>
                        <Group>
                            <Button variant="default" onClick={onClose}>Cancelar</Button>
                            <Button loading={enviando} disabled={!completos || (condicion === 'Credito' && dias === '')} onClick={guardar}>Guardar cambios</Button>
                        </Group>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
