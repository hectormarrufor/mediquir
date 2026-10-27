'use client';

// «Pagar y retener» (o solo retener) una o varias facturas de un mismo proveedor, en un paso:
// el comprobante de retención sale con el siguiente número del correlativo y al proveedor se le paga el total menos lo retenido.
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Group, Modal, ScrollArea, SegmentedControl, Select, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCash, IconCheck, IconReceiptTax } from '@tabler/icons-react';
import { CONFIG_FISCAL } from '@/app/constants/empresa';
import { fechaCaracas, formatearFecha } from '@/app/constants/hora';
import { OPCIONES_PAGO_PROVEEDOR } from '@/app/constants/metodosPago';
import { PreguntarNumero, useNumeracion } from '@/app/superuser/_components/NumeracionFiscal';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Estado de la retención de una compra: emitida (con comprobante), pendiente («al pagar»), no hecha (tiene IVA y nunca se retuvo) o no aplica
export function estadoRetencion(c) {
    if (c.tipoDocumento !== 'FACTURA') return 'nota';
    const rets = c.retenciones || [];
    if (rets.some((r) => r.comprobante)) return 'retenida';
    if (!(Number(c.montoIva) > 0)) return 'sin_iva';
    if (rets.some((r) => r.estado === 'PENDIENTE')) return 'pendiente';
    return 'sin_retener';
}

// Lo que se le debe al proveedor por una compra (en la moneda de su cuenta por pagar); 0 si fue de contado o ya está pagada
export const saldoDe = (c) => (c.cuentaPorPagar && c.cuentaPorPagar.estado !== 'Pagado' ? Number(c.cuentaPorPagar.saldoPendiente) || 0 : 0);

// Misma regla que el servidor (retenciones.js): IVA en Bs × %, redondeado a 2; en la moneda de la factura con su tasa
function retencionDe(c, pct) {
    const tasa = Number(c.tasaCambio) || 1;
    const ivaBs = c.moneda === 'BS' ? r2(c.montoIva) : r2(Number(c.montoIva) * tasa);
    const retBs = r2(ivaBs * pct / 100);
    const enMoneda = c.moneda === 'BS' ? retBs : r2(retBs / tasa);
    const cxp = c.cuentaPorPagar;
    const enCuenta = !cxp || cxp.moneda === c.moneda ? enMoneda : (cxp.moneda === 'BS' ? retBs : r2(retBs / (Number(cxp.tasaCambio) || tasa)));
    return { ivaBs, retBs, enCuenta };
}

