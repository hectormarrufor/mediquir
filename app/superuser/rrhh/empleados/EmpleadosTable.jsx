'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import { 
  Button, Box, Flex, Tooltip, ActionIcon, Text, Menu, Modal, 
  MantineProvider, Badge, Avatar, Card, Group, Stack, TextInput, 
  Grid, Divider, Select, MultiSelect, Collapse
} from '@mantine/core';
import { 
  IconEdit, IconTrash, IconEye, IconPlus, IconRefresh, 
  IconSearch, IconPhone, IconMapPin, IconId, IconCalendar, IconFilter 
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import CrearUsuarioModal from './CrearUsuarioModal';
import EditUsuarioModal from './EditUsuarioModal';

// --- UTILIDADES ---
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  const nacimiento = new Date(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const haCumplidoEsteAno = (
    hoy.getMonth() > nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() >= nacimiento.getDate())
  );
  if (!haCumplidoEsteAno) edad--;
  return edad;
}

const ESTADO_PRIORIDAD = {
  'Activo': 1,
  'Reposo Medico': 2,
  'Vacaciones': 3,
  'Permiso': 4,
  'Suspendido': 5,
  'Retirado': 6,
  'Inactivo': 7,
};

// --- MENÚ DE ACCIONES (Común) ---
const EmployeeActionsMenu = ({ empleado, router, openDeleteModal, setSelectedEmpleado, openCrearUsuarioModal, openEditUsuarioModal }) => (
  <Box 
    onClick={(e) => e.stopPropagation()} 
    onPointerDown={(e) => e.stopPropagation()}
  >
    <Menu position="bottom-end" shadow="md" width={200}>
      <Menu.Target>
        <ActionIcon variant="light" size="md" aria-label="Acciones">
          <IconEye size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Opciones</Menu.Label>
        <Menu.Item 
          leftSection={<IconEdit size={16} />} 
          onClick={() => router.push(`/superuser/rrhh/empleados/${empleado.id}/editar`)}
        >
          Editar Datos
        </Menu.Item>
        <Menu.Item
          leftSection={empleado.usuario?.user ? <IconEdit size={16} /> : <IconPlus size={16} />}
          color="blue"
          onClick={() => {
            setSelectedEmpleado(empleado);
            empleado.usuario?.user ? openEditUsuarioModal(empleado) : openCrearUsuarioModal(empleado);
          }}
        >
          {empleado.usuario?.user ? "Editar Usuario" : "Crear Usuario"}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item 
          leftSection={<IconTrash size={16} />} 
          color="red" 
          onClick={() => { setSelectedEmpleado(empleado); openDeleteModal(); }}
        >
          Eliminar
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Box>
);

