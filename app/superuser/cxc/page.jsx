'use client';

import React from 'react';
import { Box, Tabs, Text, Title } from '@mantine/core';
import { IconChartBar, IconTable, IconUsers } from '@tabler/icons-react';
import CuentasDashboard from '../_components/CuentasDashboard';
import LibroCobranza from './_components/LibroCobranza';
import HojasVendedores from './_components/HojasVendedores';

// Cuentas por cobrar: el libro de cobranza (editable como en Excel), las hojas de los vendedores a comisión y el resumen con gráficos
export default function CuentasPorCobrarPage() {
    return (
        <Box maw={1500} mx="auto" px="md" py="md">
            <Title order={2} c="white">Cuentas por cobrar</Title>
            <Text size="sm" c="gray.4" mb="md">Como las lleva la administradora en Excel: cada celda se edita ahí mismo, y todo cambio de la deuda queda registrado como un abono o un ajuste.</Text>
            <Tabs defaultValue="libro" keepMounted={false} variant="pills" color="navy.9">
                <Tabs.List mb="md">
                    <Tabs.Tab value="libro" leftSection={<IconTable size={16} />}>Libro de cobranza</Tabs.Tab>
                    <Tabs.Tab value="vendedores" leftSection={<IconUsers size={16} />}>Vendedores a comisión</Tabs.Tab>
                    <Tabs.Tab value="resumen" leftSection={<IconChartBar size={16} />}>Resumen y antigüedad</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="libro"><LibroCobranza /></Tabs.Panel>
                <Tabs.Panel value="vendedores"><HojasVendedores /></Tabs.Panel>
                <Tabs.Panel value="resumen"><CuentasDashboard tipo="cobrar" /></Tabs.Panel>
            </Tabs>
        </Box>
    );
}
