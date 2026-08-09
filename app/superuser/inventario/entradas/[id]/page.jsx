// app/superuser/inventario/entradas/[id]/page.js
'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import {
  Title, Text, Paper, Group, Divider, Grid,
  ActionIcon, Tooltip, LoadingOverlay, Button, Center
} from '@mantine/core';
import { IconEdit, IconRefresh, IconAlertCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';

export default function EntradaInventarioDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [entrada, setEntrada] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEntradaDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/inventario/entradas/${id}`);
      if (!response.ok) {
        throw new Error(`Error fetching entrada: ${response.statusText}`);
      }
      const data = await response.json();
      setEntrada(data);
    } catch (err) {
      console.error('Failed to fetch entrada details:', err);
      setError(err);
      notifications.show({
        title: 'Error',
        message: `No se pudo cargar el detalle de la entrada: ${err.message}`,
        color: 'red',
        icon: <IconAlertCircle />,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEntradaDetails();
  }, [fetchEntradaDetails]);

  if (loading) {
    return (
      <Paper p="md" shadow="sm" radius="md" style={{ position: 'relative', minHeight: '300px' }}>
        <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
        <Text align="center">Cargando detalle de la entrada...</Text>
      </Paper>
    );
  }

  if (error || !entrada) {
    return (
      <Paper p="md" shadow="sm" radius="md">
        <Text color="red">Error al cargar la entrada o no encontrada. {error?.message}</Text>
        <Button onClick={() => router.push('/superuser/inventario/entradas')} mt="md">Volver al listado</Button>
      </Paper>
    );
  }

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Detalle de Entrada de Inventario</Title>
        <Group>
          <Tooltip label="Editar Entrada (Campos Auxiliares)">
            <ActionIcon variant="light" size="lg" onClick={() => router.push(`/superuser/inventario/entradas/${entrada.id}/editar`)}>
              <IconEdit size={24} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refrescar Datos">
            <ActionIcon variant="light" size="lg" onClick={fetchEntradaDetails}>
              <IconRefresh size={24} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Paper p="md" shadow="sm" radius="md" mb="lg">
        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text fw={700}>Consumible:</Text>
            <Text>{entrada.consumible?.nombre || 'N/A'}</Text>
            <Text fw={700} mt="sm">Cantidad:</Text>
            <Text>{parseFloat(entrada.cantidad).toFixed(2)} {entrada.consumible?.unidadMedida || ''}</Text>
            <Text fw={700} mt="sm">Fecha de Entrada:</Text>
            <Text>{new Date(entrada.fechaEntrada).toLocaleDateString()}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text fw={700}>Orden de Compra Asociada:</Text>
            <Text>{entrada.ordenCompra ? `OC-${entrada.ordenCompra.numeroOrden}` : 'Ninguna'}</Text>
            <Text fw={700} mt="sm">Recibido Por:</Text>
            <Text>{entrada.recibidoPor ? `${entrada.recibidoPor.nombre} ${entrada.recibidoPor.apellido}` : 'N/A'}</Text>
            <Text fw={700} mt="sm">Notas:</Text>
            <Text>{entrada.notas || 'Sin notas'}</Text>
          </Grid.Col>
        </Grid>
      </Paper>

      <Group justify="flex-start" mt="xl">
        <Button variant="default" onClick={() => router.push('/superuser/inventario/entradas')}>
          Volver al Listado
        </Button>
      </Group>
    </Box>
  );
}