'use client';

import React, { useEffect, useState } from 'react';
import { Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
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

    return (
        <Modal opened={opened} onClose={onClose} title={<Text fw={800}>¿Cuánto vas a agregar?</Text>} centered size="sm" zIndex={zIndex}>
            {pres && (
                <Stack gap="sm">
                    <Text size="sm" fw={600} lineClamp={2}>{nombre}</Text>
                    {presentaciones.length > 1 && (
                        <SegmentedControl fullWidth value={clave} onChange={setClave} orientation={presentaciones.length > 2 ? 'vertical' : 'horizontal'}
                            data={presentaciones.map((p) => ({ value: p.clave, label: p.unidades > 1 ? `${p.etiqueta} · ${p.unidades} unidades` : p.etiqueta }))} />
                    )}
                    <NumberInput data-autofocus label={`¿Cuántas ${pres.plural}?`} min={1} max={maxPres} allowDecimal={false} allowNegative={false} value={cantidad} onChange={setCantidad}
                        inputMode="numeric" size="md" onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }} />
                    <Text size="sm" c={excede ? 'red.7' : 'dimmed'}>
                        {excede ? (ocultarExistencias ? 'Esa cantidad supera lo que hay disponible ahora. Reduce la cantidad o consúltanos por WhatsApp.' : `Solo hay ${maxUnidades} unidades disponibles.`) : pres.unidades > 1 ? `${n} ${n === 1 ? pres.singular : pres.plural} × ${pres.unidades} = ${unidades} unidades` : `${unidades} ${unidades === 1 ? pres.singular : pres.plural}`}
                    </Text>

                    {precio && (
                        <Stack gap={6}>
                            {precio.editable ? (
                                <NumberInput
                                    label={`Precio por unidad (${precio.simbolo})`} description={precio.etiqueta ? `Tarifa ${precio.etiqueta}. Cámbialo si este renglón lleva otro precio.` : undefined}
                                    value={precioTxt} onChange={setPrecioTxt} min={0} allowNegative={false} decimalScale={precio.simbolo === 'Bs' ? 2 : 3} hideControls
                                    inputMode="decimal" size="md" prefix={precio.simbolo === 'Bs' ? 'Bs ' : '$'} error={precioValido ? null : 'Escribe un precio mayor que cero'}
                                    onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
                                    styles={{ input: { fontWeight: 700, ...(cambiado ? { borderColor: '#f08c00', backgroundColor: '#fff9db' } : {}) } }}
                                />
                            ) : (
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
                            {cambiado && <Text size="xs" c="orange.8" fw={600}>Precio cambiado solo para este renglón (el del producto no cambia).</Text>}
                            {totalRenglon > 0 && (
                                <Group justify="space-between" gap="xs" wrap="nowrap">
                                    <Text size="sm" c="dimmed">Total del renglón{equivalente ? <Text span size="xs" c="dimmed"> ({equivalente})</Text> : null}</Text>
                                    <PrecioVisual valor={totalRenglon} simbolo={precio.simbolo} size="md" fw={800} />
                                </Group>
                            )}
                        </Stack>
                    )}

                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button disabled={!valido} onClick={confirmar}>Agregar</Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
