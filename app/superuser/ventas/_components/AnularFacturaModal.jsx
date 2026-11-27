'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Button, Card, Checkbox, Group, Loader, Modal, NumberInput, Paper, Radio, SegmentedControl, Select, Stack, Table, Text, TextInput, Textarea,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { PANTALLA_COMPLETA_MOVIL } from '@/app/components/ui/modalMovil';
import { calcularFactura } from '@/app/constants/facturacion';
import { useAuth } from '@/hooks/useAuth';

const nf = (v) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const MAX_NOTAS = 20;
const MOTIVOS = ['Error en los datos de la factura', 'Devolución de mercancía', 'El cliente no aceptó la factura', 'Se facturó de más', 'Otro'];

// 'NC-00045' + 2 -> 'NC-00047' (para mostrar el número que tomará cada nota de crédito)
const sumarNumero = (texto, n) => {
    const m = /^(.*?)(\d+)$/.exec(texto || '');
    return m ? `${m[1]}${String(Number(m[2]) + n).padStart(m[2].length, '0')}` : texto;
};

async function pedir(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}

// Anular una factura (total o parcial) con una nota de crédito. Pregunta si la nota afecta la cuenta por cobrar y el número de control
// de cada nota. Una factura que salió de notas de entrega, al anularse por completo, devuelve la deuda a esas notas.
// controlInicial: número de control que toma la nota de crédito de esta factura (desde «Números de control», el hueco que se está registrando)
import { avisarNotaEmitida } from './avisoNota';

