'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import { 
  Button, Box, Flex, ActionIcon, Text, Menu, Modal, 
  MantineProvider, Badge, Avatar, Card, Group, Stack, TextInput, 
  Collapse, Paper
} from '@mantine/core';
import { 
  IconEdit, IconTrash, IconEye, IconPlus, IconRefresh, 
  IconSearch, IconPhone, IconMapPin, IconId, IconMail, IconFilter 
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import CrearUsuarioClienteModal from './CrearUsuarioClienteModal';
// import EditUsuarioClienteModal from './EditUsuarioClienteModal'; // Asumiendo que lo adaptarás igual

// --- MENÚ DE ACCIONES ---
const ClienteActionsMenu = ({ cliente, router, openDeleteModal, setSelectedCliente, openCrearUsuarioModal }) => (
  <Box onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
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
          onClick={() => router.push(`/superuser/clientes/${cliente.id}/editar`)}
        >
          Editar Datos
        </Menu.Item>
        <Menu.Item
          leftSection={cliente.usuarios?.length > 0 ? <IconEdit size={16} /> : <IconPlus size={16} />}
          color="blue"
          onClick={() => {
            setSelectedCliente(cliente);
            // Si ya tiene usuario, abres el de editar, si no, el de crear
            openCrearUsuarioModal(cliente);
          }}
        >
          {cliente.usuarios?.length > 0 ? "Gestionar Usuario" : "Crear Usuario"}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item 
          leftSection={<IconTrash size={16} />} 
          color="red" 
          onClick={() => { setSelectedCliente(cliente); openDeleteModal(); }}
        >
          Eliminar
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  </Box>
);

// --- TARJETA MÓVIL ---
const MobileClienteCard = ({ cliente, actions, onClick }) => {
  return (
    <Card 
      shadow="sm" padding="lg" radius="md" withBorder mb="sm"
      onClick={onClick}
      style={{ cursor: 'pointer', transition: 'background-color 0.2s ease' }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
    >
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Avatar 
              src={cliente.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${cliente.imagen}` : null} 
              radius="xl" size="md" color="blue"
            >
              {!cliente.imagen && (cliente.nombre ? cliente.nombre.charAt(0) : cliente.identificacion.charAt(0))}
            </Avatar>
            <div>
              <Text fw={700} size="sm" lineClamp={1}>{cliente.nombre || 'Sin Nombre (Persona Natural)'}</Text>
              {cliente.esContribuyenteEspecial && (
                <Badge size="xs" color="violet" variant="light">Contribuyente Especial ({cliente.retencionIvaPorDefecto}%)</Badge>
              )}
            </div>
          </Group>
          <div onClick={(e) => e.stopPropagation()}>{actions}</div>
        </Group>
      </Card.Section>

      <Stack mt="md" gap="xs">
        <Group gap="xs">
          <IconId size={16} color="gray" />
          <Text size="sm" fw={500}>{cliente.identificacion}</Text>
        </Group>
        {cliente.telefono && (
          <Group gap="xs">
            <IconPhone size={16} color="gray" />
            <Text size="sm">{cliente.telefono}</Text>
          </Group>
        )}
        {cliente.email && (
          <Group gap="xs">
            <IconMail size={16} color="gray" />
            <Text size="sm" c="dimmed">{cliente.email}</Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
};

export default function ClientesTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Estados Responsivos y Filtros
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mobileSearch, setMobileSearch] = useState('');

  // Modales
  const [crearUsuarioModalOpened, { open: openCrearUsuarioModal, close: closeCrearUsuarioModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [selectedCliente, setSelectedCliente] = useState(null);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/clientes');
      if (!response.ok) throw new Error('Error fetching data');
      const result = await response.json();
      setData(result);
    } catch (err) {
      notifications.show({ title: 'Error', message: 'No se pudieron cargar los clientes.', color: 'red' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Definición de Columnas (Desktop)
  const columns = useMemo(() => [
    {
      accessorKey: 'imagen', header: "", size: 80, enableColumnFilter: false,
      Cell: ({ cell, row }) => (
        <Avatar 
          src={cell.getValue() ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${cell.getValue()}?v=${process.env.NEXT_PUBLIC_APP_VERSION}` : null} 
          radius="xl" size="md" color="blue"
        >
            {!cell.getValue() && (row.original.nombre ? row.original.nombre.charAt(0) : row.original.identificacion.charAt(0))}
        </Avatar>
      ),
    },
    { accessorKey: 'identificacion', header: 'RIF / Cédula', size: 120 },
    { accessorKey: 'nombre', header: 'Razón Social / Nombre', size: 200 },
    { accessorKey: 'telefono', header: 'Teléfono', size: 120 },
    { accessorKey: 'email', header: 'Correo', size: 180 },
    { 
      accessorKey: 'esContribuyenteEspecial', header: 'Tipo', size: 150,
      Cell: ({ row }) => (
        row.original.esContribuyenteEspecial ? (
            <Badge color="violet" variant="light">Especial ({row.original.retencionIvaPorDefecto}%)</Badge>
        ) : (
            <Badge color="gray" variant="light">Ordinario</Badge>
        )
      ),
    },
  ], []);

  const table = useMantineReactTable({
    columns,
    data,
    state: { isLoading: loading },
    enableRowActions: true,
    initialState: { pagination: { pageSize: 20, pageIndex: 0 } },
    renderRowActions: ({ row }) => (
      <ClienteActionsMenu 
        cliente={row.original} router={router} openDeleteModal={openDeleteModal} 
        setSelectedCliente={setSelectedCliente} openCrearUsuarioModal={openCrearUsuarioModal} 
      />
    ),
    mantineTableHeadCellProps: { style: { backgroundColor: "lightblue" } },
    mantineTableBodyRowProps: ({ row }) => ({
      onClick: () => router.push(`/superuser/clientes/${row.original.id}`),
      style: { cursor: 'pointer' },
    }),
  });

  // Filtrado para Móvil
  const filteredDataMobile = useMemo(() => {
    let result = data;
    if (mobileSearch) {
      const lowerSearch = mobileSearch.toLowerCase();
      result = result.filter(cli => 
        (cli.nombre && cli.nombre.toLowerCase().includes(lowerSearch)) ||
        cli.identificacion.toLowerCase().includes(lowerSearch)
      );
    }
    return result;
  }, [data, mobileSearch]);

  const handleDelete = async () => {
    try {
        const res = await fetch(`/api/clientes/${selectedCliente.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        notifications.show({ title: 'Éxito', message: 'Cliente eliminado', color: 'green' });
        fetchData();
    } catch (error) {
        notifications.show({ title: 'Error', message: 'No se pudo eliminar el cliente', color: 'red' });
    } finally {
        closeDeleteModal();
    }
  };

  return (
    <>
      <MantineProvider>
        {/* HEADER RESPONSIVE */}
        <Flex justify="space-between" mb="md" align="center" direction={isMobile ? 'column' : 'row'} gap="sm">
          <Button 
            leftSection={<IconPlus size={20} />} fullWidth={isMobile}
            onClick={() => router.push('/superuser/clientes/nuevo')}
          >
            {isMobile ? 'Nuevo Cliente' : 'Registrar Nuevo Cliente'}
          </Button>
            
          <Flex gap="xs" w={isMobile ? '100%' : 'auto'} align="center">
            {isMobile && (
              <TextInput 
                placeholder="Buscar por RIF o nombre..." leftSection={<IconSearch size={16}/>}
                value={mobileSearch} onChange={(e) => setMobileSearch(e.currentTarget.value)} style={{ flex: 1 }}
              />
            )}
            <ActionIcon onClick={fetchData} variant="light" size="lg">
              <IconRefresh size={24} />
            </ActionIcon>
          </Flex>
        </Flex>

        {/* RENDER CONDICIONAL (Movil vs Desktop) */}
        {isMobile ? (
          <Box pb="xl">
            {loading && <Text align="center">Cargando...</Text>}
            {!loading && filteredDataMobile.length === 0 && (
              <Text align="center" c="dimmed" mt="xl">No se encontraron clientes.</Text>
            )}
            {filteredDataMobile.map((cliente) => (
              <MobileClienteCard 
                key={cliente.id} cliente={cliente}
                onClick={() => router.push(`/superuser/clientes/${cliente.id}`)}
                actions={
                  <ClienteActionsMenu 
                    cliente={cliente} router={router} openDeleteModal={openDeleteModal} 
                    setSelectedCliente={setSelectedCliente} openCrearUsuarioModal={openCrearUsuarioModal} 
                  />
                }
              />
            ))}
          </Box>
        ) : (
          <MantineReactTable table={table} />
        )}
      </MantineProvider>

      {/* MODALES */}
      <Modal opened={deleteModalOpened} onClose={closeDeleteModal} title="Confirmar Eliminación" centered>
        <Text>¿Eliminar al cliente <Text span fw={700} c="red">{selectedCliente?.nombre || selectedCliente?.identificacion}</Text>?</Text>
        <Flex justify="flex-end" gap="md" mt="md">
          <Button variant="default" onClick={closeDeleteModal}>Cancelar</Button>
          <Button color="red" onClick={handleDelete}>Eliminar</Button>
        </Flex>
      </Modal>

      {/* Modal para crear el usuario del cliente */}
      <CrearUsuarioClienteModal 
        cliente={selectedCliente} opened={crearUsuarioModalOpened} 
        onClose={closeCrearUsuarioModal} onUserCreated={fetchData} 
      />
    </>
  );
}