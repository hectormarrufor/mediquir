'use client';
import { useState, useEffect, use } from 'react';
import {
    Box, Title, Group, Paper, Text, Table, Badge, ActionIcon,
    Stack, Button, Center, Loader, ThemeIcon, Grid, Divider,
    Modal, Select, NumberInput, Alert, Tooltip, Checkbox,
    TextInput, Avatar,
    ScrollArea,
    SegmentedControl
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import {
    IconEngine, IconArrowLeft, IconPlus, IconSettings, IconTruck,
    IconInfoCircle, IconTrash, IconArrowsRightLeft, IconEdit,
    IconBarcode, IconActivity, IconCalendarCheck, IconExchange, IconDeviceFloppy
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

import MapaNeumaticos from '../../../flota/activos/components/MapaNeumaticos';
import ConsumibleForm from '../../components/ConsumibleForm';

export default function SubsistemaDetallePage({ params }) {
    const { id } = use(params);
    const router = useRouter();
    const isMobile = useMediaQuery('(max-width: 48em)');

    const [plantilla, setPlantilla] = useState(null);
    const [loading, setLoading] = useState(true);
    const [catalogoGlobal, setCatalogoGlobal] = useState([]);
    const [todasPlantillas, setTodasPlantillas] = useState([]);

    const [procesando, setProcesando] = useState(false);

    // 1. Estados: Editar Plantilla Maestra
    const [modalEditSubOpened, setModalEditSubOpened] = useState(false);
    const [editPlantilla, setEditPlantilla] = useState({ nombre: '', categoria: '' });

    // 2. Estados: Agregar/Transferir Reglas (ADN)
    const [modalPiezaOpened, setModalPiezaOpened] = useState(false);
    const [nuevaPieza, setNuevaPieza] = useState({ consumibleId: '', cantidad: 1, categoria: '' });
    const [seleccionados, setSeleccionadas] = useState([]);
    const [modalTransferirOpened, setModalTransferirOpened] = useState(false);
    const [plantillaDestino, setPlantillaDestino] = useState('');

    // 3. Estados: Editar Ficha de la Instancia Física
    const [modalInstanciaOpened, setModalInstanciaOpened] = useState(false);
    const [editInstancia, setEditInstancia] = useState(null);

    // 4. Estados: Ver/Swap Piezas Instaladas en un Activo
    const [modalRayosXOpened, setModalRayosXOpened] = useState(false);
    const [instanciaSeleccionada, setInstanciaSeleccionada] = useState(null);

    const [modalSwapOpened, setModalSwapOpened] = useState(false);
    const [instalacionToSwap, setInstalacionToSwap] = useState(null);
    const [serialesDisponibles, setSerialesDisponibles] = useState([]);
    const [nuevoSerialId, setNuevoSerialId] = useState('');

    // 5. Estados: Montaje en Slot Vacío (Campos extendidos de fechas agregados)
    const [modalMontarOpened, setModalMontarOpened] = useState(false);
    const [slotSeleccionado, setSlotSeleccionado] = useState('');
    const [metodoMontaje, setMetodoMontaje] = useState('almacen');
    const [montajeData, setMontajeData] = useState({ 
        consumibleId: '', 
        serialId: '', 
        nuevoSerialString: '',
        fechaCompra: null,
        fechaVencimiento: null
    });
    const [modalNewConsumible, setModalNewConsumible] = useState(false);

    // 6. Estados: Gestión de Pieza Existente (Normalización / Rotación)
    const [modalGestionPiezaOpened, setModalGestionPiezaOpened] = useState(false);
    const [instalacionSeleccionada, setInstalacionSeleccionada] = useState(null);
    const [slotCodigoFoco, setSlotCodigoFoco] = useState('');

    const fetchDatos = async () => {
        setLoading(true);
        try {
            const [resSub, resCat, resAllSubs] = await Promise.all([
                fetch(`/api/gestionMantenimiento/subsistemas/${id}`),
                fetch('/api/inventario/consumibles?limit=1000'),
                fetch('/api/gestionMantenimiento/subsistemas')
            ]);

            const dataSub = await resSub.json();
            const dataCat = await resCat.json();
            const dataAllSubs = await resAllSubs.json();

            if (dataSub.success) setPlantilla(dataSub.data);
            if (dataCat.items) setCatalogoGlobal(dataCat.items);
            if (dataAllSubs.items) {
                setTodasPlantillas(dataAllSubs.items.filter(s => s.id.toString() !== id.toString()));
            }
        } catch (error) {
            notifications.show({ title: 'Error', message: 'Fallo al cargar la biometría', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDatos(); }, [id]);

    // ==========================================
    // LÓGICA: PLANTILLA MAESTRA
    // ==========================================
    const handleActualizarPlantilla = async () => {
        if (!editPlantilla.nombre || !editPlantilla.categoria) return;
        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/subsistemas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editPlantilla)
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Plantilla Actualizada', message: 'El cambio se propagó a la flota', color: 'teal' });
                setModalEditSubOpened(false);
                fetchDatos();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    // ==========================================
    // LÓGICA: ADN (REGLAS TEÓRICAS)
    // ==========================================
    const toggleSeleccion = (slotId) => setSeleccionadas(prev => prev.includes(slotId) ? prev.filter(i => i !== slotId) : [...prev, slotId]);
    const toggleTodos = () => setSeleccionadas(seleccionados.length === plantilla?.listaRecomendada?.length ? [] : (plantilla?.listaRecomendada?.map(r => r.id) || []));

    const handleAgregarPieza = async () => {
        if (!nuevaPieza.consumibleId) return notifications.show({ message: 'Seleccione un repuesto', color: 'orange' });
        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/subsistemas/${id}/recomendaciones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevaPieza)
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'ADN Mutado', message: 'Regla agregada al modelo', color: 'teal' });
                setModalPiezaOpened(false);
                setNuevaPieza({ consumibleId: '', cantidad: 1, categoria: '' });
                fetchDatos();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    const handleEliminarPieza = async (recomendacionId) => {
        if (!window.confirm("¿Seguro que deseas extirpar esta pieza de la plantilla? Detonará la recuperación de inventario.")) return;
        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/subsistemas/${id}/recomendaciones/${recomendacionId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Regla Eliminada', message: data.message, color: 'green' });
                setSeleccionadas(prev => prev.filter(i => i !== recomendacionId));
                fetchDatos();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    const handleTransferirSlots = async () => {
        if (!plantillaDestino) return notifications.show({ message: 'Elige un destino.', color: 'orange' });
        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/subsistemas/transferir-slots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destinoId: plantillaDestino, slotsIds: seleccionados })
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Clonación Exitosa', message: data.message, color: 'indigo' });
                setModalTransferirOpened(false);
                setSeleccionadas([]);
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Fallo en Transferencia', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    // ==========================================
    // LÓGICA: INSTANCIAS FÍSICAS (LOS CAMIONES)
    // ==========================================
    const abrirModalEdicionInstancia = (instancia) => {
        const activo = instancia.activo;
        const anioActivo = activo?.vehiculoInstancia?.plantilla?.anio || activo?.maquinaInstancia?.plantilla?.anio || activo?.remolqueInstancia?.plantilla?.anio || new Date().getFullYear();

        setEditInstancia({
            id: instancia.id,
            nombre: instancia.nombre,
            numeroParte: instancia.numeroParte || '',
            serial: instancia.serial || '',
            condicion: instancia.condicion || 'Desconocido',
            kilometrajePropio: instancia.kilometrajePropio || 0,
            fechaInstalacion: instancia.fechaInstalacion ? new Date(instancia.fechaInstalacion) : new Date(`${anioActivo}-01-01T12:00:00`)
        });
        setModalInstanciaOpened(true);
    };

    const handleActualizarInstanciaFisica = async () => {
        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/subsistemas/${id}/instancias/${editInstancia.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editInstancia)
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Ficha Actualizada', message: 'Datos del bloque guardados', color: 'teal' });
                setModalInstanciaOpened(false);
                fetchDatos();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    // ==========================================
    // LÓGICA: RAYOS X, MONTAJE Y GESTIÓN DE PIEZAS
    // ==========================================
    const abrirRayosX = (instancia) => {
        setInstanciaSeleccionada(instancia);
        setModalRayosXOpened(true);
    };

    const prepararMontajeNuevo = (posicion) => {
        setSlotSeleccionado(posicion);
        setMontajeData({ consumibleId: '', serialId: '', nuevoSerialString: '', fechaCompra: null, fechaVencimiento: null });
        setModalMontarOpened(true);
    };

    const ejecutarMontaje = async () => {
        if (!montajeData.consumibleId) return notifications.show({ message: 'Selecciona el modelo de caucho/pieza', color: 'orange' });
        if (metodoMontaje === 'almacen' && !montajeData.serialId) return notifications.show({ message: 'Selecciona el serial extraído del almacén', color: 'orange' });
        if (metodoMontaje === 'nuevo' && !montajeData.nuevoSerialString) return notifications.show({ message: 'Escribe el serial nuevo', color: 'orange' });

        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/instalaciones/montar-pieza`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subsistemaInstanciaId: instanciaSeleccionada.id,
                    ubicacion: slotSeleccionado,
                    consumibleId: montajeData.consumibleId,
                    serialId: metodoMontaje === 'almacen' ? montajeData.serialId : null,
                    nuevoSerialString: metodoMontaje === 'nuevo' ? montajeData.nuevoSerialString : null,
                    fechaCompra: metodoMontaje === 'nuevo' ? montajeData.fechaCompra : null,
                    fechaVencimiento: metodoMontaje === 'nuevo' ? montajeData.fechaVencimiento : null
                })
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Montaje Exitoso', message: 'El caucho fue instalado en el sistema.', color: 'green' });
                setModalMontarOpened(false);
                fetchDatos();
                setModalRayosXOpened(false);
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error de Montaje', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };

    const prepararIntervencionPieza = async (slotCode, instalacion) => {
        setSlotCodigoFoco(slotCode);
        setInstalacionSeleccionada(instalacion);
        setNuevoSerialId('');
        setSerialesDisponibles([]);

        if (instalacion) {
            setProcesando(true);
            try {
                const res = await fetch(`/api/inventario/seriales?consumibleId=${instalacion.consumibleId}&estado=almacen`);
                const data = await res.json();
                const items = data.data || data.items || [];
                setSerialesDisponibles(items.map(s => ({ value: s.id.toString(), label: `S/N: ${s.serial}` })));
            } catch (error) {
                console.error("Error cargando almacén:", error);
            } finally {
                setProcesando(false);
            }
        }
        setModalGestionPiezaOpened(true);
    };

    const handleGuardarCambiosPieza = async (forzarNormalizacion = false) => {
        setProcesando(true);
        try {
            const payload = {};
            if (forzarNormalizacion) payload.ubicacion = slotCodigoFoco;
            if (nuevoSerialId) payload.nuevoSerialId = parseInt(nuevoSerialId);

            const res = await fetch(`/api/gestionMantenimiento/instalaciones/${instalacionSeleccionada.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Gestión Exitosa', message: data.message, color: 'green' });
                setModalGestionPiezaOpened(false);
                setModalRayosXOpened(false);
                fetchDatos();
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error en Gestión', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };


    const prepararSwapSerial = async (instalacion) => {
        setInstalacionToSwap(instalacion);
        setProcesando(true);
        try {
            const res = await fetch(`/api/inventario/seriales?consumibleId=${instalacion.consumibleId}&estado=almacen`);
            const data = await res.json();
            const items = data.data || data.items || [];

            if (items.length === 0) {
                notifications.show({ title: 'Sin Stock', message: 'No hay repuestos serializados de este tipo en el almacén.', color: 'orange' });
                return;
            }

            setSerialesDisponibles(items.map(s => ({ value: s.id.toString(), label: `S/N: ${s.serial}` })));
            setNuevoSerialId('');
            setModalSwapOpened(true);
        } catch (error) {
            notifications.show({ title: 'Error', message: 'No se pudo leer el almacén', color: 'red' });
        } finally {
            setProcesando(false);
        }
    };

    const ejecutarSwapSerial = async () => {
        if (!nuevoSerialId) return notifications.show({ message: 'Elige un serial de reemplazo', color: 'orange' });
        setProcesando(true);
        try {
            const res = await fetch(`/api/gestionMantenimiento/instalaciones/${instalacionToSwap.id}/cambiar-serial`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevoSerialId: parseInt(nuevoSerialId) })
            });
            const data = await res.json();
            if (data.success) {
                notifications.show({ title: 'Rotación Exitosa', message: 'El nuevo serial ya está montado en el equipo.', color: 'green' });
                setModalSwapOpened(false);
                fetchDatos();
                setModalRayosXOpened(false);
            } else throw new Error(data.error);
        } catch (error) {
            notifications.show({ title: 'Error en Swap', message: error.message, color: 'red' });
        } finally { setProcesando(false); }
    };


    if (loading) return <Center h="100vh"><Loader color="orange" size="xl" /></Center>;
    if (!plantilla) return <Center h="100vh"><Text>Plantilla no encontrada</Text></Center>;

    const modeloAsociado = plantilla.vehiculo?.modelo || plantilla.maquina?.modelo || plantilla.remolque?.modelo || plantilla.equipo?.modelo || 'Modelo Desconocido';
    const marcaAsociada = plantilla.vehiculo?.marca || plantilla.maquina?.marca || plantilla.remolque?.marca || plantilla.equipo?.marca || 'Marca Desconocida';

    const neumaticosCatalogo = catalogoGlobal.filter(c => c.categoria?.toLowerCase() === 'neumatico');

    return (
        <Box p="md" bg="gray.0" style={{ minHeight: '100vh' }}>
            <Group justify="space-between" mb="xl" align="flex-start">
                <Group gap="md" align="center">
                    <ThemeIcon size={54} radius="md" color="dark.9" variant="filled" style={{ border: '2px solid #fab005' }}>
                        <IconEngine size={32} color="#fab005" />
                    </ThemeIcon>
                    <Box>
                        <Text size="sm" c="orange.8" tt="uppercase" fw={900}>Gestión Genética (ADN)</Text>
                        <Group gap="xs" align="center">
                            <Title order={2} c="dark.9" tt="uppercase">{plantilla.nombre}</Title>
                            <ActionIcon variant="light" color="blue" onClick={() => {
                                setEditPlantilla({ nombre: plantilla.nombre, categoria: plantilla.categoria });
                                setModalEditSubOpened(true);
                            }}>
                                <IconEdit size={18} />
                            </ActionIcon>
                        </Group>
                        <Group gap="xs" mt={4}>
                            <Badge color="dark.5" variant="filled">Aplica para: {marcaAsociada} {modeloAsociado}</Badge>
                            <Badge color="blue.7" variant="outline">Cat: {plantilla.categoria}</Badge>
                        </Group>
                    </Box>
                </Group>
                <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => router.push('/superuser/inventario/subsistemas')}>
                    Volver al Listado
                </Button>
            </Group>

            <Grid gutter="lg" align="flex-start">
                {/* ADN TEÓRICO (COLUMNA IZQUIERDA) */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Paper withBorder radius="md" shadow="sm" bg="white">
                        <Box bg="blue.0" p="md" style={{ borderBottom: '1px solid #dee2e6' }}>
                            <Group justify="space-between">
                                <Group gap="xs">
                                    <IconSettings size={20} color="#1c7ed6" />
                                    <Text fw={900} size="md" c="blue.9" tt="uppercase">Piezas Base (Dieta Teórica)</Text>
                                </Group>
                                <Group gap="xs">
                                    {seleccionados.length > 0 && (
                                        <ActionIcon color="indigo" variant="light" size="lg" onClick={() => setModalTransferirOpened(true)} title="Clonar Selección">
                                            <IconArrowsRightLeft size={18} />
                                        </ActionIcon>
                                    )}
                                    <Button size="xs" color="blue.7" leftSection={<IconPlus size={14} />} onClick={() => setModalPiezaOpened(true)}>
                                        Agregar Regla
                                    </Button>
                                </Group>
                            </Group>
                        </Box>

                        <Alert radius={0} color="blue" variant="light" icon={<IconInfoCircle />}>
                            <Text size="xs" fw={600}>Los componentes listados aquí se exigirán obligatoriamente a todos los activos físicos que posean este subsistema instalado.</Text>
                        </Alert>

                        {plantilla.listaRecomendada?.length > 0 ? (
                            <ScrollArea h={500}>
                                <Table striped highlightOnHover verticalSpacing="sm" px="md" pb="md">
                                    <Table.Thead bg="white" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                        <Table.Tr>
                                            <Table.Th w={40}>
                                                <Checkbox color="indigo" checked={seleccionados.length > 0} indeterminate={seleccionados.length > 0 && seleccionados.length < plantilla.listaRecomendada.length} onChange={toggleTodos} />
                                            </Table.Th>
                                            <Table.Th>Componente</Table.Th>
                                            <Table.Th ta="center">Cant.</Table.Th>
                                            <Table.Th>Categoría</Table.Th>
                                            <Table.Th ta="right">Quitar</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {plantilla.listaRecomendada.map(rec => (
                                            <Table.Tr key={rec.id} bg={seleccionados.includes(rec.id) ? 'indigo.0' : undefined}>
                                                <Table.Td>
                                                    <Checkbox color="indigo" checked={seleccionados.includes(rec.id)} onChange={() => toggleSeleccion(rec.id)} />
                                                </Table.Td>
                                                <Table.Td fw={700} c="dark.8">{rec.valorCriterio || rec.consumible?.nombre}</Table.Td>
                                                <Table.Td ta="center"><Badge color="gray" variant="filled">{parseFloat(rec.cantidad)}</Badge></Table.Td>
                                                <Table.Td><Text size="xs" tt="uppercase" fw={600} c="dimmed">{rec.categoria}</Text></Table.Td>
                                                <Table.Td ta="right">
                                                    <ActionIcon variant="subtle" color="red" onClick={() => handleEliminarPieza(rec.id)}>
                                                        <IconTrash size={18} />
                                                    </ActionIcon>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>
                        ) : (
                            <Box p="xl" ta="center">
                                <Text c="dimmed" fs="italic">Esta plantilla no tiene piezas teóricas configuradas aún.</Text>
                            </Box>
                        )}
                    </Paper>
                </Grid.Col>

                {/* UNIDADES FÍSICAS Y SUS RAYOS X (COLUMNA DERECHA) */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Paper withBorder radius="md" shadow="sm" bg="white">
                        <Box bg="orange.0" p="md" style={{ borderBottom: '1px solid #dee2e6' }}>
                            <Group justify="space-between">
                                <Group gap="xs">
                                    <IconTruck size={20} color="#e67700" />
                                    <Text fw={900} size="md" c="orange.9" tt="uppercase">Unidades Físicas Operando</Text>
                                </Group>
                                <Badge color="orange.7" variant="filled">{plantilla.instancias?.length || 0} Equipos</Badge>
                            </Group>
                        </Box>

                        {plantilla.instancias?.length > 0 ? (
                            <ScrollArea h={500} type="auto">
                                <Stack gap={0}>
                                    {plantilla.instancias.map(inst => {
                                        const placa = inst.activo?.vehiculoInstancia?.placa || inst.activo?.maquinaInstancia?.placa || inst.activo?.remolqueInstancia?.placa || 'Sin Placa';
                                        const piezasInstaladas = inst.instalaciones?.length || 0;

                                        return (
                                            <Paper key={inst.id} p="md" style={{ borderBottom: '1px solid #f1f3f5' }}>
                                                <Group justify="space-between" align="flex-start" mb="xs">
                                                    <Box>
                                                        <Text size="sm" fw={800} c="dark.7">Cod: {inst.activo?.codigoInterno}</Text>
                                                        <Text size="xs" fw={700} c="dimmed">Activo Físico Asociado</Text>
                                                    </Box>
                                                    <Badge size="md" color="dark" variant="outline">Placa: {placa}</Badge>
                                                </Group>

                                                <Grid mb="xs">
                                                    <Grid.Col span={4}>
                                                        <Group gap={4}>
                                                            <IconBarcode size={14} color="#868e96" />
                                                            <Text size="xs" fw={700} c="dimmed">Part/Serial No.</Text>
                                                        </Group>
                                                        <Text size="sm" fw={800}>{inst.numeroParte || inst.serial || 'S/N Desconocido'}</Text>
                                                    </Grid.Col>
                                                    <Grid.Col span={4}>
                                                        <Group gap={4}>
                                                            <IconActivity size={14} color="#868e96" />
                                                            <Text size="xs" fw={700} c="dimmed">Desgaste Base</Text>
                                                        </Group>
                                                        <Text size="sm" fw={800}>{inst.kilometrajePropio} KM/h</Text>
                                                    </Grid.Col>
                                                    <Grid.Col span={4}>
                                                        <Group gap={4}>
                                                            <IconCalendarCheck size={14} color="#868e96" />
                                                            <Text size="xs" fw={700} c="dimmed">Fecha Montaje</Text>
                                                        </Group>
                                                        <Text size="sm" fw={800}>{inst.fechaInstalacion ? new Date(inst.fechaInstalacion).toLocaleDateString() : 'N/D'}</Text>
                                                    </Grid.Col>
                                                </Grid>

                                                <Group justify="space-between" mt="sm">
                                                    <Button size="xs" variant="light" color="blue" leftSection={<IconEdit size={14} />} onClick={() => abrirModalEdicionInstancia(inst)}>
                                                        Editar Ficha
                                                    </Button>
                                                    <Button size="xs" variant="light" color="teal" leftSection={<IconSettings size={14} />} onClick={() => abrirRayosX(inst)}>
                                                        Explorar Piezas ({piezasInstaladas})
                                                    </Button>
                                                </Group>
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            </ScrollArea>
                        ) : (
                            <Box p="xl" ta="center">
                                <Text c="dimmed" fs="italic">No hay activos utilizando este subsistema actualmente.</Text>
                            </Box>
                        )}
                    </Paper>
                </Grid.Col>
            </Grid>

            {/* =================================================== */}
            {/* MODALES DEL SISTEMA                                 */}
            {/* =================================================== */}

            {/* MODAL: RENOMBRAR PLANTILLA */}
            <Modal opened={modalEditSubOpened} onClose={() => setModalEditSubOpened(false)} title={<Text fw={900} size="lg" tt="uppercase">Editar Plantilla Maestra</Text>} centered>
                <Stack gap="md">
                    <TextInput label="Nombre Genérico" required value={editPlantilla.nombre} onChange={(e) => setEditPlantilla({ ...editPlantilla, nombre: e.target.value })} />
                    <Select label="Categoría Operativa" data={['motor', 'transmision', 'frenos', 'tren de rodaje', 'suspension', 'electrico', 'iluminacion', 'sistema hidraulico']} required value={editPlantilla.categoria} onChange={(val) => setEditPlantilla({ ...editPlantilla, categoria: val })} />
                    <Group justify="flex-end" mt="sm">
                        <Button variant="default" onClick={() => setModalEditSubOpened(false)}>Cancelar</Button>
                        <Button color="blue.7" onClick={handleActualizarPlantilla} loading={procesando}>Guardar y Propagar</Button>
                    </Group>
                </Stack>
            </Modal>

            {/* MODAL: AGREGAR REGLA (PIEZA) */}
            <Modal opened={modalPiezaOpened} onClose={() => setModalPiezaOpened(false)} title={<Text fw={900} size="lg" tt="uppercase">Inyectar Configuración Teórica</Text>} centered>
                <Stack gap="md">
                    <Select label="Seleccionar Consumible de Almacén" placeholder="Buscar en el catálogo general..." data={catalogoGlobal.map(c => ({ value: c.id.toString(), label: c.nombre }))} searchable required value={nuevaPieza.consumibleId} onChange={(val) => setNuevaPieza({ ...nuevaPieza, consumibleId: val })} />
                    <Group grow>
                        <NumberInput label="Cantidad Requerida" min={1} required value={nuevaPieza.cantidad} onChange={(val) => setNuevaPieza({ ...nuevaPieza, cantidad: val })} />
                        <Select label="Categoría" data={['Filtro', 'Aceite', 'Neumatico', 'Correa', 'Repuesto General']} value={nuevaPieza.categoria} onChange={(val) => setNuevaPieza({ ...nuevaPieza, categoria: val })} />
                    </Group>
                    <Group justify="flex-end" mt="sm">
                        <Button variant="default" onClick={() => setModalPiezaOpened(false)}>Cancelar</Button>
                        <Button color="blue.7" onClick={handleAgregarPieza} loading={procesando}>Fijar Regla en ADN</Button>
                    </Group>
                </Stack>
            </Modal>

            {/* MODAL: EDITAR INSTANCIA FÍSICA (FICHA) */}
            <Modal opened={modalInstanciaOpened} onClose={() => setModalInstanciaOpened(false)} title={<Text fw={900} size="lg" tt="uppercase" c="blue.8">Ficha de Identidad del Bloque</Text>} centered>
                {editInstancia && (
                    <Stack gap="md">
                        <Alert icon={<IconInfoCircle />} color="blue" variant="light">Estas editando las especificaciones del componente físico montado en este equipo, no la teoría.</Alert>
                        <TextInput label="Número de Parte del Fabricante" placeholder="Ej: P/N-998877" value={editInstancia.numeroParte} onChange={(e) => setEditInstancia({ ...editInstancia, numeroParte: e.target.value })} />
                        <TextInput label="Serial Físico (Bloque/Eje)" placeholder="Ej: SN-458992" value={editInstancia.serial} onChange={(e) => setEditInstancia({ ...editInstancia, serial: e.target.value })} />
                        <Group grow>
                            <NumberInput label="Kilometraje / Horómetro Base" min={0} value={editInstancia.kilometrajePropio} onChange={(val) => setEditInstancia({ ...editInstancia, kilometrajePropio: val })} />
                            <DateInput label="Fecha de Montaje (Asentamiento)" valueFormat="DD/MM/YYYY" clearable value={editInstancia.fechaInstalacion} onChange={(val) => setEditInstancia({ ...editInstancia, fechaInstalacion: val })} />
                        </Group>
                        <Select label="Condición Actual" data={['Nuevo', 'Usado', 'Reparado', 'Desconocido']} value={editInstancia.condicion} onChange={(val) => setEditInstancia({ ...editInstancia, condicion: val })} />
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setModalInstanciaOpened(false)}>Cancelar</Button>
                            <Button color="teal" onClick={handleActualizarInstanciaFisica} loading={procesando}>Guardar Ficha</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            {/* MODAL: RAYOS X CON MAPA DINÁMICO */}
            <Modal opened={modalRayosXOpened} onClose={() => setModalRayosXOpened(false)} title={<Text fw={900} size="xl" tt="uppercase" c="teal.9">Rayos X: Componentes Instalados</Text>} size="xl" centered>
                {instanciaSeleccionada && (
                    <Stack gap="md">
                        <Group justify="space-between" mb="xs">
                            <Box>
                                <Text size="sm" c="dimmed" fw={800} tt="uppercase">Activo Físico Escaneado</Text>
                                <Text size="lg" fw={900} c="dark.8">{instanciaSeleccionada.activo?.codigoInterno} - {instanciaSeleccionada.nombre}</Text>
                            </Box>
                            <Badge size="xl" color="teal" variant="light" leftSection={<IconSettings size={16} />}>{instanciaSeleccionada.instalaciones?.length || 0} Piezas</Badge>
                        </Group>

                        {/* 🔥 INYECCIÓN DEL MAPA VISUAL SOLO SI ES TREN DE RODAJE 🔥 */}
                        {plantilla.categoria === 'tren de rodaje' && (
                            <MapaNeumaticos
                                activo={instanciaSeleccionada.activo}
                                instalaciones={instanciaSeleccionada.instalaciones || []}
                                onSlotClick={(posicion, instalacion) => {
                                    if (instalacion) {
                                        prepararIntervencionPieza(posicion, instalacion);
                                    } else {
                                        // 🔥 SI ESTÁ VACÍO, ABRIMOS EL QUIRÓFANO DE MONTAJE 🔥
                                        prepararMontajeNuevo(posicion);
                                    }
                                }}
                            />
                        )}

                        {/* TABLA DE PIEZAS */}
                        {instanciaSeleccionada.instalaciones?.length > 0 ? (
                            <Table striped withTableBorder verticalSpacing="sm" mt="md">
                                <Table.Thead bg="gray.1">
                                    <Table.Tr>
                                        <Table.Th>Pieza Instalada</Table.Th>
                                        <Table.Th>Ubicación</Table.Th>
                                        <Table.Th ta="center">Identidad / Serial</Table.Th>
                                        <Table.Th ta="center">Gestión</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {instanciaSeleccionada.instalaciones.map(inst => (
                                        <Table.Tr key={inst.id}>
                                            <Table.Td>
                                                <Text fw={800} size="sm">{inst.fichaTecnica?.nombre}</Text>
                                                <Text size="xs" c="dimmed" tt="uppercase">{inst.fichaTecnica?.categoria}</Text>
                                            </Table.Td>
                                            <Table.Td><Badge color="gray" variant="outline">{inst.ubicacion || 'General'}</Badge></Table.Td>
                                            <Table.Td ta="center">
                                                {inst.serialFisico ? (
                                                    <Badge color="dark" size="md">S/N: {inst.serialFisico.serial}</Badge>
                                                ) : (
                                                    <Text size="xs" fs="italic" c="dimmed">Fungible ({parseFloat(inst.cantidad)} und)</Text>
                                                )}
                                            </Table.Td>
                                            <Table.Td ta="center">
                                                {inst.serialFisico && (
                                                    <Tooltip label="Rotar o Cambiar este Serial">
                                                        <ActionIcon variant="light" color="indigo" onClick={() => prepararSwapSerial(inst)} loading={procesando}>
                                                            <IconExchange size={18} />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        ) : (
                            <Alert color="orange" icon={<IconInfoCircle />}>No hay piezas registradas físicamente en el interior de este bloque.</Alert>
                        )}
                    </Stack>
                )}
            </Modal>

            {/* MODAL: SWAP DE SERIALES */}
            <Modal opened={modalSwapOpened} onClose={() => setModalSwapOpened(false)} title={<Text fw={900} size="lg" tt="uppercase" c="indigo.8">Rotación de Serial Físico</Text>} centered>
                {instalacionToSwap && (
                    <Stack gap="md">
                        <Alert icon={<IconExchange size={16} />} color="indigo" variant="light">
                            Selecciona el nuevo serial que se montó en el camión. El serial antiguo ({instalacionToSwap.serialFisico?.serial}) regresará automáticamente al inventario del almacén general.
                        </Alert>

                        <Paper withBorder p="md" radius="md" bg="gray.0">
                            <Text size="xs" c="dimmed" fw={800} tt="uppercase">Ubicación Afectada</Text>
                            <Text size="lg" fw={900} c="dark.8">{instalacionToSwap.ubicacion || 'Posición General'}</Text>
                            <Text size="sm" fw={700} c="indigo.9" mt={4}>{instalacionToSwap.fichaTecnica?.nombre}</Text>
                        </Paper>

                        <Select
                            label="Seleccionar Nuevo Serial"
                            placeholder="Buscar serial en almacén..."
                            data={serialesDisponibles}
                            searchable required
                            value={nuevoSerialId}
                            onChange={setNuevoSerialId}
                        />

                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setModalSwapOpened(false)}>Cancelar</Button>
                            <Button color="indigo" leftSection={<IconExchange size={16} />} onClick={ejecutarSwapSerial} loading={procesando}>
                                Ejecutar Cambio
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            {/* 🔥 MODAL: EL QUIRÓFANO UNIFICADO DE INTERVENCION (SWAP Y NORMALIZACIÓN) 🔥 */}
            <Modal opened={modalGestionPiezaOpened} onClose={() => setModalGestionPiezaOpened(false)} title={<Text fw={900} size="lg" tt="uppercase" c="dark.9">Gestión de Posición: {slotCodigoFoco}</Text>} centered>
                <Stack gap="md">
                    {instalacionSeleccionada ? (
                        <>
                            <Paper withBorder p="sm" bg="gray.0" radius="sm">
                                <Text size="xs" c="dimmed" fw={800} tt="uppercase">Componente Montado</Text>
                                <Text size="sm" fw={800} c="blue.9">{instalacionSeleccionada.fichaTecnica?.nombre}</Text>
                                <Text size="xs" mt={4}>String en Base de Datos actual: <Badge size="xs" color="red" variant="light">"{instalacionSeleccionada.ubicacion}"</Badge></Text>
                            </Paper>

                            {/* Alerta de detección de formato viejo humana */}
                            {instalacionSeleccionada.ubicacion !== slotCodigoFoco && (
                                <Alert color="orange" title="Ubicación No Normalizada" icon={<IconInfoCircle />}>
                                    <Text size="xs" mb="sm">Este neumático está asignado con texto plano. ¿Quieres corregir el string en la Base de Datos al formato estándar del chasis <b>"{slotCodigoFoco}"</b>?</Text>
                                    <Button size="xs" color="orange.8" variant="light" fullWidth leftSection={<IconDeviceFloppy size={14} />} onClick={() => handleGuardarCambiosPieza(true)} loading={procesando}>
                                        Normalizar Ubicación a "{slotCodigoFoco}"
                                    </Button>
                                </Alert>
                            )}

                            <Divider label="Rotación / Cambio de Neumático" labelPosition="center" />
                            
                            <Select 
                                label="Seleccionar Reemplazo desde Almacén" 
                                placeholder="Buscar serial disponible..." 
                                data={serialesDisponibles} 
                                searchable 
                                value={nuevoSerialId} 
                                onChange={setNuevoSerialId} 
                            />
                            
                            <Button color="indigo" fullWidth leftSection={<IconExchange size={16} />} disabled={!nuevoSerialId} onClick={() => handleGuardarCambiosPieza(false)} loading={procesando}>
                                Ejecutar Rotación de Serial
                            </Button>
                        </>
                    ) : (
                        <Alert color="gray" variant="outline" title="Posición Desocupada" style={{ borderStyle: 'dashed' }}>
                            <Text size="xs">No hay ningún neumático amarrado a esta posición estructural. Usa el botón inferior para instalar un repuesto.</Text>
                        </Alert>
                    )}
                </Stack>
            </Modal>

            {/* MODAL: MONTAR PIEZA EN SLOT VACÍO (Inyectadas inputs de Fecha de Compra y Vencimiento) */}
            <Modal opened={modalMontarOpened} onClose={() => setModalMontarOpened(false)} title={<Text fw={900} size="lg" tt="uppercase" c="teal.8">Montar Componente en {slotSeleccionado}</Text>} centered>
                <Stack gap="md">
                    <Alert icon={<IconSettings size={16} />} color="teal" variant="light">
                        Estás a punto de montar físicamente un repuesto en el <b>{slotSeleccionado}</b> del equipo <b>{instanciaSeleccionada?.activo?.codigoInterno}</b>.
                    </Alert>

                    <Group justify="space-between" align="flex-end">
                        <Select
                            label="Modelo de Neumático / Pieza"
                            placeholder="Buscar modelo..."
                            data={neumaticosCatalogo.map(c => ({ value: c.id.toString(), label: c.nombre }))}
                            searchable required style={{ flex: 1 }}
                            value={montajeData.consumibleId}
                            onChange={(val) => setMontajeData({ ...montajeData, consumibleId: val })}
                        />
                        <Button size="xs" variant="outline" color="blue" onClick={() => setModalNewConsumible(true)}>
                            Crear Nuevo Modelo
                        </Button>
                    </Group>

                    {montajeData.consumibleId && (
                        <Paper withBorder p="md" bg="gray.0" radius="md">
                            <Text size="xs" fw={800} tt="uppercase" mb="xs">Procedencia del Serial</Text>
                            <SegmentedControl
                                fullWidth
                                data={[
                                    { label: 'Extraer de Almacén', value: 'almacen' },
                                    { label: 'Crear Serial Nuevo', value: 'nuevo' }
                                ]}
                                value={metodoMontaje}
                                onChange={setMetodoMontaje}
                                color="teal"
                            />

                            <Box mt="md">
                                {metodoMontaje === 'almacen' ? (
                                    <Select
                                        label="Seleccionar Serial en Stock"
                                        placeholder="Buscar S/N..."
                                        data={serialesDisponibles} 
                                        searchable required
                                        onDropdownOpen={async () => {
                                            const res = await fetch(`/api/inventario/seriales?consumibleId=${montajeData.consumibleId}&estado=almacen`);
                                            const data = await res.json();
                                            setSerialesDisponibles((data.data || data.items || []).map(s => ({ value: s.id.toString(), label: `S/N: ${s.serial}` })));
                                        }}
                                        value={montajeData.serialId}
                                        onChange={(val) => setMontajeData({ ...montajeData, serialId: val })}
                                    />
                                ) : (
                                    <Stack gap="sm">
                                        <TextInput
                                            label="Ingresar Nuevo Serial"
                                            placeholder="Ej: DOT-4522-XYZ"
                                            required
                                            value={montajeData.nuevoSerialString}
                                            onChange={(e) => setMontajeData({ ...montajeData, nuevoSerialString: e.target.value })}
                                        />
                                        {/* 🔥 ENLACE DE AUDITORÍA DE FECHAS AL CREAR AL VUELO 🔥 */}
                                        <Group grow>
                                            <DateInput
                                                label="Fecha de Compra"
                                                placeholder="Selecciona fecha"
                                                valueFormat="DD/MM/YYYY"
                                                clearable
                                                value={montajeData.fechaCompra}
                                                onChange={(val) => setMontajeData({ ...montajeData, fechaCompra: val })}
                                            />
                                            <DateInput
                                                label="Fecha de Vencimiento"
                                                placeholder="Garantía / Expiración"
                                                valueFormat="DD/MM/YYYY"
                                                clearable
                                                value={montajeData.fechaVencimiento}
                                                onChange={(val) => setMontajeData({ ...montajeData, fechaVencimiento: val })}
                                            />
                                        </Group>
                                    </Stack>
                                )}
                            </Box>
                        </Paper>
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setModalMontarOpened(false)}>Cancelar</Button>
                        <Button color="teal" onClick={ejecutarMontaje} loading={procesando}>
                            Ejecutar Montaje
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* MODAL: CREAR CONSUMIBLE EXPRESS */}
            <Modal opened={modalNewConsumible} onClose={() => setModalNewConsumible(false)} title={<Text fw={900} size="lg" tt="uppercase">Crear Ficha de Inventario</Text>} size="xl" fullScreen={isMobile} zIndex={1000}>
                <ConsumibleForm
                    isEdit={false}
                    onCancel={() => setModalNewConsumible(false)}
                    onSuccess={(nuevo) => {
                        setCatalogoGlobal(prev => [...prev, nuevo]);
                        setMontajeData({ ...montajeData, consumibleId: nuevo.id.toString() });
                        setModalNewConsumible(false);
                        notifications.show({ title: 'Modelo Creado', message: 'Seleccionado automáticamente', color: 'green' });
                    }}
                />
            </Modal>

        </Box>
    );
}