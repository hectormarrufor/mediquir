'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Radio, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

// Borrar una marca, categoría o grupo. Si la usan productos (o grupos, en las categorías) se elige a cuál pasarlos,
// para no dejar productos sin categoría ni sin marca. Un grupo también puede dejar sus productos sueltos (sin grupo).
//   tipo: 'categoria' | 'marca' | 'grupo'      item: el registro (con nProductos y nGrupos)      otros: los demás del mismo tipo
const TEXTOS = {
    categoria: { el: 'la categoría', la: 'la', otro: 'otra categoría', destino: 'Pasarlos a la categoría' },
    marca: { el: 'la marca', la: 'la', otro: 'otra marca', destino: 'Pasarlos a la marca' },
    grupo: { el: 'el grupo', la: 'lo', otro: 'otro grupo', destino: 'Pasarlos al grupo' },
};

export default function ModalBorrar({ tipo, item, otros = [], onCerrar, onBorrar }) {
    const [destino, setDestino] = useState(null);
    const [modo, setModo] = useState('mover'); // solo grupos: 'mover' | 'soltar'
    const [borrando, setBorrando] = useState(false);
    useEffect(() => { setDestino(null); setModo('mover'); }, [item?.id]);
    if (!item) return null;

    const t = TEXTOS[tipo];
    const nProductos = item.nProductos || 0;
    const nGrupos = tipo === 'categoria' ? item.nGrupos || 0 : 0;
    const enUso = nProductos > 0 || nGrupos > 0;
    const necesitaDestino = enUso && !(tipo === 'grupo' && modo === 'soltar');
    const uso = [nProductos ? `${nProductos} producto(s)` : null, nGrupos ? `${nGrupos} grupo(s) de equivalencia` : null].filter(Boolean).join(' y ');

    const confirmar = async () => {
        setBorrando(true);
        try {
            await onBorrar(item, enUso ? (tipo === 'grupo' && modo === 'soltar' ? { soltar: '1' } : { moverA: destino }) : {});
        } finally {
            setBorrando(false);
        }
    };

    return (
        <Modal opened={Boolean(item)} onClose={onCerrar} centered title={<Text fw={800}>Borrar {t.el} «{item.nombre}»</Text>}>
            <Stack gap="md">
                {enUso ? (
                    <>
                        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} p="sm">
                            <Text size="sm">{t.la === 'la' ? 'La' : 'Lo'} usan <b>{uso}</b>. Antes de borrar{t.la}, elige qué pasa con ellos.</Text>
                        </Alert>
                        {tipo === 'grupo' && (
                            <Radio.Group value={modo} onChange={setModo}>
                                <Stack gap={6}>
                                    <Radio value="mover" label="Pasar sus productos a otro grupo" />
                                    <Radio value="soltar" label="Dejar sus productos sueltos (sin grupo); cada uno usa su propio stock mínimo" />
                                </Stack>
                            </Radio.Group>
                        )}
                        {necesitaDestino && (
                            <Select
                                label={t.destino} placeholder={`Elige ${t.otro}`} searchable data-autofocus
                                data={otros.filter((o) => o.id !== item.id).map((o) => ({ value: String(o.id), label: o.nombre }))}
                                value={destino} onChange={setDestino} nothingFoundMessage="No hay coincidencias"
                            />
                        )}
                    </>
                ) : (
                    <Text size="sm">Ningún producto {t.la} usa. ¿Seguro que quieres borrar{t.la}?</Text>
                )}

                <Group justify="flex-end" gap="xs">
                    <Button variant="default" onClick={onCerrar} tt="none">Cancelar</Button>
                    <Button color="red" onClick={confirmar} loading={borrando} disabled={necesitaDestino && !destino} tt="none">
                        {necesitaDestino ? 'Pasar y borrar' : 'Borrar'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
