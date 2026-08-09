'use client';

import { Box, Paper, SimpleGrid, Title } from '@mantine/core';
import PedidosTable from './PedidosTable';
import BackButton from '../../components/BackButton'; // Ajusta la ruta de tu BackButton
import { useRouter } from 'next/navigation';

export default function PedidosPage() {
  const router = useRouter();
  return (
    <Paper size="xl" mt={70} mx={20} p={10}>
      <SimpleGrid cols={3}>
        <BackButton onClick={() => router.back()}/>
        <Title order={2} ta="center" mb="lg">
          Gestión de Pedidos
        </Title>
        <Box></Box>
      </SimpleGrid>
      <PedidosTable />
    </Paper>
  );
}