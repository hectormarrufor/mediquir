'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
    Box, Button, Group, Title, Table, Badge, ActionIcon, 
    Loader, Center, Text, Paper, Avatar, TextInput, Select, 
    ScrollArea, Stack, Tooltip, Card, Grid, Divider, ThemeIcon, Progress, 
    Modal 
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { 
    IconPlus, IconEdit, IconTrash, IconSearch, 
    IconFilter, IconBox, IconTags, IconSitemap, IconX 
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';

// =======================================================================
// 1. TARJETA MÓVIL INDIVIDUAL
// =======================================================================
const ProductoCardMovil = ({ prod, stockPorGrupos, onEdit, onDelete, onImageClick }) => {
    let isCritico = false;
    if (prod.grupoEquivalenciaId) {
        const totalGrupo = stockPorGrupos[prod.grupoEquivalenciaId] || 0;
        isCritico = totalGrupo <= prod.grupoEquivalencia.stockMinimoGlobal;
    } else {
        isCritico = Number(prod.stockAlmacen) <= Number(prod.stockMinimo);
    }

    const imgSrc = prod.imagen 
        ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${prod.imagen}` 
        : (prod.marca?.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${prod.marca.imagen}` : null);

    return (
        <Card withBorder radius="md" p="md" shadow="sm" bg="white">
            <Group wrap="nowrap" align="flex-start" justify="space-between" mb="sm">
                <Group wrap="nowrap" gap="sm" style={{ flex: 1 }}>
                    <Avatar 
                        src={imgSrc} 
                        alt={prod.nombre} 
                        radius="sm" 
                        size="lg" 
                        color="blue"
                        styles={{ image: { objectFit: 'contain' } }}
                        style={{ cursor: imgSrc ? 'pointer' : 'default' }}
                        onClick={() => imgSrc && onImageClick(imgSrc)}
                    >
                        {prod.nombre.charAt(0)}
                    </Avatar>
                    <Box style={{ flex: 1 }}>
                        <Text fw={700} size="sm" lh={1.2} lineClamp={2}>{prod.nombre}</Text>
                        <Group gap={4} mt={4}>
                            <Text size="xs" c="dimmed">{prod.codigo}</Text>
                            {prod.marca && <Badge size="xs" variant="dot" color="grape">{prod.marca.nombre}</Badge>}
                        </Group>
                    </Box>
                </Group>
                <Badge color={isCritico ? 'red' : (prod.grupoEquivalenciaId ? 'teal' : 'green')} variant={prod.grupoEquivalenciaId ? 'filled' : 'light'} size="xs">
                    {isCritico ? 'Crítico' : 'Óptimo'}
                </Badge>
            </Group>

            <Divider variant="dotted" mb="sm" />

           <Grid gutter="xs" mb="sm">
                <Grid.Col span={6}>
                    <Text size="xs" c="dimmed">Presentación</Text>
                    <Text size="sm" tt="capitalize" fw={500} lh={1.1}>
                        {prod.presentacion} 
                        {prod.presentacion === 'caja' && prod.unidadesPorCaja && <Text span size="xs" c="dimmed"> ({prod.unidadesPorCaja}u)</Text>}
                    </Text>
                </Grid.Col>
                <Grid.Col span={6}>
                    <Text size="xs" c="dimmed">Unds x Bulto</Text>
                    <Text size="sm" fw={500} lh={1.1}>{prod.unidadesPorBulto}</Text>
                </Grid.Col>

                {/* 🔥 NUEVA FILA DE FINANZAS (Costo, P6, P7) 🔥 */}
                <Grid.Col span={8}>
                    <Group gap="md">
                        <Box>
                            <Text size="xs" c="dimmed">Costo</Text>
                            <Text size="sm" fw={700} c="green.8" lh={1.1}>${Number(prod.costoUsd).toFixed(2)}</Text>
                        </Box>
                        {Number(prod.precio6) > 0 && (
                            <Box>
                                <Text size="xs" c="dimmed">P6</Text>
                                <Text size="sm" fw={600} c="blue.7" lh={1.1}>${Number(prod.precio6).toFixed(2)}</Text>
                            </Box>
                        )}
                        {Number(prod.precio7) > 0 && (
                            <Box>
                                <Text size="xs" c="dimmed">P7</Text>
                                <Text size="sm" fw={600} c="grape.7" lh={1.1}>${Number(prod.precio7).toFixed(2)}</Text>
                            </Box>
                        )}
                    </Group>
                </Grid.Col>

                <Grid.Col span={4}>
                    <Text size="xs" c="dimmed">Stock Actual</Text>
                    <Text size="sm" fw={900} lh={1.1}>{Number(prod.stockAlmacen)}</Text>
                </Grid.Col>
            </Grid>

            {prod.tags && prod.tags.length > 0 && (
                <Group gap={4} mb="md">
                    {prod.tags.map(t => <Badge key={t.id} size="xs" color="gray" variant="light" style={{ textTransform: 'lowercase' }}>#{t.nombre}</Badge>)}
                </Group>
            )}

            <Group grow gap="xs">
                <Button variant="light" color="blue" size="xs" leftSection={<IconEdit size={16} />} onClick={onEdit}>Editar</Button>
                <Button variant="light" color="red" size="xs" leftSection={<IconTrash size={16} />} onClick={onDelete}>Eliminar</Button>
            </Group>
        </Card>
    );
};

// =======================================================================
// 2. COMPONENTE RENDERIZADOR (Tabla en Desktop, Cards en Móvil)
// =======================================================================
const ProductosVista = ({ items, stockPorGrupos, isMobile, onEdit, onDelete, onImageClick }) => {
    if (isMobile) {
        return (
            <Stack gap="xs">
                {items.map((prod) => (
                    <ProductoCardMovil 
                        key={prod.id} prod={prod} stockPorGrupos={stockPorGrupos} 
                        onEdit={() => onEdit(prod.id)} onDelete={() => onDelete(prod.id, prod.nombre)} 
                        onImageClick={onImageClick}
                    />
                ))}
            </Stack>
        );
    }

    return (
        <ScrollArea offsetScrollbars>
            <Table striped highlightOnHover withTableBorder withColumnBorders bg="white" style={{ minWidth: 1000 }}>
                <Table.Thead bg="blue.0">
                    <Table.Tr>
                        <Table.Th w={60}></Table.Th>
                        <Table.Th>Producto y Marca</Table.Th>
                        <Table.Th>Presentación</Table.Th>
                        <Table.Th>Etiquetas</Table.Th>
                        <Table.Th>Finanzas (USD)</Table.Th>
                        <Table.Th>Stock Actual</Table.Th>
                        <Table.Th>Estado Alerta</Table.Th>
                        <Table.Th ta="center">Acciones</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {items.map((prod) => {
                        let isCritico = false;
                        if (prod.grupoEquivalenciaId) {
                            const totalGrupo = stockPorGrupos[prod.grupoEquivalenciaId] || 0;
                            isCritico = totalGrupo <= prod.grupoEquivalencia.stockMinimoGlobal;
                        } else {
                            isCritico = Number(prod.stockAlmacen) <= Number(prod.stockMinimo);
                        }

                        const imgSrc = prod.imagen 
                            ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${prod.imagen}` 
                            : (prod.marca?.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${prod.marca.imagen}` : null);

                        return (
                            <Table.Tr key={prod.id}>
                                <Table.Td>
                                    <Avatar 
                                        src={imgSrc} 
                                        alt={prod.nombre} 
                                        radius="sm" 
                                        size="lg" 
                                        color="blue"
                                        styles={{ image: { objectFit: 'contain' } }}
                                        style={{ cursor: imgSrc ? 'pointer' : 'default' }}
                                        onClick={() => imgSrc && onImageClick(imgSrc)}
                                    >
                                        {prod.nombre.charAt(0)}
                                    </Avatar>
                                </Table.Td>
                                <Table.Td>
                                    <Stack gap={2}>
                                        <Text fw={700} size="sm" lh={1.1}>{prod.nombre}</Text>
                                        <Group gap="xs">
                                            <Text size="xs" c="dimmed">{prod.codigo}</Text>
                                            {prod.marca && <Badge size="xs" variant="dot" color="grape">{prod.marca.nombre}</Badge>}
                                        </Group>
                                    </Stack>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" tt="capitalize" fw={500}>{prod.presentacion}</Text>
                                    {prod.presentacion === 'caja' && prod.unidadesPorCaja && <Text size="xs" c="dimmed">({prod.unidadesPorCaja} unds/caja)</Text>}
                                    <Text size="xs" c="gray.6">Bulto: {prod.unidadesPorBulto}</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Group gap={4} maw={200}>
                                        {prod.tags?.map(t => <Badge key={t.id} size="xs" color="gray" variant="light" style={{ textTransform: 'lowercase' }}>#{t.nombre}</Badge>)}
                                        {(!prod.tags || prod.tags.length === 0) && <Text size="xs" c="dimmed">-</Text>}
                                    </Group>
                                </Table.Td>
                                {/* 🔥 COLUMNA FINANZAS MULTIPRECIO 🔥 */}
                                <Table.Td>
                                    <Text fw={700} c="green.8" title="Costo Base">
                                        C: ${Number(prod.costoUsd).toFixed(2)}
                                    </Text>
                                    
                                    {Number(prod.precio6) > 0 && (
                                        <Text size="xs" fw={600} c="blue.7" title="Precio 6 Manual">
                                            P6: ${Number(prod.precio6).toFixed(2)}
                                        </Text>
                                    )}
                                    
                                    {Number(prod.precio7) > 0 && (
                                        <Text size="xs" fw={600} c="grape.7" title="Precio 7 Manual">
                                            P7: ${Number(prod.precio7).toFixed(2)}
                                        </Text>
                                    )}
                                    
                                    <Text size="xs" c="dimmed" mt={4}>IVA: {prod.porcentajeIva}%</Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text fw={800} size="md">{Number(prod.stockAlmacen)}</Text>
                                </Table.Td>
                                <Table.Td>
                                    {prod.grupoEquivalenciaId ? (
                                        <Tooltip label={`Total del Grupo: ${stockPorGrupos[prod.grupoEquivalenciaId]}. Mínimo exigido: ${prod.grupoEquivalencia.stockMinimoGlobal}`}>
                                            <Badge color={isCritico ? 'red' : 'teal'} variant="filled" style={{ cursor: 'help' }}>{isCritico ? 'Crítico (G)' : 'Óptimo (G)'}</Badge>
                                        </Tooltip>
                                    ) : (
                                        <Badge color={isCritico ? 'red' : 'green'} variant="light">{isCritico ? 'Crítico' : 'Óptimo'}</Badge>
                                    )}
                                </Table.Td>
                                <Table.Td ta="center">
                                    <Group gap="xs" justify="center" wrap="nowrap">
                                        <ActionIcon variant="light" color="blue" title="Editar" onClick={() => onEdit(prod.id)}><IconEdit size={16} /></ActionIcon>
                                        <ActionIcon variant="light" color="red" title="Eliminar" onClick={() => onDelete(prod.id, prod.nombre)}><IconTrash size={16} /></ActionIcon>
                                    </Group>
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </ScrollArea>
    );
};

// =======================================================================
// 3. COMPONENTE PRINCIPAL DE LA PÁGINA
// =======================================================================
export default function ListaProductos() {
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 768px)');

    const [search, setSearch] = useState('');
    const [filterMarca, setFilterMarca] = useState(null);
    const [filterTag, setFilterTag] = useState(null);
    
    // Estado para el Visor de Imágenes (Lightbox)
    const [imagenAmpliada, setImagenAmpliada] = useState(null);

    const { data: productos, isLoading, isError } = useQuery({
        queryKey: ['productos'],
        queryFn: async () => {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error('Error al cargar los productos');
            return res.json();
        }
    });

    const stockPorGrupos = useMemo(() => {
        if (!productos) return {};
        const sums = {};
        productos.forEach(p => {
            if (p.grupoEquivalencia) {
                sums[p.grupoEquivalencia.id] = (sums[p.grupoEquivalencia.id] || 0) + Number(p.stockAlmacen);
            }
        });
        return sums;
    }, [productos]);

    const filterOptions = useMemo(() => {
        if (!productos) return { marcas: [], tags: [] };
        const marcasSet = new Set(), tagsSet = new Set();
        productos.forEach(p => {
            if (p.marca?.nombre) marcasSet.add(p.marca.nombre);
            p.tags?.forEach(t => tagsSet.add(t.nombre));
        });
        return { marcas: Array.from(marcasSet).sort(), tags: Array.from(tagsSet).sort() };
    }, [productos]);

    const productosFiltrados = useMemo(() => {
        if (!productos) return [];
        let filtrados = productos;
        if (search) {
            const lowerSearch = search.toLowerCase();
            filtrados = filtrados.filter(p => {
                const nombreMatch = p.nombre ? p.nombre.toLowerCase().includes(lowerSearch) : false;
                const codigoMatch = p.codigo ? p.codigo.toLowerCase().includes(lowerSearch) : false;
                return nombreMatch || codigoMatch;
            });
        }
        if (filterMarca) filtrados = filtrados.filter(p => p.marca?.nombre === filterMarca);
        if (filterTag) filtrados = filtrados.filter(p => p.tags?.some(t => t.nombre === filterTag));
        return filtrados;
    }, [productos, search, filterMarca, filterTag]);

    const inventarioAnidado = useMemo(() => {
        return productosFiltrados.reduce((acc, producto) => {
            const catNombre = producto.categoria?.nombre || 'Sin Categoría';
            
            if (!acc[catNombre]) {
                acc[catNombre] = { grupos: {}, sinGrupo: [] };
            }

            if (producto.grupoEquivalencia) {
                const gId = producto.grupoEquivalencia.id;
                if (!acc[catNombre].grupos[gId]) {
                    acc[catNombre].grupos[gId] = { info: producto.grupoEquivalencia, productos: [] };
                }
                acc[catNombre].grupos[gId].productos.push(producto);
            } else {
                acc[catNombre].sinGrupo.push(producto);
            }
            return acc;
        }, {});
    }, [productosFiltrados]);

    const eliminarProducto = async (id, nombre) => {
        if (confirm(`¿Estás seguro de eliminar "${nombre}"? Esta acción no se puede deshacer.`)) {
            try {
                const res = await fetch(`/api/productos/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Error al eliminar');
                notifications.show({ title: 'Éxito', message: 'Producto eliminado', color: 'green' });
                router.refresh();
            } catch (error) {
                notifications.show({ title: 'Error', message: error.message, color: 'red' });
            }
        }
    };

    if (isLoading) return <Center h="50vh"><Loader size="lg" /></Center>;
    if (isError) return <Center h="50vh"><Text c="red">Error al cargar inventario.</Text></Center>;

    return (
        <Box p={isMobile ? "xs" : "md"} maw={1400} mx="auto">
            {/* CABECERA */}
            <Group justify="space-between" mb="xl" align="center">
                <Title order={2} c="blue.9" size={isMobile ? "h3" : "h2"}>Inventario</Title>
                <Button leftSection={<IconPlus size={16} />} onClick={() => router.push('/superuser/inventario/productos/nuevo')} color="blue" size={isMobile ? "sm" : "md"} radius="md">
                    {isMobile ? 'Nuevo' : 'Nuevo Producto'}
                </Button>
            </Group>

            {/* FILTROS */}
            <Paper p="md" radius="md" withBorder bg="gray.0" mb="xl">
                <Grid align="flex-end">
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <TextInput label="Buscar" placeholder="Nombre o SKU..." leftSection={<IconSearch size={16} />} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, md: 4 }}>
                        <Select label="Marca" placeholder="Todas" data={filterOptions.marcas} value={filterMarca} onChange={setFilterMarca} clearable searchable leftSection={<IconFilter size={16} />} />
                    </Grid.Col>
                    <Grid.Col span={{ base: 6, md: 4 }}>
                        <Select label="Etiqueta" placeholder="Todos los tags" data={filterOptions.tags} value={filterTag} onChange={setFilterTag} clearable searchable leftSection={<IconTags size={16} />} />
                    </Grid.Col>
                </Grid>
            </Paper>

            {/* RENDERIZADO ANIDADO */}
            {Object.keys(inventarioAnidado || {}).length === 0 ? (
                <Paper p="xl" withBorder ta="center" radius="md"><Text c="dimmed">No se encontraron productos.</Text></Paper>
            ) : (
                Object.entries(inventarioAnidado).map(([categoria, contenido]) => (
                    <Box key={categoria} mb={isMobile ? "xl" : 40}>
                        
                        <Group mb="md" gap="xs">
                            <IconBox color="#1971c2" size={28} />
                            <Title order={3} c="blue.9">{categoria}</Title>
                            <Badge color="blue" variant="light" radius="xl" size="lg">
                                {Object.values(contenido.grupos).reduce((sum, g) => sum + g.productos.length, 0) + contenido.sinGrupo.length}
                            </Badge>
                        </Group>

                        {/* GRUPOS DE EQUIVALENCIA */}
                        {Object.values(contenido.grupos).map(grupo => {
                            const totalGrupo = stockPorGrupos[grupo.info.id] || 0;
                            const minimoGlobal = grupo.info.stockMinimoGlobal;
                            const isCritico = totalGrupo <= minimoGlobal;
                            const porcentaje = minimoGlobal > 0 ? Math.min((totalGrupo / minimoGlobal) * 100, 100) : 100;

                            return (
                                <Paper key={grupo.info.id} withBorder p={isMobile ? "sm" : "md"} mb="lg" radius="md" bg="gray.0">
                                    <Group justify="space-between" mb="xs">
                                        <Group gap="xs">
                                            {/* Avatar del Grupo adaptado para Lightbox */}
                                            <Avatar 
                                                src={grupo.info.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${grupo.info.imagen}` : null} 
                                                radius="md" 
                                                size="md"
                                                color="teal"
                                                styles={{ image: { objectFit: 'contain' } }}
                                                style={{ cursor: grupo.info.imagen ? 'pointer' : 'default' }}
                                                onClick={() => grupo.info.imagen && setImagenAmpliada(`${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${grupo.info.imagen}`)}
                                            >
                                                {grupo.info.nombre?.charAt(0).toUpperCase()}
                                            </Avatar>
                                            <Title order={5} c="teal.9">Grupo: {grupo.info.nombre}</Title>
                                        </Group>
                                        <Group gap="sm">
                                            <Text size="sm" fw={600} c={isCritico ? 'red.7' : 'teal.7'}>
                                                Stock Total: {totalGrupo} / {minimoGlobal}
                                            </Text>
                                            <Badge color={isCritico ? 'red' : 'teal'} variant="filled">
                                                {isCritico ? 'Déficit' : 'Óptimo'}
                                            </Badge>
                                        </Group>
                                    </Group>

                                    <Progress value={porcentaje} color={isCritico ? 'red' : 'teal'} size="sm" mb="md" radius="xl" striped={!isCritico} />

                                    <ProductosVista 
                                        items={grupo.productos} stockPorGrupos={stockPorGrupos} isMobile={isMobile}
                                        onEdit={(id) => router.push(`/superuser/inventario/productos/${id}/editar`)}
                                        onDelete={eliminarProducto}
                                        onImageClick={setImagenAmpliada}
                                    />
                                </Paper>
                            );
                        })}

                        {/* PRODUCTOS SIN GRUPO */}
                        {contenido.sinGrupo.length > 0 && (
                            <Box mt="md" pl={Object.keys(contenido.grupos).length > 0 ? "md" : 0}>
                                {Object.keys(contenido.grupos).length > 0 && (
                                    <Title order={6} mb="sm" c="gray.6" tt="uppercase" lts={1}>
                                        Productos Individuales
                                    </Title>
                                )}
                                <ProductosVista 
                                    items={contenido.sinGrupo} stockPorGrupos={stockPorGrupos} isMobile={isMobile}
                                    onEdit={(id) => router.push(`/superuser/inventario/productos/${id}/editar`)}
                                    onDelete={eliminarProducto}
                                    onImageClick={setImagenAmpliada}
                                />
                            </Box>
                        )}
                    </Box>
                ))
            )}

            {/* 🔥 VISOR DE IMÁGENES (LIGHTBOX TIPO FACEBOOK) 🔥 */}
            <Modal
                opened={!!imagenAmpliada}
                onClose={() => setImagenAmpliada(null)}
                size="auto"
                centered
                withCloseButton={false}
                styles={{
                    root: { zIndex: 9999 },
                    content: { backgroundColor: 'transparent', boxShadow: 'none' }, // Fondo transparente
                    body: { padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }
                }}
            >
                {imagenAmpliada && (
                    <Box pos="relative">
                        {/* Botón Flotante para Cerrar */}
                        <ActionIcon 
                            onClick={() => setImagenAmpliada(null)} 
                            radius="xl" 
                            color="dark" 
                            variant="filled" 
                            pos="absolute" 
                            top={-15} 
                            right={-15}
                            style={{ zIndex: 10, border: '2px solid white' }}
                        >
                            <IconX size={16} />
                        </ActionIcon>
                        {/* Imagen Expandida (Sin deformarse) */}
                        <img 
                            src={imagenAmpliada} 
                            alt="Vista ampliada" 
                            style={{ maxWidth: '100vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px' }} 
                        />
                    </Box>
                )}
            </Modal>

        </Box>
    );
}