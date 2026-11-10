'use client';

import React, { useEffect, useState } from 'react';
import { Box, Button, Group, Tabs, Text, Title } from '@mantine/core';
import { IconChartBar, IconHelpCircle, IconReceiptTax, IconTable, IconUsers } from '@tabler/icons-react';
import CuentasDashboard from '../_components/CuentasDashboard';
import LibroCobranza from './_components/LibroCobranza';
import HojasVendedores from './_components/HojasVendedores';
import SeguimientoCobros from './_components/SeguimientoCobros';
import TutorialCxc, { tutorialYaVisto } from './_components/TutorialCxc';
import { guardarLocal, leerLocal, useEsTelefono } from './_components/utilidades';
import classes from './_components/cxc.module.css';

const PESTANAS = ['libro', 'vendedores', 'seguimiento', 'resumen'];
const LLAVE_PESTANA = 'mq:cxc:pestana';

// Cuentas por cobrar: el libro de cobranza (editable como en Excel), las hojas de los vendedores a comisión y el resumen con la antigüedad.
// Usa casi todo el ancho de la pantalla (solo un margen pequeño a los lados): son tablas con muchas columnas.
export default function CuentasPorCobrarPage() {
    const telefono = useEsTelefono();
    const [pestana, setPestana] = useState('libro');
    const [tutorial, setTutorial] = useState({ abierto: false, seccion: 'libro' });

    // La pestaña de la última vez y el tutorial de la primera vez se leen al montar (no en el servidor: evita diferencias de hidratación)
    useEffect(() => {
        const guardada = leerLocal(LLAVE_PESTANA);
        const inicial = PESTANAS.includes(guardada) ? guardada : 'libro';
        setPestana(inicial);
        if (!tutorialYaVisto()) setTutorial({ abierto: true, seccion: inicial });
    }, []);
    const cambiarPestana = (v) => { if (!v) return; setPestana(v); guardarLocal(LLAVE_PESTANA, v); };

    return (
        <Box px={{ base: 8, sm: 12, lg: 16 }} pt={{ base: 8, sm: 10 }} pb="md">
            <Group justify="space-between" align="center" wrap="nowrap" gap="sm" mb={8}>
                <Box style={{ minWidth: 0 }}>
                    <Title order={3} c="white" fz={{ base: 19, sm: 22 }} style={{ paddingBottom: 0 }}>Cuentas por cobrar</Title>
                    <Text size="xs" c="gray.4" visibleFrom="sm">Lo que deben los clientes, los abonos que van haciendo y las comisiones de los vendedores. Todo cambio de la deuda queda registrado como abono o ajuste.</Text>
                </Box>
                <Button
                    variant="white" size={telefono ? 'compact-sm' : 'sm'} leftSection={<IconHelpCircle size={18} />} style={{ flexShrink: 0 }}
                    onClick={() => setTutorial({ abierto: true, seccion: pestana })} aria-label="¿Cómo se usa? Abrir el tutorial"
                >
                    ¿Cómo se usa?
                </Button>
            </Group>

            {/* En el teléfono, nombres cortos y sin ícono: las tres pestañas caben a 360 px */}
            <Tabs value={pestana} onChange={cambiarPestana} keepMounted={false} variant="pills" color="navy.9" radius="md" styles={telefono ? { tab: { paddingInline: 6, fontWeight: 700 } } : { tab: { fontWeight: 700 } }}>
                <Tabs.List mb={8} className={`${classes.pestanas} ${classes.noImprimir}`} grow={Boolean(telefono)}>
                    <Tabs.Tab value="libro" leftSection={telefono ? null : <IconTable size={16} />}>{telefono ? 'Libro' : 'Libro de cobranza'}</Tabs.Tab>
                    <Tabs.Tab value="vendedores" leftSection={telefono ? null : <IconUsers size={16} />}>{telefono ? 'Vendedores' : 'Vendedores a comisión'}</Tabs.Tab>
                    <Tabs.Tab value="seguimiento" leftSection={telefono ? null : <IconReceiptTax size={16} />}>{telefono ? 'Seguimiento' : 'Retenciones y seguimiento'}</Tabs.Tab>
                    <Tabs.Tab value="resumen" leftSection={telefono ? null : <IconChartBar size={16} />}>{telefono ? 'Resumen' : 'Resumen y antigüedad'}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="libro"><LibroCobranza /></Tabs.Panel>
                <Tabs.Panel value="vendedores"><HojasVendedores /></Tabs.Panel>
                <Tabs.Panel value="seguimiento"><SeguimientoCobros /></Tabs.Panel>
                <Tabs.Panel value="resumen"><CuentasDashboard tipo="cobrar" embebido /></Tabs.Panel>
            </Tabs>

            <TutorialCxc abierto={tutorial.abierto} seccionInicial={tutorial.seccion} onCerrar={() => setTutorial((t) => ({ ...t, abierto: false }))} />
        </Box>
    );
}
