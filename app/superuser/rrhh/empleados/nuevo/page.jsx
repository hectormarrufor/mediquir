// app/superuser/rrhh/empleados/nuevo/page.js
'use client';

import { Container } from '@mantine/core';
import { EmpleadoForm } from '../EmpleadoForm';

export default function NuevoEmpleadoPage() {
  return (
    <Container size="xl" py="xl">
      <EmpleadoForm />
    </Container>
  );
}