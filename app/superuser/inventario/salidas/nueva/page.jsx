'use client';
import { Paper, Title } from '@mantine/core';
import SalidaForm from '../SalidasForm';

export default function NuevaSalidaPage() {
    return (
        <Paper   p="xl" mt={30}>
            <Title order={2} mb="xl">Registrar Salida de Inventario</Title>
            <SalidaForm />
        </Paper>
    );
}