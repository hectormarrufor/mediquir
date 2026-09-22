'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import {
    Box, Button, Group, Title, TextInput, NumberInput,
    Select, Paper, Stack, Grid, Modal, ActionIcon,
    Text, Divider, Badge, TagsInput, Checkbox, Center, Loader
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft, IconPlus, IconCalculator } from '@tabler/icons-react';
import ImageDropzone from '@/app/components/ImageDropzone';
import { capitalizarPalabras } from '@/app/handlers/formatters';
import { PRESENTACIONES } from '@/app/constants/inventarioCampos';


export default function ProductoForm({ productId = null }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isEditMode = !!productId;

    // --- ESTADOS PARA MODALES ---
    const [modalCat, setModalCat] = useState(false);
    const [modalMarca, setModalMarca] = useState(false);
    const [modalGrupo, setModalGrupo] = useState(false);
    const [marcaSearch, setMarcaSearch] = useState('');

    // --- FETCH DE DICCIONARIOS ---
    const fetchSelect = async (endpoint) => {
        const res = await fetch(endpoint);
        if (!res.ok) return [];
        return res.json();
    };

    const { data: categorias } = useQuery({ queryKey: ['categorias'], queryFn: () => fetchSelect('/api/categorias') });
    const { data: marcas } = useQuery({ queryKey: ['marcas'], queryFn: () => fetchSelect('/api/marcas') });
    const { data: grupos } = useQuery({ queryKey: ['grupos'], queryFn: () => fetchSelect('/api/grupos-equivalencia') });
    const { data: tagsList } = useQuery({ queryKey: ['tags'], queryFn: () => fetchSelect('/api/tags') });

    // --- FETCH PRODUCTO A EDITAR ---
    const { data: productoDB, isLoading: cargandoProducto } = useQuery({
        queryKey: ['producto', productId],
        queryFn: async () => {
            const res = await fetch(`/api/productos/${productId}`);
            if (!res.ok) throw new Error('No se encontró el producto');
            return res.json();
        },
        enabled: isEditMode
    });

    const mapOptions = (data) => data?.map(item => ({ value: item.id.toString(), label: item.nombre })) || [];
    const tagOptionsStr = tagsList?.map(t => t.nombre.toLowerCase()) || [];

    // --- FORMULARIO PRINCIPAL ---
    const form = useForm({
        initialValues: {
            nombre: '', codigo: '', codigoBarras: '', codigoBarrasCaja: '', codigoBarrasBulto: '', categoriaId: '', marcaId: '', grupoEquivalenciaId: '',
            tags: [], costoUsd: '', precio6: '', precio7: '', porcentajeDescuento: '',
            conIva: true, presentacion: 'unidad', unidadesPorCaja: '', cajasPorBulto: '', unidadesPorBulto: '',
            stockAlmacen: '', stockMinimo: '', imagen: null
        },
        validate: {
            nombre: (value) => (!value || value.trim().length < 3 ? 'Mínimo 3 caracteres' : null),
            codigo: (value) => {
                if (!value) return 'El código es obligatorio';
                if (/\s/.test(value)) return 'El código no puede tener espacios';
                return null;
            },
            categoriaId: (value) => (!value ? 'Seleccione una categoría' : null),
            marcaId: (value) => (!value ? 'Seleccione una marca' : null),
            costoUsd: (value) => (value === '' || Number(value) <= 0 ? 'Debe ser mayor a 0' : null),
            precio6: (value) => (value !== '' && Number(value) < -1 ? 'No puede ser negativo' : null),
            precio7: (value) => (value !== '' && Number(value) < -1 ? 'No puede ser negativo' : null),
            stockAlmacen: (value) => (value === '' || Number(value) < 0 ? 'No puede ser negativo' : null),
            unidadesPorCaja: (value) => (value !== '' && value !== null && Number(value) < 1 ? 'Debe ser mayor a 0' : null),
            cajasPorBulto: (value) => (value !== '' && value !== null && Number(value) < 1 ? 'Mínimo 1 caja por bulto' : null),
            unidadesPorBulto: (value) => (value !== '' && value !== null && Number(value) < 1 ? 'Mínimo 1 unidad por bulto' : null),
        }
    });

    // --- FORMULARIOS DE MODALES ---
    const formCategoria = useForm({ initialValues: { nombre: '' }, validate: { nombre: (val) => (val.trim().length < 2 ? 'Muy corto' : null) } });
    const formMarca = useForm({ initialValues: { nombre: '', imagen: null }, validate: { nombre: (val) => (val.trim().length < 2 ? 'Muy corto' : null) } });
    const formGrupo = useForm({ initialValues: { nombre: '', stockMinimoGlobal: '', imagen: null }, validate: { nombre: (val) => (val.trim().length < 2 ? 'Muy corto' : null) } });

    // 🔥 HIDRATACIÓN 🔥
    useEffect(() => {
        if (isEditMode && productoDB) {
            form.setValues({
                nombre: productoDB.nombre,
                codigo: productoDB.codigo,
                codigoBarras: productoDB.codigoBarras || '',
                codigoBarrasCaja: productoDB.codigoBarrasCaja || '',
                codigoBarrasBulto: productoDB.codigoBarrasBulto || '',
                categoriaId: productoDB.categoriaId?.toString() || '',
                marcaId: productoDB.marcaId?.toString() || '',
                grupoEquivalenciaId: productoDB.grupoEquivalenciaId?.toString() || '',
                tags: productoDB.tags ? productoDB.tags.map(t => t.nombre) : [],
                costoUsd: Number(productoDB.costoUsd),
                precio6: Number(productoDB.precio6) || '',
                precio7: Number(productoDB.precio7) || '',

                // 🔥 AHORA SOLO LEEMOS EL PORCENTAJE DIRECTAMENTE DE LA BD 🔥
                porcentajeDescuento: Number(productoDB.porcentajeDescuento) || '',

                conIva: Number(productoDB.porcentajeIva) > 0,
                presentacion: productoDB.presentacion,
                unidadesPorCaja: productoDB.unidadesPorCaja || '',
                cajasPorBulto: productoDB.cajasPorBulto || '',
                unidadesPorBulto: productoDB.unidadesPorCaja ? '' : (productoDB.unidadesPorBulto || ''),
                stockAlmacen: Number(productoDB.stockAlmacen),
                stockMinimo: Number(productoDB.stockMinimo),
                imagen: productoDB.imagen || null
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productoDB, isEditMode]);

    const handleSubmitDiccionario = async (endpoint, queryKey, fieldName, values, extraData = {}, formInstance, closeModalFn) => {
        try {
            let payload = { nombre: values.nombre, ...extraData, stockMinimoGlobal: Number(values.stockMinimoGlobal || 0) };

            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'upload-dict', title: 'Subiendo logo...', message: 'Espera...', loading: true });
                const fileExt = values.imagen.name.split('.').pop();
                const uniqueFilename = `${queryKey}_${Date.now()}.${fileExt}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, { method: 'POST', body: values.imagen });
                if (!response.ok) throw new Error('Falló la subida');

                payload.imagen = uniqueFilename;
                notifications.update({ id: 'upload-dict', title: 'Éxito', message: 'Logo subido', color: 'green' });
            }
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            queryClient.invalidateQueries({ queryKey: [queryKey] });
            form.setFieldValue(fieldName, data.id.toString());
            formInstance.reset();
            closeModalFn(false);
            notifications.show({ title: 'Éxito', message: 'Registro creado', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    };

    // --- ENVÍO PRINCIPAL (POST o PUT) ---
    const handleSubmitProducto = async (values) => {
        setIsSubmitting(true);
        try {
            let payload = {
                ...values,
                categoriaId: Number(values.categoriaId),
                marcaId: Number(values.marcaId),
                grupoEquivalenciaId: values.grupoEquivalenciaId ? Number(values.grupoEquivalenciaId) : null,
                costoUsd: Number(values.costoUsd),
                precio6: values.precio6 ? Number(values.precio6) : 0,
                precio7: values.precio7 ? Number(values.precio7) : 0,
                porcentajeIva: values.conIva ? 16 : 0,
                codigoBarras: String(values.codigoBarras || '').trim() || null,
                codigoBarrasCaja: String(values.codigoBarrasCaja || '').trim() || null,
                codigoBarrasBulto: String(values.codigoBarrasBulto || '').trim() || null,
                // Con cajas: si no se dice cuántas trae el bulto, no viene en bulto (no se inventa un bulto de 1 caja).
                // Sin cajas: las unidades que trae el bulto directamente, o null si se deja en blanco (no viene en bulto).
                unidadesPorCaja: Number(values.unidadesPorCaja) > 0 ? Number(values.unidadesPorCaja) : null,
                cajasPorBulto: Number(values.unidadesPorCaja) > 0 ? (Number(values.cajasPorBulto) || null) : null,
                unidadesPorBulto: Number(values.unidadesPorCaja) > 0
                    ? (Number(values.cajasPorBulto) > 0 ? Number(values.cajasPorBulto) * Number(values.unidadesPorCaja) : null)
                    : (Number(values.unidadesPorBulto) || null),
            };

            delete payload.conIva;

            // 🔥 AHORA SOLO GUARDAMOS EL PORCENTAJE DIRECTAMENTE 🔥
            if (Number(values.porcentajeDescuento) > 0) {
                payload.porcentajeDescuento = Number(values.porcentajeDescuento);
            } else {
                payload.porcentajeDescuento = 0;
            }

            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Espera...', loading: true });
                const fileExtension = values.imagen.name.split('.').pop();
                const uniqueFilename = `${values.codigo.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.${fileExtension}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
                    method: 'POST', body: values.imagen,
                });
                if (!response.ok) throw new Error('Falló la subida');

                payload.imagen = uniqueFilename;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida', color: 'green' });
            }

            const url = isEditMode ? `/api/productos/${productId}` : '/api/productos';
            const method = isEditMode ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar el producto');

            notifications.show({ title: 'Éxito', message: `Producto ${isEditMode ? 'actualizado' : 'registrado'} correctamente`, color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
            router.push('/superuser/inventario/productos');

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isEditMode && cargandoProducto) return <Center h="100vh"><Loader size="xl" /></Center>;

    return (
        <Box p="md" maw={1000} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>Volver</Button>
                <Title order={2} c="blue.9">{isEditMode ? 'Editar Producto' : 'Registrar Nuevo Producto'}</Title>
            </Group>

            <form onSubmit={form.onSubmit(handleSubmitProducto)}>
                <Stack gap="xl">
                    {/* SECCIÓN 1: DATOS COMERCIALES */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">1. Datos Comerciales y Clasificación</Title>
                        <Grid>

                            {/* 🔥 NUEVO ORDEN LÓGICO: Fila 1 (Cat -> Grupo -> Marca) */}
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select style={{ flex: 1 }} withAsterisk label="Categoría" data={mapOptions(categorias)} searchable {...form.getInputProps('categoriaId')} />
                                    <ActionIcon size="lg" color="blue" variant="light" onClick={() => setModalCat(true)}><IconPlus size={18} /></ActionIcon>
                                </Group>
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select
                                        style={{ flex: 1 }} label="Grupo Equivalencia" description="Para stock global"
                                        data={mapOptions(grupos)} searchable clearable
                                        value={form.values.grupoEquivalenciaId}
                                        onChange={(val) => {
                                            form.setFieldValue('grupoEquivalenciaId', val);
                                            if (val) {
                                                const grupoSeleccionado = grupos.find(g => g.id.toString() === val);
                                                if (grupoSeleccionado) {
                                                    // 🔥 El grupo está en mayúsculas, pero el producto lo recibe Capitalizado
                                                    form.setFieldValue('nombre', capitalizarPalabras(grupoSeleccionado.nombre));
                                                }
                                            }
                                        }}
                                        error={form.errors.grupoEquivalenciaId}
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

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select
                                        style={{ flex: 1 }}
                                        withAsterisk
                                        label="Marca"
                                        data={mapOptions(marcas)}
                                        searchable
                                        searchValue={marcaSearch}
                                        onSearchChange={(value) => setMarcaSearch(value.toUpperCase())}
                                        {...form.getInputProps('marcaId')}
                                    />
                                    <ActionIcon size="lg" color="grape" variant="light" onClick={() => setModalMarca(true)}><IconPlus size={18} /></ActionIcon>
                                </Group>
                            </Grid.Col>

                            {/* 🔥 NUEVO ORDEN LÓGICO: Fila 2 (Nombre -> Código) */}
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <TextInput
                                    withAsterisk label="Nombre del Producto" placeholder="Ej. Inyectadora 3ml"
                                    value={form.values.nombre}
                                    // 🔥 Aplica capitalización a CADA palabra (Title Case)
                                    onChange={(e) => form.setFieldValue('nombre', capitalizarPalabras(e.currentTarget.value))}
                                    error={form.errors.nombre}
                                />
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    withAsterisk label="Código" placeholder="Ej. INY-3ML-01" autoCapitalize="characters"
                                    value={form.values.codigo}
                                    // 🔥 Fuerza a MAYÚSCULAS
                                    onChange={(e) => form.setFieldValue('codigo', e.currentTarget.value.toUpperCase())}
                                    error={form.errors.codigo}
                                />
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    label="Código de barras (unidad)" placeholder="Opcional" inputMode="numeric"
                                    description="El de la unidad suelta; vacío si no trae"
                                    value={form.values.codigoBarras}
                                    onChange={(e) => form.setFieldValue('codigoBarras', e.currentTarget.value.replace(/\s/g, ''))}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    label="Código de barras (caja)" placeholder="Opcional" inputMode="numeric"
                                    description="El de la caja cerrada; vacío si no trae"
                                    value={form.values.codigoBarrasCaja}
                                    onChange={(e) => form.setFieldValue('codigoBarrasCaja', e.currentTarget.value.replace(/\s/g, ''))}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    label="Código de barras (bulto)" placeholder="Opcional" inputMode="numeric"
                                    description="El del bulto; vacío si no trae"
                                    value={form.values.codigoBarrasBulto}
                                    onChange={(e) => form.setFieldValue('codigoBarrasBulto', e.currentTarget.value.replace(/\s/g, ''))}
                                />
                            </Grid.Col>

                            {/* 🔥 NUEVO ORDEN LÓGICO: Fila 3 (Etiquetas) */}
                            <Grid.Col span={12}>
                                <TagsInput
                                    label="Etiquetas (Tags)" description="Escribe una etiqueta y presiona Enter. Se normalizará automáticamente." placeholder="Agrega características..."
                                    data={tagOptionsStr} searchable clearable value={form.values.tags} error={form.errors.tags}
                                    onChange={(values) => {
                                        const normalized = values.map(v => v.trim().toLowerCase().replace(/[\s-]/g, ''));
                                        const unique = [...new Set(normalized)];
                                        const nuevosTags = unique.filter(v => !tagOptionsStr.includes(v));

                                        nuevosTags.forEach(nuevoTag => {
                                            fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: nuevoTag }) })
                                                .then(() => queryClient.invalidateQueries({ queryKey: ['tags'] }));
                                        });
                                        form.setFieldValue('tags', unique);
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                />
                            </Grid.Col>
                        </Grid>
                    </Paper>

                    {/* SECCIÓN 2: FINANZAS Y PRECIOS (AHORA CON 3 DECIMALES) */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="gray.0">
                        <Group mb="md" gap="xs"><IconCalculator color="#1971c2" /><Title order={4} c="blue.7">2. Estructura de Precios (Ref USD)</Title></Group>
                        <Grid align="flex-end">
                            {/* 🔥 Todos los NumberInput de dinero ajustados a 3 decimales 🔥 */}
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput withAsterisk label="Costo por unidad (USD)" description="Lo que cuesta UNA unidad (un guante, una jeringa)" decimalScale={5} prefix="$ " placeholder="Ej. 0.045" {...form.getInputProps('costoUsd')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput label="Precio 6 (Manual USD)" decimalScale={3} prefix="$ " placeholder="Ej. 12.000" {...form.getInputProps('precio6')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput label="Precio 7 (Manual USD)" decimalScale={3} prefix="$ " placeholder="Ej. 15.000" {...form.getInputProps('precio7')} /></Grid.Col>

                            <Grid.Col span={{ base: 12, md: 3 }}>
                                <Box mb="xs">
                                    <Checkbox
                                        label={<Text fw={600} size="sm">Aplica IVA (16%)</Text>}
                                        description="Si se desmarca, el IVA será 0%"
                                        checked={form.values.conIva}
                                        onChange={(e) => form.setFieldValue('conIva', e.currentTarget.checked)}
                                        color="blue" size="md"
                                    />
                                </Box>
                            </Grid.Col>
                        </Grid>

                        <Divider label="Promociones E-commerce" labelPosition="center" my="lg" />
                        <Grid align="flex-end">
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput
                                    label="% Descuento sobre Precio 7" description="Se activará como Oferta en la Tienda"
                                    suffix="%" placeholder="Ej. 15" min={0} max={99}
                                    {...form.getInputProps('porcentajeDescuento')}
                                />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                {Number(form.values.porcentajeDescuento) > 0 && Number(form.values.precio7) > 0 && (
                                    <Badge color="red" size="xl" variant="light" h={40} mb={6}>
                                        {/* 🔥 Resultado en 3 decimales 🔥 */}
                                        Precio Final Público: ${(Number(form.values.precio7) - (Number(form.values.precio7) * (Number(form.values.porcentajeDescuento) / 100))).toFixed(3)}
                                    </Badge>
                                )}
                            </Grid.Col>
                        </Grid>

                        {Number(form.values.costoUsd) > 0 && (
                            <Group mt="xl" bg="blue.1" p="sm" style={{ borderRadius: 8 }}>
                                <Text size="sm" fw={600} c="blue.9">Proyecciones automáticas:</Text>
                                {/* 🔥 Proyecciones en 3 decimales 🔥 */}
                                <Badge color="green" variant="light" size="lg">Precio 1 (35%): ${(Number(form.values.costoUsd) * 1.35).toFixed(3)}</Badge>
                                <Badge color="teal" variant="light" size="lg">Precio 4 (50%): ${(Number(form.values.costoUsd) * 1.50).toFixed(3)}</Badge>
                            </Group>
                        )}
                    </Paper>

                    {/* SECCIÓN 3: LOGÍSTICA E INVENTARIO */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">3. Logística e Inventario</Title>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Select label="Presentación (qué es UNA unidad: stock, costo y precios)" description="Unidad, par, paquete, caja x100/x200, metro o rollo. La caja (o el rollo, si se vende por metro) se define abajo" data={PRESENTACIONES} withAsterisk {...form.getInputProps('presentacion')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput label={form.values.presentacion === 'metro' ? "Metros por rollo (opcional)" : "Unidades por caja (opcional)"} description={form.values.presentacion === 'metro' ? "Cuántos metros trae el rollo completo; vacío si no se vende por rollo" : "Cuántas unidades (o pares) trae cada caja; vacío si no se vende en cajas"} placeholder="Ej. 100" min={1} {...form.getInputProps('unidadesPorCaja')} />
                            </Grid.Col>
                            {Number(form.values.unidadesPorCaja) > 0 ? (
                                <Grid.Col span={{ base: 12, md: 4 }}>
                                    <NumberInput label={form.values.presentacion === 'metro' ? 'Rollos por bulto (opcional)' : 'Cajas por bulto (opcional)'} description={(form.values.presentacion === 'metro' ? 'Rollos que trae el bulto con el que compras' : 'Cajas que trae el bulto con el que compras') + '; vacío si no se vende en bultos'} placeholder="Ej. 10" min={1} {...form.getInputProps('cajasPorBulto')} />
                                </Grid.Col>
                            ) : (
                                <Grid.Col span={{ base: 12, md: 4 }}>
                                    <NumberInput label="Unidades por bulto (opcional)" description="Sin cajas: el bulto trae las unidades directamente (p. ej. 10 paquetes x100 por bulto = 10); vacío si no se vende en bultos" placeholder="Ej. 3000" min={1} {...form.getInputProps('unidadesPorBulto')} />
                                </Grid.Col>
                            )}

                            {/* Del costo por unidad al costo de la caja y del bulto */}
                            {(() => {
                                const v = form.values;
                                const esCaja = Number(v.unidadesPorCaja) > 0;
                                const undCaja = Number(v.unidadesPorCaja) || 0;
                                const cajas = Number(v.cajasPorBulto) || 1;
                                const undBulto = esCaja ? cajas * undCaja : (Number(v.unidadesPorBulto) || 0);
                                const costo = Number(v.costoUsd) || 0;
                                if (!undBulto && !(esCaja && undCaja)) return null;
                                return (
                                    <Grid.Col span={12}>
                                        <Group gap="xs">
                                            {esCaja && undCaja > 0 && <Badge color="blue" variant="light" size="lg">1 bulto = {cajas} caja(s) × {undCaja} und = {undBulto} unidades</Badge>}
                                            {!esCaja && undBulto > 0 && <Badge color="blue" variant="light" size="lg">1 bulto = {undBulto} unidades</Badge>}
                                            {costo > 0 && esCaja && undCaja > 0 && <Badge color="teal" variant="light" size="lg">Costo por caja: {'$'}{(costo * undCaja).toFixed(2)}</Badge>}
                                            {costo > 0 && undBulto > 0 && <Badge color="grape" variant="light" size="lg">Costo por bulto: {'$'}{(costo * undBulto).toFixed(2)}</Badge>}
                                        </Group>
                                    </Grid.Col>
                                );
                            })()}

                            <Grid.Col span={12}><Divider my="sm" /></Grid.Col>

                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <NumberInput withAsterisk label="Stock Inicial (Almacén)" placeholder="Cantidad física" min={0} {...form.getInputProps('stockAlmacen')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <NumberInput
                                    label="Stock Mínimo (Alerta Crítica)" placeholder="Ej. 10" min={0}
                                    disabled={!!form.values.grupoEquivalenciaId}
                                    description={form.values.grupoEquivalenciaId ? "Desactivado. Se usará el mínimo del Grupo de Equivalencia." : ""}
                                    {...form.getInputProps('stockMinimo')}
                                />
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
                        <Button type="submit" size="lg" color={isEditMode ? "green.8" : "blue.9"} leftSection={<IconDeviceFloppy size={20} />} loading={isSubmitting}>
                            {isEditMode ? 'Actualizar Producto Completo' : 'Guardar Producto Completo'}
                        </Button>
                    </Group>
                </Stack>
            </form>

            {/* --- MODALES DINÁMICOS --- */}
            <Modal opened={modalCat} onClose={() => { setModalCat(false); formCategoria.reset(); }} title={<Title order={4}>Nueva Categoría</Title>} centered>
                <form onSubmit={formCategoria.onSubmit((values) => handleSubmitDiccionario('/api/categorias', 'categorias', 'categoriaId', values, {}, formCategoria, setModalCat))}>
                    <Stack gap="md">
                        {/* Categoría: Aplica Capitalización Inteligente */}
                        <TextInput
                            label="Nombre" placeholder="Ej. Descartables" autoFocus
                            value={formCategoria.values.nombre}
                            onChange={(e) => formCategoria.setFieldValue('nombre', capitalizarPalabras(e.currentTarget.value))}
                            error={formCategoria.errors.nombre}
                        />
                        <Button type="submit" fullWidth color="blue">Guardar Categoría</Button>
                    </Stack>
                </form>
            </Modal>

            <Modal opened={modalMarca} onClose={() => { setModalMarca(false); formMarca.reset(); }} title={<Title order={4}>Nueva Marca</Title>} centered>
                <form onSubmit={formMarca.onSubmit((values) => handleSubmitDiccionario('/api/marcas', 'marcas', 'marcaId', values, {}, formMarca, setModalMarca))}>
                    <Stack gap="md">
                        {/* 🔥 Marca: TODO MAYÚSCULAS 🔥 */}
                        <TextInput
                            label="Nombre de la Marca" autoFocus
                            value={formMarca.values.nombre}
                            onChange={(e) => formMarca.setFieldValue('nombre', e.currentTarget.value.toUpperCase())}
                            error={formMarca.errors.nombre}
                        />
                        <ImageDropzone label="Logo de la Marca (Opcional)" form={formMarca} fieldPath="imagen" />
                        <Button type="submit" fullWidth color="grape">Guardar Marca</Button>
                    </Stack>
                </form>
            </Modal>

            <Modal opened={modalGrupo} onClose={() => { setModalGrupo(false); formGrupo.reset(); }} title={<Title order={4}>Nuevo Grupo</Title>} centered>
                <form onSubmit={formGrupo.onSubmit((values) => handleSubmitDiccionario('/api/grupos-equivalencia', 'grupos', 'grupoEquivalenciaId', values, { categoriaId: form.values.categoriaId }, formGrupo, setModalGrupo))}>
                    <Stack gap="md">
                        {/* 🔥 Grupo Equivalencia: TODO MAYÚSCULAS 🔥 */}
                        <TextInput
                            label="Nombre del Grupo" autoFocus
                            value={formGrupo.values.nombre}
                            onChange={(e) => formGrupo.setFieldValue('nombre', e.currentTarget.value.toUpperCase())}
                            error={formGrupo.errors.nombre}
                        />
                        <NumberInput label="Stock Mínimo Global" placeholder="Ej. 20" min={0} {...formGrupo.getInputProps('stockMinimoGlobal')} />
                        <ImageDropzone label="Foto del Grupo (Opcional)" form={formGrupo} fieldPath="imagen" />
                        <Button type="submit" fullWidth color="teal">Guardar Grupo</Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}