'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Box, Button, Card, Group, Image, List, Loader, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconCheck, IconChevronLeft, IconDeviceFloppy, IconPlayerSkipForward, IconReportAnalytics } from '@tabler/icons-react';
import { PRESENTACIONES, parseNumero } from '@/app/constants/inventarioCampos';

const TEXTOS = {
    SIN_COSTO: ['Falta el costo', 'yellow'], SIN_P7: ['Falta el precio 7', 'red'], P7_MENOR_P6: ['El precio 7 es menor que el precio 6', 'red'],
    P6_MENOR_COSTO: ['El precio 6 es menor que el costo (se vendería perdiendo)', 'red'], POSIBLE_CAJA: ['Posible precio de CAJA puesto como precio por unidad', 'orange'],
    DIF_REPORTE: ['Su precio 6 no coincide con el del reporte de tu sistema', 'orange'], NOTA: ['Tiene notas de la carga automática', 'blue'],
};
const FILTROS = [
    { value: 'alertas', label: 'Solo lo dudoso' }, { value: 'todos', label: 'Todos' }, { value: 'SIN_P7', label: 'Sin precio 7' }, { value: 'SIN_COSTO', label: 'Sin costo' },
    { value: 'P7_MENOR_P6', label: 'Precio 7 menor que 6' }, { value: 'POSIBLE_CAJA', label: 'Posible precio de caja' }, { value: 'DIF_REPORTE', label: 'Difiere del reporte' },
];

