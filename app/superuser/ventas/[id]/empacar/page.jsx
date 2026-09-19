'use client';

import React, { useRef, useState } from 'react';
import {
    Container, Stack, Paper, Title, Text, Badge, Button, Group, Progress, Image, TextInput, NumberInput,
    Textarea, Alert, Center, Loader, ActionIcon, Radio, SimpleGrid, ThemeIcon,
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
    IconPackage, IconScan, IconPhotoOff, IconCamera, IconCheck, IconAlertTriangle, IconArrowLeft, IconLock,
} from '@tabler/icons-react';
import EscanerCodigo, { escanerDisponible } from '../../_components/EscanerCodigo';

// La foto del teléfono pesa varios MB y el servidor acepta ~4 MB: se reduce y se comprime antes de subirla
async function comprimirFoto(archivo, maxLado = 1600, calidad = 0.8) {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad));
}

function Aviso({ titulo, texto, volver }) {
    return (
        <Container size="xs" py="xl">
            <Alert color="gray" title={titulo} icon={<IconLock size={18} />}>
                <Text size="sm" mb="md">{texto}</Text>
                <Button variant="light" leftSection={<IconArrowLeft size={16} />} onClick={volver}>Volver al pedido</Button>
            </Alert>
        </Container>
    );
}

export default function EmpacarPage() {
    const { id } = useParams();
    const router = useRouter();
    const inputFoto = useRef(null);

    const [comenzado, setComenzado] = useState(false);
    const [codigo, setCodigo] = useState('');
    const [escaneado, setEscaneado] = useState(false);
    const [marca, setMarca] = useState('');
    const [conteo, setConteo] = useState({ BULTO: '', CAJA: '', UNIDAD: '' }); // lo que el empacador cuenta por nivel
    const [motivo, setMotivo] = useState('');
    const [errorItem, setErrorItem] = useState(null);
    const [aviso, setAviso] = useState(null); // { tipo: 'error' | 'aviso' | 'ok', titulo, detalle } sobre el código escaneado
    const [enviando, setEnviando] = useState(false);
    const [verEscaner, setVerEscaner] = useState(false);
    const [tipoFoto, setTipoFoto] = useState(null);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['empaque', id],
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const res = await fetch(`/api/ventas/${id}/empaque`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo cargar el empaque');
            return res.json();
        },
    });

    const volver = () => router.push(`/superuser/ventas/${id}`);
    if (isLoading) return <Center h="60vh"><Loader /></Center>;
    if (!data) return <Aviso titulo="No se pudo cargar" texto="Revisa tu conexión e intenta de nuevo." volver={volver} />;

    const { venta, items, esEmpacador } = data;
    if (!esEmpacador) return <Aviso titulo="Este empaque no es tuyo" texto={`Solo ${venta.empacadorNombre || 'la persona asignada'} puede empacar este pedido.`} volver={volver} />;
    if (venta.empacadoAt) return <Aviso titulo="Empaque ya firmado" texto="La evidencia quedó guardada y ya no se puede modificar." volver={volver} />;
    if (['Cancelado', 'Completado'].includes(venta.statusDespacho)) return <Aviso titulo="Pedido cerrado" texto="Este pedido ya no admite empaque." volver={volver} />;

    const hechos = items.filter((i) => i.estado === 'OK').length;
    const actual = items.find((i) => i.estado !== 'OK');
    const empezado = comenzado || hechos > 0 || Boolean(venta.empaqueIniciadoAt);

    const limpiar = () => { setCodigo(''); setEscaneado(false); setMarca(''); setConteo({ BULTO: '', CAJA: '', UNIDAD: '' }); setMotivo(''); setErrorItem(null); setAviso(null); };

    // Pregunta al servidor qué se tiene en la mano según el código (no guarda nada)
    const comprobarCodigo = async (valor, escaneo) => {
        if (!actual || String(valor || '').trim().length < 4) return;
        try {
            const res = await fetch(`/api/ventas/${id}/empaque`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'COMPROBAR_CODIGO', detalleId: actual.detalleId, codigo: valor, escaneado: escaneo }),
            });
            const r = await res.json();
            if (!res.ok) { setAviso({ tipo: 'error', titulo: 'NO SE PUDO COMPROBAR', detalle: r.error || 'Intenta de nuevo.' }); return; }
            setAviso(r.alerta || { tipo: 'ok', titulo: 'CÓDIGO CORRECTO', detalle: 'Es el producto y la presentación que piden.' });
        } catch {
            setAviso({ tipo: 'error', titulo: 'SIN CONEXIÓN', detalle: 'No se pudo comprobar el código.' });
        }
    };

    const confirmarItem = async () => {
        setEnviando(true);
        setErrorItem(null);
        try {
            const res = await fetch(`/api/ventas/${id}/empaque`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'VERIFICAR_ITEM', detalleId: actual.detalleId, codigo, escaneado, marcaElegida: marca, empacado: { bultos: Number(conteo.BULTO || 0), cajas: Number(conteo.CAJA || 0), sueltas: Number(conteo.UNIDAD || 0) }, observacion: motivo }),
            });
            const r = await res.json();
            if (!res.ok) { if (r.alerta) { setAviso(r.alerta); setErrorItem(null); } else setErrorItem(r.error || 'No se pudo verificar'); return; }
            if (r.estado === 'NOVEDAD') notifications.show({ title: 'Novedad reportada', message: 'Avisamos a administración.', color: 'orange' });
            limpiar();
            await refetch();
        } catch {
            setErrorItem('Sin conexión. Intenta de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const subirFoto = async (archivo) => {
        if (!archivo || !tipoFoto) return;
        setEnviando(true);
        try {
            const blob = await comprimirFoto(archivo);
            const res = await fetch(`/api/ventas/${id}/empaque/foto?tipo=${tipoFoto}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
            const r = await res.json();
            if (!res.ok) throw new Error(r.error || 'No se pudo guardar la foto');
            await refetch();
        } catch (e) {
            notifications.show({ title: 'Error con la foto', message: e.message, color: 'red' });
        } finally {
            setEnviando(false);
            setTipoFoto(null);
            if (inputFoto.current) inputFoto.current.value = '';
        }
    };

    const tomarFoto = (tipo) => { setTipoFoto(tipo); setTimeout(() => inputFoto.current?.click(), 0); };

    const confirmarEmpaque = async () => {
        setEnviando(true);
        try {
            const res = await fetch(`/api/ventas/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'FIRMAR_EMPAQUE' }) });
            const r = await res.json();
            if (!res.ok) throw new Error(r.error || 'No se pudo confirmar');
            notifications.show({ title: 'Empaque confirmado', message: `Pedido ${venta.numeroDocumento} listo, a tu nombre.`, color: 'teal' });
            router.replace(`/superuser/ventas/${id}`);
        } catch (e) {
            notifications.show({ title: 'Error', message: e.message, color: 'red' });
            setEnviando(false);
        }
    };

    const Cabecera = (
        <Stack gap={4}>
            <Group justify="space-between">
                <Text fw={700}>Pedido {venta.numeroDocumento}</Text>
                <Badge variant="light">{hechos}/{items.length}</Badge>
            </Group>
            <Progress value={(hechos / Math.max(items.length, 1)) * 100} size="lg" radius="xl" />
        </Stack>
    );

    // ---------- Inicio ----------
    if (!empezado) {
        return (
            <Container size="xs" py="md">
                <Paper withBorder p="lg" radius="md">
                    <Stack align="center" ta="center">
                        <ThemeIcon size={64} radius="xl" variant="light"><IconPackage size={36} /></ThemeIcon>
                        <Title order={3}>Empacar pedido {venta.numeroDocumento}</Title>
                        <Text size="sm">Son <b>{items.length}</b> producto(s). Vas a comprobar cada uno y tomar fotos de la caja.</Text>
                        <Alert color="blue" variant="light" ta="left">
                            Al confirmar, el pedido queda empacado <b>a tu nombre</b> con hora y fotos. Nadie más puede modificarlo después.
                        </Alert>
                        <Button size="lg" fullWidth onClick={() => setComenzado(true)}>Empezar</Button>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    // ---------- Un producto por pantalla ----------
    if (actual) {
        const bloqueado = actual.estado === 'NOVEDAD';
        // Lo que hay que entregar por nivel; sin desglose (renglón manual) se cuenta el total en unidades
        const niveles = actual.entrega?.length ? actual.entrega : [{ nivel: 'UNIDAD', cantidad: actual.cantidadPedida, unidadesCada: 1, nombre: 'unidades' }];
        const completo = niveles.every((n) => conteo[n.nivel] !== '' && conteo[n.nivel] != null);
        const diferente = completo && niveles.some((n) => Number(conteo[n.nivel]) !== n.cantidad);
        const identificado = actual.modo === 'codigo' ? codigo.trim().length >= 4 : actual.modo === 'marca' ? Boolean(marca) : true;
        const listo = identificado && completo && (!diferente || motivo.trim().length >= 5);
        const de = { BULTO: 'del BULTO', CAJA: 'de la CAJA', UNIDAD: 'de la UNIDAD' };
        const soloUnidad = actual.nivelRequerido === 'UNIDAD';
        const dondeCodigo = (actual.nivelesCodigo || []).map((n) => de[n]).join(' o ');
        const etiquetaCodigo = !actual.nivelesCodigo?.length
            ? 'Código de barras (de cualquier presentación de este producto)'
            : actual.nivelesCodigo?.length > 1 || (soloUnidad && actual.nivelesCodigo?.[0] !== 'UNIDAD')
            ? `Código de barras (${dondeCodigo}${soloUnidad ? ', o de donde las sacaste' : ''})`
            : `Código de barras ${dondeCodigo}`;

        return (
            <Container size="xs" py="md">
                <Stack>
                    {Cabecera}
                    <Paper withBorder p="md" radius="md">
                        <Stack gap="sm">
                            {actual.imagen
                                ? <Image src={actual.imagen} h={230} fit="contain" alt={actual.nombre} />
                                : <Center h={160}><IconPhotoOff size={48} color="gray" /></Center>}
                            <Title order={3}>{actual.nombre}</Title>
                            {actual.marca && <Text c="dimmed" size="sm">Marca: {actual.marca}</Text>}
                            {/* Qué hay que meter, por nivel: no es lo mismo una caja de 100 que 100 unidades sueltas */}
                            <Stack gap={4}>
                                {niveles.map((n) => (
                                    <Badge key={n.nivel} size="xl" color={n.nivel === 'UNIDAD' ? 'blue' : 'grape'} variant="filled" radius="sm" tt="none" h="auto" py={6} styles={{ label: { whiteSpace: 'normal' } }}>
                                        {n.cantidad} {n.nombre}{n.nivel === 'UNIDAD' && niveles.length > 1 ? ' sueltas' : ''}{n.nivel !== 'UNIDAD' ? ` cerrada${n.cantidad === 1 ? '' : 's'} (${n.unidadesCada} ${n.unidadCorta || 'und'} c/u)` : ''}
                                    </Badge>
                                ))}
                                {niveles.length > 0 && actual.entrega?.length > 0 && <Text size="xs" c="dimmed">Total: {actual.cantidadPedida} unidades</Text>}
                            </Stack>

                            {bloqueado ? (
                                <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Novedad reportada">
                                    Dijiste {[actual.bultosEmpacados > 0 && `${actual.bultosEmpacados} bulto(s)`, actual.cajasEmpacadas > 0 && `${actual.cajasEmpacadas} caja(s)`, actual.sueltasEmpacadas > 0 && `${actual.sueltasEmpacadas} suelta(s)`].filter(Boolean).join(' + ') || `${actual.cantidadEmpacada} unidades`} y se pedía {actual.entregaTexto || `${actual.cantidadPedida} unidades`}: “{actual.observacion}”. Administración fue avisada; podrás continuar cuando la resuelva.
                                    <Button mt="sm" variant="light" onClick={() => refetch()}>Revisar si ya se resolvió</Button>
                                </Alert>
                            ) : (
                                <>
                                    {actual.modo === 'codigo' && (
                                        <TextInput
                                            label={etiquetaCodigo} size="md" value={codigo} autoComplete="off" inputMode="numeric"
                                            description={`${actual.nivelRequerido && actual.nivelRequerido !== 'UNIDAD' ? 'No sirve el código de una unidad suelta. ' : ''}Escríbelo (o solo sus últimos 4 dígitos)${escanerDisponible() ? ' o escanéalo con la cámara' : ''}`}
                                            onChange={(e) => { setCodigo(e.currentTarget.value); setEscaneado(false); setAviso(null); }}
                                            rightSection={escanerDisponible() ? <ActionIcon variant="light" size="lg" onClick={() => setVerEscaner(true)}><IconScan size={20} /></ActionIcon> : null}
                                        />
                                    )}
                                    {actual.modo === 'codigo' && codigo.trim().length >= 4 && !aviso && (
                                        <Button variant="light" onClick={() => comprobarCodigo(codigo, escaneado)}>Comprobar el código</Button>
                                    )}
                                    {aviso && (
                                        <Alert
                                            color={aviso.tipo === 'ok' ? 'teal' : aviso.tipo === 'aviso' ? 'yellow' : 'red'} variant={aviso.tipo === 'error' ? 'filled' : 'light'}
                                            icon={aviso.tipo === 'ok' ? <IconCheck size={26} /> : <IconAlertTriangle size={26} />}
                                            title={<Text fw={900} fz={aviso.tipo === 'error' ? 22 : 16} lh={1.2} tt="uppercase">{aviso.titulo}</Text>}
                                        >
                                            <Text fw={aviso.tipo === 'ok' ? 500 : 700} fz={aviso.tipo === 'error' ? 17 : 14}>{aviso.detalle}</Text>
                                        </Alert>
                                    )}
                                    {actual.modo === 'marca' && actual.nivelRequerido && actual.nivelRequerido !== 'UNIDAD' && <Alert color="gray" variant="light">Esta presentación no tiene código de barras registrado: se comprueba por la marca del empaque.</Alert>}
                                    {actual.modo === 'marca' && (
                                        <Radio.Group label="¿Qué marca dice el empaque del producto que tomaste?" value={marca} onChange={setMarca}>
                                            <SimpleGrid cols={2} mt="xs">
                                                {actual.opcionesMarca?.map((m) => <Radio key={m} value={m} label={m} />)}
                                            </SimpleGrid>
                                        </Radio.Group>
                                    )}
                                    {actual.modo === 'manual' && <Alert color="gray" variant="light">Este producto no tiene código ni marca registrada: compáralo con la foto.</Alert>}

                                    {niveles.map((n) => (
                                        <NumberInput
                                            key={n.nivel} size="lg" value={conteo[n.nivel]} onChange={(v) => setConteo((c) => ({ ...c, [n.nivel]: v }))}
                                            label={n.nivel === 'UNIDAD' ? (niveles.length > 1 ? '¿Cuántas unidades sueltas metiste?' : '¿Cuántas unidades metiste en la caja?') : `¿Cuántas ${n.nivel === 'CAJA' ? 'cajas' : 'bultos'} cerrad${n.nivel === 'CAJA' ? 'as' : 'os'} metiste?`}
                                            min={0} allowDecimal={false} allowNegative={false} hideControls inputMode="numeric" placeholder="Escribe la cantidad"
                                        />
                                    ))}
                                    {diferente && (
                                        <>
                                            <Alert color="orange" icon={<IconAlertTriangle size={18} />}>
                                                No coincide con lo pedido ({actual.entregaTexto || `${actual.cantidadPedida} unidades`}). Explica el motivo; se avisará a administración y el pedido no avanza hasta que lo resuelvan.
                                            </Alert>
                                            <Textarea label="Motivo" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} minRows={2} autosize />
                                        </>
                                    )}
                                    {errorItem && <Alert color="red" icon={<IconAlertTriangle size={18} />}>{errorItem}</Alert>}
                                    <Button size="lg" color={diferente ? 'orange' : 'teal'} disabled={!listo} loading={enviando} onClick={confirmarItem} leftSection={<IconCheck size={20} />}>
                                        {diferente ? 'Reportar novedad' : 'Confirmar producto'}
                                    </Button>
                                </>
                            )}
                        </Stack>
                    </Paper>
                </Stack>
                <EscanerCodigo opened={verEscaner} onClose={() => setVerEscaner(false)} onDetectar={(v) => { setCodigo(v); setEscaneado(true); setVerEscaner(false); comprobarCodigo(v, true); }} />
            </Container>
        );
    }

    // ---------- Fotos de la caja y confirmación ----------
    const paso = !venta.fotoCajaAbiertaUrl ? 'abierta' : !venta.fotoCajaSelladaUrl ? 'sellada' : 'confirmar';
    return (
        <Container size="xs" py="md">
            <Stack>
                {Cabecera}
                <Paper withBorder p="md" radius="md">
                    <Stack>
                        {paso !== 'confirmar' ? (
                            <>
                                <Title order={4}>{paso === 'abierta' ? 'Foto de la caja abierta' : 'Foto de la caja sellada'}</Title>
                                <Text size="sm">{paso === 'abierta'
                                    ? 'Toma una foto de la caja con todos los productos adentro, antes de cerrarla.'
                                    : 'Cierra y sella la caja, y toma la foto final.'}</Text>
                                {venta.fotoCajaAbiertaUrl && paso === 'sellada' && <Image src={venta.fotoCajaAbiertaUrl} h={120} fit="contain" alt="Caja abierta" />}
                                <Button size="lg" loading={enviando} leftSection={<IconCamera size={20} />} onClick={() => tomarFoto(paso)}>Tomar foto</Button>
                            </>
                        ) : (
                            <>
                                <Title order={4}>Todo verificado</Title>
                                <SimpleGrid cols={2}>
                                    <Image src={venta.fotoCajaAbiertaUrl} h={110} fit="cover" radius="sm" alt="Caja abierta" />
                                    <Image src={venta.fotoCajaSelladaUrl} h={110} fit="cover" radius="sm" alt="Caja sellada" />
                                </SimpleGrid>
                                <Stack gap={2}>
                                    {items.map((i) => <Text key={i.detalleId} size="sm">✓ {i.entregaTexto || `${i.cantidadEmpacada} unidades`} · {i.nombre}</Text>)}
                                </Stack>
                                <Alert color="blue" variant="light">
                                    Al confirmar, el pedido queda empacado a nombre de <b>{venta.empacadorNombre}</b>. No se puede modificar.
                                </Alert>
                                <Button size="lg" color="teal" loading={enviando} leftSection={<IconCheck size={20} />} onClick={confirmarEmpaque}>Confirmar empaque</Button>
                                <Button variant="subtle" color="gray" loading={enviando} onClick={() => tomarFoto('sellada')}>Repetir la foto de la caja sellada</Button>
                            </>
                        )}
                    </Stack>
                </Paper>
                {/* capture="environment" abre directamente la cámara trasera (no la galería) */}
                <input ref={inputFoto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => subirFoto(e.target.files?.[0])} />
            </Stack>
        </Container>
    );
}
