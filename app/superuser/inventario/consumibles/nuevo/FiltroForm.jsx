import React, { useEffect, useState } from 'react';
import { TextInput, Select, Button, Group, Modal, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import { AsyncCatalogComboBox } from '@/app/components/CatalogCombobox';
import ODTSelectableGrid from '@/app/superuser/odt/ODTSelectableGrid';
import ImageDropzone from '@/app/superuser/flota/activos/components/ImageDropzone';
import { useRouter } from 'next/navigation';

const FiltroForm = ({ onSuccess, onCancel }) => {
    const router = useRouter();
    const [filtros, setFiltros] = useState([]);

    const form = useForm({
        initialValues: {
            marca: '',
            tipo: '',
            codigo: '',
            equivalencias: [],
            posicion: '',
            imagen: "",
        },
    });

    useEffect(() => {
        // Fetch existing filtros for equivalencias selection

        const fetchFiltros = async () => {
            try {
                const response = await axios.get(`/api/inventario/filtros/${form.values.tipo}`);
                setFiltros(response.data);
                console.log(response.data)
            } catch (error) {
                console.error('Error fetching filtros:', error);
            }
        };
        form.values.tipo?.length > 0 && fetchFiltros();
    }, [form.values.tipo]);

    useEffect(() => {
        console.log("Form values changed:", form.values);
    }, [form.values]);

    const handleSubmit = async (values) => {
        const {posicion, ...rest} = values;
        let payload = values.tipo === "combustible" ? {...rest, posicion} : {...rest};

        if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
                notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
                const imagenFile = values.imagen;
                const fileExtension = imagenFile.name.split('.').pop();
                const uniqueFilename = `${values.marca}${values.codigo}.${fileExtension}`;
        
                const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
                  method: 'POST',
                  body: imagenFile,
                });
                        console.log(response)
        
        
                if (!response.ok) console.log('Falló la subida de la imagen. Probablemente ya exista una con ese nombre.');
                const newBlob = await response.json();
                payload.imagen = uniqueFilename;
                notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida.', color: 'green' });
              }

        try {
            const res = await axios.post('/api/inventario/filtros', payload);
            const createdFiltro = res.data;
            // Handle success (e.g., show a success message or reset the form)
            form.reset();
            notifications.show({
                title: 'Éxito',
                message: 'Filtro creado exitosamente',
                color: 'green',
            });
            if (onSuccess) {
                // Si me pasaron onSuccess (estoy en Modal), lo ejecuto y le paso el objeto creado
                onSuccess(createdFiltro); 
            } else {
            router.push('/superuser/inventario/consumibles');
            }
        } catch (error) {
            // Handle error (e.g., show an error message)
            console.error('Error submitting form:', error);
            notifications.show({
                title: 'Error',
                message: `Hubo un error al crear el filtro, ${error.message}`,
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
            <Select
                label="Tipo"
                data={['aceite', 'aire', 'combustible', 'cabina']}
                {...form.getInputProps('tipo')}
            />
            {form.values.tipo === "combustible" && <Select
                label="Posición"
                data={['primario', 'secundario']}
                {...form.getInputProps('posicion')}
            />}
            <AsyncCatalogComboBox
                label="Marca"
                placeholder="Selecciona una marca"
                fieldKey="marca"
                form={form}
                catalogo="marcas"
                tipo='filtro'
            />
            <AsyncCatalogComboBox
                label="Código"
                placeholder="Ingresa el código del filtro"
                fieldKey="codigo"
                form={form}
                catalogo="codigos"
                tipo={
                    form.values.tipo === "aceite" ? 'filtroAceite' :
                    form.values.tipo === "aire" ? 'filtroAire' :
                    form.values.tipo === "combustible" ? 'filtroCombustible' :
                    form.values.tipo === "cabina" ? 'filtroCabina' :
                    '' 
                }
            />
            <ImageDropzone 
                label="Imagen del filtro"
                form={form}
                fieldPath="imagen"
            />
            {form.values.tipo &&
                <>
                    <Divider my={10} />
                    <ODTSelectableGrid
                        label="Equivalencias"
                        data={filtros}
                        onChange={(values) => form.setFieldValue("equivalencias", values)}
                    />
                </>
            }

            <Group position="right" mt="md">
                {onCancel && <Button variant="outline" color="red" onClick={onCancel}>Cancelar</Button>}
                <Button type="submit">Submit</Button>
            </Group>

        </form>

    );
};

export default FiltroForm;