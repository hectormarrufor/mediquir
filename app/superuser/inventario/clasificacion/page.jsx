'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ActionIcon, Alert, Anchor, Avatar, Badge, Box, Button, Center, Group, Loader, Paper, Table, Tabs, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconArrowLeft, IconCategory, IconEdit, IconLink, IconPlus, IconSearch, IconTags, IconTrash, IconX } from '@tabler/icons-react';
import ModalBorrar from './_components/ModalBorrar';
import ModalFormulario from './_components/ModalFormulario';

// Marcas, categorías y grupos de equivalencia en un solo lugar (antes marcas y grupos tenían cada uno su pantalla suelta,
// sin enlace en ningún menú, y las categorías no tenían ninguna). Se llega desde Inventario y desde la hoja de productos.
const PESTANAS = [
    {
        value: 'categorias', tipo: 'categoria', label: 'Categorías', icono: IconCategory, api: '/api/categorias', nuevo: 'Nueva categoría', creado: 'Categoría creada', vacio: 'Todavía no hay categorías', filtro: 'categoriaId', color: 'blue',
        ayuda: 'Cada producto pertenece a una categoría (p. ej. «Guantes», «Jeringas»). Sirven para filtrar el inventario, la tienda y la lista de precios.',
    },
    {
        value: 'marcas', tipo: 'marca', label: 'Marcas', icono: IconTags, api: '/api/marcas', nuevo: 'Nueva marca', creado: 'Marca creada', vacio: 'Todavía no hay marcas', filtro: 'marcaId', color: 'grape',
        ayuda: 'El fabricante de cada producto. En la lista de precios, el logo sirve de foto cuando ni el producto ni su grupo tienen foto.',
    },
    {
        value: 'grupos', tipo: 'grupo', label: 'Grupos de equivalencia', icono: IconLink, api: '/api/grupos-equivalencia', nuevo: 'Nuevo grupo', creado: 'Grupo creado', vacio: 'Todavía no hay grupos', filtro: 'grupoId', color: 'teal',
        ayuda: 'Productos que se sustituyen entre sí (lo mismo en otra marca o presentación). La hoja de inventario los muestra juntos, con el stock total y un mínimo para todo el grupo.',
    },
];
const LISTA = { categoria: 'categorias', marca: 'marcas', grupo: 'grupos' };
const pestanaDeTipo = (tipo) => PESTANAS.find((p) => p.tipo === tipo);

const IMG = process.env.NEXT_PUBLIC_IMG_BASE;
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function pedir(url, opciones) {
    const r = await fetch(url, opciones);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo completar la operación');
    return { ...j, _estado: r.status };
}

