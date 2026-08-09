// components/rrhh/PuestosTable.jsx
'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table';
import { Button, Box, Flex, Tooltip, ActionIcon, Text, Menu, Modal, SimpleGrid, Paper, Title } from '@mantine/core';
import { IconEdit, IconTrash, IconEye, IconPlus, IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import BackButton from '../../../components/BackButton';

// Definición de las columnas de la tabla
const getColumns = () => [
  {
    accessorKey: 'nombre',
    header: 'Nombre del Puesto',
    size: 200,
  },
  {
    accessorKey: 'descripcion',
    header: 'Descripción',
    size: 400,
  },
  // Puedes añadir más columnas si tu modelo Puesto tiene otros campos relevantes
];

export function PuestosTable() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();

  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [selectedPuesto, setSelectedPuesto] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/rrhh/puestos');
      if (!response.ok) {
        throw new Error(`Error fetching data: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch puestos:', err);
      setError(err);
      notifications.show({
        title: 'Error',
        message: 'No se pudieron cargar los puestos. Intenta de nuevo.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!selectedPuesto) return;
    try {
      const response = await fetch(`/api/rrhh/puestos/${selectedPuesto.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Error deleting puesto: ${response.statusText}`);
      }
      notifications.show({
        title: 'Puesto Eliminado',
        message: 'El puesto ha sido eliminado exitosamente.',
        color: 'green',
      });
      fetchData(); // Recargar datos
    } catch (err) {
      console.error('Failed to delete puesto:', err);
      notifications.show({
        title: 'Error',
        message: `No se pudo eliminar el puesto: ${err.message}`,
        color: 'red',
      });
    } finally {
      closeDeleteModal();
      setSelectedPuesto(null);
    }
  };

  const columns = useMemo(() => getColumns(), []);

  const table = useMantineReactTable({
    columns,
    data,
    state: { isLoading: loading, showAlertBanner: !!error },
    mantineToolbarAlertBannerProps: error
      ? { color: 'red', children: `Error al cargar los datos: ${error.message}` }
      : undefined,
    enableRowActions: true,
    renderRowActionMenuItems: ({ row }) => (
      <Menu control={<ActionIcon variant="light" size="md" aria-label="Acciones"><IconEye size={18} /></ActionIcon>}>
        <Menu.Item
          leftSection={<IconEdit size={18} />}
          onClick={() => router.push(`/superuser/rrhh/puestos/${row.original.id}/editar`)}
        >
          Editar
        </Menu.Item>
        <Menu.Item
          leftSection={<IconTrash size={18} />}
          color="red"
          onClick={() => {
            setSelectedPuesto(row.original);
            openDeleteModal();
          }}
        >
          Eliminar
        </Menu.Item>
      </Menu>
    ),
    renderTopToolbarCustomActions: () => (
      <Flex gap="md">
        <Button
          leftSection={<IconPlus size={20} />}
          onClick={() => router.push('/superuser/rrhh/puestos/nuevo')}
          variant="filled"
          color="blue"
        >
          Registrar Nuevo Puesto
        </Button>
        <Tooltip label="Refrescar Datos">
          <ActionIcon onClick={fetchData} variant="light" size="lg" aria-label="Refrescar">
            <IconRefresh size={24} />
          </ActionIcon>
        </Tooltip>
      </Flex>
    ),
    initialState: {
      density: 'xs',
      pagination: { pageSize: 10, pageIndex: 0 },
    },
    mantineTableContainerProps: {
      style: { minHeight: '400px' },
    },
  });

  return (
    <>
    <Paper size="xl" my={70} mx={50}>
      <SimpleGrid cols={3}>
        <BackButton onClick={() => router.back()}/>
        <Title order={2} ta="center" mb="lg">
          Listado de Puestos
        </Title>
        <Box></Box>
      </SimpleGrid>
      <MantineReactTable table={table}/>
      <Modal opened={deleteModalOpened} onClose={closeDeleteModal} title="Confirmar Eliminación" centered>
        <Text>
          ¿Estás seguro de que quieres eliminar el puesto "
          <Text span fw={700} c="red">
            {selectedPuesto?.nombre}
          </Text>
          "? Esta acción no se puede deshacer.
        </Text>
        <Flex justify="flex-end" gap="md" mt="md">
          <Button variant="default" onClick={closeDeleteModal}>
            Cancelar
          </Button>
          <Button color="red" onClick={handleDelete}>
            Eliminar
          </Button>
        </Flex>
      </Modal>
    </Paper>
    </>
  );
}