export default function PagarRetenerModal({ facturas, modo = 'pagar', onClose, onListo }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const proveedor = facturas[0]?.proveedor || {};
    const porRetener = facturas.filter((c) => ['pendiente', 'sin_retener'].includes(estadoRetencion(c)));
    const puedeRetener = CONFIG_FISCAL.agenteRetencionIva && porRetener.length > 0;
    const pendientePct = porRetener.flatMap((c) => c.retenciones || []).find((r) => r.estado === 'PENDIENTE')?.porcentajeRetencion;
    const pctInicial = [75, 100].includes(Number(pendientePct)) ? Number(pendientePct) : [75, 100].includes(Number(proveedor.retencionIvaPorDefecto)) ? Number(proveedor.retencionIvaPorDefecto) : CONFIG_FISCAL.porcentajeRetencionCompras;

    const [retener, setRetener] = useState(puedeRetener);
    const [pct, setPct] = useState(String(pctInicial));
    const [periodo, setPeriodo] = useState(fechaCaracas().slice(0, 7));
    const [metodoPago, setMetodoPago] = useState('Transferencia');
    const [referencia, setReferencia] = useState('');
    const [fechaPago, setFechaPago] = useState(fechaCaracas());
    const [sinComprobante, setSinComprobante] = useState(false); // ya se pagó, pero quien pagó no pasó el comprobante
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);

    // Fecha del comprobante: hoy; si se elige un mes anterior (retención de un periodo pasado), el último día de ese mes
    const hoy = fechaCaracas();
    const fechaRet = periodo === hoy.slice(0, 7) ? hoy : (() => { const [a, m] = periodo.split('-').map(Number); return `${periodo}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`; })();
    const opcionesPeriodo = Array.from({ length: 4 }, (_, i) => {
        const d = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - i, 1);
        const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return { value: v, label: `${MESES[d.getMonth()]} ${d.getFullYear()}${i === 0 ? ' (hoy)' : ''}` };
    });

    const conRetencion = retener && puedeRetener;
    const { data: info, refetch } = useQuery({
        queryKey: ['proximo-comprobante', fechaRet], enabled: conRetencion,
        queryFn: async () => { const r = await fetch(`/api/compras/retenciones?fecha=${fechaRet}`); return (await r.json()).proximo; },
    });
    const { data: numeracion } = useNumeracion(conRetencion && info?.configurado === false);
    const serieRet = numeracion?.series?.find((s) => s.clave === 'RET-COMPRA');

    const filas = useMemo(() => facturas.map((c) => {
        const est = estadoRetencion(c);
        const ret = conRetencion && ['pendiente', 'sin_retener'].includes(est) ? retencionDe(c, Number(pct)) : null;
        const saldo = saldoDe(c);
        const moneda = c.cuentaPorPagar?.moneda || c.moneda;
        return { c, est, ret, saldo, moneda, aPagar: Math.max(0, r2(saldo - (ret?.enCuenta || 0))) };
    }), [facturas, conRetencion, pct]);
    const totalRetBs = r2(filas.reduce((a, f) => a + (f.ret?.retBs || 0), 0));
    const aPagarPor = (moneda) => r2(filas.filter((f) => f.moneda === moneda).reduce((a, f) => a + f.aPagar, 0));
    const totalesPago = ['BS', 'USD'].map((m) => ({ m, v: aPagarPor(m) })).filter((x) => x.v > 0);
    const hayQuePagar = modo === 'pagar' && filas.some((f) => f.saldo > 0.005);
    const sinRetenerAlPagar = modo === 'pagar' && puedeRetener && !retener;

    const confirmar = async () => {
        setEnviando(true);
        try {
            const res = modo === 'pagar'
                ? await fetch('/api/compras/pagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facturaIds: facturas.map((c) => c.id), retener: conRetencion, porcentaje: Number(pct), fecha: fechaRet, metodoPago, referencia, fechaPago, sinComprobante }) })
                : await fetch('/api/compras/retenciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facturaIds: porRetener.map((c) => c.id), porcentaje: Number(pct), fecha: fechaRet }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data.codigo === 'RETENCION_PENDIENTE') refetch();
                throw new Error(data.error || 'No se pudo completar');
            }
            const ret = modo === 'pagar' ? data.retencion : data;
            setResultado({ comprobante: ret?.comprobante || null, totalBs: ret?.totalBs || 0, facturaId: ret?.facturas?.[0]?.id || null, pagos: data.pagos || [], avisos: ret?.avisos || [] });
            queryClient.invalidateQueries({ queryKey: ['historial-compras'] });
            queryClient.invalidateQueries({ queryKey: ['compras-pendientes'] });
            queryClient.invalidateQueries({ queryKey: ['retenciones-compras'] });
            queryClient.invalidateQueries({ queryKey: ['cuentas'] });
            onListo?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo completar', message: e.message });
        } finally {
            setEnviando(false);
        }
    };

    const titulo = modo === 'pagar' ? (conRetencion ? 'Pagar y retener' : 'Pagar') : 'Generar comprobante de retención';

    return (
        <Modal opened onClose={onClose} size="lg" centered title={<Text fw={800}>{titulo} · {proveedor.nombre}</Text>}>
            {resultado ? (
                <Stack>
                    <Alert color="teal" icon={<IconCheck size={18} />} title="Listo">
                        {resultado.pagos.length > 0 && <Text size="sm">Pagada(s): {resultado.pagos.map((p) => `${p.numero} (${p.moneda === 'BS' ? 'Bs' : '$'} ${fmt(p.monto)})`).join(', ')}.</Text>}
                        {resultado.comprobante && <Text size="sm">Comprobante de retención <b>{resultado.comprobante}</b> por Bs {fmt(resultado.totalBs)}.</Text>}
                    </Alert>
                    {resultado.avisos.map((a, i) => <Alert key={i} color="yellow" variant="light" p="xs"><Text size="xs">{a}</Text></Alert>)}
                    <Group grow>
                        <Button variant="default" onClick={onClose}>Cerrar</Button>
                        {resultado.comprobante && resultado.facturaId && (
                            <Button color="green" leftSection={<IconReceiptTax size={18} />} onClick={() => router.push(`/superuser/compras/${resultado.facturaId}/retencion`)}>Ver y enviar el comprobante</Button>
                        )}
                    </Group>
                </Stack>
            ) : (
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">{proveedor.identificacion ? `RIF ${proveedor.identificacion} · ` : ''}{facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}</Text>
                    <ScrollArea>
                        <Table withTableBorder verticalSpacing={6} fz="sm" miw={480}>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Factura</Table.Th>
                                    <Table.Th ta="right">IVA (Bs)</Table.Th>
                                    {conRetencion && <Table.Th ta="right">Retención {pct}% (Bs)</Table.Th>}
                                    {modo === 'pagar' && <Table.Th ta="right">A pagar</Table.Th>}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {filas.map(({ c, est, ret, saldo, moneda, aPagar }) => (
                                    <Table.Tr key={c.id}>
                                        <Table.Td><Text size="sm" fw={600}>{c.numeroDocumento}</Text><Text size="xs" c="dimmed">{formatearFecha(c.fechaFactura)}</Text></Table.Td>
                                        <Table.Td ta="right">{c.tipoDocumento === 'FACTURA' ? fmt(c.moneda === 'BS' ? c.montoIva : Number(c.montoIva) * (Number(c.tasaCambio) || 1)) : '—'}</Table.Td>
                                        {conRetencion && <Table.Td ta="right">{ret ? fmt(ret.retBs) : <Text span size="xs" c="dimmed">{est === 'retenida' ? 'ya retenida' : 'no aplica'}</Text>}</Table.Td>}
                                        {modo === 'pagar' && <Table.Td ta="right">{saldo > 0.005 ? `${moneda === 'BS' ? 'Bs' : '$'} ${fmt(aPagar)}` : <Text span size="xs" c="dimmed">ya pagada</Text>}</Table.Td>}
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>

                    {puedeRetener && (
                        <Stack gap={6}>
                            {modo === 'pagar' && <Switch checked={retener} onChange={(e) => setRetener(e.currentTarget.checked)} label={<Text size="sm" fw={600}>Retener el IVA en este pago</Text>} />}
                            {conRetencion && (
                                <>
                                    <Group gap="sm" align="flex-end" wrap="wrap">
                                        <div>
                                            <Text size="xs" c="dimmed" mb={2}>Porcentaje</Text>
                                            <SegmentedControl size="xs" value={pct} onChange={setPct} data={[{ value: '75', label: '75%' }, { value: '100', label: '100%' }]} />
                                        </div>
                                        <Select size="xs" w={190} label="Mes del comprobante" allowDeselect={false} data={opcionesPeriodo} value={periodo} onChange={(v) => setPeriodo(v || hoy.slice(0, 7))} />
                                    </Group>
                                    {info?.configurado && <Text size="sm">Comprobante N° <b>{info.siguiente}</b>{info.ultimo ? ` (el último fue …${info.ultimo})` : ''} · retenido <b>Bs {fmt(totalRetBs)}</b></Text>}
                                    {info && !info.configurado && serieRet && (
                                        <Alert color="orange" variant="light" p="xs" title="Falta el número del primer comprobante">
                                            <Text size="xs" mb={6}>Indica con qué número sale tu próximo comprobante de retención; luego el sistema lleva el correlativo solo.</Text>
                                            <PreguntarNumero serie={serieRet} puedeEditar={numeracion.puedeEditar} enLinea onListo={() => refetch()} />
                                        </Alert>
                                    )}
                                    {modo === 'pagar' && metodoPago === 'Punto de Venta' && (
                                        <Text size="xs" c="orange.8">Pagada con la tarjeta de la empresa: la providencia de retenciones de IVA excluye lo pagado con tarjeta de débito o crédito a nombre del agente de retención (confírmalo con el contador). Si es el caso, apaga «Retener el IVA».</Text>
                                    )}
                                </>
                            )}
                            {sinRetenerAlPagar && <Text size="xs" c="orange.8">Se pagará el total sin retener: esa(s) factura(s) seguirán como «Falta retener».</Text>}
                        </Stack>
                    )}

                    {modo === 'pagar' && hayQuePagar && (
                        <Stack gap={6}>
                            <Group grow align="flex-start">
                                <TextInput type="date" label="Fecha del pago" value={fechaPago} max={hoy} onChange={(e) => setFechaPago(e.currentTarget.value || hoy)} />
                                <Select label="¿Cómo se pagó?" allowDeselect={false} data={OPCIONES_PAGO_PROVEEDOR} value={metodoPago} onChange={(v) => setMetodoPago(v || 'Transferencia')} />
                            </Group>
                            <Checkbox label="Ya se pagó, pero no tengo el comprobante (lo pagó otra persona)" checked={sinComprobante} onChange={(e) => setSinComprobante(e.currentTarget.checked)} />
                            {sinComprobante
                                ? <Text size="xs" c="dimmed">Quedará marcada como pagada sin comprobante, con tu nombre. Si luego te pasan la referencia, puedes anotarla en caja.</Text>
                                : <TextInput label="Referencia (opcional)" placeholder="Nº de la transferencia" maxLength={60} value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />}
                        </Stack>
                    )}
                    {modo === 'pagar' && hayQuePagar && (
                        <Text fw={800}>Total a pagar al proveedor: {totalesPago.map((x) => `${x.m === 'BS' ? 'Bs' : '$'} ${fmt(x.v)}`).join(' + ') || '0,00'}</Text>
                    )}
                    {modo === 'pagar' && !hayQuePagar && <Text size="sm" c="dimmed">Estas facturas ya están pagadas: solo se emitirá el comprobante.</Text>}

                    <Group grow>
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button color={modo === 'pagar' ? 'teal' : 'green'} loading={enviando} leftSection={modo === 'pagar' ? <IconCash size={18} /> : <IconReceiptTax size={18} />}
                            disabled={(conRetencion && !info?.configurado) || (modo === 'retener' && !porRetener.length) || (modo === 'pagar' && !hayQuePagar && !conRetencion)}
                            onClick={confirmar}>
                            {titulo}
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
