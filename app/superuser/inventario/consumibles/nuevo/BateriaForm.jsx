import React, { useEffect } from 'react';
import { TextInput, Button, Group, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import { AsyncCatalogComboBox } from '@/app/components/CatalogCombobox';
import ImageDropzone from '@/app/superuser/flota/activos/components/ImageDropzone';
import { useRouter } from 'next/navigation';

const BateriaForm = ({ onSuccess, onCancel }) => {
    const router = useRouter();

    const form = useForm({
        initialValues: {
            marca: '',
            codigo: '',
            amperaje: '',
            voltaje: '',
        },
        validate: {
            marca: (value) => (value ? null : 'La marca es requerida'),
            codigo: (value) => (value ? null : 'El código es requerido'),
            amperaje: (value) => (value ? null : 'El amperaje es requerido'),
            voltaje: (value) => (value ? null : 'El voltaje es requerido'),
        },
    });

    useEffect(() => {
        console.log("Form values changed:", form.values);
    }, [form.values]);

    const handleSubmit = async (values) => {
        let payload = { ...values };
        try {
            // Adjust the API endpoint to match your backend route for batteries
            const res = await axios.post('/api/inventario/baterias', payload);
            const createdBateria = res.data;
            
            form.reset();
            notifications.show({
                title: 'Éxito',
                message: 'Batería creada exitosamente',
                color: 'green',
            });
            if (onSuccess) {
                onSuccess(createdBateria);
            } else {
                router.push('/superuser/inventario/consumibles');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            notifications.show({
                title: 'Error',
                message: `Hubo un error al crear la batería, ${error.message}`,
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
                tipo='bateria'
            />
            <AsyncCatalogComboBox
                label="Código"
                placeholder="Ingresa el código de la batería"
                fieldKey="codigo"
                form={form}
                catalogo="codigos" 
                tipo='bateria'
            />
            
            <Group grow>
                <TextInput
                    label="Amperaje"
                    placeholder="Ej. 700 CCA"
                    {...form.getInputProps('amperaje')}
                />
                <TextInput
                    label="Voltaje"
                    placeholder="Ej. 12V"
                    {...form.getInputProps('voltaje')}
                />
            </Group>

            <Divider my={10} />

            <Group position="right" mt="md">
                {onCancel && <Button variant="outline" color="red" onClick={onCancel}>Cancelar</Button>}
                <Button type="submit">Guardar Batería</Button>
            </Group>
        </form>
    );
};

export default BateriaForm;