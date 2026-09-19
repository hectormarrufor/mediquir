'use client';
import { useState } from 'react';
import {
  Container, Title, Timeline, Text, Paper, Group, Badge, Loader, Center, ThemeIcon,
  ActionIcon, Tooltip, Button, SegmentedControl, Stack
} from '@mantine/core';
import { IconBell, IconTrash, IconChecks, IconMailOpened } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/hooks/useAuth';
import {
  useNotificacionesLista, useMarcarLeidas, useUnreadCount, useInvalidarNotificaciones, aplanar
} from '@/hooks/useNotificaciones';
import { getTipoMeta, tiempoRelativo } from '@/app/components/nav/notificacionesUi';

export default function NotificacionesPage() {
  const [filtro, setFiltro] = useState('todas');
  const router = useRouter();
  const { isAdmin } = useAuth();

  const { data: noLeidas = 0 } = useUnreadCount();
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotificacionesLista({ filtro, limit: 20 });
  const marcar = useMarcarLeidas();
  const invalidar = useInvalidarNotificaciones();

  const notificaciones = aplanar(data);

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de borrar esta notificación del historial?')) return;
    try {
      const res = await fetch(`/api/notificaciones/${id}`, { method: 'DELETE' });
      if (res.ok) {
        invalidar();
        notifications.show({ title: 'Eliminado', message: 'Notificación borrada', color: 'green' });
      } else {
        notifications.show({ title: 'Error', message: 'No se pudo borrar', color: 'red' });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const abrir = (notif) => {
    if (!notif.leida) marcar.mutate({ ids: [notif.id] });
    if (notif.url) router.push(notif.url);
  };

  return (
    <Container size="md" py="xl">
      <Group mb="xl" justify="space-between" align="flex-start">
        <Group>
          <ThemeIcon size="xl" radius="md" variant="light" color="brand.6"><IconBell /></ThemeIcon>
          <div>
            <Title order={2}>Centro de Notificaciones</Title>
            <Text c="dimmed">
              Historial de alertas y avisos{noLeidas > 0 ? ` · ${noLeidas} sin leer` : ' · estás al día'}
            </Text>
          </div>
        </Group>

        <Button
          variant="light" color="brand.6" leftSection={<IconChecks size={18} />} tt="none"
          disabled={noLeidas === 0 || marcar.isPending}
          onClick={() => marcar.mutate({ todas: true })}
        >
          Marcar todas como leídas
        </Button>
      </Group>

      <Paper shadow="sm" radius="md" p="xl" withBorder>
        <SegmentedControl
          mb="lg" value={filtro} onChange={setFiltro} radius="xl" color="navy.9"
          data={[{ value: 'todas', label: 'Todas' }, { value: 'no-leidas', label: 'Sin leer' }]}
        />

        {isLoading ? (
          <Center h={200}><Loader /></Center>
        ) : isError ? (
          <Text ta="center" c="red.7">No se pudieron cargar las notificaciones.</Text>
        ) : notificaciones.length === 0 ? (
          <Text ta="center" c="dimmed">
            {filtro === 'no-leidas' ? 'No tienes notificaciones sin leer.' : 'No tienes notificaciones registradas.'}
          </Text>
        ) : (
          <Stack gap="lg">
            <Timeline active={-1} bulletSize={30} lineWidth={2}>
              {notificaciones.map((notif) => {
                const { color, icon } = getTipoMeta(notif.tipo, 18);
                return (
                  <Timeline.Item
                    key={notif.id}
                    bullet={icon}
                    color={color}
                    title={
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs">
                          <Text fw={notif.leida ? 500 : 800}>{notif.titulo}</Text>
                          {!notif.leida && <Badge color="accent.6" size="xs">Nueva</Badge>}
                          {notif.tipo !== 'Info' && <Badge color={color} size="xs" variant="light">{notif.tipo}</Badge>}
                        </Group>

                        <Group gap={4} wrap="nowrap">
                          <Tooltip label={notif.leida ? 'Marcar como no leída' : 'Marcar como leída'}>
                            <ActionIcon
                              variant="subtle" color="brand.6" size="sm" aria-label="Cambiar estado de lectura"
                              onClick={() => marcar.mutate({ ids: [notif.id], leida: !notif.leida })}
                            >
                              <IconMailOpened size={16} />
                            </ActionIcon>
                          </Tooltip>

                          {isAdmin && (
                            <Tooltip label="Eliminar notificación">
                              <ActionIcon color="red" variant="subtle" size="sm" aria-label="Eliminar" onClick={() => handleDelete(notif.id)}>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Group>
                    }
                  >
                    <Text c="dimmed" size="sm" mt={4}>{notif.mensaje}</Text>

                    <Group justify="space-between" mt="xs">
                      <Text size="xs" c="dimmed">{tiempoRelativo(notif)}{notif.fechaHoraCaracas ? ` · ${notif.fechaHoraCaracas}` : ''}</Text>

                      {notif.url && (
                        <Text size="xs" c="brand.6" fw={600} style={{ cursor: 'pointer' }} onClick={() => abrir(notif)}>
                          Ir al detalle →
                        </Text>
                      )}
                    </Group>
                  </Timeline.Item>
                );
              })}
            </Timeline>

            {hasNextPage && (
              <Center>
                <Button variant="default" tt="none" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
                  Cargar más notificaciones
                </Button>
              </Center>
            )}
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
