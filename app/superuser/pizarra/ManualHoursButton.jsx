"use client";

import { useState, useEffect } from "react";
import {
  Button, Modal, NumberInput, Textarea, Stack, Group, LoadingOverlay,
  Title, Text, Alert
} from "@mantine/core";
import { DateInput, TimeInput } from "@mantine/dates";
import { IconClockPlus, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import EmployeeSelector from "./EmployeeSelector"; 
import { useAuth } from "@/hooks/useAuth";

export default function ManualHoursButton() {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const { userId } = useAuth();

  // Estado del Formulario
  const [form, setForm] = useState({
    empleadoIds: [], // <--- AHORA ES UN ARRAY
    fecha: new Date(),
    horas: 8,
    inicio: "08:00",
    fin: "16:00",
    observaciones: ""
  });

  // Cargar empleados
  useEffect(() => {
    if (opened && employees.length === 0) {
      setLoading(true);
      fetch("/api/rrhh/empleados")
        .then((res) => res.json())
        .then((data) => setEmployees(Array.isArray(data) ? data : []))
        .catch((err) => console.error("Error cargando empleados", err))
        .finally(() => setLoading(false));
    }
  }, [opened]);

  // Calcular horas
  useEffect(() => {
    const calcularHoras = (inicio, fin) => {
      if(!inicio || !fin) return 0;
      const [hIn, mIn] = inicio.split(':').map(Number);
      const [hOut, mOut] = fin.split(':').map(Number);
      let entrada = hIn * 60 + mIn;
      let salida = hOut * 60 + mOut;
      if (salida < entrada) salida += 24 * 60;
      return (salida - entrada) / 60;
    };

    const horasCalculadas = calcularHoras(form.inicio, form.fin);
    setForm((prev) => ({ ...prev, horas: horasCalculadas }));
  }, [form.inicio, form.fin]);

  // Manejo de envío MÚLTIPLE
  const handleSubmit = async () => {
    // Validaciones
    if (form.empleadoIds.length === 0) {
      return notifications.show({ title: 'Error', message: 'Debes seleccionar al menos un empleado', color: 'red' });
    }
    if (!form.fecha) {
      return notifications.show({ title: 'Error', message: 'La fecha es obligatoria', color: 'red' });
    }
    if (form.horas <= 0) {
      return notifications.show({ title: 'Error', message: 'Las horas deben ser mayor a 0', color: 'red' });
    }

    setLoading(true);
    try {
      // Preparamos los datos base
      const basePayload = {
        fecha: form.fecha.toISOString().split('T')[0],
        horas: form.horas,
        inicio: form.inicio, // Si tu backend lo soporta
        fin: form.fin,       // Si tu backend lo soporta
        observaciones: form.observaciones,
        creadorId: userId
      };

      // Creamos un array de promesas (una petición por cada empleado seleccionado)
      const promesas = form.empleadoIds.map(empId => {
        return fetch("/api/rrhh/horas-manuales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...basePayload,
                empleadoId: empId // Asignamos el ID individual
            }),
        }).then(async (res) => {
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || `Fallo al guardar empleado ID ${empId}`);
            }
            return res.json();
        });
      });

      // Ejecutamos todas las peticiones en paralelo
      await Promise.all(promesas);

      notifications.show({ 
          title: 'Éxito', 
          message: `Se registraron horas para ${form.empleadoIds.length} empleados correctamente.`, 
          color: 'green' 
      });

      // Reset y Cerrar
      setForm({ empleadoIds: [], fecha: new Date(), horas: 8, inicio: "08:00", fin: "16:00", observaciones: "" });
      setOpened(false);
      window.location.reload();

    } catch (error) {
      console.error(error);
      notifications.show({ title: 'Error Parcial o Total', message: error.message, color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        leftSection={<IconClockPlus size={18} />}
        onClick={() => setOpened(true)}
        color="teal"
      >
        Registrar Horas
      </Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Registro de Horas (Individual o Grupal)"
        centered
        size="lg"
      >
        <Stack pos="relative">
          <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />

          {/* 1. SELECTOR DE EMPLEADOS MÚLTIPLE */}
          <EmployeeSelector
            label="Personal Asignado"
            data={employees}
            value={form.empleadoIds}
            onChange={(ids) => setForm({ ...form, empleadoIds: ids })}
          />
          
          {form.empleadoIds.length > 1 && (
            <Alert variant="light" color="blue" title="Modo Grupal" icon={<IconInfoCircle />}>
                Se creará un registro individual de <b>{form.horas} horas</b> para cada uno de los <b>{form.empleadoIds.length} empleados</b> seleccionados con la misma observación.
            </Alert>
          )}

          <Group grow>
            {/* 2. FECHA */}
            <DateInput
                label="Fecha"
                placeholder="Selecciona fecha"
                value={form.fecha}
                onChange={(date) => setForm({ ...form, fecha: date })}
                withAsterisk
            />
            {/* 3. CANTIDAD DE HORAS */}
            <NumberInput
                disabled
                label="Total Horas"
                value={form.horas}
                onChange={(val) => setForm({ ...form, horas: val })}
                min={0.5}
                max={24}
                step={0.5}
                withAsterisk
            />
          </Group>

          <Group grow>
            <TimeInput
                label="Hora inicio"
                value={form.inicio}
                onChange={(e) => setForm({ ...form, inicio: e.currentTarget.value })}
            />
            <TimeInput
                label="Hora fin"
                value={form.fin}
                onChange={(e) => setForm({ ...form, fin: e.currentTarget.value })}
            />
          </Group>

          {/* 4. OBSERVACIONES */}
          <Textarea
            label="Tarea / Observaciones"
            placeholder="Ej: Mantenimiento preventivo de unidad..."
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.currentTarget.value })}
            minRows={3}
          />
          
          <Title order={6} c="dimmed" ta="center" mt="sm">
            Registrando como: {employees.find(emp => emp.usuario?.id === userId)?.nombre || 'Administrador'}
          </Title>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} color="teal" loading={loading}>
                {form.empleadoIds.length > 1 ? `Registrar a ${form.empleadoIds.length} Empleados` : "Guardar Registro"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}