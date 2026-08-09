'use client';
import { useState, useEffect } from 'react';
import {
    Box, Title, Group, Paper, Text, Table, Badge, ActionIcon,
    TextInput, Select, Stack, Center, Loader, Tooltip,
    ThemeIcon, Grid, Accordion, Button, Modal, Card, SimpleGrid
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { 
    IconSearch, IconEngine, IconTruck, IconSettings, 
    IconTractor, IconArrowLeft, IconPlus, IconTrash, 
    IconBoxSeam, IconCar,
    IconEye
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

export default function ListaSubsistemasPage() {
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 48em)');

    const [subsistemas, setSubsistemas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [procesando, setProcesando] = useState(false);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroCategoria, setFiltroCategoria] = useState(null);

    // Estados para Crear Plantilla
    const [modalCrearOpened, setModalCrearOpened] = useState(false);
    const [modelosPadre, setModelosPadre] = useState([]); 
    const [cargandoModelos, setCargandoModelos] = useState(false);
    const [nuevaPlantilla, setNuevaPlantilla] = useState({
        nombre: '', categoria: '', tipoPlantilla: 'Vehiculo', plantillaId: ''
    });

    const fetchSubsistemas = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/gestionMantenimiento/subsistemas/global');
            const data = await res.json();
            const items = data.data || data.items || [];
            setSubsistemas(items);
        } catch (error) {
            notifications.show({ title: 'Error', message: 'No se pudieron cargar las plantillas', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchSubsistemas(); }, []);

    useEffect(() => {
        if (modalCrearOpened) {
            setCargandoModelos(true);
            const endpoint = 
                nuevaPlantilla.tipoPlantilla === 'Vehiculo' ? '/api/gestionMantenimiento/vehiculos' :
                nuevaPlantilla.tipoPlantilla === 'Remolque' ? '/api/gestionMantenimiento/remolques' :
                '/api/gestionMantenimiento/maquinas';

            fetch(endpoint)
                .then(res => res.json())
                .then(data => {
                    const items = data.data || data.items || [];
                    setModelosPadre(items.map(i => ({ 
                        value: i.id.toString(), 
                        label: `${i.marca} ${i.modelo}` 
                    })));
                    setNuevaPlantilla(prev => ({ ...prev, plantillaId: '' }));
                })
                .catch(() => notifications.show({ message: 'Error cargando modelos', color: 'red' }))
                .finally(() => setCargandoModelos(false));
        }
    }, [modalCrearOpened, nuevaPlantilla.tipoPlantilla]);

    const handleCrearPlantilla = async () => {
        if (!nuevaPlantilla.nombre || !nuevaPlantilla.categoria || !nuevaPlantilla.plantillaId) {
            return notifications.show({ message: 'Complete todos los campos requeridos', color: 'orange' });
        }
        setProcesando(true);
        try {
            const res = await fetch('/api/gestionMantenimiento/subsistemas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevaPlantilla)
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Plantilla Creada', message: 'El subsistema se agregó al ecosistema', color: 'teal' });
                setModalCrearOpened(false);
                setNuevaPlantilla({ nombre: '', categoria: '', tipoPlantilla: 'Vehiculo', plantillaId: '' });
                fetchSubsistemas();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    const handleEliminarPlantilla = async (id, nombre) => {
        const confirm1 = window.confirm(
            `⚠️ ALERTA DE CONFIGURACIÓN MAESTRA ⚠️\n\nEstá a punto de ELIMINAR permanentemente la plantilla del subsistema: "${nombre.toUpperCase()}".\n\n¿Desea proceder con la primera verificación?`
        );
        if (!confirm1) return;

        const confirm2 = window.confirm(
            `🛑 IMPACTO DE INVENTARIO Y TRAZABILIDAD CONTABLE 🛑\n\nEsta acción ejecutará un reverso táctico automático:\n1. Extirpará esta sección de TODOS los activos físicos asociados en la calle.\n2. Calculará y restará el "Stock Asignado" del patrimonio rodante.\n3. Reingresará físicamente cada repuesto montado al Almacén Principal como Entrada de Ajuste.\n\n¿Está absolutamente seguro de que desea detonar esta cascada?`
        );
        if (!confirm2) return;

        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/subsistemas/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Estructura Desintegrada', message: data.message, color: 'green' });
                fetchSubsistemas();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error Crítico en Reverso', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    const obtenerPlantillaPadre = (sub) => {
        if (sub.vehiculo) return { tipo: 'Vehículo', nombre: `${sub.vehiculo.marca} ${sub.vehiculo.modelo}`, icon: <IconTruck size={20} /> };
        if (sub.maquina) return { tipo: 'Máquina', nombre: `${sub.maquina.marca} ${sub.maquina.modelo}`, icon: <IconTractor size={20} /> };
        if (sub.remolque) return { tipo: 'Remolque', nombre: `${sub.remolque.marca} ${sub.remolque.modelo}`, icon: <IconTruck size={20} /> };
        if (sub.equipo) return { tipo: 'Equipo Estacionario', nombre: `${sub.equipo.marca} ${sub.equipo.modelo}`, icon: <IconEngine size={20} /> };
        return { tipo: 'Global', nombre: 'Plantilla Huérfana', icon: <IconSettings size={20} /> };
    };

    // 🔥 LOGICA CORE INYECTADA: MAPEA Y CONVIERTE LAS INSTANCIAS A MODELOS UNICOS DE FABRICA 🔥
    const obtenerModelosActivosUnicos = (sub) => {
        if (!sub.instancias || sub.instancias.length === 0) return 'Ningun modelo asociado activo';

        const modelosArray = sub.instancias.map(inst => {
            const act = inst.activo;
            if (!act) return null;

            const pVehiculo = act.vehiculoInstancia?.plantilla;
            const pRemolque = act.remolqueInstancia?.plantilla;
            const pMaquina = act.maquinaInstancia?.plantilla;
            const pEquipo = act.equipoInstancia?.plantilla;

            const marca = pVehiculo?.marca || pRemolque?.marca || pMaquina?.marca || pEquipo?.marca;
            const modelo = pVehiculo?.modelo || pRemolque?.modelo || pMaquina?.modelo || pEquipo?.modelo;

            if (marca && modelo) return `${marca} ${modelo}`;
            return null;
        }).filter(Boolean);

        const unicos = [...new Set(modelosArray)];
        return unicos.length > 0 ? unicos.join(', ') : 'Modelos no especificados';
    };

    const subsistemasFiltrados = subsistemas.filter(sub => {
        const matchSearch = sub.nombre.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategoria = filtroCategoria ? sub.categoria === filtroCategoria : true;
        return matchSearch && matchCategoria;
    });

    const subsistemasAgrupados = subsistemasFiltrados.reduce((acc, sub) => {
        const padre = obtenerPlantillaPadre(sub);
        const clave = `${padre.tipo} | ${padre.nombre}`;
        if (!acc[clave]) acc[clave] = { padreInfo: padre, items: [] };
        acc[clave].items.push(sub);
        return acc;
    }, {});

    const kpiPlantillas = subsistemas.length;
    const kpiReglas = subsistemas.reduce((acc, s) => acc + (s.listaRecomendada?.length || 0), 0);
    const kpiEquiposAfectados = subsistemas.reduce((acc, s) => acc + (s.instancias?.length || 0), 0);

    return (
        <Box p={isMobile ? 'xs' : 'md'} bg="gray.0" style={{ minHeight: '100vh' }}>
            {/* ENCABEZADO ADAPTATIVO */}
            <Stack mb="xl">
                <Group justify="space-between" align="flex-start" wrap={isMobile ? 'wrap' : 'nowrap'}>
                    <Group gap="sm" align="center" style={{ flex: 1 }}>
                        <ThemeIcon size={isMobile ? 42 : 54} radius="md" color="dark.9" variant="filled" style={{ border: '2px solid #fab005' }}>
                            <IconEngine size={isMobile ? 24 : 32} color="#fab005" />
                        </ThemeIcon>
                        <Box>
                            <Title order={2} c="dark.8" tt="uppercase" lh={1.1}>Arquitectura de Flota</Title>
                            <Text size="xs" c="dimmed" mt={4}>Administración Genética de Subsistemas</Text>
                        </Box>
                    </Group>
                    <Stack gap="xs" style={{ width: isMobile ? '100%' : 'auto', marginTop: isMobile ? 8 : 0 }}>
                        <Button color="orange.7" leftSection={<IconPlus size={16} />} fullWidth={isMobile} onClick={() => setModalCrearOpened(true)}>
                            Diseñar Nueva Plantilla
                        </Button>
                        <Button variant="default" leftSection={<IconArrowLeft size={16} />} fullWidth={isMobile} onClick={() => router.push('/superuser/inventario')}>
                            Volver a Inventario
                        </Button>
                    </Stack>
                </Group>
            </Stack>

            {/* DASHBOARD DE METRICAS CON EXPLICACIÓN TÉCNICA */}
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mb="xl">
                <Card shadow="sm" padding="lg" radius="md" withBorder style={{ borderTop: '4px solid #1c7ed6' }}>
                    <Group justify="space-between" mb="xs">
                        <Text size="xs" c="dimmed" fw={800} tt="uppercase">Total Plantillas Base</Text>
                        <IconEngine size={24} color="#1c7ed6" />
                    </Group>
                    <Text size="xl" fw={900} mb="xs">{kpiPlantillas}</Text>
                    <Text size="11px" c="dimmed" lh={1.2}>
                        Representa el catálogo maestro de configuraciones de ingeniería (ej: "Motor Cursor 13 Iveco"). Define la estructura anatómica genérica que usarán los activos según su tipo.
                    </Text>
                </Card>
                
                <Card shadow="sm" padding="lg" radius="md" withBorder style={{ borderTop: '4px solid #e67700' }}>
                    <Group justify="space-between" mb="xs">
                        <Text size="xs" c="dimmed" fw={800} tt="uppercase">ADN (Piezas Teóricas)</Text>
                        <IconSettings size={24} color="#e67700" />
                    </Group>
                    <Text size="xl" fw={900} mb="xs">{kpiReglas}</Text>
                    <Text size="11px" c="dimmed" lh={1.2}>
                        Suma total de ranuras o componentes mínimos obligatorios (slots) parametrizados dentro de las plantillas. Es la "dieta técnica" teórica que rige el abastecimiento de repuestos.
                    </Text>
                </Card>
                
                <Card shadow="sm" padding="lg" radius="md" withBorder style={{ borderTop: '4px solid #2b8a3e' }}>
                    <Group justify="space-between" mb="xs">
                        <Text size="xs" c="dimmed" fw={800} tt="uppercase">Activos Físicos Gobernados</Text>
                        <IconCar size={24} color="#2b8a3e" />
                    </Group>
                    <Text size="xl" fw={900} mb="xs">{kpiEquiposAfectados}</Text>
                    <Text size="11px" c="dimmed" lh={1.2}>
                        Cantidad de bloques o compartimentos reales instalados y activos en la calle (chutos, máquinas o remolques) cuyas auditorías y consumos están sincronizados con estas plantillas.
                    </Text>
                </Card>
            </SimpleGrid>

            <Paper withBorder p="sm" radius="md" mb="md" shadow="sm" bg="white">
                <Grid align="center">
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <TextInput 
                            placeholder="Buscar subsistema..." 
                            leftSection={<IconSearch size={16} />} 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.currentTarget.value)} 
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Select 
                            placeholder="Filtrar por Categoría" 
                            data={['motor', 'transmision', 'frenos', 'suspension', 'electrico', 'sistema hidraulico', 'sistema de direccion', 'iluminacion']} 
                            clearable 
                            value={filtroCategoria} 
                            onChange={setFiltroCategoria} 
                        />
                    </Grid.Col>
                </Grid>
            </Paper>

            {loading ? (
                <Center py="xl"><Loader color="orange" /></Center>
            ) : Object.keys(subsistemasAgrupados).length === 0 ? (
                <Paper withBorder p="xl" ta="center" radius="md"><Text c="dimmed" fs="italic">No se encontraron plantillas registradas.</Text></Paper>
            ) : (
                <Accordion variant="separated" radius="md" defaultValue={Object.keys(subsistemasAgrupados)[0]}>
                    {Object.keys(subsistemasAgrupados).map(claveGrupo => {
                        const grupo = subsistemasAgrupados[claveGrupo];
                        return (
                            <Accordion.Item value={claveGrupo} key={claveGrupo} bg="white" style={{ border: '1px solid #dee2e6' }}>
                                <Accordion.Control px={isMobile ? 'xs' : 'md'}>
                                    <Group wrap="nowrap" align="center">
                                        <ThemeIcon color="dark.8" variant="filled" size={isMobile ? "md" : "lg"} radius="md">
                                            {grupo.padreInfo.icon}
                                        </ThemeIcon>
                                        <Box style={{ flex: 1 }}>
                                            <Text fw={900} size={isMobile ? "sm" : "md"} c="dark.9" tt="uppercase" lineClamp={1}>{grupo.padreInfo.nombre}</Text>
                                            <Text size="xs" c="dimmed" fw={700} tt="uppercase">{grupo.padreInfo.tipo}</Text>
                                        </Box>
                                        <Badge ml="auto" color="orange.7" variant="light" size={isMobile ? "xs" : "sm"}>
                                            {grupo.items.length} {isMobile ? '' : 'Áreas'}
                                        </Badge>
                                    </Group>
                                </Accordion.Control>
                                <Accordion.Panel px={isMobile ? 0 : 'md'}>
                                    
                                    {/* 🔥 VISTA MÓVIL: TARJETAS CON APILAMIENTO DE BOTONES Y MODELOS DE FÁBRICA ASOCIADOS 🔥 */}
                                    <Box hiddenFrom="md">
                                        <Stack gap="md" p="xs">
                                            {grupo.items.map(sub => {
                                                const modelosTexto = obtenerModelosActivosUnicos(sub);
                                                
                                                return (
                                                    <Paper key={sub.id} withBorder p="md" shadow="xs" radius="md" bg="gray.0">
                                                        <Group justify="space-between" mb="xs" wrap="nowrap">
                                                            <Text fw={800} c="dark.8" lineClamp={2} style={{ flex: 1 }}>{sub.nombre}</Text>
                                                            <Badge color="blue.7" variant="outline">{sub.categoria}</Badge>
                                                        </Group>
                                                        
                                                        <Group grow mb="md">
                                                            <Box ta="center" p="xs" style={{ border: '1px solid #e9ecef', borderRadius: 8, backgroundColor: 'white' }}>
                                                                <Text size="xs" c="dimmed" fw={700} tt="uppercase">Piezas (ADN)</Text>
                                                                <Text fw={900} size="lg" c="teal.7">{sub.listaRecomendada?.length || 0}</Text>
                                                            </Box>
                                                            <Box ta="center" p="xs" style={{ border: '1px solid #e9ecef', borderRadius: 8, backgroundColor: 'white' }}>
                                                                <Text size="xs" c="dimmed" fw={700} tt="uppercase">Modelos Rodando</Text>
                                                                <Text fw={700} size="xs" c="orange.8" mt={4} lineClamp={2} title={modelosTexto}>
                                                                    {modelosTexto}
                                                                </Text>
                                                            </Box>
                                                        </Group>

                                                        <Stack gap="xs">
                                                            <Button 
                                                                fullWidth size="sm" variant="light" color="indigo" 
                                                                leftSection={<IconEye size={18}/>}
                                                                onClick={() => router.push(`/superuser/inventario/subsistemas/${sub.id}`)}
                                                            >
                                                                Ver detalles y configuración
                                                            </Button>
                                                            <Button 
                                                                fullWidth size="sm" variant="light" color="red" 
                                                                leftSection={<IconTrash size={18}/>}
                                                                loading={procesando} 
                                                                onClick={() => handleEliminarPlantilla(sub.id, sub.nombre)}
                                                            >
                                                                Eliminar
                                                            </Button>
                                                        </Stack>
                                                    </Paper>
                                                )
                                            })}
                                        </Stack>
                                    </Box>

                                    {/* 🔥 VISTA ESCRITORIO: TABLA CON MODELOS UNICOS ASOCIADOS 🔥 */}
                                    <Box visibleFrom="md">
                                        <Table striped highlightOnHover verticalSpacing="sm">
                                            <Table.Thead bg="gray.1">
                                                <Table.Tr>
                                                    <Table.Th>Nombre del Área</Table.Th>
                                                    <Table.Th>Categoría</Table.Th>
                                                    <Table.Th ta="center">Composición (ADN)</Table.Th>
                                                    <Table.Th ta="center">Modelos de Flota Asociados</Table.Th>
                                                    <Table.Th ta="right">Acciones de Gestión</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {grupo.items.map(sub => {
                                                    const modelosTexto = obtenerModelosActivosUnicos(sub);

                                                    return (
                                                        <Table.Tr key={sub.id}>
                                                            <Table.Td fw={800} c="dark.7">{sub.nombre}</Table.Td>
                                                            <Table.Td><Badge color="blue.7" variant="outline">{sub.categoria}</Badge></Table.Td>
                                                            <Table.Td ta="center">
                                                                <Badge color="teal.7" variant="light" leftSection={<IconBoxSeam size={12}/>}>
                                                                    {sub.listaRecomendada?.length || 0} Piezas
                                                                </Badge>
                                                            </Table.Td>
                                                            <Table.Td ta="center">
                                                                <Text size="sm" fw={800} c="dark.6" maw={280} mx="auto" lh={1.2}>
                                                                    {modelosTexto}
                                                                </Text>
                                                            </Table.Td>
                                                            <Table.Td ta="right">
                                                                <Group justify="flex-end" gap={4}>
                                                                    <Tooltip label="Ver detalles y configuración">
                                                                        <ActionIcon variant="light" color="indigo" size="lg" onClick={() => router.push(`/superuser/inventario/subsistemas/${sub.id}`)}>
                                                                            <IconSettings size={18} />
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                    <Tooltip label="Eliminar Plantilla Global y Reversar Inventarios">
                                                                        <ActionIcon variant="light" color="red" size="lg" loading={procesando} onClick={() => handleEliminarPlantilla(sub.id, sub.nombre)}>
                                                                            <IconTrash size={18} />
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                </Group>
                                                            </Table.Td>
                                                        </Table.Tr>
                                                    )
                                                })}
                                            </Table.Tbody>
                                        </Table>
                                    </Box>

                                </Accordion.Panel>
                            </Accordion.Item>
                        );
                    })}
                </Accordion>
            )}

            {/* 🔥 MODAL: CREAR NUEVA PLANTILLA 🔥 */}
            <Modal opened={modalCrearOpened} onClose={() => setModalCrearOpened(false)} title={<Text fw={900} size="lg" tt="uppercase" c="orange.8">Diseñar Nueva Plantilla</Text>} centered fullScreen={isMobile}>
                <Stack gap="md">
                    <Select 
                        label="Tipo de Modelo (Padre)" 
                        data={['Vehiculo', 'Remolque', 'Maquina']} 
                        value={nuevaPlantilla.tipoPlantilla} 
                        onChange={(val) => setNuevaPlantilla({ ...nuevaPlantilla, tipoPlantilla: val })} 
                        required 
                    />
                    <Select 
                        label="Modelo Específico" 
                        placeholder="Buscar modelo..." 
                        data={modelosPadre} 
                        searchable 
                        required 
                        disabled={cargandoModelos}
                        value={nuevaPlantilla.plantillaId} 
                        onChange={(val) => setNuevaPlantilla({ ...nuevaPlantilla, plantillaId: val })} 
                    />
                    <TextInput 
                        label="Nombre del Subsistema" 
                        placeholder="Ej: Eje Trasero, Motor Cursor 13" 
                        required 
                        value={nuevaPlantilla.nombre} 
                        onChange={(e) => setNuevaPlantilla({ ...nuevaPlantilla, nombre: e.target.value })} 
                    />
                    <Select 
                        label="Categoría Operativa" 
                        data={['motor', 'transmision', 'frenos', 'tren de rodaje', 'suspension', 'electrico', 'iluminacion', 'sistema hidraulico', 'sistema de direccion', 'sistema de escape']} 
                        required 
                        value={nuevaPlantilla.categoria} 
                        onChange={(val) => setNuevaPlantilla({ ...nuevaPlantilla, categoria: val })} 
                    />
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setModalCrearOpened(false)}>Cancelar</Button>
                        <Button color="orange.7" fullWidth={isMobile} onClick={handleCrearPlantilla} loading={procesando}>Crear Plantilla Maestra</Button>
                    </Group>
                </Stack>
            </Modal>
        </Box>
    );
}