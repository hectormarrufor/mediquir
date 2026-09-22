'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Anchor, Badge, Box, Button, Card, Checkbox, Group, Image, List, Loader, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconAlertTriangle, IconBrandGoogle, IconCamera, IconCheck, IconChevronLeft, IconCopy, IconDeviceFloppy, IconPhotoEdit, IconPlayerSkipForward, IconTrash } from '@tabler/icons-react';
import { PRESENTACIONES, parseNumero } from '@/app/constants/inventarioCampos';
import EditorFoto from './_components/EditorFoto';

const BLOB = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const TEXTOS = {
    SIN_COSTO: ['Falta el costo', 'yellow'], SIN_P7: ['Falta el precio 7', 'red'], P7_MENOR_P6: ['El precio 7 es menor que el precio 6', 'red'],
    P6_MENOR_COSTO: ['El precio 6 es menor que el costo (se vendería perdiendo)', 'red'], POSIBLE_CAJA: ['Posible precio de CAJA puesto como precio por unidad', 'orange'],
    DIF_REPORTE: ['Su precio 6 no coincide con el del reporte de tu sistema', 'orange'],
};
const FILTROS = [
    { value: 'pendiente', label: 'Todo lo pendiente' }, { value: 'dudoso', label: 'Solo lo dudoso' }, { value: 'fotos', label: 'Fotos por revisar o que faltan' }, { value: 'sin-foto', label: 'Sin foto (incluye las que dejé para después)' },
    { value: 'datos', label: 'Solo precios y presentación' }, { value: 'SIN_P7', label: 'Sin precio 7' }, { value: 'SIN_COSTO', label: 'Sin costo' }, { value: 'P7_MENOR_P6', label: 'Precio 7 menor que 6' },
    { value: 'POSIBLE_CAJA', label: 'Posible precio de caja' }, { value: 'DIF_REPORTE', label: 'Difiere del reporte' }, { value: 'marcas', label: 'Logos de marcas que faltan' },
];
const ORIGEN = { producto: 'Foto del producto', grupo: 'Foto del grupo de equivalencia', marca: 'Logo de la marca (el producto no tiene foto propia)' };

async function api(url, opciones) {
    const res = await fetch(url, opciones);
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo.error || 'No se pudo completar');
    return cuerpo;
}
const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const txt = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const aNum = (s) => (String(s).trim() === '' ? null : parseNumero(s));
const usd = (n) => (Number.isFinite(n) ? `$${n.toLocaleString('es-VE', { maximumFractionDigits: 4 })}` : '—');
const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const copiar = (texto) => {
    navigator.clipboard?.writeText(String(texto)).then(
        () => notifications.show({ color: 'teal', message: `Código ${texto} copiado`, autoClose: 1000 }),
        () => notifications.show({ color: 'red', message: 'No se pudo copiar' }),
    );
};

