'use client';

import React, { useEffect, useState } from 'react';
import {
  TextInput, Button, Group, Box, Paper, Title, Grid, Select, NumberInput,
  MultiSelect, Fieldset
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import '@mantine/dates/styles.css';
import ImageDropzone from '../../flota/activos/components/ImageDropzone';
import { actualizarSueldos } from '@/app/helpers/calcularSueldo';

export function EmpleadoForm({ initialData = null }) {
  const [puestos, setPuestos] = useState(null)
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm({
    initialValues: {
      cedula: initialData?.cedula || '',
      nombre: initialData?.nombre || '',
      apellido: initialData?.apellido || '',
      telefono: initialData?.telefono || '',
      direccion: initialData?.direccion || '',
      fechaIngreso: initialData?.fechaIngreso ? new Date(initialData.fechaIngreso) : null,
      fechaNacimiento: initialData?.fechaNacimiento ? new Date(initialData.fechaNacimiento) : null,
      fechaRetorno: initialData?.fechaRetorno ? new Date(initialData.fechaRetorno) : null,
      estado: initialData?.estado || 'Activo',
      puestos: initialData?.puestos.map(puesto => String(puesto.id)) || [],
      
      // Sueldos
      sueldo: initialData?.sueldo || 0,
      sueldoDiario: "", // Se calculan visualmente, aunque podrías inicializarlos si los guardas
      sueldoHorario: "",
      sueldoSemanal: "",
      sueldoMensual: "",
      tasaSueldo: initialData?.tasaSueldo || 'bcv',
      
      genero: initialData?.genero || '',
      notas: initialData?.notas || "",
      imagen: initialData?.imagen || null,

      // --- NUEVOS CAMPOS DE DOTACIÓN ---
      tallaCamisa: initialData?.tallaCamisa || null,
      tallaPantalon: initialData?.tallaPantalon || null,
      tallaCalzado: initialData?.tallaCalzado || null,
      tallaBraga: initialData?.tallaBraga || null,
    },
    validate: {
      cedula: (value) => value ? null : 'La cédula es requerida',
      nombre: (value) => value ? null : 'El nombre es requerido',
      apellido: (value) => value ? null : 'El apellido es requerido',
      telefono: (value) => (/^\d{4}\d{7}$/.test(value) ? null : 'Formato inválido (ej. 0412-1234567)'),
      fechaIngreso: (value) => value ? null : 'Fecha de contratación requerida',
      sueldo: (value) => value > 0 ? null : 'Sueldo debe ser mayor a 0',
      estado: (value) => value ? null : 'Estado requerido',
      fechaRetorno: (value, values) =>
        values.estado == 'Vacaciones' || values.estado == 'Permiso' || values.estado == 'Suspendido' ? (value ? null : 'Fecha de retorno requerida si el empleado está en Vacaciones, Permiso o Suspendido') : null,
      genero: (value) => (value === 'Masculino' || value === 'Femenino' ? null : 'Selecciona el género'),
      tasaSueldo: (value) => (value === 'bcv' || value === 'euro' || value === 'usdt' ? null : 'Selecciona la tasa de sueldo'),
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const puestos = await fetch('/api/rrhh/puestos/');
        const res = await puestos.json();
        setPuestos(res.map(puesto => { return ({ label: puesto.nombre, value: String(puesto.id) }) }));
      } catch (error) {
        notifications.show({ title: `no se pudo obtener los puestos: ${error.message}` })
      }
    })();
    
    // Si hay initialData y quieres recalcular los sueldos visuales al cargar:
    if (initialData?.sueldo) {
        handleSueldo('mensual', initialData.sueldo);
    }
  }, []);

  // Debugger opcional
  // useEffect(() => { console.log(form.values); }, [form])

  const handleSubmit = async (values) => {
    setIsLoading(true);
    let payload = {
      ...values,
      fechaIngreso: values.fechaIngreso?.toISOString().split('T')[0] ?? null,
      fechaNacimiento: values.fechaNacimiento?.toISOString().split('T')[0] ?? null,
      fechaRetorno: values.fechaRetorno?.toISOString().split('T')[0] ?? null,
    };

    try {
      if (values.imagen && typeof values.imagen.arrayBuffer === 'function') {
        notifications.show({ id: 'uploading-image', title: 'Subiendo imagen...', message: 'Por favor espera.', loading: true });
        const imagenFile = values.imagen;
        const fileExtension = imagenFile.name.split('.').pop();
        const uniqueFilename = `${values.cedula}.${fileExtension}`;

        const response = await fetch(`/api/upload?filename=${encodeURIComponent(uniqueFilename)}`, {
          method: 'POST',
          body: imagenFile,
        });

        if (!response.ok) console.log('Falló la subida de la imagen. Probablemente ya exista una con ese nombre.');
        // const newBlob = await response.json(); // Si usas Vercel Blob o similar
        payload.imagen = uniqueFilename;
        notifications.update({ id: 'uploading-image', title: 'Éxito', message: 'Imagen subida.', color: 'green' });
      }

      const isEditing = Boolean(initialData);
      const url = isEditing
        ? `/api/rrhh/empleados/${initialData.id}`
        : '/api/rrhh/empleados';

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) throw new Error((await response.json()).message || response.statusText);

      notifications.show({
        title: 'Éxito',
        message: isEditing ? 'Empleado actualizado exitosamente' : 'Empleado registrado exitosamente',
        color: 'green',
      });

      router.push(isEditing ? `/superuser/rrhh/empleados/${initialData.id}` : '/superuser/rrhh/empleados');
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Error al procesar: ${error.message}`,
        color: 'red',
      });
    }
    finally {
      setIsLoading(false);
    }
  }

  const handleSueldo = (campo, valor) => {
    const {mensual, semanal, diario, horario} = actualizarSueldos(campo, valor)
    form.setValues({
      sueldo: mensual,
      sueldoDiario: diario,
      sueldoSemanal: semanal,
      sueldoHorario: horario,
    })
  }

  return (
    <Box maw={800} mx="auto">
      <Paper shadow="md" p={30} mt={30} radius="md">

        <form onSubmit={form.onSubmit(handleSubmit)}>

          <Grid gutter="md">
            {/* --- DATOS PERSONALES --- */}
            <Grid.Col span={12}>
              <TextInput label="Nombre" placeholder="Nombre" {...form.getInputProps('nombre')} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label="Apellido" placeholder="Apellido" {...form.getInputProps('apellido')} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label="Cedula" placeholder="Cedula" {...form.getInputProps('cedula')} />
            </Grid.Col>
            <Grid.Col span={12}>
              <TextInput label="Telefono" placeholder="Telefono" {...form.getInputProps('telefono')} />
            </Grid.Col>

            <Grid.Col span={12}>
              <ImageDropzone
                label="Foto del Empleado"
                form={form}
                fieldPath="imagen"
              />
            </Grid.Col>

            {/* --- PUESTOS --- */}
            <Grid.Col span={12}>
              {puestos && <MultiSelect
                label="Puestos"
                data={puestos}
                {...form.getInputProps('puestos')}
              />}
            </Grid.Col>

            {/* --- SUELDOS --- */}
            <Grid.Col span={12}>
              <NumberInput 
                label="Sueldo Mensual" 
                min={0} 
                step={1} 
                {...form.getInputProps('sueldo')} 
                onChange={(value) => handleSueldo("mensual", value)}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Select
                label="Tasa de Sueldo"
                placeholder="Selecciona la tasa de sueldo"
                data={[
                  { value: 'bcv', label: 'BCV' },
                  { value: 'euro', label: 'Euro' },
                  { value: 'usdt', label: 'USDT' },
                ]}
                {...form.getInputProps('tasaSueldo')}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <NumberInput
                label="Sueldo por hora" 
                min={0} 
                step={1} 
                {...form.getInputProps('sueldoHorario')} 
                onChange={(value) => handleSueldo("horario", value)}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <NumberInput 
                label="Sueldo por dia" 
                min={0} 
                step={1} 
                {...form.getInputProps('sueldoDiario')}
                onChange={(value) => handleSueldo("diario", value)}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <NumberInput 
                label="Sueldo por semana" 
                min={0} 
                step={1} 
                {...form.getInputProps('sueldoSemanal')} 
                onChange={(value) => handleSueldo("semanal", value)}
              />
            </Grid.Col>

            {/* --- OTROS --- */}
            <Grid.Col span={12}>
              <TextInput label="Dirección" placeholder="Calle, ciudad, país" {...form.getInputProps('direccion')} />
            </Grid.Col>
            <Grid.Col span={6}>
              <DateInput label="Fecha de Contratación" valueFormat="DD/MM/YYYY" {...form.getInputProps('fechaIngreso')} />
            </Grid.Col>
            <Grid.Col span={6}>
              <DateInput label="Fecha de Nacimiento" valueFormat="DD/MM/YYYY" {...form.getInputProps('fechaNacimiento')} />
            </Grid.Col>
            <Grid.Col span={6}>
              <Select
                label="Estado"
                placeholder="Selecciona estado"
                data={['Activo', 'Inactivo', 'Suspendido', 'Vacaciones', 'Permiso', 'Retirado', 'Reposo Medico']}
                {...form.getInputProps('estado')}
              />
            </Grid.Col>
            {(form.values.estado == 'Vacaciones' || form.values.estado == 'Permiso' || form.values.estado == 'Suspendido') && (
              <Grid.Col span={6}>
                <DateInput
                  label="Fecha de Retorno"
                  valueFormat="DD/MM/YYYY"
                  {...form.getInputProps('fechaRetorno')}
                />
              </Grid.Col>
            )}
            <Grid.Col span={6}>
              <Select
                label="Género"
                placeholder="Selecciona género"
                data={['Masculino', 'Femenino']}
                {...form.getInputProps('genero')}
              />
            </Grid.Col>

            {/* --- NUEVA SECCIÓN: TALLAS Y DOTACIÓN --- */}
            <Grid.Col span={12}>
              <Fieldset legend="Dotación y Tallas" mt="md">
                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <Select
                      label="Talla Camisa"
                      placeholder="Ej: L"
                      data={['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']}
                      {...form.getInputProps('tallaCamisa')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <TextInput
                      label="Talla Pantalón"
                      placeholder="Ej: 34"
                      {...form.getInputProps('tallaPantalon')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <NumberInput
                      label="Talla Calzado"
                      placeholder="Ej: 42"
                      min={30}
                      max={50}
                      {...form.getInputProps('tallaCalzado')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <NumberInput
                      label="Talla Braga"
                      placeholder="Ej: 42"
                      min={35}
                      max={55}
                      {...form.getInputProps('tallaBraga')}
                    />
                  </Grid.Col>
                </Grid>
              </Fieldset>
            </Grid.Col>

          </Grid>

          <Group justify="flex-end" mt="xl">
            <Button variant="default" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" loading={isLoading} color="blue">
              {initialData ? 'Actualizar Empleado' : 'Registrar Empleado'}
            </Button>
          </Group>
        </form>
      </Paper>
    </Box>
  );
}