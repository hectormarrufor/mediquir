// app/superuser/rrhh/departamentos/components/DepartamentosTable.jsx
import Link from 'next/link';
import { FaPencilAlt, FaTrash } from 'react-icons/fa';
import { Button, Modal, Title } from '@mantine/core';
import { useState } from 'react';

export default function DepartamentosTable({ departamentos, onDelete, onEdit }) {
    if (!departamentos || departamentos.length === 0) {
        return <p>No hay departamentos registrados.</p>;
    }

    const [empleadosModal, setEmpleadosModal] =useState([]);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
                <thead>
                    <tr>
                        <th className="py-2 px-4 border-b">Nombre</th>
                        <th className="py-2 px-4 border-b">Código</th>
                        <th className="py-2 px-4 border-b">Descripción</th>
                        <th className="py-2 px-4 border-b">Nº Empleados</th>
                        <th className="py-2 px-4 border-b">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {departamentos.map((depto) => (
                        <tr key={depto.id}>
                            <td className="py-2 px-4 border-b">{depto.nombre}</td>
                            <td className="py-2 px-4 border-b">{depto.codigo || 'N/A'}</td>
                            <td className="py-2 px-4 border-b">{depto.descripcion}</td>
                            <td className="py-2 px-4 border-b text-center"><Button onClick={() => setEmpleadosModal(depto.puestos.map(puesto => puesto.empleados).flat())}>{depto.puestos.length > 0 && depto.puestos.map(puesto => puesto.empleados.length).reduce((acc, val) => acc + val, 0) || 0}</Button></td>
                            <td className="py-2 px-4 border-b">
                                <div className="flex items-center justify-center space-x-2">
                                    <Button onClick={() => onEdit(depto)} variant="outline" color="blue" title="Editar">
                                        <FaPencilAlt />
                                    </Button>
                                    <Button
                                        onClick={() => onDelete(depto)}
                                        className="text-red-500 hover:text-red-700"
                                        title="Eliminar"
                                    >
                                        <FaTrash />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <Modal opened={empleadosModal.length > 0} centered title="Lista de empleados" onClose={() => setEmpleadosModal([])}>
                {console.log(empleadosModal)}
                {empleadosModal &&
                empleadosModal.map(empleado => 
                   <Title><Link href={`/superuser/rrhh/empleados/${empleado.id}`}>{`${empleado.nombre} ${empleado.apellido}`}</Link></Title>
                )
                }



            </Modal>
        </div>
    );
}