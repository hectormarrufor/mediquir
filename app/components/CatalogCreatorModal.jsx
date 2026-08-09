// components/CatalogCreatorModal.jsx
import { useEffect } from 'react';
import { Modal, TextInput, Button, Group, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';

export function CatalogCreatorModal({ opened, onClose, onConfirm, initialValue, catalogo }) {
  const form = useForm({
    initialValues: {
      nombre: '',
      telefono: '',
      direccion: '',
    },
    validate: {
      nombre: (value) => (value.length < 2 ? 'El nombre es muy corto' : null),
    },
  });

  // Cuando se abre el modal, pre-cargamos el nombre que el usuario escribió en el combo
  useEffect(() => {
    if (opened) {
      form.setValues({
        nombre: initialValue || '',
        telefono: '',
        direccion: '',
      });
    }
  }, [opened, initialValue]);

  const handleSubmit = (values) => {
    // Enviamos los datos al padre
    onConfirm(values);
    onClose();
    form.reset();
  };

  // Título dinámico según catálogo
  const title = catalogo === 'talleres' ? 'Registrar Nuevo Taller' : 'Nuevo Registro';

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label="Nombre"
            placeholder="Nombre del taller"
            withAsterisk
            data-autofocus
            {...form.getInputProps('nombre')}
          />
          
          {/* Renderizado condicional de campos extras para Talleres */}
          {catalogo === 'talleres' && (
            <>
              <TextInput
                label="Teléfono"
                placeholder="Ej: 0414-1234567"
                {...form.getInputProps('telefono')}
              />
              <TextInput
                label="Dirección"
                placeholder="Ej: Av. Intercomunal..."
                {...form.getInputProps('direccion')}
              />
            </>
          )}

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}