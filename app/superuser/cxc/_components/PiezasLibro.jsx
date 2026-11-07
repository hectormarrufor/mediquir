'use client';

// Piezas del libro de cobranza que usan igual la tabla (escritorio) y las tarjetas (teléfono):
// el menú «⋯» de cada documento, su estado en palabras y los diálogos para editar.
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Alert, Button, Group, Menu, NumberInput, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconArrowBackUp, IconCalendarDue, IconCheck, IconCoin, IconDotsVertical, IconExternalLink, IconListCheck, IconPencil, IconReceipt, IconTrash } from '@tabler/icons-react';
import { fechaCaracas } from '@/app/constants/hora';
import { Dialogo } from './Piezas';
import { dolares, vencimientoEnPalabras } from './utilidades';
import classes from './cxc.module.css';

// Estado del documento con ícono + texto (no solo color): Vencida hace N días / Cobrada
export function EstadoDocumento({ f, corto = false }) {
    if (f.pagada) return <span className={classes.estado} data-estado="pagada"><IconCheck size={12} />Cobrada</span>;
    if (!f.vencida) return null;
    const v = vencimientoEnPalabras(f.vence, f.saldo, f.dias);
    return <span className={classes.estado} data-estado="vencida" title={v.texto}><IconAlertTriangle size={12} />{corto ? `Vencida ${v.corto}` : v.texto}</span>;
}

