// app/superuser/rrhh/page.jsx
'use client';

import { Container, Paper, Title, Text, SimpleGrid, ThemeIcon, Group, ActionIcon, Card, rem } from '@mantine/core';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaUsers, FaBriefcase, FaTshirt, FaBuilding } from 'react-icons/fa';
import { IconChevronLeft } from '@tabler/icons-react';
import { useAuth } from '@/hooks/useAuth';

// Datos del menú
const mockdata = [
    { 
      title: 'Gestión de Empleados', 
      icon: FaUsers, 
      color: 'blue', 
      href: '/superuser/rrhh/empleados',
      description: 'Crear, editar y consultar la ficha de todo el personal.'
    },
    { 
      title: 'Gestión de Puestos', 
      icon: FaBriefcase, 
      color: 'teal', 
      href: '/superuser/rrhh/puestos',
      description: 'Definir los cargos, roles y responsabilidades.',
      restricted: true // Marcamos este como restringido
    },
    { 
      title: 'Gestión de Departamentos', 
      icon: FaBuilding, 
      color: 'violet', 
      href: '/superuser/rrhh/departamentos',
      description: 'Organizar la empresa en áreas operativas.',
      restricted: true // Marcamos este como restringido
    },
    { 
      title: 'Dotación de Indumentaria', 
      icon: FaTshirt, 
      color: 'grape', 
      href: '/superuser/rrhh/dotacion',
      description: 'Inventario de uniformes y equipos de seguridad.'
    },
];

export default function RRHHPage() {
    const router = useRouter();
    const { userId } = useAuth(); // Obtenemos el ID del usuario

    // Filtramos los items según el permiso
    const items = mockdata
        .filter(item => {
            // Si el item es restringido, solo lo mostramos si userId es 1
            if (item.restricted) {
                return userId === 1;
            }
            // Si no es restringido, lo mostramos a todos
            return true;
        })
        .map((item) => (
            <Card 
                key={item.title} 
                component={Link} 
                href={item.href}
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder
                style={{ 
                    cursor: 'pointer', 
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
                // Efecto hover inline (o puedes usar clases css)
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-5px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--mantine-shadow-sm)';
                }}
            >
                <ThemeIcon 
                    color={item.color} 
                    variant="light" 
                    size={50} 
                    radius="md"
                    style={{ marginBottom: rem(15) }}
                >
                    <item.icon size="1.6rem" />
                </ThemeIcon>

                <Text fw={700} size="lg" mt="md" style={{ lineHeight: 1.2 }}>
                    {item.title}
                </Text>

                <Text size="sm" c="dimmed" mt={7}>
                    {item.description}
                </Text>
            </Card>
        ));

    return (
        <Container size="xl" py="xl">
            {/* Encabezado con Botón Atrás */}
            <Group mb="xl" align="center">
                <ActionIcon 
                    variant="subtle" 
                    color="gray" 
                    size="xl" 
                    onClick={() => router.back()}
                    radius="xl"
                >
                    <IconChevronLeft size={28} />
                </ActionIcon>
                <div>
                    <Title order={2}>Recursos Humanos</Title>
                    <Text c="dimmed">Administración de personal y estructura organizativa</Text>
                </div>
            </Group>

            {/* Contenedor Principal */}
            <Paper p="xl" radius="md" bg="transparent"> 
                {items.length > 0 ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
                        {items}
                    </SimpleGrid>
                ) : (
                    <Text c="dimmed" ta="center" fs="italic">
                        No tienes permisos para ver las opciones de este módulo.
                    </Text>
                )}
            </Paper>
        </Container>
    );
}