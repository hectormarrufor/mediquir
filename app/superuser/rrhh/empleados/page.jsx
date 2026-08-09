// app/superuser/rrhh/empleados/page.js
'use client';

import {  Box, Paper, SimpleGrid, Title } from '@mantine/core';
import EmpleadosTable from './EmpleadosTable';
import BackButton from '../../../components/BackButton';
import { useRouter } from 'next/navigation';

export default function EmpleadosPage() {
  const router = useRouter();
  return (
    <Paper size="xl" mt={70} mx={20} p={10}>
      <SimpleGrid cols={3}>
        <BackButton  onClick={() => router.back()}/>
        <Title  order={2} ta="center" mb="lg">
          Listado de Empleados
        </Title>
        <Box ></Box>
      </SimpleGrid>
      <EmpleadosTable />
    </Paper>
  );
}