// Asistente único: una ficha por producto con su FOTO (producto → grupo → marca) y sus DATOS (costo, precios, presentación, caja, bulto).
export default function AuditarPage() {
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 48em)');
    const [filtro, setFiltro] = useState('pendiente');
    const [cola, setCola] = useState([]);
    const [conteo, setConteo] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [editorTarget, setEditorTarget] = useState(null); // { tipo, id, nombre, marca }: foto que se está cambiando (la del producto o una relacionada)
    const [form, setForm] = useState(null);
    const omitidos = useRef(new Set());
    const hechos = useRef(0);

    const cargar = useCallback(async (f) => {
        setCargando(true); setError('');
        try {
            const d = await api(`/api/inventario/auditoria?filtro=${f}&limite=20&excluir=${[...omitidos.current].join(',')}`);
            setCola(d.items); setConteo(d.conteo);
        } catch (e) { setError(e.message); } finally { setCargando(false); }
    }, []);
    useEffect(() => { omitidos.current = new Set(); hechos.current = 0; cargar(filtro); }, [filtro, cargar]);

    const actual = cola[0];
    const claveActual = actual?.clave;
    useEffect(() => {
        const d = actual?.datos;
        if (!d) { setForm(null); return; }
        setForm({ costoUsd: txt(d.costoUsd || ''), precio6: txt(d.precio6 || ''), precio7: txt(d.precio7 || ''), porcentajeIva: txt(d.porcentajeIva), presentacion: d.presentacion,
            unidadesPorCaja: txt(d.unidadesPorCaja ?? ''), cajasPorBulto: txt(d.cajasPorBulto ?? ''), unidadesPorBulto: txt(d.unidadesPorBulto ?? '') });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claveActual]);

    const avanzar = useCallback(() => {
        hechos.current += 1;
        setCola((c) => { const r = c.slice(1); if (!r.length) setTimeout(() => cargar(filtro), 0); return r; });
    }, [cargar, filtro]);
    const saltar = () => { omitidos.current.add(actual.clave); setCola((c) => { const r = c.slice(1); if (!r.length) setTimeout(() => cargar(filtro), 0); return r; }); };
    const cambiarFoto = (foto) => setCola((c) => [{ ...c[0], foto: { ...c[0].foto, ...foto } }, ...c.slice(1)]);

    // Lo que cambió en los datos respecto a lo guardado
    const upcN = form ? aNum(form.unidadesPorCaja) : null;
    const cambios = useMemo(() => {
        if (!actual?.datos || !form) return {};
        const d = actual.datos, c = {};
        ['costoUsd', 'precio6', 'precio7', 'porcentajeIva'].forEach((k) => { const n = aNum(form[k]); if ((n ?? 0) !== (d[k] ?? 0)) c[k] = n ?? 0; });
        if (form.presentacion !== d.presentacion) c.presentacion = form.presentacion;
        const upc = aNum(form.unidadesPorCaja);
        if ((upc ?? null) !== (d.unidadesPorCaja ?? null) || (upc > 1 && (aNum(form.cajasPorBulto) ?? 1) !== (d.cajasPorBulto ?? 1))) { c.unidadesPorCaja = upc || null; c.cajasPorBulto = upc > 1 ? (aNum(form.cajasPorBulto) || 1) : null; }
        // Sin caja: dejar en blanco "unidades por bulto" ya no significa "bulto de 1", significa que el producto no viene en bulto
        if (!(upc > 1)) { const nb = aNum(form.unidadesPorBulto); if (nb !== (d.unidadesPorBulto ?? null)) c.unidadesPorBulto = nb; }
        return c;
    }, [actual, form]);
    const hayCambios = Object.keys(cambios).length > 0;
    const foto = actual?.foto;

    const enviar = async () => {
        if (!actual || ocupado) return;
        setOcupado(true);
        try {
            const marcaFoto = foto.estado === 'PENDIENTE' ? 'APROBADA' : foto.estado === 'FALTA' ? 'OMITIDA' : null;
            const r = await post('/api/inventario/auditoria', {
                accion: hayCambios ? 'GUARDAR' : 'APROBAR', ids: actual.idsDatos || [], cambios,
                foto: marcaFoto ? { tipo: foto.entidad.tipo, id: foto.entidad.id, estado: marcaFoto } : null,
            });
            if (r.pendiente) {
                // Sigue faltando algo bloqueante (costo, precio 7...): no se cierra del todo, reaparecerá después de las fichas nunca revisadas
                omitidos.current.add(actual.clave);
                notifications.show({ color: 'yellow', message: 'Guardado, pero sigue faltando algo: la verás más adelante', autoClose: 1800 });
            } else {
                notifications.show({ color: 'teal', message: hayCambios ? 'Cambios guardados' : 'Revisado', autoClose: 1200 });
            }
            avanzar();
        } catch (e) { notifications.show({ color: 'red', title: 'No se guardó', message: e.message }); } finally { setOcupado(false); }
    };

    // Guarda la foto del target abierto en el editor: la del producto/grupo/marca principal, o una relacionada (marca/grupo aparte)
    const guardarFoto = async (nombre) => {
        const t = editorTarget;
        await post('/api/inventario/imagenes-auditoria', { tipo: t.tipo, id: t.id, accion: 'CAMBIAR', imagen: nombre });
        const nuevaUrl = `${BLOB}/${nombre}`;
        if (t.tipo === foto.entidad.tipo && t.id === foto.entidad.id) {
            cambiarFoto({ estado: 'OK', tienePropia: true, url: nuevaUrl, origen: t.tipo === 'grupo' ? 'grupo' : t.tipo === 'marca' ? 'marca' : 'producto', puntaje: null, fuente: null, pagina: null });
        }
        setCola((c) => [{
            ...c[0],
            grupo: c[0].grupo && t.tipo === 'grupo' && c[0].grupo.id === t.id ? { ...c[0].grupo, url: nuevaUrl } : c[0].grupo,
            marcasInfo: c[0].marcasInfo?.map((m) => (t.tipo === 'marca' && m.id === t.id ? { ...m, url: nuevaUrl } : m)),
        }, ...c.slice(1)]);
        setEditorTarget(null);
    };
    const quitarFoto = async () => {
        if (!window.confirm('¿Quitar esta foto? Quedará como "falta la foto".')) return;
        try {
            await post('/api/inventario/imagenes-auditoria', { tipo: foto.entidad.tipo, id: foto.entidad.id, accion: 'QUITAR' });
            cambiarFoto({ estado: 'FALTA', tienePropia: false, url: actual.marcaImagen || null, origen: actual.marcaImagen ? 'marca' : null, puntaje: null, fuente: null, pagina: null });
        } catch (e) { notifications.show({ color: 'red', message: e.message }); }
    };

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.currentTarget ? e.currentTarget.value : e }));
    const costo = aNum(form?.costoUsd), p6 = aNum(form?.precio6), p7 = aNum(form?.precio7);
    const margen6 = costo > 0 && p6 > 0 ? ((p6 - costo) / costo) * 100 : null;
    const margen7 = p6 > 0 && p7 > 0 ? ((p7 - p6) / p6) * 100 : null;
    const sugerenciaP7 = p6 > 0 && !(p7 > 0) && conteo?.margenP7 != null ? p6 * (1 + conteo.margenP7) : null;
    const bulto = upcN > 1 ? upcN * (aNum(form?.cajasPorBulto) || 1) : aNum(form?.unidadesPorBulto) || null;
    const ref = actual?.referencia;
    const busqueda = actual ? `https://www.google.com/search?q=${encodeURIComponent(`${actual.nombre} ${actual.marcas?.[0] || ''}`.trim())}&udm=2` : '#';
    const etiquetaBoton = actual?.tipo === 'marca' ? (foto.estado === 'OK' ? 'Listo, siguiente' : 'Sin logo por ahora, siguiente')
        : hayCambios ? 'Guardar cambios y siguiente' : foto?.estado === 'FALTA' ? 'Sin foto por ahora, siguiente' : 'Todo bien, siguiente';

    return (
        <Box px={isMobile ? 'xs' : 'md'} py="sm" maw={980} mx="auto">
            <Button variant="subtle" color="gray.3" size="compact-sm" leftSection={<IconChevronLeft size={16} />} onClick={() => router.push('/superuser/inventario/productos')}>Inventario</Button>
            <Title order={2} c="white" fz={isMobile ? 22 : 28} tt="none" pb={0}>Auditar fotos y precios</Title>
            <Text size="sm" c="gray.4" mb="sm">Una ficha por producto: revisa su foto, el costo, los precios 6 y 7 y el empaque. Lo que cambies vale para todas sus marcas.</Text>

            <Select mb="xs" bg="white" data={FILTROS} value={filtro} onChange={(v) => v && setFiltro(v)} allowDeselect={false} />
            {conteo && (
                <Group gap="xs" mb="sm">
                    <Badge color="teal" variant="light">Datos revisados: {conteo.aprobados}</Badge>
                    <Badge color="gray" variant="light">Fichas pendientes: {conteo.fichas}</Badge>
                    <Badge color="red" variant="light">Dudosas: {conteo.dudosos}</Badge>
                    <Badge color="violet" variant="light">Fotos por revisar: {conteo.fotosPorRevisar}</Badge>
                    <Badge color="orange" variant="light">Sin foto: {conteo.fotosFaltan}</Badge>
                    <Badge color="red" variant="outline">Sin precio 7: {conteo.SIN_P7}</Badge>
                    {conteo.margenP7 != null && <Badge color="grape" variant="light">Precio 7 promedio: +{Math.round(conteo.margenP7 * 100)} % sobre el 6</Badge>}
                </Group>
            )}
            {error && <Alert color="red" mb="sm">{error}</Alert>}

            {cargando && !actual ? <Group justify="center" py={80}><Loader /></Group> : !actual ? (
                <Paper withBorder radius="md" p="xl" ta="center" bg="white">
                    <IconCheck size={48} color="var(--mantine-color-teal-6)" />
                    <Title order={3} mt="xs">No hay más fichas con este filtro</Title>
                    <Text c="dimmed" mt={4}>{hechos.current ? `Esta sesión revisaste ${hechos.current}.` : 'Todo al día.'}</Text>
                    {filtro !== 'pendiente' && <Button mt="md" variant="light" onClick={() => setFiltro('pendiente')}>Ver todo lo pendiente</Button>}
                </Paper>
            ) : (
                <Card withBorder radius="md" p={isMobile ? 'sm' : 'md'} bg="white">
                    <Stack gap="sm">
                        <Box>
                            <Text fw={800} fz={isMobile ? 'lg' : 'xl'} lh={1.2}>{actual.nombre}</Text>
                            <Text size="sm" c="dimmed">
                                {actual.tipo === 'marca' ? 'Marca' : (
                                    <Text span style={{ cursor: 'pointer' }} onClick={() => copiar(actual.base)} title="Clic para copiar el código">
                                        Código {actual.base} <IconCopy size={12} style={{ verticalAlign: -1 }} />
                                    </Text>
                                )}
                                {actual.categoria ? ` · ${actual.categoria}` : ''}
                            </Text>
                            {actual.tipo === 'producto' && (
                                <Group gap={4} mt={4}>
                                    {actual.variantes.map((v) => (
                                        <Badge key={v.id} size="sm" variant="light" tt="none" style={{ cursor: 'pointer' }} onClick={() => copiar(v.codigo)} title="Clic para copiar el código">
                                            {v.codigo}{v.marca ? ` · ${v.marca}` : ''}
                                        </Badge>
                                    ))}
                                    <Text size="xs" c="dimmed">{actual.variantes.length > 1 ? `Se aplica a ${actual.variantes.length} marcas` : 'Una sola marca'} · Quedan {cola.length}+</Text>
                                </Group>
                            )}
                        </Box>

                        {/* ---- FOTO ---- */}
                        <Paper withBorder radius="md" p="xs" bg="gray.0">
                            {foto.url
                                ? <Image src={foto.url} alt={actual.nombre} h={isMobile ? 260 : 340} fit="contain" radius="md" bg="white" />
                                : <Box h={isMobile ? 180 : 220} style={{ border: '2px dashed var(--mantine-color-gray-4)', borderRadius: 12, display: 'grid', placeItems: 'center' }}>
                                    <Stack align="center" gap={4}><IconCamera size={44} color="var(--mantine-color-gray-5)" /><Text c="dimmed" fw={600}>No tiene foto</Text></Stack>
                                </Box>}
                            <Group gap={6} mt="xs">
                                {foto.origen && <Badge variant="outline" color="gray" tt="none">{ORIGEN[foto.origen]}{foto.origen === 'grupo' && foto.grupo ? `: ${foto.grupo}` : ''}</Badge>}
                                {foto.estado === 'FALTA' && <Badge color="red">Falta la foto</Badge>}
                                {foto.estado === 'OMITIDA' && <Badge color="orange">Sin foto (la dejaste para después)</Badge>}
                                {foto.estado === 'OK' && <Badge color="teal" variant="light">Foto revisada</Badge>}
                                {foto.estado === 'PENDIENTE' && <Badge color={foto.puntaje !== null && foto.puntaje < 0.7 ? 'red' : foto.puntaje !== null && foto.puntaje < 0.9 ? 'yellow' : 'teal'}>{foto.puntaje === null ? 'Foto por revisar' : `Coincidencia ${Math.round(foto.puntaje * 100)} %`}</Badge>}
                                {foto.estado === 'PENDIENTE' && foto.fuente && <Text size="xs" c="dimmed">Salió de <Anchor href={foto.pagina || foto.fuente} target="_blank" size="xs">{dominio(foto.pagina || foto.fuente)}</Anchor></Text>}
                            </Group>
                            <Group gap="xs" mt="xs">
                                <Button size="compact-md" variant="light" color="orange" leftSection={<IconPhotoEdit size={16} />} onClick={() => setEditorTarget({ tipo: foto.entidad.tipo, id: foto.entidad.id, nombre: actual.nombre, marca: actual.marcas?.[0] })}>{foto.tienePropia ? 'Cambiar foto' : 'Agregar foto'}</Button>
                                <Button size="compact-md" variant="default" component="a" href={busqueda} target="_blank" leftSection={<IconBrandGoogle size={16} />}>Buscar en Google</Button>
                                {foto.tienePropia && <Button size="compact-md" variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={quitarFoto}>Quitar</Button>}
                            </Group>
                        </Paper>

                        {/* ---- FOTOS RELACIONADAS (marca de cada variante y grupo de equivalencia): también se pueden cambiar, aparte de la del producto ---- */}
                        {actual.tipo === 'producto' && (actual.grupo || actual.marcasInfo?.length > 0) && (
                            <Paper withBorder radius="md" p="xs" bg="gray.0">
                                <Text size="xs" fw={700} c="dimmed" mb={6}>Otras fotos relacionadas (se comparten con más productos)</Text>
                                <Group gap="sm" align="flex-start">
                                    {actual.grupo && (
                                        <Stack gap={4} align="center" w={84}>
                                            {actual.grupo.url
                                                ? <Image src={actual.grupo.url} w={72} h={72} fit="contain" radius="sm" bg="white" style={{ border: '1px solid var(--mantine-color-gray-3)' }} />
                                                : <Box w={72} h={72} style={{ border: '2px dashed var(--mantine-color-gray-4)', borderRadius: 8, display: 'grid', placeItems: 'center' }}><IconCamera size={20} color="var(--mantine-color-gray-5)" /></Box>}
                                            <Text size="xs" ta="center" lineClamp={2}>{actual.grupo.nombre}</Text>
                                            <Button size="compact-xs" variant="light" fullWidth onClick={() => setEditorTarget({ tipo: 'grupo', id: actual.grupo.id, nombre: actual.grupo.nombre })}>Grupo</Button>
                                        </Stack>
                                    )}
                                    {actual.marcasInfo?.map((m) => (
                                        <Stack key={m.id} gap={4} align="center" w={84}>
                                            {m.url
                                                ? <Image src={m.url} w={72} h={72} fit="contain" radius="sm" bg="white" style={{ border: '1px solid var(--mantine-color-gray-3)' }} />
                                                : <Box w={72} h={72} style={{ border: '2px dashed var(--mantine-color-gray-4)', borderRadius: 8, display: 'grid', placeItems: 'center' }}><IconCamera size={20} color="var(--mantine-color-gray-5)" /></Box>}
                                            <Text size="xs" ta="center" lineClamp={2}>{m.nombre}</Text>
                                            <Button size="compact-xs" variant="light" fullWidth onClick={() => setEditorTarget({ tipo: 'marca', id: m.id, nombre: m.nombre })}>Marca</Button>
                                        </Stack>
                                    ))}
                                </Group>
                            </Paper>
                        )}

                        {/* ---- DATOS ---- */}
                        {actual.datos && form && (
                            <>
                                {actual.alertas.filter((a) => TEXTOS[a]).map((a) => <Alert key={a} color={TEXTOS[a][1]} variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>{TEXTOS[a][0]}</Alert>)}
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
                                    <TextInput label="Precio 7 (detal)" inputMode="decimal" value={form.precio7} onChange={set('precio7')}
                                        description={margen7 !== null ? `${margen7.toFixed(0)} % sobre el 6` : sugerenciaP7 !== null ? `Sugerido ~${usd(sugerenciaP7)} (+${Math.round(conteo.margenP7 * 100)} % sobre el 6)` : undefined} />
                                    <Box>
                                        <Text size="sm" fw={500} mb={6}>IVA</Text>
                                        <Checkbox mt={4} label={aNum(form.porcentajeIva) === 16 ? 'Con IVA (16 %)' : 'Sin IVA (0 %)'} checked={aNum(form.porcentajeIva) === 16}
                                            onChange={(e) => setForm((f) => ({ ...f, porcentajeIva: e.currentTarget.checked ? '16' : '0' }))} />
                                    </Box>
                                </SimpleGrid>
                                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                                    <Select label="Presentación (una unidad es…)" data={PRESENTACIONES} value={form.presentacion} onChange={(v) => v && setForm((f) => ({ ...f, presentacion: v }))} allowDeselect={false} />
                                    <TextInput label="Unidades por caja" placeholder="sin caja" inputMode="numeric" value={form.unidadesPorCaja} onChange={set('unidadesPorCaja')} />
                                    {upcN > 1
                                        ? <TextInput label="Cajas por bulto" inputMode="numeric" value={form.cajasPorBulto} onChange={set('cajasPorBulto')} />
                                        : <TextInput label="Unidades por bulto" placeholder="sin bulto" inputMode="numeric" value={form.unidadesPorBulto} onChange={set('unidadesPorBulto')} />}
                                    <TextInput label="Total por bulto" value={bulto ? `${bulto.toLocaleString('es-VE')} unid.` : 'Sin bulto'} readOnly variant="filled" />
                                </SimpleGrid>
                            </>
                        )}

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                            <Button size="lg" color={hayCambios ? 'blue' : 'teal'} loading={ocupado} leftSection={hayCambios ? <IconDeviceFloppy size={22} /> : <IconCheck size={22} />} onClick={enviar}>{etiquetaBoton}</Button>
                            <Button size="lg" variant="default" leftSection={<IconPlayerSkipForward size={22} />} onClick={saltar}>Saltar</Button>
                        </SimpleGrid>
                        {hayCambios && <Text size="xs" c="dimmed">Cambiarás: {Object.keys(cambios).join(', ')}</Text>}
                    </Stack>
                </Card>
            )}

            <EditorFoto item={editorTarget} opened={Boolean(editorTarget)} onClose={() => setEditorTarget(null)} onGuardar={guardarFoto} />
        </Box>
    );
}
