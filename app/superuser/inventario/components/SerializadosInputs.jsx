'use client';

import { useEffect } from 'react';
import { SimpleGrid, TextInput, Paper, Text, Stack, Group, ActionIcon, NumberInput } from '@mantine/core';
import { IconTrash, IconHistory, IconPlus } from '@tabler/icons-react'; // Agregué iconos faltantes
import { DatePickerInput } from '@mantine/dates';
import { AsyncCatalogComboBox } from '@/app/components/CatalogCombobox';

export default function SerializadosInputs({
    cantidad = 1,
    values = [],
    onChange, // Seguimos recibiendo onChange para serial, fecha, etc.
    esRecauchable = false,
    form // Recibimos el form para pasarlo al Combobox
}) {

    // 1. Sincronizar cantidad de inputs con el stock
    useEffect(() => {
        if (values.length !== cantidad) {
            const newValues = Array(cantidad).fill(null).map((_, index) => {
                return values[index] || {
                    serial: '',
                    fechaCompra: new Date(),
                    fechaVencimientoGarantia: null,
                    estado: 'almacen',
                    esRecauchado: false,
                    historialRecauchado: []
                };
            });
            onChange(newValues);
        }
    }, [cantidad]); // Eliminamos 'values' de dependencias para evitar loops infinitos

    const updateItem = (index, field, val) => {
        const newValues = [...values];
        newValues[index] = { ...newValues[index], [field]: val };
        onChange(newValues);
    };

    const addRecauchado = (index) => {
        const newValues = [...values];
        const currentHistory = newValues[index].historialRecauchado || [];

        newValues[index] = {
            ...newValues[index],
            esRecauchado: true,
            historialRecauchado: [
                ...currentHistory,
                {
                    fecha: new Date(),
                    costo: 0,
                    tallerNombre: '', // CAMPO VISUAL
                    tallerId: null,   // CAMPO LÓGICO (ID)
                    fechaVencimientoGarantia: null
                }
            ]
        };
        onChange(newValues);
    };

    const removeRecauchado = (itemIndex, recauchadoIndex) => {
        const newValues = [...values];
        const currentHistory = [...(newValues[itemIndex].historialRecauchado || [])];
        currentHistory.splice(recauchadoIndex, 1);

        newValues[itemIndex] = {
            ...newValues[itemIndex],
            historialRecauchado: currentHistory,
            // Si borra todos, ya no es recauchado
            esRecauchado: currentHistory.length > 0
        };
        onChange(newValues);
    };

    // Esta función solo la usaremos para campos simples (fecha, costo), 
    // el Taller lo manejará el Combobox directo con el form.
    const updateRecauchado = (itemIndex, recauchadoIndex, field, val) => {
        const newValues = [...values];
        const currentHistory = [...(newValues[itemIndex].historialRecauchado || [])];
        currentHistory[recauchadoIndex] = { ...currentHistory[recauchadoIndex], [field]: val };

        newValues[itemIndex] = { ...newValues[itemIndex], historialRecauchado: currentHistory };
        onChange(newValues);
    };

    return (
        <Stack gap="xs">
            {values.map((item, index) => (
                <Paper key={index} withBorder p="sm" bg="gray.0">
                    <Group justify="space-between" mb="xs">
                        <Text fw={700} size="sm" c="blue">Unidad #{index + 1}</Text>
                    </Group>

                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                        <TextInput
                            label="Serial / Código Único"
                            placeholder="Ej. SN-8844"
                            required
                            value={item.serial}
                            onChange={(e) => updateItem(index, 'serial', e.currentTarget.value)}
                        />

                        <DatePickerInput
                            label="Fecha de Compra"
                            placeholder="Seleccionar"
                            value={item.fechaCompra}
                            onChange={(date) => updateItem(index, 'fechaCompra', date)}
                            clearable
                        />

                        <DatePickerInput
                            label="Vencimiento Garantía"
                            placeholder="Opcional"
                            value={item.fechaVencimientoGarantia}
                            onChange={(date) => updateItem(index, 'fechaVencimientoGarantia', date)}
                            minDate={new Date()}
                            clearable
                        />
                    </SimpleGrid>

                    {esRecauchable && (
                        <Stack mt="md" gap="xs">
                            <Group justify="space-between">
                                <Text size="sm" fw={500}>Historial de Recauchado</Text>
                                <ActionIcon variant="light" color="blue" onClick={() => addRecauchado(index)} title="Añadir Recauchado">
                                    <IconPlus size={16} />
                                </ActionIcon>
                            </Group>

                            {(item.historialRecauchado || []).map((rec, rIndex) => (
                                <Paper key={rIndex} withBorder p="xs" bg="white">
                                    <Group justify="flex-end" mb={4}>
                                        <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removeRecauchado(index, rIndex)}>
                                            <IconTrash size={14} />
                                        </ActionIcon>
                                    </Group>
                                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="xs">
                                        <DatePickerInput
                                            label="Fecha"
                                            placeholder="Seleccionar"
                                            value={rec.fecha}
                                            onChange={(date) => updateRecauchado(index, rIndex, 'fecha', date)}
                                            clearable
                                        />
                                        <TextInput
                                            label="Costo"
                                            type="number"
                                            placeholder="0.00"
                                            value={rec.costo}
                                            onChange={(e) => updateRecauchado(index, rIndex, 'costo', e.currentTarget.value)}
                                        />

                                        {/* --- CORRECCIÓN CRÍTICA AQUÍ --- */}
                                        <AsyncCatalogComboBox
                                            label="Taller"
                                            placeholder="Seleccionar..."
                                            catalogo="talleres"
                                            form={form}
                                            // Campo Visual (Nombre)
                                            fieldKey={`itemsSerializados.${index}.historialRecauchado.${rIndex}.tallerNombre`}
                                            // Campo Lógico (ID)
                                            idFieldKey={`itemsSerializados.${index}.historialRecauchado.${rIndex}.tallerId`}
                                        />

                                        <DatePickerInput
                                            label="Venc. Garantía"
                                            placeholder="Opcional"
                                            value={rec.fechaVencimientoGarantia}
                                            onChange={(date) => updateRecauchado(index, rIndex, 'fechaVencimientoGarantia', date)}
                                            minDate={rec.fecha || new Date()}
                                            clearable
                                        />
                                    </SimpleGrid>
                                </Paper>
                            ))}
                            {(item.historialRecauchado || []).length === 0 && (
                                <Text size="xs" c="dimmed" fs="italic">No hay registros de recauchado.</Text>
                            )}
                        </Stack>
                    )}
                </Paper>
            ))}
        </Stack>
    );
}