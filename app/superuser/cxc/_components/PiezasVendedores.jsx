'use client';

// Piezas de la hoja de vendedores que usan igual la tabla (escritorio) y las tarjetas (teléfono):
// el estado de la comisión (color + ícono + texto), el menú «⋯» de cada línea, la leyenda y los diálogos.
import React, { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Autocomplete, Box, Button, Group, Menu, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconArrowBackUp, IconCircleCheck, IconCoin, IconDotsVertical, IconHourglass, IconInfoCircle, IconListCheck, IconPencil, IconPlus, IconReceiptRefund, IconTrash } from '@tabler/icons-react';
import { CONCEPTOS, ESTADOS, PORCENTAJES, esPago, estadoLinea, opcionesPct, r2 } from './comisiones';
import { Dialogo } from './Piezas';
import { bolivares, dolares, fmtFecha, hoy } from './utilidades';
import classes from './cxc.module.css';

const ICONOS = { porpagar: IconCoin, pagada: IconCircleCheck, sincobrar: IconHourglass, enabonos: IconListCheck, nota: IconReceiptRefund };
export const COLOR_POR_PAGAR = '#fff59d';
export const COLOR_PAGADA = '#e9ecef';

const textoEstado = (l, e) => (e === 'pagada' && l.fechaPagoComision ? `Pagada ${fmtFecha(l.fechaPagoComision)}` : ESTADOS[e].etiqueta);

// Estado de la comisión de una línea. Con `onMarcar` es un botón que abre «Marcar pagada / Volver a pendiente».
export function EstadoComision({ l, onMarcar }) {
    const e = estadoLinea(l);
    const Icono = ICONOS[e];
    const texto = textoEstado(l, e);
    if (!onMarcar) return <span className={classes.estado} data-estado={e} title={ESTADOS[e].ayuda}><Icono size={12} />{texto}</span>;
    return (
        <Menu position="bottom-start" withinPortal shadow="md" width={270}>
            <Menu.Target>
                <button type="button" className={classes.estado} data-estado={e} title={ESTADOS[e].ayuda} aria-label={`Comisión: ${texto}. Cambiar`}><Icono size={12} />{texto}</button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label style={{ whiteSpace: 'normal' }}>{ESTADOS[e].ayuda}</Menu.Label>
                {l.estatusComision !== 'PAGADA'
                    ? <Menu.Item color="teal" leftSection={<IconCircleCheck size={16} />} onClick={() => onMarcar(l, 'PAGADA')}>Marcar comisión pagada (hoy)</Menu.Item>
                    : <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={() => onMarcar(l, 'PENDIENTE')}>Volver a pendiente</Menu.Item>}
            </Menu.Dropdown>
        </Menu>
    );
}

// Cómo va el cobro de la factura enlazada: «Debe $x» o «Cobrada»
export function CobroFactura({ l, fz = 10.5 }) {
    if (!l.ventaId) return null;
    if (l.saldoCxc !== null && l.saldoCxc !== undefined && Number(l.saldoCxc) > 0.005) return <Text span fz={fz} fw={800} c="red.8" style={{ whiteSpace: 'nowrap' }} title="Lo que el cliente todavía debe de esta factura">Debe {dolares(l.saldoCxc)}</Text>;
    if ((l.saldoCxc !== null && l.saldoCxc !== undefined) || l.pagoVenta === 'Pagado') return <Text span fz={fz} fw={800} c="teal.8" style={{ whiteSpace: 'nowrap' }}>Cobrada</Text>;
    return null;
}

// «⋯» de una línea: editar todo, agregar un abono a la factura, borrar
export function MenuLinea({ l, acc, tamano = 'md' }) {
    const pago = esPago(l);
    return (
        <Menu position="bottom-end" withinPortal shadow="md" width={240}>
            <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size={tamano === 'lg' ? 36 : 24} aria-label={`Más acciones de ${l.documentoTexto || 'la línea'}`}><IconDotsVertical size={tamano === 'lg' ? 20 : 15} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>{pago ? (l.concepto === 'NOTA' ? 'Nota de crédito' : 'Abono') : 'Factura'} {l.documentoTexto || ''}</Menu.Label>
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => acc.editarLinea(l)}>Editar esta línea</Menu.Item>
                {!pago && <Menu.Item leftSection={<IconPlus size={16} />} onClick={() => acc.agregarAbono(l)}>Agregar un abono a esta factura</Menu.Item>}
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => acc.borrarLinea(l)}>Borrar de la hoja</Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}

