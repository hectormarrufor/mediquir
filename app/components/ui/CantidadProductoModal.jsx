'use client';

import React, { useEffect, useState } from 'react';
import { Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text } from '@mantine/core';
import useVisualViewport from '@/hooks/useVisualViewport';

// Pregunta cuánto se agrega de un producto: por unidad (cuántas) o por caja (cuántas cajas y cuántas unidades trae cada una).
// presentaciones: las de presentacionesDe(producto) ({ clave, etiqueta, singular, plural, unidades }).
// maxUnidades: tope en unidades (p. ej. lo que queda en existencia); Infinity = sin tope.
// onConfirmar(claveDePresentacion, cantidadDePresentaciones) -> el que lo usa agrega al carrito.
export default function CantidadProductoModal({ opened, onClose, nombre, presentaciones, claveInicial = 'UNIDAD', maxUnidades = Infinity, onConfirmar, zIndex }) {
    const [clave, setClave] = useState(claveInicial);
    const [cantidad, setCantidad] = useState(1);
    useEffect(() => {
        if (opened) { setClave(presentaciones.some((p) => p.clave === claveInicial) ? claveInicial : 'UNIDAD'); setCantidad(1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, claveInicial]);

    const pres = presentaciones.find((p) => p.clave === clave) || presentaciones[0];
    const n = Math.max(0, Math.floor(Number(cantidad) || 0));
    const unidades = n * (pres?.unidades || 1);
    const maxPres = Number.isFinite(maxUnidades) ? Math.max(0, Math.floor(maxUnidades / (pres?.unidades || 1))) : undefined;
    const excede = Number.isFinite(maxUnidades) && unidades > maxUnidades;
    const valido = n >= 1 && !excede;
    const confirmar = () => { if (valido) { onConfirmar(pres.clave, n); onClose(); } };

    // Con el teclado abierto, el modal se centra en el área visible (no en la pantalla completa)
    const vv = useVisualViewport(opened);

    return (
        <Modal opened={opened} onClose={onClose} title={<Text fw={800}>¿Cuánto vas a agregar?</Text>} centered size="sm" zIndex={zIndex}
            styles={vv ? { inner: { top: vv.top, bottom: 'auto', height: vv.height, paddingTop: 0, paddingBottom: 0 } } : undefined}>
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
                        {excede ? `Solo hay ${maxUnidades} unidades disponibles.` : pres.unidades > 1 ? `${n} ${n === 1 ? pres.singular : pres.plural} × ${pres.unidades} = ${unidades} unidades` : `${unidades} ${unidades === 1 ? pres.singular : pres.plural}`}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button disabled={!valido} onClick={confirmar}>Agregar</Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
