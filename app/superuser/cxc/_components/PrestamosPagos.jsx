'use client';

// Préstamos a los vendedores a comisión y el pago de su comisión acumulada (completo o una parte, con abono al préstamo y formato de pago).
import React, { useEffect, useState } from 'react';
import { ActionIcon, Alert, Box, Button, Group, NumberInput, SegmentedControl, Stack, Table, Text, Textarea } from '@mantine/core';
import { IconCash, IconCircleCheck, IconInfoCircle, IconPrinter, IconTrash } from '@tabler/icons-react';
import { Dialogo } from './Piezas';
import { bolivares, dolares, fmtFecha, hoy } from './utilidades';
import classes from './cxc.module.css';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const acotar = (v, min, max) => Math.min(Math.max(Number(v) || 0, min), max);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEG = { root: classes.segRaiz, label: classes.segEtiqueta };

// ---------- Préstamos: saldo, historial (se puede borrar un préstamo), alta de uno nuevo y abono con la comisión acumulada ----------
export function DialogoPrestamo({ abierto, vendedor, tasa, acumulado = 0, onCerrar, onPrestar, onBorrar, onAbonar }) {
    const [monto, setMonto] = useState('');
    const [nota, setNota] = useState('');
    const [fecha, setFecha] = useState(hoy());
    const [guardando, setGuardando] = useState(false);
    const [rebaja, setRebaja] = useState('');
    const [rebajando, setRebajando] = useState(false);
    const [ultimoPago, setUltimoPago] = useState(null); // pago hecho desde aquí, para imprimir su formato
    useEffect(() => { if (abierto) { setMonto(''); setNota(''); setFecha(hoy()); setRebaja(''); setUltimoPago(null); } }, [abierto]);
    const p = vendedor?.prestamo || { saldo: 0, movimientos: [] };
    const tiene = p.saldo > 0.004 || p.movimientos.length > 0;
    const topeRebaja = r2(Math.min(p.saldo, acumulado));
    const guardar = async () => {
        setGuardando(true);
        try { await onPrestar({ montoUsd: Number(monto), nota, fecha }); setMonto(''); setNota(''); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    const abonar = async () => {
        setRebajando(true);
        try { const r = await onAbonar(Number(rebaja)); setUltimoPago({ id: r.pagoId, monto: Number(rebaja) }); setRebaja(''); } catch { /* ya se avisó */ } finally { setRebajando(false); }
    };
    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={`Préstamos de ${vendedor?.nombre || ''}`} ancho="md">
            <Stack gap="sm">
                {p.saldo > 0.004
                    ? <Box p="xs" style={{ background: '#fff1f1', borderRadius: 8, border: '1px solid #f1b0b0' }}><Text fz={11} fw={700} tt="uppercase" c="#5c6675">Debe de préstamo</Text><Text fw={800} fz={22} c="red.8">{dolares(p.saldo)}</Text>{tasa && <Text fz={12} c="#5c6675">{bolivares(p.saldo * tasa)} a la tasa BCV de hoy</Text>}</Box>
                    : <Alert color="gray" variant="light" p="xs" icon={<IconInfoCircle size={18} />}>{tiene ? 'El vendedor no debe nada: sus préstamos están saldados.' : 'El vendedor no tiene préstamos.'}</Alert>}

                {p.saldo > 0.004 && (
                    <Box p="xs" style={{ background: '#f4f7fc', borderRadius: 8 }}>
                        <Text fz={13} fw={700}>Bajar el préstamo con su comisión acumulada</Text>
                        {topeRebaja > 0.004 ? (
                            <>
                                <Text fz={12} c="#5c6675" mb={6}>Tiene {dolares(acumulado)} por pagar: se descuenta de ahí, sin darle efectivo.</Text>
                                <Group gap="xs" align="flex-end" wrap="wrap">
                                    <NumberInput label="Monto a descontar (USD)" decimalScale={2} min={0} max={topeRebaja} hideControls value={rebaja} onChange={setRebaja} inputMode="decimal" w={170} description={`Máximo ${dolares(topeRebaja)}`} />
                                    <Button variant="light" onClick={() => setRebaja(topeRebaja)}>Máximo</Button>
                                    <Button disabled={!(Number(rebaja) > 0)} loading={rebajando} onClick={abonar}>Descontar del préstamo</Button>
                                </Group>
                            </>
                        ) : <Text fz={12} c="#5c6675">No tiene comisión acumulada por pagar para descontar.</Text>}
                        {ultimoPago && (
                            <Alert mt="xs" color="teal" variant="light" p="xs" icon={<IconCircleCheck size={16} />}>
                                Se descontaron {dolares(ultimoPago.monto)} del préstamo.{' '}
                                <Text span td="underline" fw={700} style={{ cursor: 'pointer' }} onClick={() => imprimirFormatoPago(ultimoPago.id).catch((e) => alert(e.message))}>Imprimir formato de pago</Text>
                            </Alert>
                        )}
                    </Box>
                )}

                <Text fz={13} fw={700}>{tiene ? 'Prestarle más (se suma a lo que debe)' : 'Añadir el primer préstamo'}</Text>
                <Group gap="sm" align="flex-start" wrap="wrap">
                    <NumberInput label="Monto USD" decimalScale={2} min={0} value={monto} onChange={setMonto} inputMode="decimal" w={150}
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
                                <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Movimiento</Table.Th><Table.Th ta="right">Monto</Table.Th><Table.Th w={36} /></Table.Tr></Table.Thead>
                                <Table.Tbody>
                                    {p.movimientos.map((m) => (
                                        <Table.Tr key={m.id}>
                                            <Table.Td>{fmtFecha(m.fecha)}</Table.Td>
                                            <Table.Td>{m.tipo === 'PRESTAMO' ? 'Préstamo' : 'Abono'}{m.nota ? ` · ${m.nota}` : ''}</Table.Td>
                                            <Table.Td ta="right" fw={700} c={m.tipo === 'PRESTAMO' ? 'red.8' : 'teal.8'}>{m.tipo === 'PRESTAMO' ? '+' : '−'}{dolares(m.montoUsd)}</Table.Td>
                                            <Table.Td>
                                                {m.tipo === 'PRESTAMO' && (
                                                    <ActionIcon variant="subtle" color="red" size="sm" aria-label="Borrar este préstamo" title="Borrar este préstamo (por error)"
                                                        onClick={() => { if (window.confirm(`¿Borrar el préstamo de ${dolares(m.montoUsd)} del ${fmtFecha(m.fecha)}? Es para un préstamo registrado por error.`)) onBorrar(m).catch(() => {}); }}>
                                                        <IconTrash size={15} />
                                                    </ActionIcon>
                                                )}
                                            </Table.Td>
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
    const pagado = Number(pago.pagadoUsd) > 0;
    const tieneAcum = pago.acumuladoAntesUsd !== null && pago.acumuladoAntesUsd !== undefined;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pago de comisión #${pago.id}</title>
<style>body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:28px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:10px 0}
th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#eee}.r{text-align:right}.tot td{font-weight:700}.firmas{display:flex;gap:40px;margin-top:60px}.firmas div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center}
.pago{background:#f3f3f3}</style></head><body>
<h1>Formato de pago de comisión N° ${pago.id}</h1>
<div>Fecha: <b>${esc(String(pago.fecha).slice(0, 10).split('-').reverse().join('/'))}</b> · Vendedor: <b>${esc(pago.vendedorNombre)}</b>${tasa ? ` · Tasa BCV: <b>${tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</b>` : ''}</div>
<h3>Comisión</h3>
<table><tbody>
${tieneAcum ? `<tr><td>Comisión acumulada por pagar antes de este pago</td><td class="r">${usd(pago.acumuladoAntesUsd)}</td></tr>` : ''}
<tr class="tot"><td>Comisión que se liquida en este pago</td><td class="r">${usd(pago.totalComisionUsd)}</td></tr>
${tieneAcum ? `<tr><td>Queda por pagar</td><td class="r">${usd(pago.acumuladoDespuesUsd)}</td></tr>` : ''}
</tbody></table>
${filas ? `<h3>Comisiones que quedaron pagadas completas</h3><table><thead><tr><th>Documento</th><th>Cliente</th><th>Tipo</th><th class="r">Comisión</th></tr></thead><tbody>${filas}</tbody></table>` : ''}
<h3>Destino del pago</h3>
<table><thead><tr><th>Concepto</th><th class="r">USD</th><th class="r">Bolívares</th></tr></thead><tbody>
${abono ? `<tr><td>Abono al préstamo del vendedor</td><td class="r">${usd(pago.abonoPrestamoUsd)}</td><td class="r">${bs(pago.abonoPrestamoUsd)}</td></tr>` : ''}
<tr class="tot pago"><td>Pagado al vendedor</td><td class="r">${usd(pago.pagadoUsd)}</td><td class="r">${bs(pago.pagadoUsd)}</td></tr></tbody></table>
${abono || Number(pago.prestamoAntesUsd) > 0 ? `<div>Préstamo: debía <b>${usd(pago.prestamoAntesUsd)}</b> · abonó <b>${usd(pago.abonoPrestamoUsd)}</b> · queda debiendo <b>${usd(pago.prestamoDespuesUsd)}</b></div>` : ''}
${pago.observacion ? `<p>Observación: ${esc(pago.observacion)}</p>` : ''}
${pagado ? `<div class="firmas"><div>Entregado por</div><div>Recibí conforme: ${esc(pago.vendedorNombre)}</div></div>` : ''}
<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) throw new Error('El navegador bloqueó la ventana de impresión: permite ventanas emergentes');
    w.document.write(html);
    w.document.close();
}

// ---------- Pagar la comisión acumulada: todo o una parte; cuánto va en efectivo y cuánto baja el préstamo ----------
export function DialogoPagarComision({ abierto, vendedor, total, tasa, onCerrar, onPagar }) {
    const saldo = vendedor?.prestamo?.saldo || 0;
    const tienePrestamo = saldo > 0.004;
    const [modo, setModo] = useState('todo');       // todo | parte
    const [parte, setParte] = useState('');
    const [abona, setAbona] = useState('no');
    const [abono, setAbono] = useState(0);
    const [obs, setObs] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [hecho, setHecho] = useState(null);       // { pagoId, monto, abono, efectivo, queda }
    useEffect(() => { if (abierto) { setModo('todo'); setParte(''); setAbona('no'); setAbono(0); setObs(''); setHecho(null); } }, [abierto]);

    const monto = modo === 'todo' ? r2(total) : r2(acotar(parte, 0, total));
    const tope = r2(Math.min(saldo, monto));
    const abonoNum = abona === 'si' ? r2(acotar(abono, 0, tope)) : 0;
    const efectivo = r2(monto - abonoNum);
    const queda = r2(total - monto);

    const pagar = async () => {
        setGuardando(true);
        try {
            const r = await onPagar({ montoUsd: monto, abonoPrestamoUsd: abonoNum, observacion: obs });
            setHecho({ pagoId: r.pagoId, monto, abono: abonoNum, efectivo, queda });
        } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    const fila = (titulo, v, color) => (
        <Group justify="space-between" wrap="nowrap"><Text fz={13} fw={600}>{titulo}</Text><Text fz={14} fw={800} c={color} ta="right">{dolares(v)}{tasa ? <Text span fz={11.5} c="#5c6675" fw={600}> · {bolivares(v * tasa)}</Text> : null}</Text></Group>
    );
    if (hecho) {
        return (
            <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Pago registrado" ancho="sm">
                <Stack gap="sm">
                    <Alert color="teal" variant="light" icon={<IconCircleCheck size={18} />}>Pago a {vendedor?.nombre} registrado.</Alert>
                    <Stack gap={4} p="xs" style={{ background: '#f4f7fc', borderRadius: 8 }}>
                        {hecho.abono > 0 && fila('Abonado al préstamo', hecho.abono, 'indigo.8')}
                        {hecho.efectivo > 0 && fila('Pagado al vendedor', hecho.efectivo, 'teal.8')}
                        {hecho.queda > 0.004 && <Text fz={12} c="#5c6675">Le quedan {dolares(hecho.queda)} por pagar de su comisión.</Text>}
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
                <Stack gap={4} p="xs" style={{ background: '#fffbe0', borderRadius: 8, border: '1px solid #ecd77a' }}>{fila('Comisión acumulada por pagar', total, '#8a4b00')}</Stack>
                <SegmentedControl fullWidth color="navy.9" classNames={SEG} value={modo} onChange={(v) => { setModo(v); setAbono(0); }} data={[{ value: 'todo', label: 'Pagar todo' }, { value: 'parte', label: 'Pagar una parte' }]} />
                {modo === 'parte' && (
                    <NumberInput label="¿Cuánto de la comisión se paga ahora? (USD)" decimalScale={2} min={0} max={total} hideControls value={parte} onChange={setParte} inputMode="decimal" data-autofocus
                        description={`Máximo ${dolares(total)}${tasa && Number(parte) > 0 ? ` · ≈ ${bolivares(Number(parte) * tasa)}` : ''}`} />
                )}
                {tienePrestamo && monto > 0 && (
                    <>
                        <Alert color="orange" variant="light" p="xs" icon={<IconInfoCircle size={18} />}>{vendedor.nombre} debe <b>{dolares(saldo)}</b> de préstamo. ¿Parte de este pago se usa para bajarlo?</Alert>
                        <SegmentedControl fullWidth color="navy.9" classNames={SEG} value={abona} onChange={(v) => { setAbona(v); setAbono(v === 'si' ? tope : 0); }} data={[{ value: 'no', label: 'No, todo en efectivo' }, { value: 'si', label: 'Sí, bajar el préstamo' }]} />
                        {abona === 'si' && (
                            <Group grow align="flex-start">
                                <NumberInput label="Para bajar el préstamo" decimalScale={2} min={0} max={tope} hideControls value={abonoNum} onChange={(v) => setAbono(acotar(v, 0, tope))} inputMode="decimal" description={`Máximo ${dolares(tope)}`} data-autofocus />
                                <NumberInput label="En efectivo al vendedor" decimalScale={2} min={0} max={monto} hideControls value={efectivo} onChange={(v) => setAbono(acotar(r2(monto - acotar(v, 0, monto)), 0, tope))} inputMode="decimal" description="Se ajusta solo con el de al lado" />
                            </Group>
                        )}
                    </>
                )}
                <Stack gap={4} p="xs" style={{ background: '#f4f7fc', borderRadius: 8 }}>
                    {fila('Comisión que se paga ahora', monto, '#1a1b1e')}
                    {abonoNum > 0 && fila('→ Baja su préstamo', abonoNum, 'indigo.8')}
                    {abonoNum > 0 && <Text fz={11.5} c="#5c6675">Quedará debiendo {dolares(r2(saldo - abonoNum))} de préstamo</Text>}
                    {fila('→ Se le paga al vendedor', efectivo, 'teal.8')}
                    {queda > 0.004 && <Text fz={11.5} c="#5c6675">Le quedarán {dolares(queda)} por pagar de su comisión</Text>}
                </Stack>
                <Textarea label="Observación (opcional)" autosize minRows={1} maxRows={3} value={obs} onChange={(e) => setObs(e.currentTarget.value)} />
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button size="sm" color="teal" leftSection={<IconCash size={16} />} loading={guardando} disabled={!(monto > 0)} onClick={pagar}>Confirmar pago</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}