// Qué significa cada color (ley del Excel de la administradora). Siempre con texto, no solo el color.
export function LeyendaColores({ compacta = false }) {
    const items = [
        { color: COLOR_POR_PAGAR, borde: '#c9a400', titulo: 'Amarillo', texto: 'el cliente ya pagó: comisión por pagar' },
        { color: COLOR_PAGADA, borde: '#adb5bd', titulo: 'Gris', texto: 'comisión ya pagada' },
        { color: '#fff', borde: '#adb5bd', titulo: 'Blanco', texto: 'factura sin cobrar (aún no se paga la comisión)' },
    ];
    return (
        <Group gap={compacta ? 8 : 16} wrap="wrap" component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Qué significa cada color">
            {items.map((i) => (
                <Group key={i.titulo} gap={6} wrap="nowrap" component="li">
                    <span className={classes.muestra} style={{ background: i.color, border: `1px solid ${i.borde}` }} aria-hidden="true" />
                    <Text fz={12} c="#1a1b1e"><b>{i.titulo}:</b> {i.texto}</Text>
                </Group>
            ))}
        </Group>
    );
}

// Las cifras del encabezado de cada cliente (y del total general), en el mismo orden en escritorio y teléfono
export function cifrasDe(t, deuda, tasa) {
    return [
        deuda === null
            ? { clave: 'debe', titulo: 'Debe', valor: null, color: '#5c6675', ayuda: 'Ninguna factura de este cliente está enlazada con el sistema: lo que debe se lleva a mano (Estatus cliente)' }
            : { clave: 'debe', titulo: 'Debe', valor: deuda, color: deuda > 0 ? '#c92a2a' : '#2b8a3e', ayuda: 'Lo que el cliente todavía debe de sus facturas (enlazadas con el sistema)' },
        { clave: 'facturas', titulo: 'Facturas (con IVA)', valor: t.facturas, ayuda: 'Total de las facturas, con IVA, tal como se facturaron' },
        { clave: 'abonado', titulo: 'Abonado', valor: t.abonos, color: '#1971c2', ayuda: 'Lo que el cliente ha pagado en abonos' },
        { clave: 'base', titulo: 'A comisionar sin IVA', valor: t.base, ayuda: 'La base sin IVA sobre la que se calcula la comisión' },
        { clave: 'comision', titulo: 'Comisión', valor: t.comision, tasa, ayuda: 'Suma de las comisiones de estas líneas' },
        { clave: 'porpagar', titulo: 'Por pagar', valor: t.porPagar, color: t.porPagar > 0 ? '#b35900' : '#2b8a3e', tasa, ayuda: 'Ya se le puede pagar al vendedor: el cliente ya pagó (renglones amarillos)' },
        { clave: 'futura', titulo: 'Por generar (sin cobrar)', valor: t.futura, color: '#5c6675', tasa, ayuda: 'Lo que dejarán las facturas que el cliente aún no paga' },
    ];
}

const num = (v) => (v === '' || v === null || v === undefined ? '' : Number(v));

