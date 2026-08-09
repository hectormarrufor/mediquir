'use client';

import { Box, Button, Center, Modal, Paper, Select, TextInput, Title } from '@mantine/core';
import { MantineReactTable } from 'mantine-react-table';
import React, { useEffect, useState } from 'react'
import EspecificacionesEditor from './EspecificacionesEditor';

const TiposConsumiblesPage = () => {
    const [loading, setLoading] = useState(true);
    const [tiposConsumibles, setTiposConsumibles] = useState([]);
    const [error, setError] = useState(null);
    const [createModal, setCreateModal] = useState(false);

    useEffect(() => {
        fetch('/api/inventario/tipo')
            .then(response => response.json())
            .then(data => {
                if (!data.success) throw new Error(data.message || 'Error fetching tipos de consumibles');
                console.log(data.data)
                setTiposConsumibles(data.data)
            })
            .catch(error => {
                console.error('Error fetching tipos de consumibles:', error)
                setError(error);
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <>
            {loading ?
                <Center h="94vh">
                    <Paper>Cargando tipos de consumibles...</Paper>

                </Center>

                : error ?
                    <Center h="94vh">
                        <Paper>Error cargando tipos de consumibles: {error.message}</Paper>
                    </Center> :
                    <Paper>
                        <Box p="md">

                            <Title order={2} mb="lg">
                                Lista de tipos de Consumibles
                            </Title>
                            <Button onClick={() => setCreateModal(true)}>Crear nuevo consumible</Button>
                        </Box>
                        <MantineReactTable
                            columns={[
                                {
                                    accessorKey: 'id',
                                    header: 'ID',
                                    size: 50,
                                    enableEditing: false,
                                },
                                {
                                    accessorKey: 'nombre',
                                    header: 'Nombre',
                                },
                                {
                                    accessorKey: 'unidadMedida',
                                    header: 'Unidad de Medida',
                                    Edit: ({ cell, row, column, table }) => (
                                        <Select
                                            label="Unidad de Medida"
                                            placeholder="Selecciona una unidad"
                                            data={[
                                                { value: 'Litros', label: 'Litros' },
                                                { value: 'Unidades', label: 'Unidades' },
                                                { value: 'Metros', label: 'Metros' },
                                                { value: 'Kilogramos', label: 'Kilogramos' },
                                            ]}
                                            value={cell.getValue() || ''}
                                            onChange={(val) => {
                                                // 🔥 Esto actualiza el estado interno de MantineReactTable
                                                row._valuesCache[column.id] = val;
                                                table.options.meta.updateData(row.index, column.id, val);
                                            }}
                                        />
                                    )
                                },
                                {
                                    accessorKey: 'especificaciones',
                                    header: 'Especificaciones',
                                    Edit: ({ cell, row, column, table }) => (
                                        <EspecificacionesEditor
                                            value={cell.getValue()}
                                            onChange={(val) => {
                                                // 🔥 Esto actualiza el estado interno de MantineReactTable
                                                row._valuesCache[column.id] = val;
                                                table.options.meta.updateData(row.index, column.id, val);
                                            }
                                            }
                                        />
                                    ),
                                    Cell: ({ cell }) => (
                                        <ul>
                                            {cell.getValue()?.map((esp, i) => (
                                                <li key={i}>
                                                    <strong>{esp.campo}</strong> ({esp.tipoEntrada})
                                                    {esp.opciones?.length > 0 && ` → ${esp.opciones.join(', ')}`}
                                                </li>
                                            ))}
                                        </ul>
                                    )
                                },
                                {
                                    accessorKey: 'atributosUso',
                                    header: 'Atributos de uso',
                                    Edit: ({ cell, row, column, table }) => (
                                        <EspecificacionesEditor
                                            value={cell.getValue()}
                                            onChange={(val) => {
                                                // 🔥 Esto actualiza el estado interno de MantineReactTabl
                                                // 
                                                row._valuesCache[column.id] = val;
                                                table.options.meta.updateData(row.index, column.id, val);
                                            }}
                                        />
                                    ),
                                    Cell: ({ cell }) => (
                                        <ul>
                                            {cell.getValue()?.map((esp, i) => (
                                                <li key={i}>
                                                    <strong>{esp.campo}</strong> ({esp.tipoEntrada})
                                                    {esp.opciones?.length > 0 && ` → ${esp.opciones.join(', ')}`}
                                                </li>
                                            ))}
                                        </ul>
                                    )
                                }

                            ]}
                            data={tiposConsumibles}
                            enableEditing
                            editDisplayMode="modal"

                            onEditingRowSave={({ values, row, table }) => {

                                const updatedTipos = tiposConsumibles.map((tipo, i) =>
                                    i === row.index ? { ...tipo, ...values } : tipo
                                );
                                setTiposConsumibles(updatedTipos);
                                // Aquí puedes hacer el PUT al backend
                                fetch(`/api/inventario/tipo/${values.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(values),
                                }).then(response => response.json())
                                    .then(data => {
                                        if (!data.success) {
                                            throw new Error(data.message || 'Error updating tipo de consumible');
                                        }
                                        console.log('Tipo de consumible actualizado:', data.data);
                                        // Cierra el modal
                                        table.setEditingRow(null);

                                    })
                                    .catch(error => {
                                        console.error('Error updating tipo de consumible:', error);
                                    });

                            }}

                            meta={{
                                updateData: (rowIndex, columnId, value) => {
                                    const updated = [...tiposConsumibles];
                                    updated[rowIndex] = { ...updated[rowIndex], [columnId]: value };

                                    console.log(`Fila ${rowIndex} actualizada:`, updated[rowIndex]);

                                    setTiposConsumibles(updated);
                                }
                            }}


                        />



                        <Modal opened={createModal} title="Crear nuevo tipo de consumible" centered onClose={() => setCreateModal(false)} size="lg">
                        </Modal>
                    </Paper>

            }
        </>
    )
}

export default TiposConsumiblesPage 