'use client';

import React, { useEffect, useState } from 'react';
import { Button, Modal, NumberInput, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import ImageDropzone from '@/app/components/ImageDropzone';

// Crear o cambiar una marca, categoría o grupo de equivalencia (item = null para crear).
//   marca:     nombre (se guarda en MAYÚSCULAS) y logo
//   categoria: nombre y descripción
//   grupo:     nombre, categoría, stock mínimo del grupo y foto de portada
const TITULO = {
    categoria: ['Nueva categoría', 'Cambiar categoría'],
    marca: ['Nueva marca', 'Cambiar marca'],
    grupo: ['Nuevo grupo de equivalencia', 'Cambiar grupo de equivalencia'],
};

// Sube la foto si es nueva (un archivo); si ya estaba subida (texto) no la vuelve a mandar
async function subirSiEsNueva(valor, prefijo) {
    if (!valor || typeof valor === 'string') return undefined;
    const extension = ((valor.name || 'foto.jpg').split('.').pop() || 'jpg').toLowerCase();
    const nombre = `${prefijo}_${Date.now()}.${extension}`;
    const r = await fetch(`/api/upload?filename=${encodeURIComponent(nombre)}`, { method: 'POST', body: valor });
    if (!r.ok) throw new Error('No se pudo subir la imagen');
    return nombre;
}

export default function ModalFormulario({ tipo, abierto, item, categorias = [], onCerrar, onGuardar }) {
    const [guardando, setGuardando] = useState(false);
    const form = useForm({
        initialValues: { nombre: '', descripcion: '', categoriaId: null, stockMinimoGlobal: 0, imagen: null },
        validate: {
            nombre: (v) => (String(v || '').trim().length < 2 ? 'Mínimo 2 letras' : null),
            categoriaId: (v) => (tipo === 'grupo' && !v ? 'Elige la categoría del grupo' : null),
            stockMinimoGlobal: (v) => (tipo === 'grupo' && (!Number.isInteger(Number(v)) || Number(v) < 0) ? 'Número entero, 0 o más' : null),
        },
    });

    useEffect(() => {
        if (!abierto) return;
        form.setValues({
            nombre: item?.nombre || '',
            descripcion: item?.descripcion || '',
            categoriaId: item?.categoriaId ? String(item.categoriaId) : null,
            stockMinimoGlobal: item?.stockMinimoGlobal ?? 0,
            imagen: item?.imagen || null,
        });
        form.resetDirty();
        form.clearErrors();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abierto, item?.id]);

    const enviar = async (v) => {
        setGuardando(true);
        try {
            const imagen = tipo === 'categoria' ? undefined : await subirSiEsNueva(v.imagen, tipo);
            const datos = tipo === 'categoria'
                ? { nombre: v.nombre.trim(), descripcion: v.descripcion.trim() || null }
                : tipo === 'marca'
                    ? { nombre: v.nombre.trim(), ...(imagen ? { imagen } : {}) }
                    : { nombre: v.nombre.trim(), categoriaId: Number(v.categoriaId), stockMinimoGlobal: Number(v.stockMinimoGlobal) || 0, ...(imagen ? { imagen } : {}) };
            await onGuardar(item, datos);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal opened={abierto} onClose={onCerrar} centered title={<Text fw={800}>{TITULO[tipo][item ? 1 : 0]}</Text>}>
            <form onSubmit={form.onSubmit(enviar)}>
                <Stack gap="md">
                    <TextInput
                        label="Nombre" withAsterisk data-autofocus
                        description={tipo === 'marca' ? 'Se guarda en mayúsculas' : undefined}
                        {...form.getInputProps('nombre')}
                    />

                    {tipo === 'categoria' && (
                        <Textarea label="Descripción (opcional)" autosize minRows={2} {...form.getInputProps('descripcion')} />
                    )}

                    {tipo === 'grupo' && (
                        <>
                            <Select
                                label="Categoría" withAsterisk searchable nothingFoundMessage="No hay coincidencias"
                                description="La categoría a la que pertenece el grupo"
                                data={categorias.map((c) => ({ value: String(c.id), label: c.nombre }))}
                                {...form.getInputProps('categoriaId')}
                            />
                            <NumberInput
                                label="Stock mínimo del grupo" min={0} allowDecimal={false} allowNegative={false}
                                description="El grupo queda «bajo mínimo» cuando la suma del stock de todos sus productos llega a este número"
                                {...form.getInputProps('stockMinimoGlobal')}
                            />
                        </>
                    )}

                    {tipo !== 'categoria' && (
                        <ImageDropzone label={tipo === 'marca' ? 'Logo de la marca' : 'Imagen de portada'} form={form} fieldPath="imagen" />
                    )}

                    <Button type="submit" loading={guardando} fullWidth tt="none">{item ? 'Guardar cambios' : 'Crear'}</Button>
                </Stack>
            </form>
        </Modal>
    );
}
