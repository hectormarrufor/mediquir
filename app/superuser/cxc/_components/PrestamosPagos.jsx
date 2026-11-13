'use client';

// Préstamos a los vendedores a comisión y el pago de su comisión acumulada (con abono al préstamo y formato de pago).
import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Group, NumberInput, SegmentedControl, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconCash, IconCircleCheck, IconInfoCircle, IconPrinter } from '@tabler/icons-react';
import { Dialogo } from './Piezas';
import { bolivares, dolares, fmtFecha, hoy } from './utilidades';
import classes from './cxc.module.css';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEG = { root: classes.segRaiz, label: classes.segEtiqueta };

// ---------- Préstamos: saldo, historial y alta de uno nuevo (el primero o uno más) ----------
export function DialogoPrestamo({ abierto, vendedor, tasa, onCerrar, onPrestar }) {
    const [monto, setMonto] = useState('');
    const [nota, setNota] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { if (abierto) { setMonto(''); setNota(''); setFecha(hoy()); } }, [abierto]);
    const p = vendedor?.prestamo || { saldo: 0, movimientos: [] };
    const tiene = p.saldo > 0.004 || p.movimientos.length > 0;
    const guardar = async () => {
        setGuardando(true);
        try { await onPrestar({ montoUsd: Number(monto), nota, fecha }); setMonto(''); setNota(''); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={`Préstamos de ${vendedor?.nombre || ''}`} ancho="md">
            <Stack gap="sm">
                {p.saldo > 0.004
                    ? <Box p="xs" style={{ background: '#fff1f1', borderRadius: 8, border: '1px solid #f1b0b0' }}><Text fz={11} fw={700} tt="uppercase" c="#5c6675">Debe de préstamo</Text><Text fw={800} fz={22} c="red.8">{dolares(p.saldo)}</Text>{tasa && <Text fz={12} c="#5c6675">{bolivares(p.saldo * tasa)} a la tasa BCV de hoy</Text>}</Box>
                    : <Alert color="gray" variant="light" p="xs" icon={<IconInfoCircle size={18} />}>{tiene ? 'El vendedor no debe nada: sus préstamos están saldados.' : 'El vendedor no tiene préstamos.'}</Alert>}
                <Text fz={13} fw={700}>{tiene ? 'Prestarle más (se suma a lo que debe)' : 'Añadir el primer préstamo'}</Text>
                <Group gap="sm" align="flex-start" wrap="wrap">
                    <NumberInput label="Monto USD" decimalScale={2} min={0} value={monto} onChange={setMonto} inputMode="decimal" w={150} data-autofocus
                        description={tasa && Number(monto) > 0 ? `≈ ${bolivares(Number(monto) * tasa)}` : undefined} />
                    <Box><Text fz="sm" fw={500} mb={4}>Fecha</Text><input type="date" value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} style={{ height: 36, padding: '0 8px', borderRadius: 4, border: '1px solid #ced4da' }} /></Box>
                </Group>
                <Textarea label="Nota (opcional)" autosize minRows={1} maxRows={3} value={nota} onChange={(e) => setNota(e.currentTarget.value)} />
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cerrar</Button>
                    <Button size="sm" disabled={!(Number(monto) > 0)} loading={guardando} onClick={guardar}>{tiene ? 'Añadir préstamo' : 'Registrar préstamo'}</Button>
                </Group>
                {p.movimientos.length > 0 && (
                    <>
                        <Text fz={13} fw={700}>Historial</Text>
                        <Box style={{ overflowX: 'auto' }}>
                            <Table fz={12.5} withRowBorders verticalSpacing={4}>
                                <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Movimiento</Table.Th><Table.Th ta="right">Monto</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {p.movimientos.map((m) => (
                                        <Table.Tr key={m.id}>
                                            <Table.Td>{fmtFecha(m.fecha)}</Table.Td>
                                            <Table.Td>{m.tipo === 'PRESTAMO' ? 'Préstamo' : 'Abono'}{m.nota ? ` · ${m.nota}` : ''}</Table.Td>
                                            <Table.Td ta="right" fw={700} c={m.tipo === 'PRESTAMO' ? 'red.8' : 'teal.8'}>{m.tipo === 'PRESTAMO' ? '+' : '−'}{dolares(m.montoUsd)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Box>
                    </>
                )}
            </Stack>
        </Dialogo>
    );
}

// ---------- Formato de pago (se imprime): adónde fue cada parte del pago ----------
export async function imprimirFormatoPago(pagoId) {
    const res = await fetch(`/api/comisiones/pagos?id=${pagoId}`);
    const { pago, error } = await res.json();
    if (!res.ok) throw new Error(error || 'No se pudo cargar el pago');
    const tasa = Number(pago.tasaBcv) > 0 ? Number(pago.tasaBcv) : null;
    const usd = (v) => `$ ${Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const bs = (v) => (tasa ? `Bs ${(Math.round(Number(v) * tasa * 100) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
    const filas = (pago.lineas || []).map((l) => `<tr><td>${esc(l.documento || '')}</td><td>${esc(l.cliente || '')}</td><td>${l.concepto === 'ABONO' ? 'Abono' : l.concepto === 'NOTA' ? 'Nota' : 'Factura'}</td><td class="r">${usd(l.comisionUsd)}</td></tr>`).join('');
    const abono = Number(pago.abonoPrestamoUsd) > 0;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pago de comisión #${pago.id}</title>
<style>body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:28px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#eee}.r{text-align:right}.tot td{font-weight:700}.firmas{display:flex;gap:40px;margin-top:60px}.firmas div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}
.pago{background:#f3f3f3}</style></head><body>
<h1>Formato de pago de comisión N° ${pago.id}</h1>
<div>Fecha: <b>${esc(String(pago.fecha).split('-').reverse().join('/'))}</b> · Vendedor: <b>${esc(pago.vendedorNombre)}</b>${tasa ? ` · Tasa BCV: <b>${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</b>` : ''}</div>
<h3>Comisiones que se liquidan</h3>
<table><thead><tr><th>Documento</th><th>Cliente</th><th>Tipo</th><th class="r">Comisión</th></tr></thead><tbody>${filas}
<tr class="tot"><td colspan="3">Total de comisión acumulada</td><td class="r">${usd(pago.totalComisionUsd)}</td></tr></tbody></table>
<h3>Destino del pago</h3>
<table><thead><tr><th>Concepto</th><th class="r">USD</th><th class="r">Bolívares</th></tr></thead><tbody>
${abono ? `<tr><td>Abono al préstamo del vendedor</td><td class="r">${usd(pago.abonoPrestamoUsd)}</td><td class="r">${bs(pago.abonoPrestamoUsd)}</td></tr>` : ''}
<tr class="tot pago"><td>Pagado al vendedor</td><td class="r">${usd(pago.pagadoUsd)}</td><td class="r">${bs(pago.pagadoUsd)}</td></tr></tbody></table>
${abono || Number(pago.prestamoAntesUsd) > 0 ? `<div>Préstamo: debía <b>${usd(pago.prestamoAntesUsd)}</b> · abonó <b>${usd(pago.abonoPrestamoUsd)}</b> · queda debiendo <b>${usd(pago.prestamoDespuesUsd)}</b></div>` : ''}
${pago.observacion ? `<p>Observación: ${esc(pago.observacion)}</p>` : ''}
<div class="firmas"><div>Entregado por</div><div>Recibí conforme: ${esc(pago.vendedorNombre)}</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) throw new Error('El navegador bloqueó la ventana de impresión: permite ventanas emergentes');
    w.document.write(html);
    w.document.close();
}

// ---------- Pagar la comisión acumulada: ¿se abona al préstamo? cuánto abona y cuánto se le paga ----------
export function DialogoPagarComision({ abierto, vendedor, cantidad, total, tasa, onCerrar, onPagar }) {
    const saldo = vendedor?.prestamo?.saldo || 0;
    const tienePrestamo = saldo > 0.004;
    const tope = r2(Math.min(saldo, total));
    const [abona, setAbona] = useState('no');
    const [abono, setAbono] = useState(0);
    const [obs, setObs] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [hecho, setHecho] = useState(null); // { pagoId, abono, pagado }
    useEffect(() => { if (abierto) { setAbona('no'); setAbono(tope); setObs(''); setHecho(null); } }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
    const abonoNum = abona === 'si' ? r2(Math.min(Math.max(Number(abono) || 0, 0), tope)) : 0;
    const pagado = r2(total - abonoNum);
    const pagar = async () => {
        setGuardando(true);
        try { const r = await onPagar({ abonoPrestamoUsd: abonoNum, observacion: obs }); setHecho({ pagoId: r.pagoId, abono: abonoNum, pagado }); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    const fila = (titulo, v, color) => (
        <Group justify="space-between" wrap="nowrap"><Text fz={13} fw={600}>{titulo}</Text><Text fz={14} fw={800} c={color} ta="right">{dolares(v)}{tasa ? <Text span fz={11.5} c="#5c6675" fw={600}> · {bolivares(v * tasa)}</Text> : null}</Text></Group>
    );
    if (hecho) {
        return (
            <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Pago registrado" ancho="sm">
                <Stack gap="sm">
                    <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />}>Pago de {vendedor?.nombre} registrado y {cantidad} comisión(es) marcada(s) como pagadas.</Alert>
                    <Stack gap={4} p="xs" style={{ background: '#f4f7fc', borderRadius: 8 }}>
                        {hecho.abono > 0 && fila('Abonado al préstamo', hecho.abono, 'indigo.8')}
                        {fila('Pagado al vendedor', hecho.pagado, 'teal.8')}
                    </Stack>
                    <Group justify="flex-end" gap="xs">
                        <Button variant="default" size="sm" onClick={onCerrar}>Cerrar</Button>
                        <Button size="sm" leftSection={<IconPrinter size={16} />} onClick={() => imprimirFormatoPago(hecho.pagoId).catch((e) => alert(e.message))}>Imprimir formato de pago</Button>
                    </Group>
                </Stack>
            </Dialogo>
        );
    }
    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={`Pagar comisión a ${vendedor?.nombre || ''}`} ancho="sm">
            <Stack gap="sm">
                <Text fz={13}>Se pagan <b>{cantidad}</b> comisión(es) acumuladas (amarillas) y quedan en gris con la fecha de hoy.</Text>
                <Stack gap={4} p="xs" style={{ background: '#fffbe0', borderRadius: 8, border: '1px solid #ecd77a' }}>{fila('Comisión acumulada', total, '#8a4b00')}</Stack>
                {tienePrestamo ? (
                    <>
                        <Alert color="orange" variant="light" p="xs" icon={<IconInfoCircle size={18} />}>{vendedor.nombre} debe <b>{dolares(saldo)}</b> de préstamo. ¿Se abona al préstamo en este pago?</Alert>
                        <SegmentedControl fullWidth color="navy.9" classNames={SEG} value={abona} onChange={(v) => { setAbona(v); if (v === 'si') setAbono(tope); }} data={[{ value: 'no', label: 'No, pagar todo' }, { value: 'si', label: 'Sí, abonar al préstamo' }]} />
                        {abona === 'si' && (
                            <NumberInput label="¿Cuánto abona al préstamo? (USD)" decimalScale={2} min={0} max={tope} value={abono} onChange={setAbono} inputMode="decimal"
                                description={`Máximo ${dolares(tope)}${tasa && Number(abono) > 0 ? ` · ≈ ${bolivares(Number(abono) * tasa)}` : ''}`} data-autofocus />
                        )}
                    </>
                ) : null}
                <Stack gap={4} p="xs" style={{ background: '#f4f7fc', borderRadius: 8 }}>
                    {abonoNum > 0 && fila('Abono al préstamo', abonoNum, 'indigo.8')}
                    {abonoNum > 0 && <Text fz={11.5} c="#5c6675">Quedará debiendo {dolares(r2(saldo - abonoNum))} de préstamo</Text>}
                    {fila('Se le paga al vendedor', pagado, 'teal.8')}
                </Stack>
                <Textarea label="Observación (opcional)" autosize minRows={1} maxRows={3} value={obs} onChange={(e) => setObs(e.currentTarget.value)} />
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button size="sm" color="teal" leftSection={<IconCash size={16} />} loading={guardando} disabled={!(total > 0)} onClick={pagar}>Confirmar pago</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}
