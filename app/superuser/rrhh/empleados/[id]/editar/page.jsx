// app/superuser/rrhh/empleados/[id]/editar/page.js
'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation'; // <--- 1. Importar router
import { Container, Text, Center, Loader, Group, ActionIcon, Title } from '@mantine/core'; // <--- 2. Importar componentes de UI
import { notifications } from '@mantine/notifications';
import { IconChevronLeft } from '@tabler/icons-react'; // <--- 3. Importar icono

import { EmpleadoForm } from '../../EmpleadoForm';
import { toLocalDate } from '@/app/helpers/fechaCaracas';

export default function EditarEmpleadoPage({ params }) {
  const { id } = use(params);
  const router = useRouter(); // <--- 4. Inicializar router
  
  const [empleadoData, setEmpleadoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEmpleado = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/rrhh/empleados/${id}`);
        if (!response.ok) {
          throw new Error(`Error al cargar los datos del empleado: ${response.statusText}`);
        }
        const data = await response.json();
        setEmpleadoData({
            ...data, 
            fechaIngreso: toLocalDate(data.fechaIngreso), 
            fechaNacimiento: toLocalDate(data.fechaNacimiento), 
            fechaRetorno: data.fechaRetorno ? toLocalDate(data.fechaRetorno) : null 
        });
      } catch (err) {
        console.error('Failed to fetch employee for editing:', err);
        setError(err);
        notifications.show({
          title: 'Error',
          message: `No se pudo cargar el empleado: ${err.message}`,
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEmpleado();
  }, [id]);

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '300px' }}>
          <Loader size="lg" />
          <Text ml="md">Cargando datos del empleado...</Text>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '300px' }}>
          <Text c="red">Error: {error.message}</Text>
        </Center>
      </Container>
    );
  }

  if (!empleadoData) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '300px' }}>
          <Text>Empleado no encontrado.</Text>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      {/* --- ENCABEZADO DE NAVEGACIÓN --- */}
      <Group mb="lg" align="center">
        <ActionIcon 
            variant="subtle" 
            color="gray" 
            size="lg" 
            onClick={() => router.back()}
            aria-label="Volver"
        >
            <IconChevronLeft size={24} />
        </ActionIcon>
        <div>
            <Title order={2}>Editar Empleado</Title>
            <Text c="dimmed" size="sm">Modificar información personal y laboral</Text>
        </div>
      </Group>

      <EmpleadoForm initialData={empleadoData} />
    </Container>
  );
}