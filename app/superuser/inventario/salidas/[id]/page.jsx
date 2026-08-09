// app/superuser/inventario/salidas/[id]/page.js
'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import {
  Title, Text, Paper, Group, Divider, Grid,
  ActionIcon, Tooltip, LoadingOverlay, Button, Center
} from '@mantine/core';
import { IconEdit, IconRefresh, IconAlertCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';

export default function SalidaInventarioDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [salida, setSalida] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSalidaDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/inventario/salidas/${id}`);
      if (!response.ok) {
        throw new Error(`Error fetching salida: ${response.statusText}`);
      }
      const data = await response.json();
      setSalida(data);
    } catch (err) {
      console.error('Failed to fetch salida details:', err);
      setError(err);
      notifications.show({
        title: 'Error',
        message: `No se pudo cargar el detalle de la salida: ${err.message}`,
        color: 'red',
        icon: <IconAlertCircle />,
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSalidaDetails();
  }, [fetchSalidaDetails]);

  if (loading) {
    return (
      <Paper p="md" shadow="sm" radius="md" style={{ position: 'relative', minHeight: '300px' }}>
        <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
        <Text align="center">Cargando detalle de la salida...</Text>
      </Paper>
    );
  }

  if (error || !salida) {
    return (
      <Paper p="md" shadow="sm" radius="md">
        <Text color="red">Error al cargar la salida o no encontrada. {error?.message}</Text>
        <Button onClick={() => router.push('/superuser/inventario/salidas')} mt="md">Volver al listado</Button>
      </Paper>
    );
  }

  return (
    <Box>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Detalle de Salida de Inventario</Title>
        <Group>
          <Tooltip label="Editar Salida (Campos Auxiliares)">
            <ActionIcon variant="light" size="lg" onClick={() => router.push(`/superuser/inventario/salidas/${salida.id}/editar`)}>
              <IconEdit size={24} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Refrescar Datos">
            <ActionIcon variant="light" size="lg" onClick={fetchSalidaDetails}>
              <IconRefresh size={24} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Paper p="md" shadow="sm" radius="md" mb="lg">
        <Grid>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text fw={700}>Consumible:</Text>
            <Text>{salida.consumible?.nombre || 'N/A'}</Text>
            <Text fw={700} mt="sm">Cantidad:</Text>
            <Text>{parseFloat(salida.cantidad).toFixed(2)} {salida.consumible?.unidadMedida || ''}</Text>
            <Text fw={700} mt="sm">Fecha de Salida:</Text>
            <Text>{new Date(salida.fechaSalida).toLocaleDateString()}</Text>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Text fw={700}>Motivo:</Text>
            <Text>{salida.motivo || 'N/A'}</Text>
            <Text fw={700} mt="sm">Entregado Por:</Text>
            <Text>{salida.entregadoPor ? `${salida.entregadoPor.nombre} ${salida.entregadoPor.apellido}` : 'N/A'}</Text>
            <Text fw={700} mt="sm">Contrato de Servicio Asociado:</Text>
            <Text>{salida.contratoServicio ? `Contrato ${salida.contratoServicio.numeroContrato}` : 'Ninguno'}</Text>
            <Text fw={700} mt="sm">Notas:</Text>
            <Text>{salida.notas || 'Sin notas'}</Text>
          </Grid.Col>
        </Grid>
      </Paper>

      <Group justify="flex-start" mt="xl">
        <Button variant="default" onClick={() => router.push('/superuser/inventario/salidas')}>
          Volver al Listado
        </Button>
      </Group>
    </Box>
  );
}