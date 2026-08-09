import { TextInput, Select, Button, Group, Divider, Box } from '@mantine/core';
import { useEffect, useState } from 'react';

const EspecificacionesEditor = ({ value, onChange }) => {
    const [especificaciones, setEspecificaciones] = useState(value || []);

    useEffect(() => {
        console.log(especificaciones);
    }, [especificaciones]);
    const updateEspecificacion = (index, key, val) => {
        const updated = [...especificaciones];
        updated[index][key] = val;
        setEspecificaciones(updated);
        onChange(updated);
    };

    const addEspecificacion = () => {
        setEspecificaciones([...especificaciones, { campo: '', tipoEntrada: '', opciones: [] }]);
    };

    const removeEspecificacion = (index) => {
        const updated = [...especificaciones];
        updated.splice(index, 1);
        setEspecificaciones(updated);
        onChange(updated); // 🔥 Esto es lo que actualiza el modal
        console.log('Especificación eliminada. Nuevo estado:', updated);
    };


    return (
        <div>
            {especificaciones.map((esp, index) => (
                <Box key={index}>
                    <Divider key={"div" + index} my="sm" />
                    <Group key={index} mt="sm">
                        <TextInput
                            placeholder="Campo"
                            value={esp.campo}
                            onChange={(e) => updateEspecificacion(index, 'campo', e.currentTarget.value)}
                        />
                        <Select
                            placeholder="Tipo"
                            data={['text', 'number', 'select', 'multiselect']}
                            value={esp.tipoEntrada}
                            onChange={(val) => updateEspecificacion(index, 'tipoEntrada', val)}
                        />
                        {(esp.tipoEntrada === 'select' || esp.tipoEntrada === 'multiselect') && (
                            <TextInput
                                placeholder="Opciones (coma separadas)"
                                value={esp.opciones?.join(',') || ''}
                                onChange={(e) =>
                                    updateEspecificacion(index, 'opciones', e.currentTarget.value.split(','))
                                }
                            />
                        )}
                        <Button color="red" onClick={() => removeEspecificacion(index)}>Eliminar</Button>
                    </Group>
                </Box>
            ))}
            <Button mt="md" onClick={addEspecificacion}>Agregar especificación</Button>
        </div>
    );
};
export default EspecificacionesEditor;