export default function AnularFacturaModal({ opened, onClose, pedido, onListo, controlInicial = null }) {
    const queryClient = useQueryClient();
    const { isAdmin } = useAuth();
    const [tipo, setTipo] = useState('TOTAL');
    const [tieneOriginalYCopias, setTieneOriginalYCopias] = useState(false);
    const [cantidades, setCantidades] = useState({});
    const [afecta, setAfecta] = useState(null); // 'si' | 'no'
    const [motivo, setMotivo] = useState(MOTIVOS[0]);
    const [detalle, setDetalle] = useState('');
    const [documentos, setDocumentos] = useState({}); // controles de las facturas hermanas (las que comparten notas de entrega)
    const [cuantas, setCuantas] = useState(1); // en cuántas notas de crédito se anula la factura
    const [controles, setControles] = useState([]); // [{ numero, control }] de cada nota de esta factura
    const [repartos, setRepartos] = useState([{}]); // por nota: { [renglón]: cantidad }
    const [fecha, setFecha] = useState('');
    const [modificarPago, setModificarPago] = useState(false); // excepción en nota parcial sobre factura pagada: rebajar también el pago ya registrado
    const [enviando, setEnviando] = useState(false);

    const { data: plan, isLoading, error } = useQuery({
        queryKey: ['anular-factura', pedido.id], enabled: opened, gcTime: 0,
        queryFn: () => pedir(`/api/ventas/${pedido.id}/anular`),
    });
    // Controles sugeridos: los siguientes libres, uno por cada nota de crédito (se pueden cambiar). Las notas de esta factura toman los primeros;
    // las facturas hermanas de una nota de entrega, los que siguen. Con un control indicado, la primera nota de esta factura lo toma.
    useEffect(() => {
        if (!plan) return;
        // El control NO se sugiere: se asigna al imprimir la nota (solo se escribe si se copia de una forma ya impresa, o desde «Números de control»)
        setControles(Array.from({ length: cuantas }, (_, k) => ({ numero: '', control: k === 0 && controlInicial ? controlInicial : '' })));
        setDocumentos(Object.fromEntries(plan.facturas.filter((f) => f.id !== plan.factura.id).map((f) => [f.id, { numero: '', control: '' }])));
    }, [plan, controlInicial, cuantas]);
    useEffect(() => { setRepartos((r) => Array.from({ length: cuantas }, (_, k) => r[k] || {})); }, [cuantas]);

    const simbolo = plan?.factura.moneda === 'BS' ? 'Bs' : '$';
    const varias = cuantas > 1;
    // Lo que queda por repartir de cada renglón al llegar a cada nota (lo que toman las notas anteriores ya no queda)
    const quedaAntes = (k, rid) => {
        const r = plan.renglones.find((x) => x.id === rid);
        return Math.max(0, r.restante - repartos.slice(0, k).reduce((a, rep) => a + (Number(rep[rid]) || 0), 0));
    };
    const sinRepartir = plan ? plan.renglones.reduce((a, r) => a + quedaAntes(cuantas, r.id), 0) : 0;
    const completaVarias = varias && sinRepartir === 0;
    const deNotas = Boolean(plan?.deNotas) && (varias ? completaVarias : tipo === 'TOTAL');
    const hermanas = plan ? plan.facturas.filter((f) => f.id !== plan.factura.id) : [];
    const facturasNc = deNotas ? hermanas : [];
    const montoNota = (k) => {
        const lineas = plan.renglones.filter((r) => Number(repartos[k]?.[r.id]) > 0).map((r) => ({ precioUnitario: r.precioUnitario, cantidad: Number(repartos[k][r.id]), aplicaIva: r.aplicaIva, porcentajeIva: 16 }));
        return lineas.length ? calcularFactura({ renglones: lineas }).totalFinal : 0;
    };
    // Monto de la nota parcial (precio e IVA de cada renglón de la factura)
    const montoParcial = useMemo(() => {
        if (!plan || tipo !== 'PARCIAL') return 0;
        const lineas = plan.renglones.filter((r) => Number(cantidades[r.id]) > 0)
            .map((r) => ({ precioUnitario: r.precioUnitario, cantidad: Number(cantidades[r.id]), aplicaIva: r.aplicaIva, porcentajeIva: 16 }));
        return lineas.length ? calcularFactura({ renglones: lineas }).totalFinal : 0;
    }, [plan, tipo, cantidades]);

    const esDirecta = !varias && tipo === 'DIRECTA';
    const motivoFinal = motivo === 'Otro' ? detalle.trim() : `${motivo}${detalle.trim() ? `: ${detalle.trim()}` : ''}`;
    // Nota PARCIAL sobre una factura ya pagada: no toca cuentas por cobrar, ingresos, inventario ni saldo a favor (se pide confirmación al emitirla)
    const parcialPagada = !esDirecta && Boolean(plan?.factura.pagada) && (varias ? !completaVarias : tipo === 'PARCIAL');
    const faltaAfecta = !esDirecta && !deNotas && !parcialPagada && !afecta;
    const faltaControl = false; // el control se asigna al imprimir
    const sinRenglones = !esDirecta && (varias ? Array.from({ length: cuantas }, (_, k) => k).some((k) => !(montoNota(k) > 0)) : tipo === 'PARCIAL' && !(montoParcial > 0));
    const bloqueadoDirecta = !plan?.anulacionDirecta?.permitida || !tieneOriginalYCopias || motivoFinal.length < 5;
    const bloqueado = !plan || (esDirecta ? bloqueadoDirecta : (faltaAfecta || faltaControl || sinRenglones || motivoFinal.length < 5 || (deNotas && plan.bloqueosNotas.length > 0)));

    const anular = async () => {
        if (esDirecta) {
            setEnviando(true);
            try {
                const r = await pedir(`/api/ventas/${pedido.id}/anular`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo: 'DIRECTA', motivo: motivoFinal, tieneOriginalYCopias }),
                });
                notifications.show({
                    color: 'green',
                    title: 'Factura anulada sin Nota de Crédito',
                    message: `${r.factura}${r.control ? ` (control ${r.control})` : ''} quedó marcada como ANULADA para el Libro de Ventas. Archiva el original y todas las copias rayadas con «ANULADA».`,
                });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                queryClient.invalidateQueries({ queryKey: ['vendedor'] });
                queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] });
                queryClient.invalidateQueries({ queryKey: ['empaque', pedido.id] });
                onClose();
                onListo?.();
            } catch (e) {
                notifications.show({ color: 'red', title: 'No se anuló', message: e.message });
            } finally { setEnviando(false); }
            return;
        }
        const pagoRebajar = parcialPagada && modificarPago;
        const aviso = pagoRebajar
            ? 'Esta factura ya está pagada. Se emitirá la nota de crédito parcial y se REBAJARÁ el pago ya registrado por el monto de la nota; no afectará las cuentas por cobrar, no dejará saldo a favor y no moverá el inventario. ¿Confirmas?'
            : 'Esta factura ya está pagada. La nota de crédito parcial NO afectará las cuentas por cobrar ni lo ya ingresado, no dejará saldo a favor y no moverá el inventario. ¿Confirmas?';
        if (parcialPagada && !window.confirm(aviso)) return;
        setEnviando(true);
        try {
            const r = await pedir(`/api/ventas/${pedido.id}/anular`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo, motivo: motivoFinal, fecha: fecha || null, afectaCxc: deNotas || parcialPagada ? null : afecta === 'si', confirmarPagada: parcialPagada, modificarPago: pagoRebajar,
                    huecoControl: Boolean(controlInicial), // solo al registrar un hueco desde «Números de control»
                    documentos: { ...documentos, [plan.factura.id]: controles[0] || {} },
                    notas: varias ? controles.slice(0, cuantas).map((c, k) => ({
                        numero: c.numero, control: c.control,
                        renglones: plan.renglones.filter((x) => Number(repartos[k]?.[x.id]) > 0).map((x) => ({ ventaDetalleId: x.id, cantidad: Number(repartos[k][x.id]) })),
                    })) : null,
                    renglones: !varias && tipo === 'PARCIAL' ? plan.renglones.filter((x) => Number(cantidades[x.id]) > 0).map((x) => ({ ventaDetalleId: x.id, cantidad: Number(cantidades[x.id]) })) : [],
                }),
            });
            avisarNotaEmitida({
                color: 'green', titulo: 'Nota de crédito emitida', porAprobar: r.porAprobar, notas: r.notas.map((n) => ({ id: n.id, numero: n.numero })),
                mensaje: `${r.notas.map((n) => `${n.numero} (control ${n.control}) sobre ${n.factura}`).join('; ')}.${r.notasEntrega.length ? ` La deuda volvió a ${r.notasEntrega.join(', ')}.` : ''}${r.notas.some((n) => n.pagoRebajado) ? ' Se rebajó el pago ya registrado.' : ''}`,
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['vendedor'] });
            queryClient.invalidateQueries({ queryKey: ['ventas', 'despachos-pendientes'] });
            queryClient.invalidateQueries({ queryKey: ['empaque', pedido.id] });
            onClose();
            onListo?.();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se anuló', message: e.message });
        } finally { setEnviando(false); }
    };

    return (
        <Modal {...PANTALLA_COMPLETA_MOVIL} size="lg" opened={opened} onClose={onClose} centered title={<Text fw={800}>Anular factura / nota de crédito · {pedido.numeroDocumento}</Text>}>
            {isLoading ? <Group justify="center" py="md"><Loader /></Group> : error ? <Alert color="red">{error.message}</Alert> : (
                <Stack gap="sm">
                    <Text size="sm">La factura no se borra: se emite una <b>nota de crédito</b> con el siguiente número ({plan.siguienteNc || 'NC'}) y su propio número de control, que la compensa en el libro de ventas.</Text>
                    {!esDirecta && (
                        <NumberInput label="¿En cuántas notas de crédito se anula esta factura?" description="Si una nota no alcanza para todos los renglones, reparte la factura en varias: se emiten juntas, cada una con su número y su control."
                            min={1} max={MAX_NOTAS} allowDecimal={false} value={cuantas} onChange={(v) => setCuantas(Math.min(MAX_NOTAS, Math.max(1, Number(v) || 1)))} w={140} />
                    )}
                    {!varias && (
                        <SegmentedControl
                            fullWidth
                            value={tipo}
                            onChange={setTipo}
                            data={[
                                { value: 'TOTAL', label: `Total NC (${simbolo} ${nf(plan.factura.acreditable)})` },
                                { value: 'PARCIAL', label: 'Parcial NC' },
                                ...(isAdmin && !controlInicial ? [{ value: 'DIRECTA', label: 'Anular sin NC (física)' }] : []),
                            ]}
                        />
                    )}

                    {esDirecta && (
                        <Stack gap="sm">
                            <Alert color="blue" variant="light" title="Anulación directa en forma libre (sin Nota de Crédito · SENIAT)">
                                <Text size="sm">
                                    Aplica únicamente cuando la factura física <b>nunca se entregó al cliente</b> y conservas el <b>original y todas las copias</b>.
                                    Conservará su número ({plan.factura.numero}) y su control para salir como <b>ANULADA</b> (tipo 03, en cero) en el Libro de Ventas, y revertirá inventario, cuenta por cobrar e ingresos de contado.
                                </Text>
                            </Alert>
                            {!plan.anulacionDirecta?.permitida ? (
                                <Alert color="red" icon={<IconAlertTriangle size={18} />} title="No se puede anular sin Nota de Crédito">
                                    <Stack gap={4}>
                                        {(plan.anulacionDirecta?.bloqueos || []).map((b) => <Text key={b} size="sm">• {b}</Text>)}
                                    </Stack>
                                </Alert>
                            ) : (
                                <Checkbox
                                    color="red"
                                    checked={tieneOriginalYCopias}
                                    onChange={(e) => setTieneOriginalYCopias(e.currentTarget.checked)}
                                    label="Confirmo que tengo en mi poder el original y todas las copias físicas de esta factura, que nunca fue entregada al cliente y que se archivarán rayadas con «ANULADA»."
                                />
                            )}
                        </Stack>
                    )}

                    {varias && (
                        <Stack gap="sm">
                            {Array.from({ length: cuantas }, (_, k) => (
                                <Card key={k} withBorder radius="md" p="xs">
                                    <Group justify="space-between" mb={4}>
                                        <Text size="sm" fw={800}>Nota de crédito {k + 1} de {cuantas} · {controles[k]?.numero?.trim() || sumarNumero(plan.siguienteNc, k)}</Text>
                                        <Text size="sm">{plan.renglones.filter((r) => Number(repartos[k]?.[r.id]) > 0).length} renglones · <b>{simbolo} {nf(montoNota(k))}</b></Text>
                                    </Group>
                                    <Group grow align="flex-start" mb={6}>
                                        {controlInicial && <TextInput size="xs" label="N° de control (hueco que se registra)" placeholder="déjalo vacío" value={controles[k]?.control || ''}
                                            onChange={(e) => { const v = e.currentTarget.value; setControles((c) => c.map((x, i) => (i === k ? { ...x, control: v } : x))); }} />}
                                        <TextInput size="xs" label="Número de NC (si ya la emitiste en el sistema anterior)" placeholder={sumarNumero(plan.siguienteNc, k)} value={controles[k]?.numero || ''}
                                            onChange={(e) => { const v = e.currentTarget.value; setControles((c) => c.map((x, i) => (i === k ? { ...x, numero: v } : x))); }} />
                                    </Group>
                                    <Table fz="sm" verticalSpacing={2}>
                                        <Table.Thead><Table.Tr><Table.Th>Renglón</Table.Th><Table.Th ta="right">Quedan</Table.Th><Table.Th w={170}>Esta nota</Table.Th></Table.Tr></Table.Thead>
                                        <Table.Tbody>
                                            {plan.renglones.filter((r) => r.restante > 0).map((r) => {
                                                const queda = quedaAntes(k, r.id);
                                                return (
                                                    <Table.Tr key={r.id}>
                                                        <Table.Td><Text size="sm">{r.nombre}</Text><Text size="xs" c="dimmed">{simbolo} {nf(r.precioUnitario)} c/u{r.aplicaIva ? ' + IVA' : ' (exento)'}</Text></Table.Td>
                                                        <Table.Td ta="right">{queda}{queda !== r.restante ? <Text span size="xs" c="dimmed"> de {r.restante}</Text> : null}</Table.Td>
                                                        <Table.Td>
                                                            <Group gap={4} wrap="nowrap">
                                                                <NumberInput size="xs" w={80} min={0} max={queda} allowDecimal={false} disabled={!queda} value={repartos[k]?.[r.id] ?? 0}
                                                                    onChange={(v) => setRepartos((rep) => rep.map((x, i) => (i === k ? { ...x, [r.id]: Math.min(queda, Math.max(0, Number(v) || 0)) } : x)))} />
                                                                <Button size="compact-xs" variant="subtle" disabled={!queda} onClick={() => setRepartos((rep) => rep.map((x, i) => (i === k ? { ...x, [r.id]: queda } : x)))}>Lo que queda</Button>
                                                            </Group>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
                                            })}
                                        </Table.Tbody>
                                    </Table>
                                </Card>
                            ))}
                            {completaVarias
                                ? <Alert color="teal">Entre las {cuantas} notas se anula la factura completa.</Alert>
                                : <Alert color="orange">Faltan por repartir {sinRepartir} unidades: si las dejas fuera, la anulación queda parcial.</Alert>}
                        </Stack>
                    )}

                    {!varias && tipo === 'PARCIAL' && (
                        <Paper withBorder radius="md">
                            <Table fz="sm" verticalSpacing={4}>
                                <Table.Thead><Table.Tr><Table.Th>Renglón</Table.Th><Table.Th ta="right">Quedan</Table.Th><Table.Th w={150}>Anular</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {plan.renglones.map((r) => (
                                        <Table.Tr key={r.id}>
                                            <Table.Td><Text size="sm">{r.nombre}</Text><Text size="xs" c="dimmed">{simbolo} {nf(r.precioUnitario)} c/u{r.aplicaIva ? ' + IVA' : ' (exento)'}</Text></Table.Td>
                                            <Table.Td ta="right">{r.restante}</Table.Td>
                                            <Table.Td>
                                                <Group gap={4} wrap="nowrap">
                                                    <NumberInput size="xs" w={80} min={0} max={r.restante} allowDecimal={false} disabled={!r.restante} value={cantidades[r.id] ?? 0}
                                                        onChange={(v) => setCantidades((c) => ({ ...c, [r.id]: Math.min(r.restante, Math.max(0, Number(v) || 0)) }))} />
                                                    <Button size="compact-xs" variant="subtle" disabled={!r.restante} onClick={() => setCantidades((c) => ({ ...c, [r.id]: r.restante }))}>Todo</Button>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                            <Group justify="flex-end" p="xs"><Text size="sm">Nota de crédito: <b>{simbolo} {nf(montoParcial)}</b></Text></Group>
                        </Paper>
                    )}

                    {!esDirecta && (deNotas ? (
                        <Alert color="blue" title={`Esta factura salió de ${plan.notasEntrega.map((n) => n.numero).join(', ')}`}>
                            <Text size="sm">Al anularla, {plan.notasEntrega.length > 1 ? 'esas notas vuelven' : 'la nota vuelve'} a ser el documento principal y la deuda vuelve a {plan.notasEntrega.length > 1 ? 'ellas' : 'ella'} ({plan.notasEntrega.map((n) => `${n.numero}: $ ${nf(n.totalUsd)}`).join(' · ')}){plan.abonosUsd > 0 ? `, con los $ ${nf(plan.abonosUsd)} que ya se abonaron` : ''}. El inventario no se mueve.</Text>
                            {plan.facturas.length > 1 && <Text size="sm" mt={6}><b>{plan.notasEntrega.length > 1 ? 'Esas notas también están' : 'Esa nota también está'} en {plan.facturas.filter((f) => f.id !== plan.factura.id).map((f) => f.numero).join(', ')}:</b> se anulan juntas, una nota de crédito por cada factura.</Text>}
                        </Alert>
                    ) : parcialPagada ? (
                        <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Esta factura ya está pagada">
                            <Text size="sm">Por eso aquí no se pregunta si la nota afecta la cuenta por cobrar: como la factura ya está pagada, <b>no la afecta</b> y la nota <b>solo se asienta en el libro de ventas</b>. No se suma saldo a favor del cliente, no cambia lo ya ingresado y no mueve el inventario. Se te pedirá confirmar al emitirla.</Text>
                            <Checkbox mt="sm" color="orange" checked={modificarPago} onChange={(e) => setModificarPago(e.currentTarget.checked)}
                                label="Sí, modifica el pago ya registrado" description="Además de emitir la nota, se rebaja el pago (ingreso) ya registrado de esta factura por el monto de la nota: pago registrado = total de la factura − nota." />
                        </Alert>
                    ) : (
                        <Radio.Group label="¿Esta nota de crédito afecta la cuenta por cobrar?" withAsterisk value={afecta} onChange={setAfecta}>
                            <Stack gap={6} mt={6}>
                                <Radio value="si" label={tipo === 'TOTAL' ? 'Sí: baja la deuda del cliente por el monto de la nota' : 'Sí: baja la deuda y los productos anulados vuelven al inventario'} />
                                <Radio value="no" label={tipo === 'TOTAL' ? 'No: la deuda queda igual' : 'No: no toca la deuda ni el inventario'} />
                            </Stack>
                        </Radio.Group>
                    ))}
                    {!esDirecta && !varias && tipo === 'TOTAL' && !deNotas && <Text size="xs" c="dimmed">{plan.factura.yaSalio ? 'Todo lo facturado vuelve al inventario.' : 'El pedido aún no salió del almacén: no hay mercancía que devolver al inventario.'}</Text>}
                    {!esDirecta && plan?.factura && !plan.factura.despachado && plan.factura.tipoEntrega !== 'sitio' && (() => {
                        const esTotalVista = varias ? completaVarias : tipo === 'TOTAL';
                        const afectaReal = deNotas ? false : parcialPagada ? false : afecta === 'si';
                        const empacado = Boolean(plan.factura.empacado);
                        if (deNotas) {
                            return <Alert color="blue" variant="light">Logística: la factura saldrá de empaque y el despacho volverá a su(s) nota(s) de entrega.</Alert>;
                        }
                        if (!empacado) {
                            if (esTotalVista) return <Alert color="teal" variant="light">Empaque: este pedido aún no se empaca — saldrá automáticamente de <b>Pendientes por empacar</b>.</Alert>;
                            if (afecta === 'si') return <Alert color="orange" variant="light">Empaque: al afectar la CxC, se ajustarán automáticamente las unidades que hay que empacar.</Alert>;
                            if (afecta === 'no' || parcialPagada) return <Alert color="gray" variant="light">Empaque: como no afecta la CxC, el pedido sigue pendiente por empacar con las mismas cantidades.</Alert>;
                            return null;
                        }
                        if (esTotalVista) {
                            return <Alert color="red" variant="light">Despacho: este pedido ya está empacado. Quedará <b>retenido en Despachos</b> para desarmar la caja antes de entregar.</Alert>;
                        }
                        if (afecta === 'si') {
                            return <Alert color="orange" variant="light">Despacho: este pedido ya está empacado. Quedará <b>retenido en Despachos</b> para ajustar la caja o re-empacar.</Alert>;
                        }
                        if (afecta === 'no' || parcialPagada) {
                            return <Alert color="gray" variant="light">Despacho: no afecta la CxC, la caja ya empacada podrá despacharse sin cambios.</Alert>;
                        }
                        return null;
                    })()}
                    {!esDirecta && deNotas && plan.bloqueosNotas.map((b) => <Alert key={b} color="red" icon={<IconAlertTriangle size={18} />}>{b}</Alert>)}

                    {!esDirecta && (
                    <Stack gap={6}>
                        {!varias && (
                            <Card withBorder radius="md" p="xs">
                                <Text size="sm" fw={700} mb={4}>Nota de crédito sobre {plan.factura.numero}</Text>
                                <Group grow align="flex-start">
                                    {controlInicial && <TextInput size="xs" label="N° de control (hueco que se registra)" placeholder="déjalo vacío" value={controles[0]?.control || ''}
                                        onChange={(e) => { const v = e.currentTarget.value; setControles((c) => c.map((x, i) => (i === 0 ? { ...x, control: v } : x))); }} />}
                                    <TextInput size="xs" label="Número de NC (si ya la emitiste en el sistema anterior)" placeholder={plan.siguienteNc || ''} value={controles[0]?.numero || ''}
                                        onChange={(e) => { const v = e.currentTarget.value; setControles((c) => c.map((x, i) => (i === 0 ? { ...x, numero: v } : x))); }} />
                                </Group>
                            </Card>
                        )}
                        {facturasNc.map((f) => (
                            <Card key={f.id} withBorder radius="md" p="xs">
                                <Text size="sm" fw={700} mb={4}>Nota de crédito sobre {f.numero}{deNotas ? ` (${f.moneda === 'BS' ? 'Bs' : '$'} ${nf(f.acreditable)})` : ''}</Text>
                                <Group grow align="flex-start">
                                    {controlInicial && <TextInput size="xs" label="N° de control (hueco que se registra)" placeholder="déjalo vacío" value={documentos[f.id]?.control || ''}
                                        onChange={(e) => { const v = e.currentTarget.value; setDocumentos((d) => ({ ...d, [f.id]: { ...d[f.id], control: v } })); }} />}
                                    <TextInput size="xs" label="Número de NC (si ya la emitiste en el sistema anterior)" placeholder={plan.siguienteNc || ''} value={documentos[f.id]?.numero || ''}
                                        onChange={(e) => { const v = e.currentTarget.value; setDocumentos((d) => ({ ...d, [f.id]: { ...d[f.id], numero: v } })); }} />
                                </Group>
                            </Card>
                        ))}
                    </Stack>
                    )}

                    <Select label="Motivo" data={MOTIVOS} value={motivo} allowDeselect={false} onChange={(v) => setMotivo(v || MOTIVOS[0])} />
                    <Textarea label={motivo === 'Otro' ? 'Explica el motivo' : 'Detalle (opcional)'} autosize minRows={2} value={detalle} onChange={(e) => setDetalle(e.currentTarget.value)} />
                    {!esDirecta && <TextInput type="date" label="Fecha de la nota" description="Vacía = hoy" max={new Date().toISOString().slice(0, 10)} value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />}
                    <Button color="red" loading={enviando} disabled={bloqueado} onClick={anular}>
                        {esDirecta ? 'Anular factura física (sin NC)' : facturasNc.length > 0 ? `Anular las ${facturasNc.length + 1} facturas` : varias ? `Emitir las ${cuantas} notas de crédito` : tipo === 'TOTAL' ? 'Anular la factura' : 'Emitir la nota de crédito'}
                    </Button>
                    <Text size="xs" c="dimmed">{esDirecta ? 'La factura queda como ANULADA en el Libro de Ventas conservando su número y su control.' : 'Esta acción no se puede deshacer desde aquí: para revertirla hay que anular la nota de crédito.'}</Text>
                </Stack>
            )}
        </Modal>
    );
}