// Editar una línea completa (en el teléfono reemplaza la edición en celda; en la computadora está en «⋯ → Editar»)
export function DialogoEditarLinea({ linea: l, tasa, hijos = 0, onCerrar, onGuardar, onBorrar }) {
    const pago = esPago(l);
    const inicial = useMemo(() => ({
        concepto: l.concepto, documentoTexto: l.documentoTexto || '', clienteTexto: l.clienteTexto || '', fecha: l.fecha || '', vencimiento: l.vencimiento || '',
        monto: l.montoUsd === null || l.montoUsd === undefined ? '' : Math.abs(Number(l.montoUsd)), baseUsd: num(l.baseUsd),
        porcentaje: l.porcentaje === null || l.porcentaje === undefined ? '' : String(Number(l.porcentaje)), comisionUsd: num(l.comisionUsd),
        estatusCliente: l.estatusCliente || '', estatusComision: l.estatusComision, fechaPagoComision: l.fechaPagoComision || '', observacion: l.observacion || '',
    }), [l]);
    const [d, setD] = useState(inicial);
    const [tocoComision, setTocoComision] = useState(false);
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { setD(inicial); setTocoComision(false); }, [inicial]);
    // el valor se lee antes de actualizar: el evento ya no tiene `currentTarget` cuando corre la actualización
    const poner = (k) => (v) => { const valor = v?.currentTarget ? v.currentTarget.value : v; setD((x) => ({ ...x, [k]: valor })); };

    // si cambia la base o el % (y no se escribió la comisión a mano), la comisión nueva se ve antes de guardar; el servidor la recalcula igual
    const recalcula = !pago && !tocoComision && (num(d.baseUsd) !== inicial.baseUsd || d.porcentaje !== inicial.porcentaje) && d.baseUsd !== '' && d.porcentaje !== '';
    const comisionVista = recalcula ? r2((Number(d.baseUsd) * Number(d.porcentaje)) / 100) : d.comisionUsd;

    const cambios = {};
    if (d.concepto !== inicial.concepto) cambios.concepto = d.concepto;
    for (const k of ['documentoTexto', 'clienteTexto', 'fecha', 'vencimiento', 'estatusCliente', 'observacion', 'fechaPagoComision']) if (String(d[k] ?? '') !== String(inicial[k] ?? '')) cambios[k] = d[k];
    if (num(d.monto) !== inicial.monto) cambios.montoUsd = d.monto === '' ? null : (pago ? -Math.abs(Number(d.monto)) : Number(d.monto));
    if (num(d.baseUsd) !== inicial.baseUsd) cambios.baseUsd = d.baseUsd === '' ? null : Number(d.baseUsd);
    if (!pago && d.porcentaje !== inicial.porcentaje && d.porcentaje !== '') cambios.porcentaje = Number(d.porcentaje);
    if (tocoComision && num(d.comisionUsd) !== inicial.comisionUsd) cambios.comisionUsd = d.comisionUsd === '' ? null : Number(d.comisionUsd);
    if (d.estatusComision !== inicial.estatusComision) cambios.estatusComision = d.estatusComision;
    const hay = Object.keys(cambios).length > 0;

    const guardar = async () => {
        setGuardando(true);
        try { await onGuardar(l, cambios); onCerrar(); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    const tipo = pago ? (l.concepto === 'NOTA' ? 'Nota de crédito' : 'Abono') : 'Factura';
    return (
        <Dialogo abierto onCerrar={onCerrar} titulo={`${tipo} ${l.documentoTexto || ''}`} ancho="lg">
            <Stack gap="sm">
                {!pago && hijos > 0 && <Alert color="blue" variant="light" p="xs" icon={<IconInfoCircle size={18} />}>Esta factura tiene {hijos} abono(s): la comisión la generan ellos. La de aquí es solo la posible.</Alert>}
                <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="sm">
                    {!pago && <Select label="Tipo" data={CONCEPTOS} value={d.concepto} onChange={(v) => v && setD({ ...d, concepto: v })} allowDeselect={false} comboboxProps={{ withinPortal: true }} />}
                    <TextInput label={pago ? 'De la factura' : 'Factura / nota'} value={d.documentoTexto} onChange={poner('documentoTexto')} description={pago ? 'A cuál factura pertenece' : undefined} />
                    {!pago && <TextInput label="Cliente (como en la hoja)" value={d.clienteTexto} onChange={poner('clienteTexto')} />}
                    <TextInput type="date" label="Fecha" value={d.fecha} onChange={poner('fecha')} />
                    {!pago && <TextInput type="date" label="Vence" value={d.vencimiento} onChange={poner('vencimiento')} />}
                    <NumberInput
                        label={pago ? 'Monto abonado USD' : 'Factura USD (con IVA)'} decimalScale={2} min={0} value={d.monto} onChange={poner('monto')} inputMode="decimal"
                        description={pago ? 'Al cambiarlo se recalculan solas la parte sin IVA y la comisión' : undefined}
                    />
                    <NumberInput label="A comisionar sin IVA" decimalScale={2} min={0} value={d.baseUsd} onChange={poner('baseUsd')} inputMode="decimal" />
                    {!pago && <Select label="% de comisión" data={opcionesPct(d.porcentaje)} value={d.porcentaje || null} onChange={(v) => v && setD({ ...d, porcentaje: v })} allowDeselect={false} description="Se aplica también a sus abonos por pagar" comboboxProps={{ withinPortal: true }} />}
                    <NumberInput
                        label="Comisión USD" decimalScale={2} min={0} value={comisionVista} inputMode="decimal"
                        onChange={(v) => { setTocoComision(true); setD((x) => ({ ...x, comisionUsd: v })); }}
                        description={recalcula ? 'Recalculada con la base y el %' : tasa && comisionVista !== '' ? `= ${bolivares(Number(comisionVista) * tasa)} a la tasa BCV de hoy` : undefined}
                    />
                </SimpleGrid>
                {!pago && <TextInput label="Estatus del cliente (nota del cobro)" placeholder="PAGADO, RET RECIBIDA…" value={d.estatusCliente} onChange={poner('estatusCliente')} maxLength={120} />}
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    <Box>
                        <Text fz="sm" fw={500} mb={4}>Comisión al vendedor</Text>
                        <SegmentedControl fullWidth color="navy.9" classNames={{ root: classes.segRaiz, label: classes.segEtiqueta }} value={d.estatusComision} onChange={(v) => setD({ ...d, estatusComision: v })}
                            data={[{ value: 'PENDIENTE', label: 'Pendiente' }, { value: 'PAGADA', label: 'Pagada' }]} />
                    </Box>
                    {d.estatusComision === 'PAGADA' && <TextInput type="date" label="Pagada el" description="Si la dejas vacía, se pone la de hoy" value={d.fechaPagoComision} onChange={poner('fechaPagoComision')} />}
                </SimpleGrid>
                <Textarea label="Observación" autosize minRows={1} maxRows={4} value={d.observacion} onChange={poner('observacion')} />
                <Group justify="space-between" gap="xs">
                    <Button variant="subtle" color="red" size="sm" leftSection={<IconTrash size={16} />} onClick={async () => { if (await onBorrar(l)) onCerrar(); }}>Borrar</Button>
                    <Group gap="xs">
                        <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                        <Button size="sm" disabled={!hay} loading={guardando} onClick={guardar}>Guardar</Button>
                    </Group>
                </Group>
            </Stack>
        </Dialogo>
    );
}

// Agregar una línea a la hoja: una factura o un abono / pago de una factura que ya está en la hoja
export function DialogoAgregarLinea({ abierto, inicial, vendedor, facturas, clientes, onCerrar, onAgregar }) {
    const vacio = () => ({ concepto: 'FACTURA', documento: '', cliente: '', fecha: hoy(), montoUsd: '', baseUsd: '', porcentaje: String(Number(vendedor?.porcentaje ?? 5)) });
    const [d, setD] = useState(vacio);
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { if (abierto) setD({ ...vacio(), ...(inicial || {}) }); }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
    const abono = d.concepto === 'ABONO';
    // al elegir una factura de la lista se completan el cliente y su %
    const elegirFactura = (documento) => {
        const f = facturas.find((x) => x.documento === documento);
        setD((x) => ({ ...x, documento, cliente: f?.cliente || x.cliente, porcentaje: f?.porcentaje !== null && f?.porcentaje !== undefined ? String(Number(f.porcentaje)) : x.porcentaje }));
    };
    const agregar = async (seguir) => {
        setGuardando(true);
        try {
            await onAgregar(d);
            if (seguir) setD((x) => ({ ...vacio(), concepto: x.concepto, cliente: x.cliente, fecha: x.fecha }));
            else onCerrar();
        } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    const valido = d.documento.trim() || d.cliente.trim();
    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo={`Agregar a la hoja de ${vendedor?.nombre || ''}`} ancho="lg">
            <Stack gap="sm">
                <SegmentedControl fullWidth color="navy.9" classNames={{ root: classes.segRaiz, label: classes.segEtiqueta }} value={d.concepto} onChange={(v) => setD({ ...d, concepto: v })}
                    data={[{ value: 'FACTURA', label: 'Factura o nota de entrega' }, { value: 'ABONO', label: 'Abono / pago de una factura' }]} />
                <Text fz={12.5} c="#5c6675">
                    {abono
                        ? 'El abono queda debajo de su factura (mismo número). Su comisión se calcula sola sobre la parte sin IVA de lo abonado, con el % de la factura, y queda amarilla (por pagar).'
                        : 'Si el número coincide con una factura del sistema, queda enlazada y el cobro se sigue solo.'}
                </Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    <Autocomplete
                        label={abono ? 'De la factura' : 'Factura / nota'} placeholder="146870 o 0000-6611" value={d.documento} limit={30}
                        data={[...new Set(facturas.map((f) => f.documento))]} onChange={(v) => setD((x) => ({ ...x, documento: v }))} onOptionSubmit={elegirFactura}
                        comboboxProps={{ withinPortal: true }} data-autofocus
                    />
                    <Autocomplete label="Cliente" value={d.cliente} limit={30} data={clientes} onChange={(v) => setD((x) => ({ ...x, cliente: v }))} comboboxProps={{ withinPortal: true }} />
                    <TextInput type="date" label={abono ? 'Fecha del abono' : 'Fecha de la factura'} value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.currentTarget.value })} />
                    <NumberInput label={abono ? 'Monto abonado USD' : 'Monto de la factura USD (con IVA)'} decimalScale={2} min={0} value={d.montoUsd} onChange={(v) => setD({ ...d, montoUsd: v })} inputMode="decimal" />
                    <NumberInput
                        label="A comisionar sin IVA" decimalScale={2} min={0} value={d.baseUsd} onChange={(v) => setD({ ...d, baseUsd: v })} inputMode="decimal"
                        description={abono ? 'Opcional: si lo dejas vacío se calcula con la proporción sin IVA de su factura' : 'El monto de la factura sin IVA'}
                    />
                    <Select
                        label="% de comisión" data={opcionesPct(d.porcentaje)} value={d.porcentaje} onChange={(v) => v && setD({ ...d, porcentaje: v })} allowDeselect={false}
                        description={abono ? 'Se usa el % de su factura; este solo si no se encuentra' : 'De 2 % a 10 %'} comboboxProps={{ withinPortal: true }}
                    />
                </SimpleGrid>
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button variant="light" size="sm" disabled={!valido} loading={guardando} onClick={() => agregar(true)}>Agregar y otra</Button>
                    <Button size="sm" leftSection={<IconPlus size={16} />} disabled={!valido} loading={guardando} onClick={() => agregar(false)}>Agregar</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}

