import React, { useEffect } from 'react';
import { TextInput, Button, Group, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import { AsyncCatalogComboBox } from '@/app/components/CatalogCombobox';
import { useRouter } from 'next/navigation';

// filepath: c:\Users\Hector Marrufo\Documents\App Web DADICA hector marrufo\WR\app\superuser\inventario\consumibles\nuevo\SensorForm.jsx

const SensorForm = ({ onSuccess, onCancel }) => {
    const router = useRouter();

    const form = useForm({
        initialValues: {
            marca: '',
            codigo: '',
        },
        validate: {
            marca: (value) => (value ? null : 'La marca es requerida'),
            codigo: (value) => (value ? null : 'El código es requerido'),
        },
    });

    useEffect(() => {
        console.log("Form values changed:", form.values);
    }, [form.values]);

    const handleSubmit = async (values) => {
        let payload = { ...values };
        try {
            const res = await axios.post('/api/inventario/sensores', payload);
            const createdSensor = res.data;
            
            form.reset();
            notifications.show({
                title: 'Éxito',
                message: 'Sensor creado exitosamente',
                color: 'green',
            });
            if (onSuccess) {
                onSuccess(createdSensor);
            } else {
                router.push('/superuser/inventario/consumibles');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            notifications.show({
                title: 'Error',
                message: `Hubo un error al crear el sensor, ${error.message}`,
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
                tipo='sensor'
            />
            
            <AsyncCatalogComboBox
                label="Código"
                placeholder="Ej. E3Z-D61"
                fieldKey="codigo"
                form={form}
                catalogo="codigos"
                tipo='sensor'
            />

            <Divider my={10} />

            <Group position="right" mt="md">
                {onCancel && <Button variant="outline" color="red" onClick={onCancel}>Cancelar</Button>}
                <Button type="submit">Guardar Sensor</Button>
            </Group>
        </form>
    );
};

export default SensorForm;