// app/superuser/rrhh/departamentos/page.jsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FaPlus } from 'react-icons/fa';
import DepartamentosTable from './components/DepartamentosTable';
import {SectionTitle} from '../../../components/SectionTitle';
import DeleteModal from '../../DeleteModal'; // Reutilizamos el modal de eliminación
import { Button, Modal, Paper, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';

export default function DepartamentosPage() {
    const [departamentos, setDepartamentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [modalIsOpen, setModalIsOpen] = useState(false);
    const [selectedDepartamento, setSelectedDepartamento] = useState(null);
    const [editModalIsOpen, setEditModalIsOpen] = useState(false);

    const fetchDepartamentos = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/rrhh/departamentos');
            if (!response.ok) {
                throw new Error('Error al obtener los departamentos');
            }
            const data = await response.json();
            setDepartamentos(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartamentos();
    }, []);

    const openModal = (departamento) => {
        setSelectedDepartamento(departamento);
        setModalIsOpen(true);
    };

    const closeModal = () => {
        setSelectedDepartamento(null);
        setModalIsOpen(false);
    };

    const handleDelete = async () => {
        if (!selectedDepartamento) return;
        try {
            const response = await fetch(`/api/rrhh/departamentos/${selectedDepartamento.id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al eliminar el departamento');
            }
            
            // Refrescar la lista de departamentos
            fetchDepartamentos();
            closeModal();
            // Aquí puedes añadir una notificación de éxito (ej. con react-toastify)
        } catch (err) {
            setError(err.message);
            // Puedes mostrar el error en una notificación
            console.error('Error al eliminar:', err.message);
        }
    };

    const handleEdit = (departamento) => {
        // Lógica para manejar la edición del departamento
        setEditModalIsOpen(true);
        setSelectedDepartamento(departamento);

    }
    const onConfirmEdit = async (updatedDepartamento) => {
        try {
            const response = await fetch(`/api/rrhh/departamentos/${updatedDepartamento.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({nombre: updatedDepartamento.nombre, descripcion: updatedDepartamento.descripcion }),
            }); 
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al actualizar el departamento');
            }
            // Refrescar la lista de departamentos
            fetchDepartamentos();
            // Aquí puedes añadir una notificación de éxito+
            notifications.show({
                title: 'Departamento actualizado',
                message: `El departamento "${updatedDepartamento.nombre}" ha sido actualizado exitosamente.`,
                color: 'green',
            });
        } catch (err) {
            setError(err.message);
            console.error('Error al actualizar:', err.message);
        }
    };

    if (loading) return <p>Cargando departamentos...</p>;
    if (error) return <p>Error: {error}</p>;

    return (
        <Paper mt={60}>
            <SectionTitle title="Gestión de Departamentos" />
            <div className="mb-4">
                <Link href="/superuser/rrhh/departamentos/nuevo" className="btn btn-primary">
                    <FaPlus className="mr-2" />
                    Nuevo Departamento
                </Link>
            </div>
            <DepartamentosTable
                departamentos={departamentos}
                onDelete={openModal}
                onEdit={handleEdit }
            />
            {selectedDepartamento && (
                <DeleteModal
                    opened={modalIsOpen}
                    onClose={closeModal}
                    onConfirm={handleDelete}
                    title="Confirmar Eliminación"
                    object={selectedDepartamento.nombre}
                    message={`¿Estás seguro de que quieres eliminar el departamento "${selectedDepartamento.nombre}"? Esta acción no se puede deshacer.`}
                />
            )}
            <Modal centered opened={editModalIsOpen} onClose={() => setEditModalIsOpen(false)} title="Editar Departamento">
                {/* Aquí iría el formulario de edición */}
                <p>Formulario de edición para {selectedDepartamento?.nombre} (pendiente de implementar)</p>
                {console.log(selectedDepartamento)}
                <TextInput label="Nombre" placeholder="Editar nombre..." defaultValue={selectedDepartamento?.nombre} onChange={(e) => setSelectedDepartamento({...selectedDepartamento, nombre: e.target.value})}/>
                <Textarea label="Descripción" placeholder="Editar descripción..." defaultValue={selectedDepartamento?.descripcion} onChange={(e) => setSelectedDepartamento({...selectedDepartamento, descripcion: e.target.value})}/>
                <Button mt={15} onClick={() => {onConfirmEdit(selectedDepartamento)}}>Guardar Cambios</Button>
            </Modal>

        </Paper>
    );
}