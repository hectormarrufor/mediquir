'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Menu, Paper, SegmentedControl, Select, SimpleGrid, Stack, Switch, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowBackUp, IconChevronsDown, IconChevronsUp, IconColumns3, IconDownload, IconFileTypePdf, IconFilterOff, IconLock, IconLockOpen, IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { COLUMNAS } from '../_lib/columnas';
import { aQueryString } from '../_hooks/useInventarioParams';

const ESTADOS = [
    { value: '', label: 'Todos' },
    { value: 'agotado', label: 'Agotados' },
    { value: 'bajo', label: 'Bajo mínimo' },
    { value: 'ok', label: 'Óptimos' },
];

const aOpciones = (lista) => (lista || []).map((o) => ({ value: String(o.id), label: o.nombre }));

export default function BarraFiltros({
    params, setParams, hayFiltros, limpiarFiltros, opciones, isMobile,
    columnasVisibles, setColumnasVisibles, onRestablecerColumnas, puedeEditar, bloqueado, setBloqueado,
    onDeshacer, hayHistorial, onNuevo, onListaPrecios, grupos = [], contraidos = new Set(), setContraidos = () => {},
}) {
    // La búsqueda se envía al servidor 300 ms después de dejar de teclear.
    // OJO: la URL tarda en actualizarse. Antes, al llegar el valor de la URL se pisaba lo que la persona ya seguía escribiendo
    // (se perdían letras y los espacios, porque la URL guarda el texto sin espacios al final). Ahora solo se copia de la URL al campo
    // cuando el cambio NO lo mandamos nosotros (botón "limpiar filtros", atrás del navegador, enlace compartido).
    const [texto, setTexto] = useState(params.q);
    const [textoDebounced] = useDebouncedValue(texto, 300);
    const enviado = useRef(params.q);
    useEffect(() => {
        if (params.q !== enviado.current) { enviado.current = params.q; setTexto(params.q); }
    }, [params.q]);
    useEffect(() => {
        const q = textoDebounced.trim();
        if (q !== enviado.current) { enviado.current = q; setParams({ q }); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textoDebounced]);

    const { page: _p, pageSize: _s, ...filtrosCsv } = params;
    const hrefCsv = `/api/inventario/productos?${aQueryString({ ...filtrosCsv, formato: 'csv' })}`;

    const selector = (placeholder, datos, clave, ancho, extra = {}) => (
        <Select
            key={clave} size="xs" placeholder={placeholder} data={datos} value={params[clave] || null}
            onChange={(v) => setParams({ [clave]: v })} clearable maw={isMobile ? undefined : ancho} {...extra}
        />
    );

    const filtros = [
        selector('Categoría', aOpciones(opciones?.categorias), 'categoriaId', 180, { searchable: true }),
        selector('Marca', aOpciones(opciones?.marcas), 'marcaId', 180, { searchable: true }),
        selector('Grupo de equivalencia', aOpciones(opciones?.grupos), 'grupoId', 230, { searchable: true }),
        selector('Etiqueta', aOpciones(opciones?.tags), 'tagId', 160, { searchable: true }),
        selector('Ofertas', [{ value: 'con', label: 'Con descuento' }, { value: 'sin', label: 'Sin descuento' }], 'oferta', 150),
    ];

    const acciones = (
        <Group gap={6} wrap="wrap" ml={isMobile ? 0 : 'auto'}>
            {hayFiltros && <Button size="xs" variant="subtle" color="red" leftSection={<IconFilterOff size={14} />} onClick={limpiarFiltros} tt="none">Limpiar</Button>}

            {puedeEditar && (
                <>
                    <Tooltip label={hayHistorial ? 'Deshacer última edición (Ctrl+Z)' : 'Nada que deshacer'}>
                        <ActionIcon variant="default" size="lg" disabled={!hayHistorial} onClick={onDeshacer} aria-label="Deshacer"><IconArrowBackUp size={18} /></ActionIcon>
                    </Tooltip>
                    {!isMobile && (
                        <Switch
                            size="sm" color="teal" checked={!bloqueado} onChange={(e) => setBloqueado(!e.currentTarget.checked)}
                            onLabel={<IconLockOpen size={12} />} offLabel={<IconLock size={12} />}
                            label="Edición" aria-label="Activar edición en la hoja"
                        />
                    )}
                </>
            )}

            {!isMobile && grupos.length > 0 && (
                <Button size="xs" variant="default" tt="none" onClick={() => setContraidos(contraidos.size ? new Set() : new Set(grupos))}
                    leftSection={contraidos.size ? <IconChevronsDown size={14} /> : <IconChevronsUp size={14} />}>
                    {contraidos.size ? 'Expandir grupos' : 'Contraer grupos'}
                </Button>
            )}

            {!isMobile && (
                <Menu shadow="md" closeOnItemClick={false} position="bottom-end">
                    <Menu.Target><Button size="xs" variant="default" leftSection={<IconColumns3 size={14} />} tt="none">Columnas</Button></Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Columnas visibles</Menu.Label>
                        {COLUMNAS.filter((c) => !c.fija).map((c) => (
                            <Menu.Item key={c.key} onClick={() => setColumnasVisibles(columnasVisibles.includes(c.key) ? columnasVisibles.filter((k) => k !== c.key) : [...columnasVisibles, c.key])}>
                                <Checkbox size="xs" readOnly label={c.label} checked={columnasVisibles.includes(c.key)} styles={{ root: { pointerEvents: 'none' } }} />
                            </Menu.Item>
                        ))}
                        <Menu.Divider />
                        <Menu.Label>Arrastra el título de una columna para moverla y su borde derecho para cambiar el ancho</Menu.Label>
                        <Menu.Item closeMenuOnClick onClick={onRestablecerColumnas}>Restablecer orden y anchos</Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            )}

            <Tooltip label="PDF con fotos: elige Precio 6 o Precio 7">
                <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} onClick={onListaPrecios} tt="none">Lista de precios</Button>
            </Tooltip>
            <Tooltip label="Descarga todo el resultado filtrado para Excel">
                <Button component="a" href={hrefCsv} size="xs" variant="default" leftSection={<IconDownload size={14} />} tt="none">CSV</Button>
            </Tooltip>
            <Button size="xs" color="navy.9" leftSection={<IconPlus size={14} />} onClick={onNuevo} tt="none">Nuevo</Button>
        </Group>
    );

    return (
        <Paper withBorder radius="md" p="sm" mb="sm" bg="white">
            <Stack gap="sm">
                <Group gap="sm" wrap={isMobile ? 'wrap' : 'nowrap'}>
                    <TextInput
                        flex={1} miw={isMobile ? '100%' : 260}
                        placeholder="Buscar por nombre, código, marca o etiqueta…"
                        leftSection={<IconSearch size={16} />}
                        rightSection={texto ? <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setTexto('')} aria-label="Borrar búsqueda"><IconX size={14} /></ActionIcon> : null}
                        value={texto}
                        onChange={(e) => setTexto(e.currentTarget.value)}
                    />
                    <SegmentedControl
                        size="xs" radius="xl" color="navy.9" value={params.stock} data={ESTADOS}
                        onChange={(v) => setParams({ stock: v })}
                        fullWidth={isMobile}
                    />
                </Group>

                {isMobile ? (
                    <>
                        <SimpleGrid cols={2} spacing="xs">{filtros}</SimpleGrid>
                        {acciones}
                    </>
                ) : (
                    <Group gap="sm" wrap="wrap">{filtros}{acciones}</Group>
                )}
            </Stack>
        </Paper>
    );
}
