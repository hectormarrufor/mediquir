// app/superuser/rrhh/departamentos/components/DepartamentoForm.jsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '../../../../components/BackButton';
import { Button, Center, Container, Flex, Paper, Textarea, TextInput, Title } from '@mantine/core';

export default function DepartamentoForm({ initialData = {}, isEdit = false }) {
    const [departamento, setDepartamento] = useState({
        nombre: '',
        descripcion: '',
        codigo: '',
    });
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (isEdit && initialData) {
            setDepartamento({
                nombre: initialData.nombre || '',
                descripcion: initialData.descripcion || '',
                codigo: initialData.codigo || '',
            });
        }
    }, [isEdit, initialData]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setDepartamento((prevState) => ({
            ...prevState,
            [name]: value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const apiUrl = isEdit ? `/api/rrhh/departamentos/${initialData.id}` : '/api/rrhh/departamentos';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const response = await fetch(apiUrl, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(departamento),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Algo salió mal');
            }

            // Aquí puedes añadir una notificación de éxito
            router.push('/superuser/rrhh/departamentos');
            router.refresh(); // Actualiza los datos en la página de lista
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Center style={{ minHeight: '100vh', padding: '2rem' }}>
            <Paper p={30} shadow="md" style={{ minWidth: 300 }}>
                <Title order={2} mb="md">
                    {isEdit ? 'Editar Departamento' : 'Crear Nuevo Departamento'} 
                </Title>
                <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow-md">
                    {error && <p className="text-red-500">{error}</p>}
                
                    <Container mt={10} >
                        <label htmlFor="nombre">Nombre del Departamento</label>
                        <TextInput
                            id="nombre"
                            name="nombre"
                            value={departamento.nombre}
                            onChange={handleChange}
                            required
                        />
                    </Container>
                    <Container mt={10}>
                        <label htmlFor="descripcion">Descripción</label>
                        <Textarea
                            id="descripcion"
                            name="descripcion"
                            value={departamento.descripcion}
                            onChange={handleChange}
                            rows="3"
                        ></Textarea>
                    </Container>
                    <Flex direction="row" justify="space-between" mt={10}>
                        <BackButton href="/superuser/rrhh/departamentos" />
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : (isEdit ? 'Actualizar Departamento' : 'Crear Departamento')}
                        </Button>
                    </Flex>
                </form>
            </Paper>
        </Center>
    );
}