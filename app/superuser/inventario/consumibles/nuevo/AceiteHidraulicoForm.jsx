import React, { useEffect } from 'react';
import { TextInput, Button, Group, Divider, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import { AsyncCatalogComboBox } from '@/app/components/CatalogCombobox';
import { useRouter } from 'next/navigation';

// filepath: c:\Users\Hector Marrufo\Documents\App Web DADICA hector marrufo\WR\app\superuser\inventario\consumibles\nuevo\AceiteHidraulicoForm.jsx

const AceiteHidraulicoForm = ({ onSuccess, onCancel }) => {
    const router = useRouter();

    const form = useForm({
        initialValues: {
            marca: '',
            viscosidad: '', // ISO VG 32, 46, 68, etc.
            tipo: '', // Mineral, Sintético, Biodegradable
            presentacion: '', // Litro, Galón, Tambor, Cubeta
        },
        validate: {
            marca: (value) => (value ? null : 'La marca es requerida'),
            viscosidad: (value) => (value ? null : 'La viscosidad es requerida'),
            tipo: (value) => (value ? null : 'El tipo de aceite es requerido'),
            presentacion: (value) => (value ? null : 'La presentación es requerida'),
        },
    });

    useEffect(() => {
        console.log("Form values changed:", form.values);
    }, [form.values]);

    const handleSubmit = async (values) => {
        let payload = { ...values };
        try {
            // Adjust the endpoint if necessary for hydraulic oils
            const res = await axios.post('/api/inventario/aceites', payload);
            const createdAceite = res.data;
            
            form.reset();
            notifications.show({
                title: 'Éxito',
                message: 'Aceite hidráulico creado exitosamente',
                color: 'green',
            });
            if (onSuccess) {
                onSuccess(createdAceite);
            } else {
                router.push('/superuser/inventario/consumibles');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            notifications.show({
                title: 'Error',
                message: `Hubo un error al crear el aceite, ${error.message}`,
                color: 'red',
            });
        }
    };

    return (
        <form onSubmit={(e) => {
                    // 1. Detiene la propagación para que no llegue al formulario padre (Vehículo)
                    e.stopPropagation(); 
                    
                    // 2. Ejecuta el submit de este formulario (Consumible)
                    form.onSubmit(handleSubmit)(e);
                }}>
            <AsyncCatalogComboBox
                label="Marca"
                placeholder="Selecciona una marca"
                fieldKey="marca"
                form={form}
                catalogo="marcas"
                tipo='aceite'
            />
            
            <Group grow>
                <AsyncCatalogComboBox
                    label="Viscosidad (ISO VG)"
                    placeholder="Ej. 68"
                    fieldKey="viscosidad"
                    form={form}
                    catalogo="viscosidades"
                    tipo='hidraulico' 
                />
                <Select
                    label="Tipo de Aceite"
                    data={['Mineral', 'Sintético', 'Biodegradable', 'Anti-desgaste (AW)']}
                    placeholder="Selecciona tipo..."
                    {...form.getInputProps('tipo')}
                />
            </Group>

            <TextInput
                label="Presentación"
                placeholder="Ej. Cubeta 19L, Tambor 200L"
                mt="sm"
                {...form.getInputProps('presentacion')}
            />

            <Divider my={10} />

            <Group position="right" mt="md">
                {onCancel && <Button variant="outline" color="red" onClick={onCancel}>Cancelar</Button>}
                <Button type="submit">Guardar Aceite Hidráulico</Button>
            </Group>
        </form>
    );
};

export default AceiteHidraulicoForm;