export function DialogoNuevoVendedor({ abierto, onCerrar, onCrear }) {
    const [nombre, setNombre] = useState('');
    const [porcentaje, setPorcentaje] = useState('5');
    const [guardando, setGuardando] = useState(false);
    useEffect(() => { if (abierto) { setNombre(''); setPorcentaje('5'); } }, [abierto]);
    const crear = async () => {
        setGuardando(true);
        try { await onCrear({ nombre: nombre.trim(), porcentaje: Number(porcentaje) }); onCerrar(); } catch { /* ya se avisó */ } finally { setGuardando(false); }
    };
    return (
        <Dialogo abierto={abierto} onCerrar={onCerrar} titulo="Nuevo vendedor a comisión" ancho="sm">
            <Stack gap="sm">
                <Text size="sm" c="#5c6675">No forma parte de la nómina ni entra al sistema: solo se le lleva su hoja de comisiones.</Text>
                <TextInput label="Nombre" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} data-autofocus />
                <Select label="% de comisión por defecto" description="Se propone al agregar sus facturas; cada factura puede tener el suyo" data={PORCENTAJES.map((n) => ({ value: String(n), label: `${n}%` }))} value={porcentaje} onChange={(v) => v && setPorcentaje(v)} allowDeselect={false} comboboxProps={{ withinPortal: true }} />
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" size="sm" onClick={onCerrar}>Cancelar</Button>
                    <Button size="sm" disabled={nombre.trim().length < 2} loading={guardando} onClick={crear}>Crear vendedor</Button>
                </Group>
            </Stack>
        </Dialogo>
    );
}
