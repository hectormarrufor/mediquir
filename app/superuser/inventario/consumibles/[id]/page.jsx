'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Container, Grid, Paper, Text, Title, Group, Badge,
    Image, Tabs, Table, LoadingOverlay, Button,
    ThemeIcon, Stack, RingProgress, Center, Card, Divider,
    Alert, Timeline,
    Avatar,
    UnstyledButton
} from '@mantine/core';
import {
    IconArrowLeft, IconEdit, IconCheck, IconX,
    IconClipboardList, IconTruck, IconLink, IconInfoCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

export default function DetalleConsumiblePage() {
    const { id } = useParams();
    const router = useRouter();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/inventario/consumibles/${id}`);
                if (!res.ok) throw new Error('Error al cargar datos');
                const result = await res.json();
                console.log("Datos del consumible cargados:", result);
                setData(result);
            } catch (error) {
                notifications.show({ title: 'Error', message: error.message, color: 'red' });
                router.push('/superuser/inventario/consumibles');
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchData();
    }, [id, router]);

    if (loading) return <LoadingOverlay visible />;
    if (!data) return null;

    // Helper para obtener imagen (prioridad hijo -> fallback)
    const imagenUrl = (data.Filtro?.imagen || data.imagen)
        ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${data.Filtro?.imagen || data.imagen}`
        : null;

    // Detectar tipo específico para mostrar datos
    const detallesHijo = data.Filtro || data.Aceite || data.Baterium || data.Bateria || data.Neumatico || data.Correa || {};
    const tipoEspecifico = data.Filtro ? 'Filtro' : data.Aceite ? 'Aceite' : data.Baterium || data.Bateria ? 'Batería' : 'Otro';

    return (
        <Container size="xl" py="md">
            {/* CABECERA Y NAVEGACIÓN */}
            <Group justify="space-between" mb="lg">
                <Button variant="subtle" leftSection={<IconArrowLeft size={18} />} onClick={() => router.back()}>
                    Volver a la lista
                </Button>
                <Button leftSection={<IconEdit size={18} />} onClick={() => router.push(`/superuser/inventario/consumibles/${id}/editar`)}>
                    Editar Consumible
                </Button>
            </Group>

            <Grid>
                {/* COLUMNA IZQUIERDA: RESUMEN E IMAGEN */}
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper withBorder radius="md" p="md" mb="md">
                        <Stack align="center" mb="md">
                            {imagenUrl ? (
                                <Image
                                    src={imagenUrl}
                                    alt={data.nombre}
                                    radius="md"
                                    h={250}
                                    fit="contain"
                                />
                            ) : (
                                <Center h={200} bg="gray.1" w="100%" style={{ borderRadius: 8 }}>
                                    <Text c="dimmed">Sin Imagen</Text>
                                </Center>
                            )}
                            <Title order={4} ta="center">{data.nombre}</Title>
                            <Group>
                                <Badge size="lg" color={data.tipo === 'serializado' ? 'orange' : 'blue'}>{data.tipo}</Badge>
                                <Badge size="lg" variant="outline">{data.categoria}</Badge>
                            </Group>
                        </Stack>

                        <Divider my="sm" />

                        <Group grow>
                            <Stack gap={0} align="center">
                                <Text size="xs" c="dimmed">Stock Actual</Text>
                                <Text fw={700} size="xl" c={Number(data.stockAlmacen) <= Number(data.stockMinimo) ? 'red' : 'green'}>
                                    {Number(data.stockAlmacen).toFixed(2)}
                                </Text>
                                <Text size="xs">{data.unidadMedida}</Text>
                            </Stack>
                            <Stack gap={0} align="center">
                                <Text size="xs" c="dimmed">Costo Prom.</Text>
                                <Text fw={700} size="xl">${Number(data.precioPromedio).toFixed(2)}</Text>
                            </Stack>
                        </Group>
                    </Paper>

                    {/* ESTADO DE STOCK VISUAL */}
                    <Card withBorder radius="md" p="md">
                        <Text size="sm" fw={500} mb="xs">Nivel de Inventario</Text>
                        <Group justify="center">
                            <RingProgress
                                size={140}
                                thickness={12}
                                roundCaps
                                sections={[
                                    { value: (Number(data.stockAlmacen) / (Number(data.stockMinimo) * 3)) * 100, color: 'blue' }
                                ]}
                                label={
                                    <Center>
                                        <ThemeIcon color="blue" variant="light" radius="xl" size="xl">
                                            <IconClipboardList size={22} />
                                        </ThemeIcon>
                                    </Center>
                                }
                            />
                        </Group>
                        <Text ta="center" size="sm" c="dimmed" mt="sm">
                            Mínimo requerido: {data.stockMinimo}
                        </Text>
                    </Card>
                </Grid.Col>

                {/* COLUMNA DERECHA: INFORMACIÓN DETALLADA (TABS) */}
                <Grid.Col span={{ base: 12, md: 8 }}>
                    <Paper withBorder radius="md" p="md" h="100%">
                        <Tabs defaultValue="detalles">
                            <Tabs.List>
                                <Tabs.Tab value="detalles" leftSection={<IconInfoCircle size={16} />}>
                                    Detalles Técnicos
                                </Tabs.Tab>
                                {data.tipo === 'serializado' && (
                                    <Tabs.Tab value="seriales" leftSection={<IconClipboardList size={16} />}>
                                        Seriales & Garantías
                                    </Tabs.Tab>
                                )}
                                <Tabs.Tab value="uso" leftSection={<IconTruck size={16} />}>
                                    Historial en Flota
                                </Tabs.Tab>
                                {data.Filtro && (
                                    <Tabs.Tab value="equivalencias" leftSection={<IconLink size={16} />}>
                                        Equivalencias
                                    </Tabs.Tab>
                                )}
                            </Tabs.List>

                            {/* TAB 1: DETALLES TÉCNICOS */}
                            <Tabs.Panel value="detalles" pt="xl">
                                <Title order={5} mb="md">Especificaciones de {tipoEspecifico}</Title>
                                <Table striped withTableBorder>
                                    <Table.Tbody>
                                        <Table.Tr><Table.Td fw={700}>Marca</Table.Td><Table.Td>{detallesHijo.marca || 'Genérica'}</Table.Td></Table.Tr>

                                        {/* Renderizado condicional según tipo */}
                                        {data.Filtro && (
                                            <>
                                                <Table.Tr><Table.Td fw={700}>Código Filtro</Table.Td><Table.Td>{data.Filtro.codigo}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Función</Table.Td><Table.Td>{data.Filtro.tipo}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Posición</Table.Td><Table.Td>{data.Filtro.posicion}</Table.Td></Table.Tr>
                                            </>
                                        )}

                                        {data.Aceite && (
                                            <>
                                                <Table.Tr><Table.Td fw={700}>Viscosidad</Table.Td><Table.Td>{data.Aceite.viscosidad}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Tipo Base</Table.Td><Table.Td>{data.Aceite.tipoBase}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Aplicación</Table.Td><Table.Td>{data.Aceite.aplicacion}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Modelo</Table.Td><Table.Td>{data.Aceite.modelo}</Table.Td></Table.Tr>
                                            </>
                                        )}

                                        {(data.Bateria || data.Baterium) && (
                                            <>
                                                <Table.Tr><Table.Td fw={700}>Grupo/Código</Table.Td><Table.Td>{detallesHijo.codigo}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Amperaje (CCA)</Table.Td><Table.Td>{detallesHijo.amperaje} A</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Voltaje</Table.Td><Table.Td>{detallesHijo.voltaje} V</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Capacidad</Table.Td><Table.Td>{detallesHijo.capacidad} Ah</Table.Td></Table.Tr>
                                            </>
                                        )}

                                        {data.Neumatico && (
                                            <>
                                                <Table.Tr><Table.Td fw={700}>Medida</Table.Td><Table.Td>{data.Neumatico.medida}</Table.Td></Table.Tr>
                                                <Table.Tr><Table.Td fw={700}>Modelo</Table.Td><Table.Td>{data.Neumatico.modelo}</Table.Td></Table.Tr>
                                            </>
                                        )}
                                    </Table.Tbody>
                                </Table>
                            </Tabs.Panel>

                            {/* TAB 2: SERIALES (Solo si es serializado) */}
                            <Tabs.Panel value="seriales" pt="xl">
                                {data.serializados && data.serializados.length > 0 ? (
                                    <Table highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Serial</Table.Th>
                                                <Table.Th>Estado</Table.Th>
                                                <Table.Th>Fecha Compra</Table.Th>
                                                <Table.Th>Ubicación</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {data.serializados.map((item) => (
                                                <Table.Tr key={item.id}>
                                                    <Table.Td fw={600}>{item.serial}</Table.Td>
                                                    <Table.Td>
                                                        <Badge color={item.estado === 'disponible' ? 'green' : 'blue'}>
                                                            {item.estado}
                                                        </Badge>
                                                    </Table.Td>
                                                    <Table.Td>{new Date(item.fechaCompra).toLocaleDateString()}</Table.Td>
                                                    <Table.Td>
                                                        <UnstyledButton onClick={() => router.push(`/superuser/flota/activos/${item.activo.id}`)}>
                                                            {
                                                                item.activo.vehiculoInstancia ?
                                                                    item.activo.vehiculoInstancia.plantilla.tipoVehiculo + " " + item.activo.vehiculoInstancia.plantilla.marca + " " + item.activo.vehiculoInstancia.plantilla.modelo + " " + item.activo.vehiculoInstancia.placa :
                                                                item.activo.maquinaInstancia ?
                                                                    item.activo.maquinaInstancia.plantilla.tipo + " " + item.activo.maquinaInstancia.plantilla.marca + " " + item.activo.maquinaInstancia.plantilla.modelo + " " + item.activo.maquinaInstancia.placa :
                                                                item.activo.remolqueInstancia ?
                                                                    item.activo.remolqueInstancia.plantilla.tipoRemolque + " " + item.activo.remolqueInstancia.plantilla.marca + " " + item.activo.remolqueInstancia.plantilla.modelo + " " + item.activo.remolqueInstancia.placa :
                                                                'En Almacén'
                                                            }
                                                        </UnstyledButton>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                ) : (
                                    <Alert color="blue">No hay unidades serializadas registradas.</Alert>
                                )}
                            </Tabs.Panel>

                            {/* TAB 3: USO EN FLOTA */}
                            <Tabs.Panel value="uso" pt="xl">
                                {data.instalaciones && data.instalaciones.length > 0 ? (
                                    <Timeline active={data.instalaciones.length} bulletSize={24} lineWidth={2}>
                                        {data.instalaciones.map((uso) => {
                                            // 🔥 CORRECCIÓN: Leemos uso.subsistema?.activo en lugar de activoPadre 🔥
                                            const activoPadre = uso.subsistema?.activo;
                                            let nombreVehiculo = 'Vehículo Desconocido';
                                            let idVehiculo = null;

                                            if (activoPadre) {
                                                idVehiculo = activoPadre.id;
                                                if (activoPadre.vehiculoInstancia) {
                                                    nombreVehiculo = `${activoPadre.vehiculoInstancia.plantilla.marca} ${activoPadre.vehiculoInstancia.plantilla.modelo} - Placa: ${activoPadre.vehiculoInstancia.placa}`;
                                                } else if (activoPadre.maquinaInstancia) {
                                                    nombreVehiculo = `${activoPadre.maquinaInstancia.plantilla.marca} - Placa: ${activoPadre.maquinaInstancia.placa}`;
                                                } else if (activoPadre.remolqueInstancia) {
                                                    nombreVehiculo = `Remolque Placa: ${activoPadre.remolqueInstancia.placa}`;
                                                }
                                            }

                                            return (
                                                <Timeline.Item
                                                    key={uso.id}
                                                    bullet={<IconTruck size={12} />}
                                                    title={
                                                        <Group gap="xs">
                                                            <Text>Instalado en</Text>
                                                            {idVehiculo ? (
                                                                <Text 
                                                                    component="a" 
                                                                    href={`/superuser/flota/activos/${idVehiculo}`} 
                                                                    c="blue" 
                                                                    fw={600} 
                                                                    style={{ cursor: 'pointer', textDecoration: 'none' }}
                                                                >
                                                                    {nombreVehiculo}
                                                                </Text>
                                                            ) : (
                                                                <Text fw={600}>{nombreVehiculo}</Text>
                                                            )}
                                                            
                                                            {uso.esEquivalente && (
                                                                <Badge 
                                                                    color="indigo" 
                                                                    variant="light" 
                                                                    style={{ cursor: 'pointer' }}
                                                                    onClick={() => router.push(`/superuser/inventario/consumibles/${uso.consumibleId}`)}
                                                                >
                                                                    {uso.fichaTecnica?.nombre} (Equivalente)
                                                                </Badge>
                                                            )}
                                                        </Group>
                                                    }
                                                >
                                                    <Text c="dimmed" size="sm" mt={4}>
                                                        Subsistema: {uso.subsistema?.nombre || 'General'}
                                                    </Text>
                                                    <Text c="dimmed" size="sm">
                                                        Fecha de Montaje: {new Date(uso.createdAt).toLocaleDateString()}
                                                    </Text>
                                                    <Text size="xs" mt={4}>
                                                        Cantidad: {uso.cantidad} {data.unidadMedida}
                                                    </Text>
                                                </Timeline.Item>
                                            );
                                        })}
                                    </Timeline>
                                ) : (
                                    <Alert title="Sin Uso Registrado" color="gray" icon={<IconInfoCircle />}>
                                        Ni este consumible ni sus equivalentes han sido asignados a ningún vehículo.
                                    </Alert>
                                )}
                            </Tabs.Panel>

                            {/* TAB 4: EQUIVALENCIAS (Solo Filtros) */}
                            <Tabs.Panel value="equivalencias" pt="xl">
                                {data.Filtro?.grupoEquivalencia ? (
                                    <Stack>
                                        <Alert variant="light" color="green" title={data.Filtro.grupoEquivalencia.nombre}>
                                            {data.Filtro.grupoEquivalencia.nombre}
                                        </Alert>

                                        <Table withTableBorder>
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th>Imagen</Table.Th>
                                                    <Table.Th>Marca</Table.Th>
                                                    <Table.Th>Código</Table.Th>
                                                    <Table.Th>Precio Promedio</Table.Th>
                                                    <Table.Th>Stock Almacén</Table.Th>
                                                    <Table.Th>Link</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {data?.Filtro.grupoEquivalencia.filtros
                                                    .filter(f => f.id !== data.Filtro.id) // Excluir el actual
                                                    .map(hermano => (
                                                        <Table.Tr key={hermano.id}>
                                                            <Table.Td>
                                                                <Avatar
                                                                    src={hermano.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${hermano.imagen}` : null}
                                                                    alt={hermano.codigo}
                                                                    radius="xl"
                                                                />
                                                            </Table.Td>
                                                            <Table.Td>{hermano.marca}</Table.Td>
                                                            <Table.Td fw={700}>{hermano.codigo}</Table.Td>
                                                            <Table.Td fw={700}>{hermano.Consumible.precioPromedio}</Table.Td>
                                                            <Table.Td fw={700}>{hermano.Consumible.stockAlmacen}</Table.Td>
                                                            <Table.Td>
                                                                <Button
                                                                    size="xs"
                                                                    variant="subtle"
                                                                    onClick={() => router.push(`/superuser/inventario/consumibles/${hermano.consumibleId}`)}
                                                                >
                                                                    Ver
                                                                </Button>
                                                            </Table.Td>
                                                        </Table.Tr>
                                                    ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Stack>
                                ) : (
                                    <Alert color="gray">No hay equivalencias registradas para este filtro.</Alert>
                                )}
                            </Tabs.Panel>
                        </Tabs>
                    </Paper>
                </Grid.Col>
            </Grid>
        </Container>
    );
}