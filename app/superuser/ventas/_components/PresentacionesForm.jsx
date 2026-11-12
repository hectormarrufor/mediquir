'use client';

import React, { useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Checkbox, Divider, Image, NumberInput, Paper, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconScan } from '@tabler/icons-react';
import EscanerCodigo, { escanerDisponible } from './EscanerCodigo';

const OPCIONES = [{ value: 'SI', label: 'Sí viene' }, { value: 'NO_APLICA', label: 'No aplica' }, { value: 'NO_SE', label: 'No sé' }];

// Se muestra en el empaque cuando el producto no tiene registrada su caja ni su bulto: el empacador, con el producto en la mano,
// dice en qué presentaciones viene y escanea sus códigos de barras. «No aplica» y «no sé» se respetan (no se pide el código de ese nivel).
export default function PresentacionesForm({ item, ventaId, onListo }) {
    const p = item.presentaciones || {};
    const [confirma, setConfirma] = useState(false);
    const [unidad, setUnidad] = useState({ codigo: p.unidad?.codigo || '' });
    const [caja, setCaja] = useState({ estado: p.caja?.unidades ? 'SI' : 'NO_SE', unidades: p.caja?.unidades || '', codigo: p.caja?.codigo || '' });
    const [bulto, setBulto] = useState({ estado: p.bulto?.cajas || p.bulto?.unidades ? 'SI' : 'NO_SE', cajas: p.bulto?.cajas || '', unidades: p.bulto?.unidades || '', codigo: p.bulto?.codigo || '' });
    const [escaneando, setEscaneando] = useState(null); // 'unidad' | 'caja' | 'bulto'
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);

    const hayCaja = caja.estado === 'SI' || Boolean(p.caja?.unidades);
    const asignar = { unidad: (v) => setUnidad((x) => ({ ...x, codigo: v })), caja: (v) => setCaja((x) => ({ ...x, codigo: v })), bulto: (v) => setBulto((x) => ({ ...x, codigo: v })) };

    const campoCodigo = (nivel, valor, etiqueta) => (
        <TextInput
            label={etiqueta} placeholder="Escanéalo o escríbelo (déjalo vacío si no trae)" value={valor} inputMode="numeric" autoComplete="off"
            onChange={(e) => asignar[nivel](e.currentTarget.value)}
            rightSection={escanerDisponible() ? <ActionIcon variant="light" size="lg" onClick={() => setEscaneando(nivel)}><IconScan size={20} /></ActionIcon> : null}
        />
    );

    const guardar = async () => {
        setError(null);
        setEnviando(true);
        try {
            const res = await fetch(`/api/ventas/${ventaId}/empaque`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accion: 'GUARDAR_PRESENTACIONES', detalleId: item.detalleId, confirmaProducto: confirma, unidad, caja, bulto }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j.error || 'No se pudo guardar');
            notifications.show({ color: 'teal', message: j.confirmado ? 'Presentaciones guardadas: gracias, el producto queda actualizado.' : 'Guardado. Como quedó algo en «no sé», se le volverá a preguntar a quien lo empaque.' });
            onListo?.();
        } catch (e) {
            setError(e.message);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
                <Title order={4}>Este producto no tiene sus presentaciones registradas</Title>
                <Text size="sm">Con el producto en la mano, dinos en qué presentaciones viene y escanea sus códigos de barras. Así el sistema podrá comprobar los próximos empaques.</Text>

                {/* Énfasis: hay que estar seguro de que se tiene el producto correcto antes de registrar nada */}
                <Alert color="red" variant="filled" icon={<IconAlertTriangle size={24} />} title={<Text fw={900} fz={18} tt="uppercase">Asegúrate de que es el producto correcto</Text>}>
                    <Stack gap={6}>
                        {item.imagen && <Image src={item.imagen} h={140} fit="contain" alt={item.nombre} bg="white" radius="sm" />}
                        <Text fw={800} fz={18}>{item.nombre}</Text>
                        <Text fw={700}>Marca: {item.marca || '—'}{item.productoCodigo ? <Badge ml="xs" color="dark" variant="filled" tt="none">Código {item.productoCodigo}</Badge> : null}</Text>
                        <Text size="sm">Compara la marca, el nombre y el código con lo que dice el empaque. Si registras los datos de otro producto, quedarán mal para todos los pedidos.</Text>
                    </Stack>
                </Alert>
                <Checkbox size="md" checked={confirma} onChange={(e) => setConfirma(e.currentTarget.checked)} label={<Text fw={700} size="sm">Confirmo que el producto que tengo en la mano es exactamente este (marca, nombre y código).</Text>} />

                <Divider label="Unidad" />
                {campoCodigo('unidad', unidad.codigo, 'Código de barras de la UNIDAD (el par, el paquete o la pieza suelta)')}

                <Divider label="Caja" />
                <Text size="sm" fw={600}>¿Viene en caja cerrada?</Text>
                <SegmentedControl fullWidth value={caja.estado} onChange={(v) => setCaja((x) => ({ ...x, estado: v }))} data={OPCIONES} />
                {caja.estado === 'SI' && (
                    <>
                        <NumberInput label="¿Cuántas unidades trae cada caja?" min={1} allowDecimal={false} allowNegative={false} hideControls inputMode="numeric" value={caja.unidades} onChange={(v) => setCaja((x) => ({ ...x, unidades: v }))} />
                        {campoCodigo('caja', caja.codigo, 'Código de barras de la CAJA')}
                    </>
                )}

                <Divider label="Bulto" />
                <Text size="sm" fw={600}>¿Viene en bulto (varias cajas o un paquete grande)?</Text>
                <SegmentedControl fullWidth value={bulto.estado} onChange={(v) => setBulto((x) => ({ ...x, estado: v }))} data={OPCIONES} />
                {bulto.estado === 'SI' && (
                    <>
                        {hayCaja
                            ? <NumberInput label="¿Cuántas cajas trae el bulto?" min={1} allowDecimal={false} allowNegative={false} hideControls inputMode="numeric" value={bulto.cajas} onChange={(v) => setBulto((x) => ({ ...x, cajas: v }))} />
                            : <NumberInput label="¿Cuántas unidades trae el bulto?" min={1} allowDecimal={false} allowNegative={false} hideControls inputMode="numeric" value={bulto.unidades} onChange={(v) => setBulto((x) => ({ ...x, unidades: v }))} />}
                        {campoCodigo('bulto', bulto.codigo, 'Código de barras del BULTO')}
                    </>
                )}
                {(caja.estado === 'NO_SE' || bulto.estado === 'NO_SE') && <Text size="xs" c="dimmed">Lo que dejes en «No sé» se le volverá a preguntar a quien empaque este producto la próxima vez.</Text>}

                {error && <Alert color="red" variant="light">{error}</Alert>}
                <Button size="lg" loading={enviando} disabled={!confirma} onClick={guardar}>Guardar y continuar</Button>
            </Stack>
            <EscanerCodigo opened={Boolean(escaneando)} onClose={() => setEscaneando(null)} onDetectar={(v) => { if (escaneando) asignar[escaneando](v); setEscaneando(null); }} />
        </Paper>
    );
}
