"use client";
import { useState, useMemo } from "react";
import {
  Button, Modal, SimpleGrid, Paper, Avatar, Text,
  Group, ActionIcon, Stack, Box, Card, TextInput, Tooltip, ScrollArea
} from "@mantine/core";
import { IconCheck, IconPlus, IconSearch, IconX, IconUsers } from "@tabler/icons-react";

export default function EmployeeSelector({ label = "Empleados", data = [], onChange, value = [] }) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");

  // Aseguramos que value sea siempre un array
  const selectedIds = Array.isArray(value) ? value : [];

  // Filtrado en tiempo real
  const filteredData = useMemo(() => {
    return data.filter((item) =>
      item.nombre.toLowerCase().includes(search.toLowerCase()) || 
      item.apellido?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  const handleSelect = (id) => {
    // Si ya existe, lo sacamos. Si no, lo metemos.
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(item => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  // Obtener objetos de empleados seleccionados para mostrar avatares
  const selectedEmployees = data.filter(d => selectedIds.includes(d.id));

  return (
    <Box>
      <Group justify="space-between" mb="xs">
        <Text fw={500} size="sm">{label} <span style={{color: 'red'}}>*</span></Text>
        <Button 
          variant="light" 
          size="compact-xs" 
          leftSection={<IconPlus size={14} />} 
          onClick={() => setOpened(true)}
        >
          {selectedIds.length > 0 ? "Editar selección" : "Seleccionar"}
        </Button>
      </Group>

      {/* MODAL DE SELECCIÓN MÚLTIPLE */}
      <Modal
        centered
        size="xl"
        opened={opened}
        onClose={() => setOpened(false)}
        title={`Seleccionar Personal (${selectedIds.length} seleccionados)`}
        zIndex={2000}
      >
        <Stack>
            <TextInput
            placeholder="Buscar empleado..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            autoFocus
            />
            
            {/* Botones de acción rápida dentro del modal */}
            {selectedIds.length > 0 && (
                <Group justify="flex-end">
                    <Button variant="subtle" color="red" size="xs" onClick={() => onChange([])}>
                        Limpiar selección
                    </Button>
                    <Button variant="filled" color="teal" size="xs" onClick={() => setOpened(false)}>
                        Listo
                    </Button>
                </Group>
            )}

            <ScrollArea.Autosize maxHeight={400}>
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                {filteredData.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    const fullName = `${item.nombre} ${item.apellido || ''}`;

                    return (
                    <Paper
                        key={item.id}
                        shadow={isSelected ? "xs" : "sm"}
                        p="md"
                        radius="md"
                        withBorder
                        onClick={() => handleSelect(item.id)}
                        style={{
                        cursor: "pointer",
                        position: "relative",
                        backgroundColor: isSelected ? "var(--mantine-color-blue-0)" : undefined,
                        borderColor: isSelected ? "var(--mantine-color-blue-filled)" : undefined,
                        transition: "all 0.2s"
                        }}
                    >
                        {isSelected && (
                        <ActionIcon color="blue" variant="filled" radius="xl" size="sm" style={{ position: "absolute", top: -8, right: -8, zIndex: 10 }}>
                            <IconCheck size={14} />
                        </ActionIcon>
                        )}

                        <Stack align="center" gap="xs">
                        <Avatar
                            size="lg"
                            src={item.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${item.imagen}` : null}
                            radius="xl"
                        />
                        <Box style={{ textAlign: 'center' }}>
                            <Text size="sm" fw={700} lineClamp={1}>{fullName}</Text>
                            <Text size="xs" c="dimmed">{item.cedula}</Text>
                        </Box>
                        </Stack>
                    </Paper>
                    );
                })}
                </SimpleGrid>
            </ScrollArea.Autosize>
        </Stack>
      </Modal>

      {/* VISUALIZACIÓN DE LA SELECCIÓN EN EL FORMULARIO */}
      {selectedIds.length > 0 ? (
        <Card p="sm" radius="md" withBorder>
            <Group justify="space-between">
                <Group gap="sm">
                     {/* Mostramos un grupo de avatares */}
                    <Avatar.Group spacing="sm">
                        {selectedEmployees.slice(0, 5).map(emp => (
                            <Tooltip key={emp.id} label={`${emp.nombre} ${emp.apellido}`}>
                                <Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} radius="xl" />
                            </Tooltip>
                        ))}
                        {selectedEmployees.length > 5 && (
                            <Avatar radius="xl">+{selectedEmployees.length - 5}</Avatar>
                        )}
                    </Avatar.Group>
                    <Box>
                        <Text size="sm" fw={700}>
                            {selectedEmployees.length === 1 
                                ? `${selectedEmployees[0].nombre} ${selectedEmployees[0].apellido}` 
                                : `${selectedEmployees.length} Empleados`
                            }
                        </Text>
                        {selectedEmployees.length > 1 && (
                            <Text size="xs" c="dimmed">Seleccionados para esta tarea</Text>
                        )}
                    </Box>
                </Group>

                <ActionIcon variant="subtle" color="red" onClick={() => onChange([])}>
                    <IconX size={16} />
                </ActionIcon>
            </Group>
        </Card>
      ) : (
        <Button variant="default" fullWidth onClick={() => setOpened(true)} style={{borderStyle: 'dashed'}} leftSection={<IconUsers size={16}/>}>
            Seleccionar grupo de trabajo
        </Button>
      )}
    </Box>
  );
}