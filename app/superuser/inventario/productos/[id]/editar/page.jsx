'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import { useParams, useRouter } from 'next/navigation';
import {
    Box, Button, Group, Title, TextInput, NumberInput,
    Select, TagsInput, Paper, Stack, Grid, Modal, ActionIcon,
    Text, Divider, Badge, Center, Loader
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy, IconArrowLeft, IconPlus, IconCalculator } from '@tabler/icons-react';
import ImageDropzone from '@/app/components/ImageDropzone';

export default function EditarProducto() {
    const router = useRouter();
    const { id } = useParams(); 
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Estados Modales
    const [modalCat, setModalCat] = useState(false);
    const [modalMarca, setModalMarca] = useState(false);
    const [modalGrupo, setModalGrupo] = useState(false);
    const [nuevoDictValor, setNuevoDictValor] = useState('');
    const [nuevoGrupoStock, setNuevoGrupoStock] = useState(0);

    // FETCH Diccionarios
    const fetchSelect = async (endpoint) => {
        const res = await fetch(endpoint);
        if (!res.ok) return [];
        return res.json();
    };
    const { data: categorias } = useQuery({ queryKey: ['categorias'], queryFn: () => fetchSelect('/api/categorias') });
    const { data: marcas } = useQuery({ queryKey: ['marcas'], queryFn: () => fetchSelect('/api/marcas') });
    const { data: grupos } = useQuery({ queryKey: ['grupos'], queryFn: () => fetchSelect('/api/grupos-equivalencia') });
    const { data: tagsList } = useQuery({ queryKey: ['tags'], queryFn: () => fetchSelect('/api/tags') });

    // FETCH Producto Actual
    const { data: productoDB, isLoading: cargandoProducto } = useQuery({
        queryKey: ['producto', id],
        queryFn: async () => {
            const res = await fetch(`/api/productos/${id}`);
            if (!res.ok) throw new Error('No se encontró el producto');
            return res.json();
        }
    });

    const mapOptions = (data) => data?.map(item => ({ value: item.id.toString(), label: item.nombre })) || [];
    const tagOptionsStr = tagsList?.map(t => t.nombre.toLowerCase()) || [];

    // --- FORMULARIO ---
    const form = useForm({
        initialValues: {
            nombre: '', codigo: '', categoriaId: '', marcaId: '', grupoEquivalenciaId: '',
            tags: [], costoUsd: '', precio6: '', precio7: '', porcentajeIva: 16, presentacion: 'unidad',
            unidadesPorCaja: '', unidadesPorBulto: 1, stockAlmacen: '', stockMinimo: '', imagen: null,
            porcentajeDescuento: 0 // 🔥 Nuevo campo agregado
        },
        validate: {
            nombre: (value) => (!value || value.trim().length < 3 ? 'Mínimo 3 caracteres' : null),
            codigo: (value) => (!value || /\s/.test(value) ? 'Obligatorio y sin espacios' : null),
            categoriaId: (value) => (!value ? 'Seleccione una categoría' : null),
            marcaId: (value) => (!value ? 'Seleccione una marca' : null),
            costoUsd: (value) => (value === '' || Number(value) <= 0 ? 'Debe ser mayor a 0' : null),
            stockAlmacen: (value) => (value === '' || Number(value) < 0 ? 'No puede ser negativo' : null),
            unidadesPorCaja: (value, values) => (values.presentacion === 'caja' && (!value || Number(value) <= 0) ? 'Debe ser mayor a 0' : null),
        }
    });

    // 🔥 PRECARGA DE DATOS (HIDRATACIÓN MATEMÁTICA) 🔥
    useEffect(() => {
        if (productoDB) {
            // Calculamos el % de descuento si existe
            let porcentajeActual = 0;
            if (Number(productoDB.precioDescuento) > 0 && Number(productoDB.precio7) > 0) {
                porcentajeActual = Math.round(((Number(productoDB.precio7) - Number(productoDB.precioDescuento)) / Number(productoDB.precio7)) * 100);
            }

            form.setValues({
                nombre: productoDB.nombre,
                codigo: productoDB.codigo,
                categoriaId: productoDB.categoriaId?.toString() || '',
                marcaId: productoDB.marcaId?.toString() || '',
                grupoEquivalenciaId: productoDB.grupoEquivalenciaId?.toString() || '',
                tags: productoDB.tags ? productoDB.tags.map(t => t.nombre) : [],
                costoUsd: Number(productoDB.costoUsd),
                precio6: Number(productoDB.precio6) || '',
                precio7: Number(productoDB.precio7) || '',
                porcentajeIva: Number(productoDB.porcentajeIva),
                presentacion: productoDB.presentacion,
                unidadesPorCaja: productoDB.unidadesPorCaja || '',
                unidadesPorBulto: productoDB.unidadesPorBulto || 1,
                stockAlmacen: Number(productoDB.stockAlmacen),
                stockMinimo: Number(productoDB.stockMinimo),
                imagen: productoDB.imagen || null,
                porcentajeDescuento: porcentajeActual // 🔥 Inyectamos el cálculo
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productoDB]);

    // Mutación Modales
    const handleCrearDiccionario = async (endpoint, queryKey, fieldName, extraData = {}) => {
        if (nuevoDictValor.trim().length < 2) return notifications.show({ title: 'Aviso', message: 'Nombre muy corto', color: 'yellow' });
        try {
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nuevoDictValor, ...extraData }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            queryClient.invalidateQueries({ queryKey: [queryKey] });
            form.setFieldValue(fieldName, data.id.toString());
            setModalCat(false); setModalMarca(false); setModalGrupo(false); setNuevoDictValor('');
            notifications.show({ title: 'Éxito', message: 'Registro creado', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    };

    // --- GUARDAR CAMBIOS (PUT) ---
    const handleSubmitProducto = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = {
                ...values,
                categoriaId: Number(values.categoriaId),
                marcaId: Number(values.marcaId),
                grupoEquivalenciaId: values.grupoEquivalenciaId ? Number(values.grupoEquivalenciaId) : null,
                unidadesPorCaja: values.presentacion === 'caja' ? Number(values.unidadesPorCaja) : null,
            };

            // 🔥 Transformamos el % de descuento a Dinero real (precioDescuento)
            if (Number(values.porcentajeDescuento) > 0 && Number(values.precio7) > 0) {
                const descuento = Number(values.precio7) * (Number(values.porcentajeDescuento) / 100);
                payload.precioDescuento = Number(values.precio7) - descuento;
            } else {
                payload.precioDescuento = null;
            }

            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Espera...', loading: true });
                const fileExt = values.imagen.name.split('.').pop();
                const uniqueFilename = `${values.codigo.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.${fileExt}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, { method: 'POST', body: values.imagen });
                if (!response.ok) throw new Error('Falló la subida de la imagen');

                payload.imagen = uniqueFilename;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida', color: 'green' });
            }

            const res = await fetch(`/api/productos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al actualizar');

            notifications.show({ title: 'Éxito', message: 'Producto actualizado correctamente', color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
            router.push('/superuser/inventario/productos');

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (cargandoProducto) return <Center h="100vh"><Loader size="xl" /></Center>;

    return (
        <Box p="md" maw={1000} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>Volver</Button>
                <Title order={2} c="blue.9">Editar Producto</Title>
            </Group>

            <form onSubmit={form.onSubmit(handleSubmitProducto)}>
                <Stack gap="xl">

                    {/* SECCIÓN 1: DATOS COMERCIALES */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">1. Datos Comerciales y Clasificación</Title>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select style={{ flex: 1 }} withAsterisk label="Categoría" data={mapOptions(categorias)} searchable {...form.getInputProps('categoriaId')} />
                                    <ActionIcon size="lg" color="blue" variant="light" onClick={() => setModalCat(true)}><IconPlus size={18} /></ActionIcon>
                                </Group>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select
                                        style={{ flex: 1 }}
                                        label="Grupo Equivalencia"
                                        description="Para stock global"
                                        data={mapOptions(grupos)}
                                        searchable
                                        clearable
                                        {...form.getInputProps('grupoEquivalenciaId')}
                                        onChange={(val) => {
                                            form.setFieldValue('grupoEquivalenciaId', val);
                                            if (val) {
                                                const grupoSeleccionado = grupos.find(g => g.id.toString() === val);
                                                if (grupoSeleccionado) form.setFieldValue('nombre', grupoSeleccionado.nombre);
                                            }
                                        }}
                                    />
                                    <ActionIcon
                                        size="lg" color="teal" variant="light" mb={22}
                                        onClick={() => {
                                            if (!form.values.categoriaId) {
                                                notifications.show({ title: 'Aviso', message: 'Selecciona una Categoría primero.', color: 'orange' });
                                                return;
                                            }
                                            setModalGrupo(true);
                                        }}
                                    >
                                        <IconPlus size={18} />
                                    </ActionIcon>
                                </Group>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <TextInput withAsterisk label="Nombre del Producto" {...form.getInputProps('nombre')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    withAsterisk label="Código"
                                    autoCapitalize="characters"
                                    value={form.values.codigo}
                                    onChange={(e) => form.setFieldValue('codigo', e.currentTarget.value.toUpperCase())}
                                    error={form.errors.codigo}
                                />
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select style={{ flex: 1 }} withAsterisk label="Marca" data={mapOptions(marcas)} searchable {...form.getInputProps('marcaId')} />
                                    <ActionIcon size="lg" color="grape" variant="light" onClick={() => setModalMarca(true)}><IconPlus size={18} /></ActionIcon>
                                </Group>
                            </Grid.Col>

                            <Grid.Col span={12}>
                                <TagsInput
                                    label="Etiquetas (Tags)"
                                    description="Escribe una etiqueta y presiona Enter. Se normalizará automáticamente."
                                    placeholder="Agrega características..."
                                    data={tagOptionsStr} searchable clearable
                                    value={form.values.tags} error={form.errors.tags}
                                    onChange={(values) => {
                                        const normalized = values.map(v => v.trim().toLowerCase().replace(/[\s\-]/g, ''));
                                        const unique = [...new Set(normalized)];
                                        const nuevosTags = unique.filter(v => !tagOptionsStr.includes(v));

                                        nuevosTags.forEach(nuevo => {
                                            fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nuevo }) })
                                                .then(() => queryClient.invalidateQueries({ queryKey: ['tags'] }));
                                        });
                                        form.setFieldValue('tags', unique);
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                />
                            </Grid.Col>
                        </Grid>
                    </Paper>

                    {/* SECCIÓN 2: FINANZAS Y PRECIOS */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="gray.0">
                        <Group mb="md" gap="xs"><IconCalculator color="#1971c2" /><Title order={4} c="blue.7">2. Estructura de Precios (Ref USD)</Title></Group>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput withAsterisk label="Costo (USD)" decimalScale={3} prefix="$ " {...form.getInputProps('costoUsd')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput label="Precio 6 (Manual USD)" decimalScale={3} prefix="$ " {...form.getInputProps('precio6')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput label="Precio 7 (Manual USD)" decimalScale={3} prefix="$ " {...form.getInputProps('precio7')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput withAsterisk label="% de IVA" min={0} suffix=" %" {...form.getInputProps('porcentajeIva')} /></Grid.Col>
                        </Grid>
                        
                        {/* 🔥 SECCIÓN DE DESCUENTOS 🔥 */}
                        <Divider label="Promociones E-commerce" labelPosition="center" my="lg" />
                        <Grid align="flex-end">
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput 
                                    label="% Descuento sobre Precio 7" 
                                    description="Se activará como Oferta en la Landing Page"
                                    suffix="%" 
                                    min={0} max={99} 
                                    {...form.getInputProps('porcentajeDescuento')} 
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                {form.values.porcentajeDescuento > 0 && form.values.precio7 > 0 && (
                                    <Badge color="red" size="xl" variant="light" h={40} mb={6}>
                                        Precio Final Público: ${(form.values.precio7 - (form.values.precio7 * (form.values.porcentajeDescuento / 100))).toFixed(2)}
                                    </Badge>
                                )}
                            </Grid.Col>
                        </Grid>

                        {form.values.costoUsd > 0 && (
                            <Group mt="xl" bg="blue.1" p="sm" style={{ borderRadius: 8 }}>
                                <Text size="sm" fw={600} c="blue.9">Proyecciones automáticas de Costo:</Text>
                                <Badge color="green" variant="light" size="lg">Precio 1 (35%): ${(form.values.costoUsd * 1.35).toFixed(3)}</Badge>
                                <Badge color="teal" variant="light" size="lg">Precio 4 (50%): ${(form.values.costoUsd * 1.50).toFixed(3)}</Badge>
                            </Group>
                        )}
                    </Paper>

                    {/* SECCIÓN 3: LOGÍSTICA E INVENTARIO */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">3. Logística e Inventario</Title>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Select label="Presentación Venta" data={[{ value: 'unidad', label: 'Unidad' }, { value: 'par', label: 'Par' }, { value: 'paqx2', label: 'Paquete x2' }, { value: 'paqx4', label: 'Paquete x4' }, { value: 'caja', label: 'Caja' }]} withAsterisk {...form.getInputProps('presentacion')} />
                            </Grid.Col>
                            {form.values.presentacion === 'caja' && (
                                <Grid.Col span={{ base: 12, md: 4 }}><NumberInput withAsterisk label="Unidades por Caja" min={1} {...form.getInputProps('unidadesPorCaja')} /></Grid.Col>
                            )}
                            <Grid.Col span={{ base: 12, md: 4 }}><NumberInput label="Despacho en Bultos (Und/Bulto)" min={1} {...form.getInputProps('unidadesPorBulto')} /></Grid.Col>
                            <Grid.Col span={12}><Divider my="sm" /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 6 }}><NumberInput withAsterisk label="Stock Inicial (Almacén)" min={0} {...form.getInputProps('stockAlmacen')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <NumberInput label="Stock Mínimo (Alerta Crítica)" min={0} disabled={!!form.values.grupoEquivalenciaId} description={form.values.grupoEquivalenciaId ? "Se usará el mínimo del Grupo de Equivalencia." : ""} {...form.getInputProps('stockMinimo')} />
                            </Grid.Col>
                        </Grid>
                    </Paper>

                    {/* SECCIÓN 4: FOTO DEL PRODUCTO */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">4. Imagen del Insumo</Title>
                        <ImageDropzone label="Subir o Fotografiar Producto" form={form} fieldPath="imagen" />
                    </Paper>

                    {/* BOTONES DE ACCIÓN */}
                    <Group justify="flex-end" mt="md">
                        <Button variant="light" color="gray" onClick={() => router.back()} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" size="lg" color="green.8" leftSection={<IconDeviceFloppy size={20} />} loading={isSubmitting}>
                            Actualizar Producto Completo
                        </Button>
                    </Group>
                </Stack>
            </form>

            {/* MODALES REUTILIZABLES */}
            <Modal opened={modalCat} onClose={() => setModalCat(false)} title={<Title order={4}>Nueva Categoría</Title>} centered><Stack gap="md"><TextInput label="Nombre" value={nuevoDictValor} onChange={(e) => setNuevoDictValor(e.currentTarget.value)} autoFocus /><Button fullWidth onClick={() => handleCrearDiccionario('/api/categorias', 'categorias', 'categoriaId')}>Guardar</Button></Stack></Modal>
            <Modal opened={modalMarca} onClose={() => setModalMarca(false)} title={<Title order={4}>Nueva Marca</Title>} centered><Stack gap="md"><TextInput label="Nombre" value={nuevoDictValor} onChange={(e) => setNuevoDictValor(e.currentTarget.value)} autoFocus /><Button fullWidth color="grape" onClick={() => handleCrearDiccionario('/api/marcas', 'marcas', 'marcaId')}>Guardar</Button></Stack></Modal>
            <Modal opened={modalGrupo} onClose={() => setModalGrupo(false)} title={<Title order={4}>Nuevo Grupo</Title>} centered><Stack gap="md"><TextInput label="Nombre" value={nuevoDictValor} onChange={(e) => setNuevoDictValor(e.currentTarget.value)} autoFocus /><NumberInput label="Stock Mínimo Global" value={nuevoGrupoStock} onChange={setNuevoGrupoStock} /><Button fullWidth color="teal" onClick={() => handleCrearDiccionario('/api/grupos-equivalencia', 'grupos', 'grupoEquivalenciaId', { stockMinimoGlobal: nuevoGrupoStock, categoriaId: form.values.categoriaId })}>Guardar Grupo</Button></Stack></Modal>
        </Box>
    );
}