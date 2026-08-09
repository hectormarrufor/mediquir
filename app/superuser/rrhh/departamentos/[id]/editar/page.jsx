// app/superuser/rrhh/departamentos/[id]/editar/page.jsx
'use client';
import { useState, useEffect, use } from 'react';
import DepartamentoForm from '../../components/DepartamentoForm';
import {SectionTitle} from '../../../../../components/SectionTitle';

export default function EditarDepartamentoPage({ params }) {
    const { id } = use(params);
    const [departamento, setDepartamento] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (id) {
            const fetchDepartamento = async () => {
                try {
                    const response = await fetch(`/api/rrhh/departamentos/${id}`);
                    if (!response.ok) {
                        throw new Error('Departamento no encontrado');
                    }
                    const data = await response.json();
                    setDepartamento(data);
                } catch (err) {
                    setError(err.message);
                } finally {
                    setLoading(false);
                }
            };
            fetchDepartamento();
        }
    }, [id]);

    if (loading) return <p>Cargando datos del departamento...</p>;
    if (error) return <p>Error: {error}</p>;

    return (
        <div>
            <SectionTitle title={`Editar Departamento: ${departamento?.nombre}`} />
            <DepartamentoForm initialData={departamento} isEdit={true} />
        </div>
    );
}