// «⋯» de un documento: lo secundario (lo principal, registrar el abono, va como botón a la vista)
export function MenuDocumento({ f, acc, abonosVisibles, onVerAbonos, tamano = 'md' }) {
    return (
        <Menu position="bottom-end" withinPortal shadow="md" width={250}>
            <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size={tamano === 'lg' ? 36 : 26} aria-label={`Más acciones de ${f.documento}`}><IconDotsVertical size={tamano === 'lg' ? 20 : 16} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>{f.documento} · {f.cliente}</Menu.Label>
                {!f.pagada && <Menu.Item leftSection={<IconCoin size={16} />} onClick={() => acc.abonar(f)}>Registrar abono</Menu.Item>}
                <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={() => acc.ajustar(f)}>Ajustar la deuda (sube)</Menu.Item>
                <Menu.Item leftSection={<IconReceipt size={16} />} onClick={() => acc.corregirMonto(f)}>Corregir el monto del documento</Menu.Item>
                <Menu.Item leftSection={<IconCalendarDue size={16} />} onClick={() => acc.editar(f)}>Cambiar vencimiento u observación</Menu.Item>
                {onVerAbonos && <Menu.Item leftSection={<IconListCheck size={16} />} onClick={onVerAbonos}>{abonosVisibles ? 'Esconder los abonos' : `Ver los abonos (${f.abonos.length})`}</Menu.Item>}
                {!f.manual && f.ventaId && <Menu.Item leftSection={<IconExternalLink size={16} />} component={Link} href={`/superuser/ventas/${f.ventaId}`}>Abrir la venta</Menu.Item>}
                {f.manual && (
                    <>
                        <Menu.Divider />
                        <Menu.Item color="red" leftSection={<IconTrash size={16} />} disabled={f.abonos.length > 0} onClick={() => acc.borrarManual(f)}>
                            {f.abonos.length > 0 ? 'No se puede borrar: tiene abonos' : 'Borrar esta cuenta manual'}
                        </Menu.Item>
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
}

// Nueva cuenta manual: deudas y préstamos que no vienen de una venta
export function DialogoCuentaManual({ abierto, onCerrar, onCrear }) {
    const vacio = () => ({ cliente: '', concepto: 'DEUDA', monto: '', fecha: fechaCaracas(), vence: '', observacion: '' });
    const [d, setD] = useState(vacio);
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { if (abierto) setD(vacio()); }, [abierto]);
    const valido = d.cliente.trim().length >= 2 && Number(d.monto) > 0;
    const crear = async () => {
        setGuardando(true);
        try { await onCrear(d); onCerrar(); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Nueva cuenta por cobrar manual">
            <Stack gap="sm">
                <Text size="sm" c="#5c6675">Para deudas y préstamos que no vienen de una venta. No toca los libros ni las ventas; se cobra con abonos como cualquier cuenta. Si el nombre coincide con un cliente, se agrupa con sus demás cuentas.</Text>
                <TextInput label="A quién se le cobra" placeholder="Nombre del cliente o persona" value={d.cliente} onChange={(e) => setD({ ...d, cliente: e.currentTarget.value })} data-autofocus />
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    <TextInput label="Concepto" placeholder="DEUDA, PRÉSTAMO…" value={d.concepto} onChange={(e) => setD({ ...d, concepto: e.currentTarget.value })} />
                    <NumberInput label="Monto USD" min={0} decimalScale={2} value={d.monto} onChange={(v) => setD({ ...d, monto: v })} inputMode="decimal" />
                    <TextInput type="date" label="Fecha" max={fechaCaracas()} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.currentTarget.value })} />
                    <TextInput type="date" label="Vence (opcional)" description="Si lo dejas vacío, vence el mismo día" value={d.vence} onChange={(e) => setD({ ...d, vence: e.currentTarget.value })} />
                </SimpleGrid>
                <TextInput label="Observación (opcional)" value={d.observacion} onChange={(e) => setD({ ...d, observacion: e.currentTarget.value })} />
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button size="sm" color="grape" disabled={!valido} loading={guardando} onClick={crear}>Crear cuenta</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}

// Corregir el monto del documento (no es un pago: es un error del documento). Pide el motivo, que queda en la observación.
export function DialogoCorregirMonto({ cuenta, nuevo, onCerrar, onGuardar }) {
    const [monto, setMonto] = useState(nuevo ?? cuenta?.monto ?? '');
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { setMonto(nuevo ?? cuenta?.monto ?? ''); setMotivo(''); }, [cuenta?.id, nuevo]);
    if (!cuenta) return null;
    const cambia = Number(monto) > 0 && Math.abs(Number(monto) - cuenta.monto) > 0.004;
    const guardar = async () => {
        setGuardando(true);
        try { await onGuardar(cuenta, { montoTotal: Number(monto), motivo: motivo.trim() }); onCerrar(); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    return (
        <Dialogo abierto onCerrar={onCerrar} titulo={`Corregir el monto de ${cuenta.documento}`}>
            <Stack gap="sm">
                <Text size="sm">Es una <b>corrección del documento</b> (no un pago): el saldo se recalcula con lo ya abonado ({dolares(cuenta.abonado)}). El motivo queda anotado en la observación.</Text>
                <SimpleGrid cols={2} spacing="sm">
                    <TextInput label="Monto actual" value={dolares(cuenta.monto)} readOnly variant="default" />
                    <NumberInput label="Monto correcto USD" min={0} decimalScale={2} value={monto} onChange={setMonto} inputMode="decimal" />
                </SimpleGrid>
                <TextInput label="Motivo de la corrección" description="Mínimo 5 letras" placeholder="Ej: error al transcribir la factura" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} data-autofocus />
                {cambia && <Text size="sm" c="#5c6675">El saldo pasará de <b>{dolares(cuenta.saldo)}</b> a <b>{dolares(Math.max(0, Number(monto) - cuenta.abonado))}</b>.</Text>}
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button size="sm" color="orange" disabled={!cambia || motivo.trim().length < 5} loading={guardando} onClick={guardar}>Corregir monto</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}

// Vencimiento y observación de un documento (en el teléfono reemplaza la edición en la celda)
export function DialogoEditarCuenta({ cuenta, onCerrar, onGuardar }) {
    const [vence, setVence] = useState(cuenta?.vence || '');
    const [observacion, setObservacion] = useState(cuenta?.observacion || '');
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { setVence(cuenta?.vence || ''); setObservacion(cuenta?.observacion || ''); }, [cuenta?.id]);
    if (!cuenta) return null;
    const campos = {};
    if (vence && vence !== (cuenta.vence || '')) campos.fechaVencimiento = vence;
    if (observacion.trim() !== (cuenta.observacion || '').trim()) campos.observacion = observacion;
    const guardar = async () => {
        setGuardando(true);
        try { await onGuardar(cuenta, campos); onCerrar(); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    return (
        <Dialogo abierto onCerrar={onCerrar} titulo={`${cuenta.documento} · ${cuenta.cliente}`}>
            <Stack gap="sm">
                <TextInput type="date" label="Vence" value={vence} onChange={(e) => setVence(e.currentTarget.value)} leftSection={<IconCalendarDue size={16} />} />
                <Textarea label="Observación" autosize minRows={2} maxRows={6} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.currentTarget.value)} />
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button size="sm" leftSection={<IconPencil size={16} />} disabled={!Object.keys(campos).length} loading={guardando} onClick={guardar}>Guardar</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}

// Corregir o borrar un abono ya registrado (la cuenta se recalcula sola)
export function DialogoEditarAbono({ cuenta, abono, onCerrar, onGuardar, onBorrar }) {
    const [d, setD] = useState(() => ({ ...abono }));
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { setD({ ...abono }); }, [abono?.id]);
    if (!cuenta || !abono) return null;
    const campos = {};
    if (d.fecha && d.fecha !== abono.fecha) campos.fecha = d.fecha;
    if (d.monto !== '' && Number(d.monto) !== Number(abono.monto)) campos.monto = Number(d.monto);
    for (const k of ['metodo', 'referencia', 'notas']) if (String(d[k] ?? '') !== String(abono[k] ?? '')) campos[k] = d[k];
    const guardar = async () => {
        setGuardando(true);
        try { await onGuardar(cuenta, abono, campos); onCerrar(); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    const esAjuste = Number(abono.monto) < 0;
    return (
        <Dialogo abierto onCerrar={onCerrar} titulo={`${esAjuste ? 'Ajuste' : 'Abono'} de ${cuenta.documento}`}>
            <Stack gap="sm">
                {esAjuste && <Alert color="orange" variant="light" p="xs">Es un ajuste: el monto va en negativo porque subió la deuda.</Alert>}
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    <TextInput type="date" label="Fecha" max={fechaCaracas()} value={d.fecha || ''} onChange={(e) => setD({ ...d, fecha: e.currentTarget.value })} />
                    <NumberInput label="Monto USD" decimalScale={2} value={d.monto} onChange={(v) => setD({ ...d, monto: v })} inputMode="decimal" />
                    <TextInput label="Método" value={d.metodo || ''} onChange={(e) => setD({ ...d, metodo: e.currentTarget.value })} />
                    <TextInput label="Referencia" value={d.referencia || ''} onChange={(e) => setD({ ...d, referencia: e.currentTarget.value })} maxLength={100} />
                </SimpleGrid>
                <TextInput label="Notas" value={d.notas || ''} onChange={(e) => setD({ ...d, notas: e.currentTarget.value })} maxLength={250} />
                <Group justify="space-between" gap="xs">
                    <Button variant="subtle" color="red" size="sm" leftSection={<IconTrash size={16} />} onClick={async () => { if (await onBorrar(cuenta, abono)) onCerrar(); }}>Borrar</Button>
                    <Group gap="xs">
                        <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                        <Button size="sm" disabled={!Object.keys(campos).length} loading={guardando} onClick={guardar}>Guardar</Button>
                    </Group>
                </Group>
            </Stack>
        </Dialogo>
    );
}
