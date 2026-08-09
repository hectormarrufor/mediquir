'use client';
import { useEffect, useState } from 'react';
import { 
  Container, Title, Timeline, Text, Paper, Group, Badge, Loader, Center, ThemeIcon, ActionIcon, Tooltip 
} from '@mantine/core';
import { 
  IconInfoCircle, IconAlertTriangle, IconAlertOctagon, IconBell, IconTrash 
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications'; // Opcional: para feedback visual

// 1. IMPORTA TU HOOK DE AUTH (Ajusta la ruta según tu proyecto)
import { useAuth } from '@/hooks/useAuth'; 

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // 2. OBTENER SI ES ADMIN
  const { isAdmin } = useAuth(); 

  useEffect(() => {
    fetch('/api/notificaciones')
      .then(res => res.json())
      .then(data => {
        if(data.success) setNotificaciones(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  // 3. FUNCIÓN PARA BORRAR NOTIFICACIÓN
  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de borrar esta notificación del historial?')) return;

    try {
      // Asumiendo que tu API soporta DELETE en /api/notificaciones/[id] o similar
      // Si tu ruta es diferente, ajusta aquí (ej: /api/notificaciones?id=${id})
      const res = await fetch(`/api/notificaciones/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        // Actualizar estado local eliminando el item borrado
        setNotificaciones((prev) => prev.filter((n) => n.id !== id));
        notifications.show({ title: 'Eliminado', message: 'Notificación borrada', color: 'green' });
      } else {
        notifications.show({ title: 'Error', message: 'No se pudo borrar', color: 'red' });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getIcon = (tipo) => {
    if (tipo === 'Critico') return <IconAlertOctagon size={18} />;
    if (tipo === 'Alerta') return <IconAlertTriangle size={18} />;
    return <IconInfoCircle size={18} />;
  };

  const getColor = (tipo) => {
    if (tipo === 'Critico') return 'red';
    if (tipo === 'Alerta') return 'orange';
    return 'blue';
  };

  if (loading) return <Center h="50vh"><Loader /></Center>;

  return (
    <Container size="md" py="xl">
      <Group mb="xl">
        <ThemeIcon size="xl" radius="md" variant="light">
          <IconBell />
        </ThemeIcon>
        <div>
          <Title order={2}>Centro de Notificaciones</Title>
          <Text c="dimmed">Historial completo de alertas y avisos</Text>
        </div>
      </Group>

      <Paper shadow="sm" radius="md" p="xl" withBorder>
        {notificaciones.length === 0 ? (
          <Text ta="center" c="dimmed">No tienes notificaciones registradas.</Text>
        ) : (
          <Timeline active={-1} bulletSize={30} lineWidth={2}>
            {notificaciones.map((notif) => (
              <Timeline.Item 
                key={notif.id} 
                bullet={getIcon(notif.tipo)}
                color={getColor(notif.tipo)}
                title={
                  <Group justify="space-between">
                    {/* Título y Badge a la izquierda */}
                    <Group gap="xs">
                      <Text fw={500}>{notif.titulo}</Text>
                      {notif.tipo !== 'Info' && (
                        <Badge color={getColor(notif.tipo)} size="xs">{notif.tipo}</Badge>
                      )}
                    </Group>

                    {/* 4. BOTÓN DE BORRAR (SOLO ADMIN) */}
                    {isAdmin && (
                      <Tooltip label="Eliminar notificación">
                        <ActionIcon 
                          color="red" 
                          variant="subtle" 
                          size="sm" 
                          onClick={() => handleDelete(notif.id)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                }
              >
                <Text c="dimmed" size="sm" mt={4}>{notif.mensaje}</Text>
                
                <Group justify="space-between" mt="xs">
                  <Text size="xs" c="dimmed">
                     {notif.fechaHoraCaracas || new Date(notif.createdAt).toLocaleString()}
                  </Text>
                  
                  {notif.url && (
                    <Text 
                      size="xs" 
                      c="blue" 
                      fw={500}
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(notif.url)}
                    >
                      Ir al detalle →
                    </Text>
                  )}
                </Group>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </Paper>
    </Container>
  );
}