'use client';

import React, { Suspense } from 'react';
import { Box, Paper, Tabs, Text, Title } from '@mantine/core';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconBook2, IconListDetails, IconScale } from '@tabler/icons-react';
import BalanceTab from './_components/BalanceTab';
import CierreTab from './_components/CierreTab';
import FinanzasDashboard from './FinanzasDashboard';

const PESTANAS = ['balance', 'cierre', 'movimientos'];

function Contenido() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const activa = PESTANAS.includes(params.get('tab')) ? params.get('tab') : 'balance';

    return (
        <Box maw={1500} mx="auto" px="md" py="md">
            <Title order={2} c="white">Balance general</Title>
            <Text size="sm" c="gray.4" mb="md">Resultados, posición, IVA y cierre de mes.</Text>

            <Tabs value={activa} onChange={(v) => router.replace(`${pathname}?tab=${v}`)} keepMounted={false} color="accent.6" variant="pills" radius="xl">
                <Paper radius="xl" p={4} mb="lg" w="fit-content" maw="100%" style={{ overflowX: 'auto' }}>
                <Tabs.List style={{ flexWrap: 'nowrap' }}>
                    <Tabs.Tab value="balance" leftSection={<IconScale size={16} />}>Balance</Tabs.Tab>
                    <Tabs.Tab value="cierre" leftSection={<IconBook2 size={16} />}>Cierre mensual</Tabs.Tab>
                    <Tabs.Tab value="movimientos" leftSection={<IconListDetails size={16} />}>Movimientos de caja</Tabs.Tab>
                </Tabs.List>
                </Paper>
                <Tabs.Panel value="balance"><BalanceTab /></Tabs.Panel>
                <Tabs.Panel value="cierre"><CierreTab /></Tabs.Panel>
                <Tabs.Panel value="movimientos"><Paper radius="lg" p="md"><FinanzasDashboard /></Paper></Tabs.Panel>
            </Tabs>
        </Box>
    );
}

export default function FinanzasPage() {
    return <Suspense fallback={null}><Contenido /></Suspense>;
}