// --- TARJETA MÓVIL (Actualizada) ---
const MobileEmployeeCard = ({ empleado, actions, onClick }) => {
  const statusColor = 
    empleado.estado === 'Activo' ? 'green' : 
    empleado.estado === 'Vacaciones' ? 'blue' : 
    empleado.estado === 'Suspendido' ? 'red' :
    empleado.estado === 'Permiso' ? 'orange' :
    empleado.estado === 'Retirado' ? 'red' :
    empleado.estado === 'Reposo Medico' && 'orange' ||
    empleado.estado === 'Inactivo' && 'red';

  return (
    <Card 
        shadow="sm" 
        padding="lg" 
        radius="md" 
        withBorder 
        mb="sm"
        // 1. EVENTO DE NAVEGACIÓN EN LA TARJETA
        onClick={onClick}
        // 2. ESTILOS PARA QUE SE SIENTA CLICKEABLE
        style={{ 
            cursor: 'pointer', 
            transition: 'background-color 0.2s ease',
        }}
        // Efecto hover simple usando sx o className si prefieres, 
        // aquí uso onMouseEnter/Leave simulado o styles directos:
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between" wrap="nowrap"> {/* wrap="nowrap" evita que se deforme */}
            <Group gap="xs">
                <Avatar 
                    src={empleado.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${empleado.imagen}` : null} 
                    radius="xl" 
                    size="md" 
                    color="blue"
                >
                    {(!empleado.imagen) && empleado.nombre?.charAt(0)}
                </Avatar>
                <div>
                    <Text fw={700} size="sm" lineClamp={1}>{empleado.nombre} {empleado.apellido}</Text>
                    <Badge size="xs" color={statusColor} variant="light">{empleado.estado}</Badge>
                </div>
            </Group>

            {/* 3. ZONA SEGURA (STOP PROPAGATION) */}
            {/* Cualquier clic aquí NO activará el onClick de la Card */}
            <div 
            onClick={(e) => e.stopPropagation()}
            >
                {actions}
            </div>
        </Group>
      </Card.Section>

      <Stack mt="md" gap="xs">
        <Group gap="xs">
            <IconId size={16} color="gray" />
            <Text size="sm" c="dimmed">{empleado.cedula}</Text>
        </Group>

        <Group gap="xs">
            <IconPhone size={16} color="gray" />
            <Text size="sm">{empleado.telefono}</Text>
        </Group>

        {empleado.puestos && empleado.puestos.length > 0 && (
            <Group gap={4}>
                {empleado.puestos.slice(0, 3).map((p, i) => ( // Slice para no llenar la card si tiene 10 puestos
                    <Badge key={i} size="xs" variant="dot">{p.nombre}</Badge>
                ))}
            </Group>
        )}
      </Stack>
    </Card>
  );
};

export default function EmpleadosTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  // Estados Responsivos y Filtros Móviles
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mobileSearch, setMobileSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState(null); // Para móvil
  const [filterPuesto, setFilterPuesto] = useState(null); // Para móvil
  const [showFilters, setShowFilters] = useState(false); // Toggle filtros móvil

  // Modales
  const [crearUsuarioModalOpened, { open: openCrearUsuarioModal, close: closeCrearUsuarioModal }] = useDisclosure(false);
  const [editUsuarioModalOpened, { open: openEditUsuarioModal, close: closeEditUsuarioModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => setFile(e.target.files[0]);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/rrhh/empleados');
      if (!response.ok) throw new Error(`Error fetching data`);
      const result = await response.json();
      
      const sortedResult = result
      .map(empleado => ({
        ...empleado, 
        nombreCompleto: empleado.nombre + " " + empleado.apellido, 
        edad: calcularEdad(empleado.fechaNacimiento) 
      }))
      .sort((a, b) => {
        // Si el estado no existe en el mapa, le damos una prioridad baja (99)
        const priorA = ESTADO_PRIORIDAD[a.estado] || 99;
        const priorB = ESTADO_PRIORIDAD[b.estado] || 99;
        return priorA - priorB;
      });

    setData(sortedResult);
    } catch (err) {
      setError(err);
      notifications.show({ title: 'Error', message: 'No se pudieron cargar los empleados.', color: 'red' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- LÓGICA DE FILTROS ---
  
  // 1. Obtener lista única de puestos para los Selects (Desktop y Mobile)
  const uniquePuestos = useMemo(() => {
    if (!data) return [];
    const allPuestos = data.flatMap(emp => emp.puestos ? emp.puestos.map(p => p.nombre) : []);
    return [...new Set(allPuestos)].sort();
  }, [data]);

  const estadoOptions = ['Activo', 'Inactivo', 'Vacaciones', 'Suspendido'];

  // 2. Definición de Columnas (Desktop) con Filtros Nativos
  const columns = useMemo(() => [
    {
        accessorKey: 'imagen', header: "", size: 80, enableColumnFilter: false,
        Cell: ({ cell }) => (
          <Avatar src={`${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${cell.getValue()}?v=${process.env.NEXT_PUBLIC_APP_VERSION}`} radius="xl" size="md" />
        ),
    },
    { accessorKey: 'cedula', header: 'Cédula', size: 100 },
    { accessorKey: 'nombreCompleto', header: 'Nombre', size: 150 },
    { accessorKey: 'telefono', header: 'Teléfono', size: 120, enableColumnFilter: false },
    {
        // Usamos accessorFn para que el filtro por texto funcione sobre los nombres de los cargos
        accessorFn: (row) => row.puestos?.map(p => p.nombre).join(', '),
        id: 'puestos', // Necesario cuando usamos accessorFn
        header: 'Cargo(s)', 
        size: 200,
        filterVariant: 'multi-select', // ¡Magia de Mantine React Table!
        filterSelectOptions: uniquePuestos, // Pasamos las opciones
        Cell: ({ row }) => (
          <Box>{row.original.puestos.map((p, i) => <Badge key={i} color="blue" variant="light" mr={4}>{p.nombre}</Badge>)}</Box>
        ),
    },
    { accessorKey: 'direccion', header: 'Dirección', size: 250 },
    { 
        accessorKey: 'estado', header: 'Estado', size: 120,
        filterVariant: 'select', // Filtro tipo Select
        filterSelectOptions: estadoOptions,
        Cell: ({ cell }) => {
            const val = cell.getValue();
            const color = val === 'Activo' ? 'green' : val === 'Vacaciones' ? 'orange' : val === 'Suspendido' ? 'red' : 'gray';
            return <Badge color={color}>{val}</Badge>;
        },
    },
  ], [uniquePuestos]); // Dependencia importante para actualizar el filtro

  const table = useMantineReactTable({
    columns,
    data,
    state: { isLoading: loading },
    enableRowActions: true,
    initialState: {pagination: { pageSize: 20, pageIndex: 0 } },
    renderRowActions: ({ row }) => (
       <EmployeeActionsMenu 
          empleado={row.original} 
          router={router} 
          openDeleteModal={openDeleteModal} 
          setSelectedEmpleado={setSelectedEmpleado} 
          openCrearUsuarioModal={openCrearUsuarioModal} 
          openEditUsuarioModal={openEditUsuarioModal}
       />
    ),
    mantineTableHeadCellProps: { style: { backgroundColor: "lightblue" } },
    mantineTableBodyRowProps: ({ row }) => ({
        onClick: () => router.push(`/superuser/rrhh/empleados/${row.original.id}`),
        style: { cursor: 'pointer' },
    }),
  });

  // 3. Lógica de Filtrado para Móvil
  const filteredDataMobile = useMemo(() => {
     let result = data;

     // Filtro de Texto
     if (mobileSearch) {
        const lowerSearch = mobileSearch.toLowerCase();
        result = result.filter(emp => 
            emp.nombreCompleto.toLowerCase().includes(lowerSearch) ||
            emp.cedula.includes(mobileSearch)
        );
     }

     // Filtro de Estado
     if (filterEstado) {
        result = result.filter(emp => emp.estado === filterEstado);
     }

     // Filtro de Puesto (Comprobamos si el empleado tiene AL MENOS ese puesto)
     if (filterPuesto) {
        result = result.filter(emp => emp.puestos?.some(p => p.nombre === filterPuesto));
     }

     return result;
  }, [data, mobileSearch, filterEstado, filterPuesto]);

  // Funciones placeholder de import/export/delete para no alargar el código (mantener las tuyas)
  const handleExport = async () => {}; // ... tu lógica
  const handleImport = async () => {}; // ... tu lógica
  const handleDelete = async () => { /* ... tu lógica */ notifications.show({title:'Simulado', message:'Borrado'}); closeDeleteModal(); };

  return (
    <>
      <MantineProvider>
        {/* HEADER RESPONSIVE */}
        <Flex justify="space-between" mb="md" align="center" direction={isMobile ? 'column' : 'row'} gap="sm">
            <Button 
                leftSection={<IconPlus size={20} />} 
                fullWidth={isMobile}
                onClick={() => router.push('/superuser/rrhh/empleados/nuevo')}
            >
                {isMobile ? 'Nuevo Empleado' : 'Registrar Nuevo'}
            </Button>
            
            <Flex gap="xs" w={isMobile ? '100%' : 'auto'} align="center">
                 {isMobile && (
                    <>
                        <TextInput 
                            placeholder="Buscar..." 
                            leftSection={<IconSearch size={16}/>}
                            value={mobileSearch}
                            onChange={(e) => setMobileSearch(e.currentTarget.value)}
                            style={{ flex: 1 }}
                        />
                        <ActionIcon 
                            variant={showFilters ? "filled" : "light"} 
                            color="blue" 
                            size="lg" 
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <IconFilter size={20} />
                        </ActionIcon>
                    </>
                 )}
                <ActionIcon onClick={fetchData} variant="light" size="lg">
                    <IconRefresh size={24} />
                </ActionIcon>
            </Flex>
        </Flex>

        {/* --- FILTROS MÓVILES DESPLEGABLES --- */}
        {isMobile && (
            <Collapse in={showFilters}>
                <Card withBorder shadow="sm" radius="md" mb="md" p="sm">
                    <Grid>
                        <Grid.Col span={6}>
                            <Select 
                                label="Estado" 
                                placeholder="Todos" 
                                data={estadoOptions} 
                                value={filterEstado} 
                                onChange={setFilterEstado} 
                                clearable 
                            />
                        </Grid.Col>
                        <Grid.Col span={6}>
                            <Select 
                                label="Cargo" 
                                placeholder="Todos" 
                                data={uniquePuestos} 
                                value={filterPuesto} 
                                onChange={setFilterPuesto} 
                                clearable 
                                searchable
                            />
                        </Grid.Col>
                    </Grid>
                </Card>
            </Collapse>
        )}

        {/* --- RENDER CONDICIONAL --- */}
        {isMobile ? (
            <Box pb="xl">
                {loading && <Text align="center">Cargando...</Text>}
                {!loading && filteredDataMobile.length === 0 && (
                    <Text align="center" c="dimmed" mt="xl">
                        No se encontraron empleados con los filtros actuales.
                    </Text>
                )}
                {filteredDataMobile.map((empleado) => (
                    <MobileEmployeeCard 
                        key={empleado.id} 
                        onClick={() => router.push(`/superuser/rrhh/empleados/${empleado.id}`)}
                        empleado={empleado}
                        actions={
                            <EmployeeActionsMenu 
                                empleado={empleado} 
                                router={router} 
                                openDeleteModal={openDeleteModal} 
                                setSelectedEmpleado={setSelectedEmpleado} 
                                openCrearUsuarioModal={openCrearUsuarioModal} 
                                openEditUsuarioModal={openEditUsuarioModal}
                            />
                        }
                    />
                ))}
            </Box>
        ) : (
            <MantineReactTable table={table} />
        )}
      </MantineProvider>

      {/* --- BOTONES FOOTER --- */}
      <Box mt="lg">
         <Group>
            <Button variant="default" onClick={handleExport}>Exportar CSV</Button>
            <input type="file" accept=".json" onChange={handleFileChange} style={{display:'none'}} id="fileInput"/>
            <label htmlFor="fileInput">
                 <Button component="span" variant="default">Cargar JSON</Button>
            </label>
            <Button onClick={handleImport} disabled={!file}>Importar</Button>
         </Group>
         {status && <Text size="sm" mt="xs">{status}</Text>}
      </Box>

      {/* --- MODALES --- */}
      <Modal opened={deleteModalOpened} onClose={closeDeleteModal} title="Confirmar Eliminación" centered>
        <Text>¿Eliminar a <Text span fw={700} c="red">{selectedEmpleado?.nombre} {selectedEmpleado?.apellido}</Text>?</Text>
        <Flex justify="flex-end" gap="md" mt="md">
          <Button variant="default" onClick={closeDeleteModal}>Cancelar</Button>
          <Button color="red" onClick={handleDelete}>Eliminar</Button>
        </Flex>
      </Modal>

      <CrearUsuarioModal empleado={selectedEmpleado} opened={crearUsuarioModalOpened} onClose={closeCrearUsuarioModal} onUserCreated={fetchData} />
      <EditUsuarioModal usuario={selectedEmpleado?.usuario} opened={editUsuarioModalOpened} onClose={closeEditUsuarioModal} onUpdated={fetchData} />
    </>
  );
}