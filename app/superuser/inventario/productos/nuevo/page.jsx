'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@mantine/form';
import {
    Box, Button, Group, Title, TextInput, NumberInput,
    Select, MultiSelect, Paper, Stack, Grid, Modal, ActionIcon,
    Text, Divider, Badge, TagsInput
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconArrowLeft, IconPlus, IconCalculator } from '@tabler/icons-react';
import ImageDropzone from '@/app/components/ImageDropzone';

export default function NuevoProducto() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- ESTADOS PARA MODALES (Diccionarios) ---
    const [modalCat, setModalCat] = useState(false);
    const [modalMarca, setModalMarca] = useState(false);
    const [modalGrupo, setModalGrupo] = useState(false);


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

    // --- MAPEO PARA SELECTS ---
    const mapOptions = (data) => data?.map(item => ({ value: item.id.toString(), label: item.nombre })) || [];
    // Simplificamos el diccionario a un arreglo de strings en minúsculas
    const tagOptionsStr = tagsList?.map(t => t.nombre.toLowerCase()) || [];

    const form = useForm({
        initialValues: {
            nombre: '',
            codigo: '',
            categoriaId: '',
            marcaId: '',
            grupoEquivalenciaId: '',
            tags: [],
            costoUsd: '',
            precio6: '',
            precio7: '',
            porcentajeIva: 16,
            presentacion: 'unidad',
            unidadesPorCaja: '',
            unidadesPorBulto: 1,
            stockAlmacen: '',
            stockMinimo: '',
            imagen: null
        },
        validate: {
            nombre: (value) => (!value || value.trim().length < 3 ? 'Mínimo 3 caracteres' : null),
            // Validación estricta para el código: sin espacios y en mayúsculas
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
            unidadesPorCaja: (value, values) => (values.presentacion === 'caja' && (!value || Number(value) <= 0) ? 'Debe ser mayor a 0' : null),
            unidadesPorBulto: (value) => (!value || Number(value) < 1 ? 'Mínimo 1 unidad por bulto' : null),
        }
    });

    const formMarca = useForm({
        initialValues: { nombre: '', imagen: null },
        validate: { nombre: (val) => (val.trim().length < 2 ? 'Nombre muy corto' : null) }
    });

    // Formulario para nuevo Grupo
    const formGrupo = useForm({
        initialValues: { nombre: '', stockMinimoGlobal: 0, imagen: null },
        validate: { nombre: (val) => (val.trim().length < 2 ? 'Nombre muy corto' : null) }
    });

    const formCategoria = useForm({
        initialValues: { nombre: '' },
        validate: { nombre: (val) => (val.trim().length < 2 ? 'Nombre muy corto' : null) }
    });


    const handleSubmitDiccionario = async (endpoint, queryKey, fieldName, values, extraData = {}, formInstance, closeModalFn) => {
        try {
            let payload = { nombre: values.nombre, ...extraData, stockMinimoGlobal: values.stockMinimoGlobal };


            // Si subió una imagen para la Marca o Grupo, la procesamos
            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'upload-dict', title: 'Subiendo logo...', message: 'Espera...', loading: true });
                const fileExt = values.imagen.name.split('.').pop();
                const uniqueFilename = `${queryKey}_${Date.now()}.${fileExt}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, { method: 'POST', body: values.imagen });
                if (!response.ok) throw new Error('Falló la subida de la imagen');

                payload.imagen = uniqueFilename;
                notifications.update({ id: 'upload-dict', title: 'Éxito', message: 'Logo subido', color: 'green' });
            }
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            queryClient.invalidateQueries({ queryKey: [queryKey] });
            form.setFieldValue(fieldName, data.id.toString()); // Selecciona automáticamente lo que acabamos de crear en el form principal

            formInstance.reset();
            closeModalFn(false);
            notifications.show({ title: 'Éxito', message: 'Registro creado', color: 'green' });
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        }
    };

    // --- ENVÍO PRINCIPAL DEL PRODUCTO ---
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
                unidadesPorCaja: values.presentacion === 'caja' ? Number(values.unidadesPorCaja) : null,
            };

            // Lógica de subida de imagen
            if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
                const fileExtension = values.imagen.name.split('.').pop();
                const uniqueFilename = `${values.codigo.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.${fileExtension}`;

                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
                    method: 'POST', body: values.imagen,
                });
                if (!response.ok) throw new Error('Falló la subida de la imagen');

                payload.imagen = uniqueFilename;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida', color: 'green' });
            }

            // Enviar Producto a la API
            const res = await fetch('/api/productos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar el producto');

            notifications.show({ title: 'Éxito', message: 'Producto registrado correctamente', color: 'green' });
            queryClient.invalidateQueries({ queryKey: ['productos'] });
            router.push('/superuser/inventario/productos');

        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Box p="md" maw={1000} mx="auto">
            <Group mb="xl">
                <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} onClick={() => router.back()}>Volver</Button>
                <Title order={2} c="blue.9">Registrar Nuevo Producto</Title>
            </Group>

            <form onSubmit={form.onSubmit(handleSubmitProducto)}>
                <Stack gap="xl">

                    {/* SECCIÓN 1: DATOS COMERCIALES */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">1. Datos Comerciales y Clasificación</Title>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <TextInput withAsterisk label="Nombre del Producto" placeholder="Ej. Inyectadora 3ml" {...form.getInputProps('nombre')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <TextInput
                                    withAsterisk
                                    label="Código"
                                    placeholder="Ej. INY-3ML-01"
                                    // 1. Forzamos la capitalización en dispositivos móviles y teclados
                                    autoCapitalize="characters"
                                    // 2. Forzamos que cualquier texto ingresado se convierta a mayúsculas en tiempo real
                                    value={form.values.codigo}
                                    onChange={(event) => form.setFieldValue('codigo', event.currentTarget.value.toUpperCase())}
                                    error={form.errors.codigo}
                                />
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select style={{ flex: 1 }} withAsterisk label="Categoría" data={mapOptions(categorias)} searchable {...form.getInputProps('categoriaId')} />
                                    <ActionIcon size="lg" color="blue" variant="light" onClick={() => setModalCat(true)}><IconPlus size={18} /></ActionIcon>
                                </Group>
                            </Grid.Col>

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Group align="flex-end" gap="xs" wrap="nowrap">
                                    <Select style={{ flex: 1 }} withAsterisk label="Marca" data={mapOptions(marcas)} searchable {...form.getInputProps('marcaId')} />
                                    <ActionIcon size="lg" color="grape" variant="light" onClick={() => setModalMarca(true)}><IconPlus size={18} /></ActionIcon>
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
                                        // 🔥 MAGIA DE AUTOMATIZACIÓN AQUÍ 🔥
                                        onChange={(val) => {
                                            // 1. Actualizamos el valor del select en el formulario
                                            form.setFieldValue('grupoEquivalenciaId', val);

                                            // 2. Si el usuario seleccionó un grupo, buscamos su nombre y lo inyectamos
                                            if (val) {
                                                const grupoSeleccionado = grupos.find(g => g.id.toString() === val);
                                                if (grupoSeleccionado) {
                                                    form.setFieldValue('nombre', grupoSeleccionado.nombre);
                                                }
                                            }
                                        }}
                                    />
                                    <ActionIcon
                                        size="lg" color="teal" variant="light" mb={22}
                                        onClick={() => {
                                            if (!form.values.categoriaId) {
                                                notifications.show({ title: 'Aviso', message: 'Selecciona primero una Categoría para que el grupo la herede.', color: 'orange' });
                                                return;
                                            }
                                            setModalGrupo(true);
                                        }}
                                    >
                                        <IconPlus size={18} />
                                    </ActionIcon>
                                </Group>
                            </Grid.Col>

                            <Grid.Col span={12}>
                                {/* EL SÚPER TAGS-INPUT INTELIGENTE */}
                                <TagsInput
                                    label="Etiquetas (Tags)"
                                    description="Escribe una etiqueta y presiona Enter. Se normalizará automáticamente."
                                    placeholder="Agrega características..."
                                    data={tagOptionsStr}
                                    searchable
                                    clearable
                                    // 1. Usamos value y onChange directamente en lugar de getInputProps para tener control total
                                    value={form.values.tags}
                                    error={form.errors.tags}
                                    onChange={(values) => {
                                        // values es un arreglo con lo que el usuario seleccionó/escribió (Ej. ['neonatal', 'neo natal'])

                                        // A. Normalizamos todo a minúsculas y sin espacios ni guiones
                                        const normalizedValues = values.map(v => v.trim().toLowerCase().replace(/[\s\-]/g, ''));

                                        // B. Eliminamos posibles duplicados (por si el usuario seleccionó "neonatal" y luego escribió "neo natal")
                                        const uniqueValues = [...new Set(normalizedValues)];

                                        // C. Filtramos para saber cuáles de estos tags son NUEVOS (no existen en la base de datos)
                                        const nuevosTags = uniqueValues.filter(v => !tagOptionsStr.includes(v));

                                        // D. Hacemos el POST silencioso SÓLO para los tags que son nuevos
                                        nuevosTags.forEach(nuevoTag => {
                                            fetch('/api/tags', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ nombre: nuevoTag })
                                            }).then(() => queryClient.invalidateQueries({ queryKey: ['tags'] }));
                                        });

                                        // E. Guardamos en el formulario el arreglo limpio y normalizado
                                        form.setFieldValue('tags', uniqueValues);
                                    }}
                                    // 2. BLOQUEO DE SEGURIDAD: Evitamos que presionar 'Enter' envíe el formulario por accidente
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                        }
                                    }}
                                />
                            </Grid.Col>
                        </Grid>
                    </Paper>

                    {/* SECCIÓN 2: FINANZAS Y PRECIOS */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="gray.0">
                        <Group mb="md" gap="xs"><IconCalculator color="#1971c2" /><Title order={4} c="blue.7">2. Estructura de Precios (Ref USD)</Title></Group>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput withAsterisk label="Costo (USD)" decimalScale={2} prefix="$ " {...form.getInputProps('costoUsd')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput label="Precio 6 (Manual USD)" decimalScale={2} prefix="$ " {...form.getInputProps('precio6')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput label="Precio 7 (Manual USD)" decimalScale={2} prefix="$ " {...form.getInputProps('precio7')} /></Grid.Col>
                            <Grid.Col span={{ base: 12, md: 3 }}><NumberInput withAsterisk label="% de IVA" min={0} suffix=" %" {...form.getInputProps('porcentajeIva')} /></Grid.Col>
                        </Grid>
                        {form.values.costoUsd > 0 && (
                            <Group mt="md" bg="blue.1" p="sm" style={{ borderRadius: 8 }}>
                                <Text size="sm" fw={600} c="blue.9">Proyecciones automáticas:</Text>
                                <Badge color="green" variant="light" size="lg">Precio 1 (35%): ${(form.values.costoUsd * 1.35).toFixed(2)}</Badge>
                                <Badge color="teal" variant="light" size="lg">Precio 4 (50%): ${(form.values.costoUsd * 1.50).toFixed(2)}</Badge>
                            </Group>
                        )}
                    </Paper>


                    {/* SECCIÓN 3: LOGÍSTICA E INVENTARIO */}
                    <Paper withBorder shadow="sm" p="xl" radius="md" bg="white">
                        <Title order={4} mb="md" c="gray.7">3. Logística e Inventario</Title>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <Select
                                    label="Presentación Venta"
                                    data={[
                                        { value: 'unidad', label: 'Unidad' },
                                        { value: 'par', label: 'Par' },
                                        { value: 'paqx2', label: 'Paquete x2' },
                                        { value: 'paqx4', label: 'Paquete x4' },
                                        { value: 'caja', label: 'Caja' }
                                    ]}
                                    withAsterisk
                                    {...form.getInputProps('presentacion')}
                                />
                            </Grid.Col>

                            {/* Renderizado Condicional: Solo sale si es Caja */}
                            {form.values.presentacion === 'caja' && (
                                <Grid.Col span={{ base: 12, md: 4 }}>
                                    <NumberInput withAsterisk label="Unidades por Caja" placeholder="Ej. 50" min={1} {...form.getInputProps('unidadesPorCaja')} />
                                </Grid.Col>
                            )}

                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <NumberInput label="Despacho en Bultos (Und/Bulto)" description="¿Cuántos ítems trae un bulto mayor?" min={1} {...form.getInputProps('unidadesPorBulto')} />
                            </Grid.Col>

                            <Grid.Col span={12}><Divider my="sm" /></Grid.Col>

                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <NumberInput withAsterisk label="Stock Inicial (Almacén)" placeholder="0" min={0} {...form.getInputProps('stockAlmacen')} />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 6 }}>
                                <NumberInput
                                    label="Stock Mínimo (Alerta Crítica)"
                                    placeholder="0"
                                    min={0}
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
                        <Button type="submit" size="lg" color="blue.9" leftSection={<IconDeviceFloppy size={20} />} loading={isSubmitting}>
                            Guardar Producto Completo
                        </Button>
                    </Group>
                </Stack>
            </form>

            {/* MODAL DE CATEGORÍA */}
            <Modal opened={modalCat} onClose={() => { setModalCat(false); formCategoria.reset(); }} title={<Title order={4}>Nueva Categoría</Title>} centered>
                <form onSubmit={formCategoria.onSubmit((values) => handleSubmitDiccionario('/api/categorias', 'categorias', 'categoriaId', values, {}, formCategoria, setModalCat))}>
                    <Stack gap="md">
                        <TextInput label="Nombre" placeholder="Ej. Descartables" {...formCategoria.getInputProps('nombre')} autoFocus />
                        <Button type="submit" fullWidth color="blue">Guardar Categoría</Button>
                    </Stack>
                </form>
            </Modal>

            {/* MODAL DE MARCA */}
            <Modal opened={modalMarca} onClose={() => { setModalMarca(false); formMarca.reset(); }} title={<Title order={4}>Nueva Marca</Title>} centered>
                <form onSubmit={formMarca.onSubmit((values) => handleSubmitDiccionario('/api/marcas', 'marcas', 'marcaId', values, {}, formMarca, setModalMarca))}>
                    <Stack gap="md">
                        <TextInput label="Nombre de la Marca" {...formMarca.getInputProps('nombre')} autoFocus />
                        <ImageDropzone label="Logo de la Marca (Opcional)" form={formMarca} fieldPath="imagen" />
                        <Button type="submit" fullWidth color="grape">Guardar Marca</Button>
                    </Stack>
                </form>
            </Modal>

            {/* MODAL DE GRUPO DE EQUIVALENCIA */}
            <Modal opened={modalGrupo} onClose={() => { setModalGrupo(false); formGrupo.reset(); }} title={<Title order={4}>Nuevo Grupo</Title>} centered>
                <form onSubmit={formGrupo.onSubmit((values) => handleSubmitDiccionario('/api/grupos-equivalencia', 'grupos', 'grupoEquivalenciaId', values, { categoriaId: form.values.categoriaId }, formGrupo, setModalGrupo))}>
                    <Stack gap="md">
                        <TextInput label="Nombre del Grupo" {...formGrupo.getInputProps('nombre')} autoFocus />
                        <NumberInput label="Stock Mínimo Global" {...formGrupo.getInputProps('stockMinimoGlobal')} />
                        <ImageDropzone label="Foto del Grupo (Opcional)" form={formGrupo} fieldPath="imagen" />
                        <Button type="submit" fullWidth color="teal">Guardar Grupo</Button>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}