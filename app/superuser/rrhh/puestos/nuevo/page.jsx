// app/superuser/rrhh/puestos/nuevo/page.js
'use client';

import { Container } from '@mantine/core';
import { PuestoForm } from '../PuestoForm';

export default function NuevoPuestoPage() {
  return (
    <Container size="xl" py="xl">
      <PuestoForm />
    </Container>
  );
}