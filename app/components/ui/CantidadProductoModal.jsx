'use client';

import React, { useEffect, useState } from 'react';
import { Button, Group, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import PrecioVisual from './PrecioVisual';
// Pregunta cuánto se agrega de un producto: por unidad (cuántas) o por caja (cuántas cajas y cuántas unidades trae cada una).
// presentaciones: las de presentacionesDe(producto) ({ clave, etiqueta, singular, plural, unidades }).
// maxUnidades: tope en unidades (p. ej. lo que queda en existencia); Infinity = sin tope.
// precio (opcional, POS y presupuestos): pregunta también el precio por unidad del renglón, que arranca con el de la tarifa.
//   { valor, simbolo: '$' | 'Bs', editable, etiqueta: 'P7 (Detal USD)', opciones: [{ etiqueta, valor }], equivalente: (v) => '≈ Bs …' }
//   Las opciones son los otros precios del producto en la misma moneda: un toque los pone en la caja.
// onConfirmar(claveDePresentacion, cantidadDePresentaciones, precioUnitario) -> el que lo usa agrega al carrito.
const iguales = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0005;

export default function CantidadProductoModal({ opened, onClose, nombre, presentaciones, claveInicial = 'UNIDAD', maxUnidades = Infinity, onConfirmar, zIndex, precio = null, ocultarExistencias = false }) {
    const movil = useMediaQuery('(max-width: 48em)');
    const [clave, setClave] = useState(claveInicial);
    const [cantidad, setCantidad] = useState(1);
    const [precioTxt, setPrecioTxt] = useState(precio ? precio.valor : '');
    useEffect(() => {
        if (opened) {
            setClave(presentaciones.some((p) => p.clave === claveInicial) ? claveInicial : 'UNIDAD');
            setCantidad(1);
            setPrecioTxt(precio ? precio.valor : '');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, claveInicial]);

    const pres = presentaciones.find((p) => p.clave === clave) || presentaciones[0];
    const n = Math.max(0, Math.floor(Number(cantidad) || 0));
    const unidades = n * (pres?.unidades || 1);
    const maxPres = Number.isFinite(maxUnidades) ? Math.max(0, Math.floor(maxUnidades / (pres?.unidades || 1))) : undefined;
    const excede = Number.isFinite(maxUnidades) && unidades > maxUnidades;
    const precioNum = Number(precioTxt);
    const precioValido = !precio || precioNum > 0;
    const valido = n >= 1 && !excede && precioValido;
    const confirmar = () => { if (valido) { onConfirmar(pres.clave, n, precio ? precioNum : undefined); onClose(); } };
    const cambiado = precio && precioValido && !iguales(precioNum, precio.valor);
    const totalRenglon = precio && precioValido ? precioNum * unidades : 0;
    const equivalente = precio?.equivalente && totalRenglon > 0 ? precio.equivalente(totalRenglon) : null;

    const tam = movil ? 'sm' : 'md';
    const precioInput = precio?.editable && (
        <NumberInput
            label={movil ? `Precio (${precio.simbolo})` : `Precio por unidad (${precio.simbolo})`}
            description={!movil && precio.etiqueta ? `Tarifa ${precio.etiqueta}. Cámbialo si este renglón lleva otro precio.` : undefined}
            value={precioTxt} onChange={setPrecioTxt} min={0} allowNegative={false} decimalScale={precio.simbolo === 'Bs' ? 2 : 3} hideControls
            inputMode="decimal" size={tam} prefix={precio.simbolo === 'Bs' ? 'Bs ' : '$'} error={precioValido ? null : (movil ? 'Mayor que cero' : 'Escribe un precio mayor que cero')}
            onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
            styles={{ input: { fontWeight: 700, ...(cambiado ? { borderColor: '#f08c00', backgroundColor: '#fff9db' } : {}) } }}
        />
    );

    return (
        <Modal opened={opened} onClose={onClose} title={<Text fw={800} size={movil ? 'sm' : 'md'}>¿Cuánto vas a agregar?</Text>} centered={!movil} size="sm" zIndex={zIndex}
            yOffset={movil ? 6 : undefined} padding={movil ? 'sm' : 'md'}
            styles={movil ? { header: { minHeight: 32, paddingBottom: 0 }, title: { lineHeight: 1.2 }, inner: { paddingLeft: 6, paddingRight: 6 } } : undefined}>
            {pres && (
                <Stack gap={movil ? 6 : 'sm'}>
                    <Text size="sm" fw={600} lineClamp={movil ? 1 : 2}>{nombre}</Text>
                    {presentaciones.length > 1 && (
                        <SegmentedControl fullWidth size={movil ? 'xs' : 'sm'} value={clave} onChange={setClave} orientation={presentaciones.length > 2 && !movil ? 'vertical' : 'horizontal'}
                            data={presentaciones.map((p) => ({ value: p.clave, label: p.unidades > 1 ? `${p.etiqueta} · ${p.unidades} unid.` : p.etiqueta }))} />
                    )}
                    <SimpleGrid cols={precio?.editable ? 2 : 1} spacing="xs">
                        <NumberInput data-autofocus label={movil ? `Cantidad (${pres.plural})` : `¿Cuántas ${pres.plural}?`} min={1} max={maxPres} allowDecimal={false} allowNegative={false} value={cantidad} onChange={setCantidad}
                            inputMode="numeric" size={tam} onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }} />
                        {precioInput}
                    </SimpleGrid>
                    <Text size={movil ? 'xs' : 'sm'} c={excede ? 'red.7' : 'dimmed'}>
                        {excede ? (ocultarExistencias ? 'Esa cantidad supera lo que hay disponible ahora. Reduce la cantidad o consúltanos por WhatsApp.' : `Solo hay ${maxUnidades} unidades disponibles.`) : pres.unidades > 1 ? `${n} ${n === 1 ? pres.singular : pres.plural} × ${pres.unidades} = ${unidades} unidades` : `${unidades} ${unidades === 1 ? pres.singular : pres.plural}`}
                    </Text>

                    {precio && (
                        <Stack gap={movil ? 4 : 6}>
                            {!precio.editable && (
                                <Group justify="space-between" gap="xs">
                                    <Text size="sm" fw={600}>Precio por unidad{precio.etiqueta ? ` (${precio.etiqueta})` : ''}</Text>
                                    <PrecioVisual valor={precio.valor} simbolo={precio.simbolo} size="md" fw={800} />
                                </Group>
                            )}
                            {precio.editable && precio.opciones?.length > 0 && (
                                <Group gap={6}>
                                    {precio.opciones.map((o) => {
                                        const activo = iguales(precioNum, o.valor);
                                        return (
                                            <Button key={o.etiqueta} size="compact-sm" radius="xl" variant={activo ? 'filled' : 'light'} color={precio.simbolo === 'Bs' ? 'teal' : 'blue'} onClick={() => setPrecioTxt(o.valor)}>
                                                {o.etiqueta}&nbsp;<PrecioVisual valor={o.valor} simbolo={precio.simbolo} size="xs" fw={700} />
                                            </Button>
                                        );
                                    })}
                                </Group>
                            )}
                            {cambiado && <Text size="xs" c="orange.8" fw={600}>{movil ? 'Precio cambiado solo en este renglón.' : 'Precio cambiado solo para este renglón (el del producto no cambia).'}</Text>}
                            {totalRenglon > 0 && (
                                <Group justify="space-between" gap="xs" wrap="nowrap">
                                    <Text size="sm" c="dimmed">Total{movil ? '' : ' del renglón'}{equivalente ? <Text span size="xs" c="dimmed"> ({equivalente})</Text> : null}</Text>
                                    <PrecioVisual valor={totalRenglon} simbolo={precio.simbolo} size="md" fw={800} />
                                </Group>
                            )}
                        </Stack>
                    )}

                    <Group justify="flex-end" gap="xs">
                        <Button variant="default" size={tam} onClick={onClose}>Cancelar</Button>
                        <Button size={tam} disabled={!valido} onClick={confirmar}>Agregar</Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