async function api(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
const txt = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const aNum = (s) => (String(s).trim() === '' ? null : parseNumero(s));
const usd = (n) => (Number.isFinite(n) ? `$${n.toLocaleString('es-VE', { maximumFractionDigits: 4 })}` : '—');

// Revisión ficha por ficha de costo, precios y empaque. Cada ficha es un producto base: lo que cambies vale para todas sus marcas.
export default function AuditarDatosPage() {
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 48em)');
    const [filtro, setFiltro] = useState('alertas');
    const [cola, setCola] = useState([]);
    const [conteo, setConteo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [form, setForm] = useState(null);
    const omitidos = useRef(new Set());
    const hechos = useRef(0);

    const cargar = useCallback(async (f) => {
        setCargando(true); setError('');
        try {
            const d = await api(`/api/inventario/auditoria-datos?filtro=${f}&limite=20&excluir=${[...omitidos.current].join(',')}`);
            setCola(d.items); setConteo(d.conteo);
        } catch (e) { setError(e.message); } finally { setCargando(false); }
    }, []);
    useEffect(() => { omitidos.current = new Set(); hechos.current = 0; cargar(filtro); }, [filtro, cargar]);

    const actual = cola[0];
    useEffect(() => {
        if (!actual) { setForm(null); return; }
        const d = actual.datos;
        setForm({ costoUsd: txt(d.costoUsd || ''), precio6: txt(d.precio6 || ''), precio7: txt(d.precio7 || ''), porcentajeIva: txt(d.porcentajeIva), presentacion: d.presentacion,
            unidadesPorCaja: txt(d.unidadesPorCaja ?? ''), cajasPorBulto: txt(d.cajasPorBulto ?? ''), unidadesPorBulto: txt(d.unidadesPorBulto ?? '') });
    }, [actual]);

    const siguiente = useCallback(() => {
        hechos.current += 1;
        setCola((c) => { const r = c.slice(1); if (!r.length) setTimeout(() => cargar(filtro), 0); return r; });
    }, [cargar, filtro]);
    const saltar = () => { omitidos.current.add(actual.base); setCola((c) => { const r = c.slice(1); if (!r.length) setTimeout(() => cargar(filtro), 0); return r; }); };

    // Lo que cambió respecto a lo guardado
    const upcN = form ? aNum(form.unidadesPorCaja) : null;
    const cambios = useMemo(() => {
        if (!actual || !form) return {};
        const d = actual.datos, c = {};
        const cmp = (k, dec) => { const n = aNum(form[k]); if ((n ?? 0) !== (d[k] ?? 0)) c[k] = n ?? 0; return dec; };
        ['costoUsd', 'precio6', 'precio7', 'porcentajeIva'].forEach((k) => cmp(k));
        if (form.presentacion !== d.presentacion) c.presentacion = form.presentacion;
        const upc = aNum(form.unidadesPorCaja);
        if ((upc ?? null) !== (d.unidadesPorCaja ?? null) || (upc > 1 && (aNum(form.cajasPorBulto) ?? 1) !== (d.cajasPorBulto ?? 1))) { c.unidadesPorCaja = upc || null; c.cajasPorBulto = upc > 1 ? (aNum(form.cajasPorBulto) || 1) : null; }
        if (!(upc > 1) && (aNum(form.unidadesPorBulto) ?? 1) !== (d.unidadesPorBulto ?? 1)) c.unidadesPorBulto = aNum(form.unidadesPorBulto) || 1;
        return c;
    }, [actual, form]);
    const hayCambios = Object.keys(cambios).length > 0;

    const enviar = async () => {
        if (!actual || ocupado) return;
        setOcupado(true);
        try {
            await api('/api/inventario/auditoria-datos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: hayCambios ? 'GUARDAR' : 'APROBAR', ids: actual.variantes.map((v) => v.id), cambios }) });
            notifications.show({ color: 'teal', message: hayCambios ? 'Cambios guardados' : 'Revisado', autoClose: 1200 });
            siguiente();
            setConteo((c) => (c ? { ...c, aprobados: c.aprobados + 1, total: c.total - 1 } : c));
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); } finally { setOcupado(false); }
    };

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.currentTarget ? e.currentTarget.value : e }));
    const costo = aNum(form?.costoUsd), p6 = aNum(form?.precio6), p7 = aNum(form?.precio7);
    const margen6 = costo > 0 && p6 > 0 ? ((p6 - costo) / costo) * 100 : null;
    const margen7 = p6 > 0 && p7 > 0 ? ((p7 - p6) / p6) * 100 : null;
    const bulto = upcN > 1 ? upcN * (aNum(form?.cajasPorBulto) || 1) : aNum(form?.unidadesPorBulto) || 1;
    const ref = actual?.referencia;

    return (
        <Box px={isMobile ? 'xs' : 'md'} py="sm" maw={980} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser/inventario/productos')}>Inventario</Button>
            <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" pb={0}>Auditar precios y presentación</Title>
            <Text size="sm" c="gray.4" mb="sm">Una ficha por producto: revisa costo, precios 6 y 7, presentación, unidades por caja y por bulto. Lo que cambies vale para todas sus marcas.</Text>

            <Select mb="xs" bg="white" data={FILTROS} value={filtro} onChange={(v) => v && setFiltro(v)} allowDeselect={false}
                label={undefined} description={undefined} />
            {conteo && (
                <Group gap="xs" mb="sm">
                    <Badge color="teal" variant="light">Revisados: {conteo.aprobados}</Badge>
                    <Badge color="gray" variant="light">Pendientes: {conteo.total}</Badge>
                    <Badge color="red" variant="light">Dudosos: {conteo.alertas}</Badge>
                    <Badge color="red" variant="outline">Sin precio 7: {conteo.SIN_P7}</Badge>
                    <Badge color="yellow" variant="outline">Sin costo: {conteo.SIN_COSTO}</Badge>
                </Group>
            )}
            {error && <Alert color="red" mb="sm">{error}</Alert>}

            {cargando && !actual ? <Group justify="center" py={80}><Loader /></Group> : !actual ? (
                <Paper withBorder radius="md" p="xl" ta="center" bg="white">
                    <IconCheck size={48} color="var(--mantine-color-teal-6)" />
                    <Title order={3} mt="xs">No hay más fichas con este filtro</Title>
                    <Text c="dimmed" mt={4}>{hechos.current ? `Esta sesión revisaste ${hechos.current}.` : 'Todo al día.'}</Text>
                    {filtro !== 'todos' && <Button mt="md" variant="light" onClick={() => setFiltro('todos')}>Ver todos los pendientes</Button>}
                </Paper>
            ) : form && (
                <Card withBorder radius="md" p={isMobile ? 'sm' : 'md'} bg="white">
                    <Stack gap="sm">
                        <Group wrap="nowrap" align="flex-start">
                            {actual.imagen ? <Image src={actual.imagen} w={isMobile ? 84 : 110} h={isMobile ? 84 : 110} fit="contain" radius="md" bg="gray.0" /> : <Box w={84} h={84} bg="gray.1" style={{ borderRadius: 8 }} />}
                            <Box style={{ minWidth: 0 }}>
                                <Text fw={800} fz={isMobile ? 'md' : 'lg'} lh={1.2}>{actual.nombre}</Text>
                                <Text size="sm" c="dimmed">Código {actual.base}{actual.categoria ? ` · ${actual.categoria}` : ''}</Text>
                                <Group gap={4} mt={4}>{actual.marcas.map((m) => <Badge key={m} size="sm" variant="light" tt="none">{m}</Badge>)}</Group>
                                <Text size="xs" c="dimmed" mt={2}>{actual.variantes.length > 1 ? `Se aplica a ${actual.variantes.length} marcas` : 'Una sola marca'} · Quedan {cola.length}+</Text>
                            </Box>
                        </Group>

                        {actual.alertas.filter((a) => a !== 'NOTA').map((a) => <Alert key={a} color={TEXTOS[a][1]} variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>{TEXTOS[a][0]}</Alert>)}
                        {actual.notas.length > 0 && <Alert color="blue" variant="light" p="xs" title="Notas de la carga"><List size="xs" spacing={2} style={{ overflowWrap: 'anywhere' }}>{actual.notas.map((n, i) => <List.Item key={i}>{n}</List.Item>)}</List></Alert>}
                        {ref && (
                            <Paper withBorder p="xs" radius="md" bg="gray.0">
                                <Group justify="space-between" wrap="wrap" gap="xs">
                                    <Text size="sm">Reporte de tu sistema: <b>Precio 6 = {usd(ref.p6)}</b> · <b>Precio 7 = {usd(ref.p7)}</b> <Text span size="xs" c="dimmed">({ref.nombre})</Text></Text>
                                    <Button size="compact-xs" variant="light" onClick={() => setForm((f) => ({ ...f, precio6: txt(ref.p6 ?? ''), precio7: txt(ref.p7 ?? '') }))}>Usar estos precios</Button>
                                </Group>
                                <Text size="xs" c="dimmed">Ojo: el reporte puede traer el precio por caja o por pieza; compáralo con la presentación.</Text>
                            </Paper>
                        )}

                        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                            <TextInput label="Costo por unidad ($)" inputMode="decimal" value={form.costoUsd} onChange={set('costoUsd')} />
                            <TextInput label="Precio 6 (mayor)" inputMode="decimal" value={form.precio6} onChange={set('precio6')} description={margen6 !== null ? `Margen sobre costo ${margen6.toFixed(0)} %` : undefined} />
                            <TextInput label="Precio 7 (detal)" inputMode="decimal" value={form.precio7} onChange={set('precio7')} description={margen7 !== null ? `${margen7.toFixed(0)} % sobre el 6` : undefined} />
                            <TextInput label="IVA %" inputMode="decimal" value={form.porcentajeIva} onChange={set('porcentajeIva')} />
                        </SimpleGrid>
                        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                            <Select label="Presentación (una unidad es…)" data={PRESENTACIONES} value={form.presentacion} onChange={(v) => v && setForm((f) => ({ ...f, presentacion: v }))} allowDeselect={false} />
                            <TextInput label="Unidades por caja" placeholder="sin caja" inputMode="numeric" value={form.unidadesPorCaja} onChange={set('unidadesPorCaja')} />
                            {upcN > 1
                                ? <TextInput label="Cajas por bulto" inputMode="numeric" value={form.cajasPorBulto} onChange={set('cajasPorBulto')} />
                                : <TextInput label="Unidades por bulto" inputMode="numeric" value={form.unidadesPorBulto} onChange={set('unidadesPorBulto')} />}
                            <TextInput label="Total por bulto" value={`${bulto.toLocaleString('es-VE')} unid.`} readOnly variant="filled" />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                            <Button size="lg" color={hayCambios ? 'blue' : 'teal'} loading={ocupado} leftSection={hayCambios ? <IconDeviceFloppy size={22} /> : <IconCheck size={22} />} onClick={enviar}>
                                {hayCambios ? 'Guardar cambios y siguiente' : 'Está bien, siguiente'}
                            </Button>
                            <Button size="lg" variant="default" leftSection={<IconPlayerSkipForward size={22} />} onClick={saltar}>Saltar</Button>
                        </SimpleGrid>
                        {hayCambios && <Text size="xs" c="dimmed"><IconReportAnalytics size={12} style={{ verticalAlign: 'middle' }} /> Cambiarás: {Object.keys(cambios).join(', ')}</Text>}
                    </Stack>
                </Card>
            )}
        </Box>
    );
}