function Clasificacion() {
    const router = useRouter();
    const sp = useSearchParams();
    const qc = useQueryClient();
    const isMobile = useMediaQuery('(max-width: 48em)');

    const tab = PESTANAS.some((p) => p.value === sp.get('tab')) ? sp.get('tab') : 'categorias';
    const pestana = PESTANAS.find((p) => p.value === tab);
    const [busqueda, setBusqueda] = useState('');
    const [formulario, setFormulario] = useState(null); // { tipo, item|null }
    const [aBorrar, setABorrar] = useState(null);       // { tipo, item }

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ['clasificacion'],
        queryFn: async () => pedir('/api/inventario/clasificacion'),
    });
    const puedeEditar = Boolean(data?.permisos?.editar);

    const filas = useMemo(() => {
        const lista = data?.[LISTA[pestana.tipo]] || [];
        const q = sinAcentos(busqueda.trim());
        return q ? lista.filter((x) => sinAcentos(`${x.nombre} ${x.descripcion || ''} ${x.categoria || ''}`).includes(q)) : lista;
    }, [data, pestana.tipo, busqueda]);

    const cambiarTab = (v) => {
        setBusqueda('');
        router.replace(`/superuser/inventario/clasificacion?tab=${v}`, { scroll: false });
    };

    // Todo lo que muestra estas listas en otras pantallas (formulario de producto, hoja de inventario, filtros)
    const refrescar = () => Promise.all(['clasificacion', 'categorias', 'marcas', 'grupos', 'productos'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

    const guardar = async (item, datos) => {
        const p = pestanaDeTipo(formulario.tipo);
        try {
            const r = await pedir(item ? `${p.api}/${item.id}` : p.api, {
                method: item ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
            });
            if (!item && p.tipo === 'marca' && r._estado === 200) {
                notifications.show({ color: 'orange', message: `La marca «${r.nombre}» ya existía: no se creó otra.` });
            } else {
                notifications.show({ color: 'teal', message: item ? 'Cambios guardados' : `${p.creado}: «${datos.nombre}»` });
            }
            setFormulario(null);
            await refrescar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo guardar', message: e.message });
        }
    };

    const borrar = async (item, opciones) => {
        const p = pestanaDeTipo(aBorrar.tipo);
        const qs = new URLSearchParams(Object.entries(opciones).filter(([, v]) => v)).toString();
        try {
            const r = await pedir(`${p.api}/${item.id}${qs ? `?${qs}` : ''}`, { method: 'DELETE' });
            notifications.show({ color: 'teal', message: r.message || 'Borrado' });
            setABorrar(null);
            await refrescar();
        } catch (e) {
            notifications.show({ color: 'red', title: 'No se pudo borrar', message: e.message });
        }
    };

    const verProductos = (x) => router.push(`/superuser/inventario/productos?${pestana.filtro}=${x.id}`);
    const celdaProductos = (x) => (x.nProductos > 0
        ? <Tooltip label="Ver estos productos en la hoja de inventario"><Anchor size="sm" fw={600} onClick={() => verProductos(x)}>{x.nProductos}</Anchor></Tooltip>
        : <Text size="sm" c="dimmed">Ninguno</Text>);
    const foto = (x) => (
        <Avatar src={x.imagen ? `${IMG}/${x.imagen}` : null} color={pestana.color} radius="sm">{x.nombre.charAt(0)}</Avatar>
    );
    const acciones = (x) => (puedeEditar ? (
        <Group gap={6} justify="center" wrap="nowrap">
            <Tooltip label="Cambiar"><ActionIcon variant="light" color="blue" onClick={() => setFormulario({ tipo: pestana.tipo, item: x })} aria-label="Cambiar"><IconEdit size={16} /></ActionIcon></Tooltip>
            <Tooltip label="Borrar"><ActionIcon variant="light" color="red" onClick={() => setABorrar({ tipo: pestana.tipo, item: x })} aria-label="Borrar"><IconTrash size={16} /></ActionIcon></Tooltip>
        </Group>
    ) : null);

    const COLUMNAS = {
        categoria: [
            { titulo: 'Categoría', celda: (x) => (<><Text fw={600}>{x.nombre}</Text>{x.descripcion && <Text size="xs" c="dimmed">{x.descripcion}</Text>}</>) },
            { titulo: 'Productos', ta: 'center', w: 100, celda: celdaProductos },
            { titulo: 'Grupos', ta: 'center', w: 90, celda: (x) => <Text size="sm" c={x.nGrupos ? undefined : 'dimmed'}>{x.nGrupos || '—'}</Text> },
        ],
        marca: [
            { titulo: 'Logo', w: 64, celda: foto },
            { titulo: 'Marca', celda: (x) => <Text fw={600}>{x.nombre}</Text> },
            { titulo: 'Productos', ta: 'center', w: 100, celda: celdaProductos },
        ],
        grupo: [
            { titulo: 'Imagen', w: 64, celda: foto },
            { titulo: 'Grupo', celda: (x) => <Text fw={600}>{x.nombre}</Text> },
            { titulo: 'Categoría', celda: (x) => <Text size="sm" c={x.categoria ? undefined : 'red'}>{x.categoria || 'Sin categoría'}</Text> },
            { titulo: 'Stock mínimo', ta: 'center', w: 110, celda: (x) => <Text size="sm" fw={700} c="teal.8">{x.stockMinimoGlobal}</Text> },
            { titulo: 'Productos', ta: 'center', w: 100, celda: celdaProductos },
        ],
    };
    const columnas = COLUMNAS[pestana.tipo];

    return (
        <Box p="md" maw={1100} mx="auto">
            <Group mb="xs" gap="sm" wrap="nowrap">
                <Button variant="subtle" color="gray.3" px={6} leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/inventario')} tt="none">Inventario</Button>
                <Title order={2} c="white" fz={isMobile ? 20 : 26}>Marcas, categorías y grupos</Title>
            </Group>
            <Text size="sm" c="gray.4" mb="md">
                Así se ordenan los productos: cada uno tiene una categoría y una marca, y puede estar en un grupo de equivalencia.
            </Text>

            <Paper withBorder radius="md" p="md" bg="white">
                <Tabs value={tab} onChange={cambiarTab} keepMounted={false}>
                    <Tabs.List mb="md">
                        {PESTANAS.map((p) => (
                            <Tabs.Tab
                                key={p.value} value={p.value} color={p.color} leftSection={<p.icono size={16} />}
                                rightSection={data ? <Badge size="sm" variant="light" color={p.color}>{(data[LISTA[p.tipo]] || []).length}</Badge> : null}
                            >
                                {p.label}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                </Tabs>

                <Text size="sm" c="dimmed" mb="sm">{pestana.ayuda}</Text>

                <Group gap="sm" mb="sm" wrap={isMobile ? 'wrap' : 'nowrap'}>
                    <TextInput
                        flex={1} miw={isMobile ? '100%' : 240} placeholder={`Buscar en ${pestana.label.toLowerCase()}…`}
                        leftSection={<IconSearch size={16} />} value={busqueda} onChange={(e) => setBusqueda(e.currentTarget.value)}
                        rightSection={busqueda ? <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setBusqueda('')} aria-label="Borrar búsqueda"><IconX size={14} /></ActionIcon> : null}
                    />
                    {puedeEditar && (
                        <Button color={pestana.color} leftSection={<IconPlus size={16} />} onClick={() => setFormulario({ tipo: pestana.tipo, item: null })} tt="none" fullWidth={isMobile}>
                            {pestana.nuevo}
                        </Button>
                    )}
                </Group>

                {data && !puedeEditar && (
                    <Alert color="gray" variant="light" mb="sm" p="xs">
                        <Text size="xs">Solo puedes consultar. Para crear, cambiar o borrar hace falta el permiso de edición de inventario.</Text>
                    </Alert>
                )}

                {isLoading ? (
                    <Center h={240}><Loader /></Center>
                ) : isError ? (
                    <Alert color="red" icon={<IconAlertCircle size={18} />} title="No se pudo cargar" variant="light">
                        {error?.message} <Button size="compact-sm" variant="white" ml="sm" onClick={() => refetch()} tt="none">Reintentar</Button>
                    </Alert>
                ) : (
                    <Table.ScrollContainer minWidth={pestana.tipo === 'grupo' ? 760 : 520}>
                        <Table striped highlightOnHover verticalSpacing="xs">
                            <Table.Thead bg={`${pestana.color}.0`}>
                                <Table.Tr>
                                    {columnas.map((c) => <Table.Th key={c.titulo} ta={c.ta} w={c.w}>{c.titulo}</Table.Th>)}
                                    {puedeEditar && <Table.Th ta="center" w={100}>Acciones</Table.Th>}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {filas.map((x) => (
                                    <Table.Tr key={x.id}>
                                        {columnas.map((c) => <Table.Td key={c.titulo} ta={c.ta}>{c.celda(x)}</Table.Td>)}
                                        {puedeEditar && <Table.Td>{acciones(x)}</Table.Td>}
                                    </Table.Tr>
                                ))}
                                {!filas.length && (
                                    <Table.Tr>
                                        <Table.Td colSpan={columnas.length + 1}>
                                            <Text size="sm" c="dimmed" ta="center" py="md">{busqueda ? 'Nada coincide con la búsqueda' : pestana.vacio}</Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Paper>

            <ModalFormulario
                key={formulario?.tipo || pestana.tipo}
                tipo={formulario?.tipo || pestana.tipo} abierto={Boolean(formulario)} item={formulario?.item || null}
                categorias={data?.categorias || []} onCerrar={() => setFormulario(null)} onGuardar={guardar}
            />
            <ModalBorrar
                tipo={aBorrar?.tipo || pestana.tipo} item={aBorrar?.item || null}
                otros={aBorrar ? data?.[LISTA[aBorrar.tipo]] || [] : []}
                onCerrar={() => setABorrar(null)} onBorrar={borrar}
            />
        </Box>
    );
}

export default function ClasificacionPage() {
    return (
        <Suspense fallback={<Center h="50vh"><Loader /></Center>}>
            <Clasificacion />
        </Suspense>
    );
}
