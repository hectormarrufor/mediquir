'use client';

import { useState } from 'react';
import { Stack, TextInput, NumberInput, Select, Button, Group, Textarea, SimpleGrid, Paper, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';

export default function RepuestoGenericoForm({ 
    onSuccess, 
    onCancel, 
    categoria, 
    naturaleza 
}) {
    const [loading, setLoading] = useState(false);

    const form = useForm({
        initialValues: {
            nombre: '',
            stockAlmacen: 0,
            stockMinimo: 0,
            precioPromedio: 0,
            unidadMedida: naturaleza === 'serializado' ? 'unidades' : '', // Serializados suelen ser unidades
            // Campos que irán al JSONB:
            marca: '',
            referenciaFabricante: '',
            especificacionesExtra: ''
        },
        validate: {
            nombre: (value) => (!value.trim() ? 'El nombre es obligatorio' : null),
            unidadMedida: (value) => (!value ? 'Seleccione una unidad' : null),
            precioPromedio: (value) => (value <= 0 ? 'El precio debe ser mayor a 0' : null),
            stockAlmacen: (value) => (value < 0 ? 'No puede ser negativo' : null),
        }
    });

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            // Empaquetamos exactamente como lo espera tu modelo Sequelize Consumible
            const payload = {
                nombre: values.nombre.trim(),
                tipo: naturaleza,      // 'fungible' o 'serializado' (viene del padre)
                categoria: categoria,  // Ej: 'pastillas de freno' (viene del padre)
                stockAlmacen: values.stockAlmacen,
                stockAsignado: 0,      // Siempre empieza en 0
                stockMinimo: values.stockMinimo,
                precioPromedio: values.precioPromedio,
                unidadMedida: values.unidadMedida,
                
                // 🔥 AQUÍ CONSTRUIMOS EL JSONB PARA EVITAR TABLAS EXTRA 🔥
                datosTecnicos: {
                    marca: values.marca.trim() || 'Genérica',
                    referencia: values.referenciaFabricante.trim() || 'N/A',
                    detallesExtra: values.especificacionesExtra.trim() || 'Sin detalles'
                }
            };

            // Ajusta esta ruta a tu endpoint real de creación de consumibles
            const res = await fetch('/api/inventario/consumibles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (result.success) {
                notifications.show({ title: 'Éxito', message: 'Repuesto registrado en inventario', color: 'green' });
                // Le pasamos el item nuevo al padre para que cierre el modal y actualice listas
                if (onSuccess) onSuccess(result.data); 
            } else {
                throw new Error(result.error || 'Fallo al registrar en base de datos');
            }
        } catch (error) {
            notifications.show({ title: 'Error de Servidor', message: error.message, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
                <Paper withBorder p="md" radius="md" bg="gray.0">
                    <Text size="sm" fw={700} mb="sm" tt="uppercase" c="dimmed">Datos Principales</Text>
                    <Stack gap="sm">
                        <TextInput
                            label="Nombre / Descripción del Repuesto"
                            placeholder="Ej: Pastillas de Freno Semimetálicas Eje Delantero"
                            withAsterisk
                            {...form.getInputProps('nombre')}
                        />
                        
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <Select
                                label="Unidad de Medida"
                                placeholder="Seleccione..."
                                withAsterisk
                                data={[
                                    { value: 'unidades', label: 'Unidades (Pzas)' },
                                    { value: 'litros', label: 'Litros (L)' },
                                    { value: 'galones', label: 'Galones (Gal)' },
                                    { value: 'kilogramos', label: 'Kilogramos (Kg)' },
                                    { value: 'metros', label: 'Metros (Mts)' }
                                ]}
                                {...form.getInputProps('unidadMedida')}
                            />
                            <NumberInput
                                label="Costo Promedio Estimado ($)"
                                placeholder="0.00"
                                min={0}
                                decimalScale={2}
                                prefix="$ "
                                withAsterisk
                                {...form.getInputProps('precioPromedio')}
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            {naturaleza === 'fungible' ? (
                                <NumberInput
                                    label="Stock Inicial (Almacén)"
                                    description="¿Cuánto hay en físico ahorita?"
                                    min={0}
                                    {...form.getInputProps('stockAlmacen')}
                                />
                            ) : (
                                <TextInput 
                                    label="Stock Inicial (Almacén)"
                                    description="Se carga al ingresar los seriales luego"
                                    value="0 (Por Seriales)"
                                    disabled
                                />
                            )}
                            <NumberInput
                                label="Alerta de Stock Mínimo"
                                description="Avisar cuando baje de esta cantidad"
                                min={0}
                                {...form.getInputProps('stockMinimo')}
                            />
                        </SimpleGrid>
                    </Stack>
                </Paper>

                <Paper withBorder p="md" radius="md" bg="blue.0" style={{ borderColor: '#a5d8ff' }}>
                    <Text size="sm" fw={700} mb="sm" tt="uppercase" c="blue.8">Detalles Técnicos (Opcional)</Text>
                    <Stack gap="sm">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <TextInput
                                label="Marca del Repuesto"
                                placeholder="Ej: Bendix, Bosch, Gates..."
                                {...form.getInputProps('marca')}
                            />
                            <TextInput
                                label="Referencia / Nro. Parte"
                                placeholder="Ej: D1369, 504129824..."
                                {...form.getInputProps('referenciaFabricante')}
                            />
                        </SimpleGrid>
                        <Textarea
                            label="Especificaciones Adicionales"
                            placeholder="Medidas, materiales, compatibilidad o notas para el mecánico..."
                            minRows={2}
                            {...form.getInputProps('especificacionesExtra')}
                        />
                    </Stack>
                </Paper>

                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" color="gray" onClick={onCancel} leftSection={<IconX size={16} />}>
                        Cancelar
                    </Button>
                    <Button type="submit" loading={loading} color="blue.7" leftSection={<IconCheck size={16} />}>
                        Guardar Repuesto
                    </Button>
                </Group>
            </Stack>
        </form>
    );
}