"use client";
import { Box, Button, Paper, Title } from '@mantine/core'
import React, { useEffect, useState } from 'react'

const HorasTrabajadas = () => {
    const [horasTrabajadas, setHorasTrabajadas] = useState([])

    useEffect(() => {
        // Aquí puedes hacer fetch a la API para obtener las horas trabajadas
        async function fetchHoras() {
            try {
                const res = await fetch('/api/rrhh/empleados/1/horasTrabajadas')
                if (!res.ok) throw new Error('Error al obtener las horas trabajadas')
                const data = await res.json()
                setHorasTrabajadas(data)
            } catch (err) {
                console.error(err)
            }
        }

        fetchHoras()
    }, [])

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`/api/rrhh/empleados/${id}/horasTrabajadas`, {
                method: 'DELETE',
            })
            if (!res.ok) throw new Error('Error al eliminar la hora trabajada')
            setHorasTrabajadas(horasTrabajadas.filter(hora => hora.id !== id))
        }
        catch (err) {
            console.error(err)
        }
    }

    return (
        <Paper>
            <Title>
                HorasTrabajadarPaper
            </Title>
            {/* Aquí puedes renderizar las horas trabajadas en una tabla o lista */}
            {horasTrabajadas.map(hora => (
                <Paper key={hora.id} style={{ margin: '10px', padding: '10px' }}>
                    <p>Empleado ID: {hora.empleadoId}</p>
                    <p>Fecha: {new Date(hora.fecha).toLocaleDateString()}</p>
                    <p>Horas: {hora.horas}</p>
                    <p>Observaciones: {hora.observaciones}</p>
                    <Box mt={10}>
                        <Button variant="light" color="blue" size="xs" style={{ marginRight: 10 }}>
                            Editar
                        </Button>
                        <Button variant="light" onClick={() => handleDelete(hora.id)} color="red" size="xs">
                            Eliminar
                        </Button>
                    </Box>
                </Paper>
            ))}
        </Paper>


    )
}

export default HorasTrabajadas