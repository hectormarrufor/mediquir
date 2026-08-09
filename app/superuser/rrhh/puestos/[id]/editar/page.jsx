// app/superuser/rrhh/puestos/[id]/editar/page.js
'use client';

import { use, useEffect, useState } from 'react';
import { Container, Text, Center, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { PuestoForm } from '../../PuestoForm';

export default function EditarPuestoPage({ params }) {
  const { id } = use(params); // El ID del puesto viene de los parámetros de la URL
  const [puestoData, setPuestoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPuesto = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/rrhh/puestos/${id}`);
        if (!response.ok) {
          throw new Error(`Error al cargar los datos del puesto: ${response.statusText}`);
        }
        const data = await response.json();
        setPuestoData(data);
      } catch (err) {
        console.error('Failed to fetch puesto for editing:', err);
        setError(err);
        notifications.show({
          title: 'Error',
          message: `No se pudo cargar el puesto: ${err.message}`,
          color: 'red',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPuesto();
  }, [id]);

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '300px' }}>
          <Loader size="lg" />
          <Text ml="md">Cargando datos del puesto...</Text>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '300px' }}>
          <Text color="red">Error: {error.message}</Text>
        </Center>
      </Container>
    );
  }

  if (!puestoData) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ height: '300px' }}>
          <Text>Puesto no encontrado.</Text>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <PuestoForm initialData={puestoData} />
    </Container>
  );
}