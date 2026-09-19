'use client';

import { useState } from 'react';
import {
  Popover, ActionIcon, Indicator, Text, Group, ThemeIcon, Button, ScrollArea,
  Center, Loader, SegmentedControl, Box, Badge, Tooltip
} from '@mantine/core';
import { IconBell, IconChecks, IconMailOpened, IconBellOff } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  useUnreadCount, useNotificacionesLista, useMarcarLeidas, aplanar
} from '@/hooks/useNotificaciones';
import { getTipoMeta, tiempoRelativo } from './nav/notificacionesUi';
import navClasses from './nav/navigation.module.css';

export default function NotificationBell() {
  const [opened, setOpened] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const { isAuthenticated, clienteId } = useAuth();
  const router = useRouter();

  // Contador liviano siempre activo; la lista (paginada) solo se pide al abrir el cajón
  const { data: noLeidas = 0 } = useUnreadCount();
  const {
    data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage
  } = useNotificacionesLista({ filtro, enabled: Boolean(isAuthenticated) && opened });
  const marcar = useMarcarLeidas();

  if (!isAuthenticated) return null;

  const notificaciones = aplanar(data);

  const abrir = (notif) => {
    if (!notif.leida) marcar.mutate({ ids: [notif.id] });
    setOpened(false);
    if (notif.url) router.push(notif.url);
  };

  const cargarMas = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <Popover
      width="min(390px, calc(100vw - 24px))"
      position="bottom-end"
      offset={10}
      radius="lg"
      shadow="xl"
      opened={opened}
      onChange={setOpened}
      classNames={{ dropdown: navClasses.notifDropdown }}
    >
      <Popover.Target>
        <Indicator
          color="accent.6"
          size={noLeidas > 0 ? 18 : 0}
          label={noLeidas > 99 ? '99+' : noLeidas}
          offset={6}
          disabled={noLeidas === 0}
          processing
        >
          <ActionIcon
            variant="transparent"
            className={navClasses.iconBtn}
            size={40}
            radius="xl"
            aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones'}
            onClick={() => setOpened((o) => !o)}
          >
            <IconBell size={22} stroke={1.6} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0}>
        {/* CABECERA */}
        <Box className={navClasses.notifHeader}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap={8} wrap="nowrap">
              <Text fw={800} size="md" c="navy.9">Notificaciones</Text>
              {noLeidas > 0 && <Badge color="accent.6" size="sm" radius="xl">{noLeidas} sin leer</Badge>}
            </Group>
            <Tooltip label="Marcar todas como leídas" withArrow>
              <ActionIcon
                variant="light"
                color="brand.6"
                radius="xl"
                aria-label="Marcar todas como leídas"
                disabled={noLeidas === 0 || marcar.isPending}
                onClick={() => marcar.mutate({ todas: true })}
              >
                <IconChecks size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <SegmentedControl
            fullWidth
            size="xs"
            radius="xl"
            mt="sm"
            value={filtro}
            onChange={setFiltro}
            color="navy.9"
            data={[{ value: 'todas', label: 'Todas' }, { value: 'no-leidas', label: 'Sin leer' }]}
          />
        </Box>

        {/* LISTA (paginada: se cargan más al llegar al final) */}
        <ScrollArea.Autosize mah={400} type="scroll" onBottomReached={cargarMas}>
          {isLoading ? (
            <Center p="xl"><Loader size="sm" /></Center>
          ) : isError ? (
            <Text c="red.7" size="sm" ta="center" p="lg">No se pudieron cargar las notificaciones.</Text>
          ) : notificaciones.length === 0 ? (
            <Center p="xl" style={{ flexDirection: 'column', gap: 8 }}>
              <ThemeIcon variant="light" color="gray" size={44} radius="xl"><IconBellOff size={22} /></ThemeIcon>
              <Text c="dimmed" size="sm">{filtro === 'no-leidas' ? 'Estás al día' : 'No hay novedades'}</Text>
            </Center>
          ) : (
            <>
              {notificaciones.map((notif) => {
                const { color, icon } = getTipoMeta(notif.tipo);
                return (
                  <Box
                    key={notif.id}
                    className={navClasses.notifItem}
                    data-unread={!notif.leida || undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(notif)}
                    onKeyDown={(e) => { if (e.key === 'Enter') abrir(notif); }}
                  >
                    <Group align="flex-start" wrap="nowrap" gap="sm">
                      <ThemeIcon variant="light" color={color} size="lg" radius="xl">{icon}</ThemeIcon>

                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={notif.leida ? 500 : 800} c="navy.9" lineClamp={1}>{notif.titulo}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>{notif.mensaje}</Text>
                        <Text size="xs" c="dimmed" mt={4} fw={500}>{tiempoRelativo(notif)}</Text>
                      </Box>

                      {!notif.leida && (
                        <Tooltip label="Marcar como leída" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="brand.6"
                            size="sm"
                            radius="xl"
                            aria-label="Marcar como leída"
                            onClick={(e) => { e.stopPropagation(); marcar.mutate({ ids: [notif.id] }); }}
                          >
                            <IconMailOpened size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Box>
                );
              })}

              {hasNextPage && (
                <Center p="sm">
                  <Button
                    variant="subtle" color="brand.6" size="compact-sm" tt="none" loading={isFetchingNextPage} onClick={cargarMas}
                  >
                    Cargar más
                  </Button>
                </Center>
              )}
            </>
          )}
        </ScrollArea.Autosize>

        {/* PIE */}
        {!clienteId && (
          <Box className={navClasses.notifFooter}>
            <Button
              fullWidth variant="light" color="brand.6" size="xs" tt="none" component={Link}
              href="/superuser/notificaciones" onClick={() => setOpened(false)}
            >
              Ver todo el historial
            </Button>
          </Box>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
