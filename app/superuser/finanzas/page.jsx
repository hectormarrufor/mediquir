'use client';

import { Box, Paper, SimpleGrid, Title } from '@mantine/core';
import FinanzasDashboard from './FinanzasDashboard';
import BackButton from '../../components/BackButton';
import { useRouter } from 'next/navigation';

export default function FinanzasPage() {
  const router = useRouter();
  return (
    <Paper size="xl" mt={70} mx={20} p={10}>
      <SimpleGrid cols={3}>
        <BackButton onClick={() => router.back()}/>
        <Title order={2} ta="center" mb="lg" c="blue.9">
          Flujo de Caja y Finanzas
        </Title>
        <Box></Box>
      </SimpleGrid>
      <FinanzasDashboard />
    </Paper>
  );
}