'use client';
import { useState, useEffect } from 'react';
import { 
  Popover, ActionIcon, Indicator, Text, Stack, Group, 
  ThemeIcon, Button, ScrollArea, Divider, Loader, Center 
} from '@mantine/core';
import { IconBell, IconInfoCircle, IconAlertTriangle, IconAlertOctagon } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function NotificationBell() {
  const [opened, setOpened] = useState(false);
  const {isAuthenticated} = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Función para obtener notificaciones
  const fetchNotificaciones = async () => {
    try {
      const res = await fetch('/api/notificaciones');
      const data = await res.json();
      if (data.success) {
        setNotificaciones(data.data);
      }
    } catch (error) {
      console.error("Error cargando notificaciones:", error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar al montar el componente
  useEffect(() => {
    fetchNotificaciones();
    // Opcional: Podrías poner un setInterval aquí para polling cada 60seg
  }, []);

  // Icono según el tipo
  const getIcon = (tipo) => {
    if (tipo === 'Critico') return <IconAlertOctagon size={16} />;
    if (tipo === 'Alerta') return <IconAlertTriangle size={16} />;
    return <IconInfoCircle size={16} />;
  };

  const getColor = (tipo) => {
    if (tipo === 'Critico') return 'red';
    if (tipo === 'Alerta') return 'orange';
    return 'blue';
  };

  // Solo mostramos las últimas 5 en el popup
  const ultimas5 = notificaciones.slice(0, 5);
 if (isAuthenticated)
  return (
    <Popover 
      width={320} 
      position="bottom-end" 
      withArrow 
      shadow="md"
      opened={opened} 
      onChange={setOpened}
    >
      <Popover.Target>
        <Indicator 
          color="red" 
          size={10} 
          offset={4} 
          disabled={notificaciones.length === 0} 
          processing // Animación de pulso
        >
          <ActionIcon 
            variant="subtle" 
            color="gray" 
            size="lg" 
            onClick={() => setOpened((o) => !o)}
          >
            <IconBell size={22} stroke={1.5} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0}>
        {/* CABECERA */}
        <Group justify="space-between" p="xs" bg="gray.0">
          <Text size="sm" fw={700}>Notificaciones</Text>
          <Text size="xs" c="dimmed">{notificaciones.length} nuevas</Text>
        </Group>
        
        <Divider />

        {/* LISTA (Scrollable por si acaso) */}
        <ScrollArea.Autosize mah={300} type="scroll">
          {loading ? (
            <Center p="md"><Loader size="sm" /></Center>
          ) : ultimas5.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" p="md">No hay novedades</Text>
          ) : (
            ultimas5.map((notif) => (
              <div 
                key={notif.id} 
                style={{ 
                  padding: '10px', 
                  cursor: 'pointer', 
                  borderBottom: '1px solid #eee',
                  transition: 'background 0.2s'
                }}
                className="hover:bg-gray-50" // Tailwind utility si usas, o style manual
                onClick={() => {
                   setOpened(false);
                   if (notif.url) router.push(notif.url);
                }}
              >
                <Group align="flex-start" wrap="nowrap" gap="xs">
                  <ThemeIcon 
                    variant="light" 
                    color={getColor(notif.tipo)} 
                    size="md" 
                    radius="xl"
                  >
                    {getIcon(notif.tipo)}
                  </ThemeIcon>
                  
                  <div style={{ flex: 1 }}>
                    <Text size="sm" fw={500} lineClamp={1}>{notif.titulo}</Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {notif.mensaje}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4} ta="right">
                      {/* Aquí usas la hora de Caracas que guardaste o createdAt */}
                      {notif.fechaHoraCaracas || new Date(notif.createdAt).toLocaleTimeString()}
                    </Text>
                  </div>
                </Group>
              </div>
            ))
          )}
        </ScrollArea.Autosize>

        <Divider />

        {/* FOOTER - BOTÓN VER TODAS */}
        <div style={{ padding: '8px' }}>
          <Button 
            fullWidth 
            variant="light" 
            size="xs" 
            component={Link} 
            href="/superuser/notificaciones"
            onClick={() => setOpened(false)}
          >
            Ver todas las notificaciones
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}