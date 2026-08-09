import React, { useEffect, useState, useRef } from "react";
import {
    Button,
    Modal,
    SimpleGrid,
    Paper,
    Avatar,
    Text,
    Group,
    ActionIcon,
    Transition,
    Stack,
    Title,
    Card,
    Select,
    TextInput,
    Loader,
    ScrollArea,
} from "@mantine/core";
import { IconCheck, IconSearch } from "@tabler/icons-react";

/*
    ModalEquivalencias (replaced UI to Mantine, preserves original behavior)
    Props:
        - open: boolean
        - onClose: () => void
        - onConfirm: (selectedItems) => void
        - initialSelected: array of ids (optional)
    Notes:
        - Adjust API endpoints '/api/equivalencias' and '/api/equiv-filters' a tu backend.
*/

export default function ModalEquivalencias({
    open = false,
    onClose = () => { },
    onConfirm = () => { },
    tipo = "",
    initialSelected = [],
}) {
    const [filters, setFilters] = useState({ categorias: [], estados: [] });
    const [filterValues, setFilterValues] = useState({ categoria: "", estado: "", q: "" });
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(new Set(initialSelected));
    const mounted = useRef(true);
    const fetchController = useRef(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (fetchController.current) fetchController.current.abort();
        };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Construimos la URL con todos los filtros actuales, apuntando a consumibles generales
            const params = new URLSearchParams({
                tipoSpecifico: tipo, // 'Filtro', 'Sensor', 'Repuesto General', etc.
                search: filterValues.q,
                categoria: filterValues.categoria, 
                estado: filterValues.estado
            });

            const res = await fetch(`/api/inventario/consumibles?${params.toString()}`);
            if (!res.ok) throw new Error("Error al obtener equivalencias");

            const data = await res.json();

            if (!mounted.current) return;

            // Extraemos y mapeamos la información sin importar qué hijo sea
            const mapeados = (data.items || []).map(c => {
                const hijo = c[tipo] || c.Filtro || c.Sensor || c.Correa || c.RepuestoGeneral || c.datosTecnicos || {};
                return {
                    id: c.id,
                    nombre: c.nombre,
                    marca: hijo.marca || 'N/A',
                    codigo: hijo.codigo || 'N/A',
                    imagen: hijo.imagen || c.datosTecnicos?.imagen,
                    grupoEquivalenciaId: hijo.grupoEquivalenciaId || null,
                    categoria: c.categoria
                };
            });

            setItems(mapeados);

            // Solo actualizamos las opciones de los Selects la primera vez o si vienen de la API
            if (filters.categorias.length === 0) {
                setFilters({
                    categorias: data.categorias || [],
                    estados: data.estados || [],
                });
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setError(err.message);
            }
        } finally {
            if (mounted.current) setLoading(false);
        }
    };

    // Efecto para recargar cuando cambie cualquier filtro o se abra el modal
    useEffect(() => {
        if (open) {
            fetchData();
        }
    }, [open, filterValues.q, filterValues.categoria, filterValues.estado, tipo]);

    const toggleSelection = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                // OPCIONAL: Si quieres forzar selección única (ya que para el grupo basta con uno)
                return new Set([id]);
                // next.add(id);
            }
            return next;
        });
    };

    const handleSave = () => {
        // Obtenemos los objetos completos de los filtros seleccionados
        const selectedItems = Array.from(selected).map(id =>
            items.find(item => item.id === id)
        ).filter(Boolean); // Limpiamos posibles nulls

        // Enviamos el array de objetos al padre
        onConfirm(selectedItems);
        onClose();
    };

    return (
        <Modal
            centered
            opened={open}
            onClose={onClose}
            title={`Seleccionar equivalencias`}
            size="xl"
            h="85vh"
        >
            <Stack spacing="md" style={{ height: "100%" }}>
                <Group align="flex-end" spacing="sm">
                    <TextInput
                        icon={<IconSearch size={14} />}
                        placeholder="Buscar..."
                        value={filterValues.q}
                        onChange={(e) => {
                            const val = e.currentTarget.value; 
                            setFilterValues((s) => ({ ...s, q: val })); 
                        }}
                        sx={{ flex: 1 }}
                    />
                    <Select
                        data={[{ value: "", label: "Todas las categorías" }, ...filters.categorias.map((c) => ({ value: c.value, label: c.label }))]}
                        value={filterValues.categoria}
                        onChange={(val) => setFilterValues((s) => ({ ...s, categoria: val || "" }))}
                        sx={{ minWidth: 200 }}
                    />
                    <Select
                        data={[{ value: "", label: "Todos los estados" }, ...filters.estados.map((e) => ({ value: e.value, label: e.label }))]}
                        value={filterValues.estado}
                        onChange={(val) => setFilterValues((s) => ({ ...s, estado: val || "" }))}
                        sx={{ minWidth: 200 }}
                    />
                </Group>

                <Card withBorder radius="md" padding="sm" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    {loading && (
                        <Group position="center" style={{ flex: 1 }}>
                            <Loader />
                            <Text>Cargando...</Text>
                        </Group>
                    )}

                    {!loading && error && (
                        <Group position="center" style={{ flex: 1 }}>
                            <Text color="red">{error}</Text>
                        </Group>
                    )}

                    {!loading && !error && items.length === 0 && (
                        <Group position="center" style={{ flex: 1 }}>
                            <Text color="dimmed">No se encontraron equivalencias</Text>
                        </Group>
                    )}

                    {!loading && !error && items.length > 0 && (
                        <ScrollArea style={{ flex: 1 }}>
                            <SimpleGrid cols={3} spacing="md">
                                {items.map((item) => {
                                    const isSelected = selected.has(item.id);
                                    return (
                                        <Transition
                                            mounted
                                            transition="scale-y"
                                            duration={180}
                                            timingFunction="ease"
                                            key={item.id}
                                        >
                                            {(styles) => (
                                                <Paper
                                                    shadow={isSelected ? "xs" : "sm"}
                                                    padding="md"
                                                    radius="md"
                                                    withBorder
                                                    onClick={() => toggleSelection(item.id)}
                                                    style={{
                                                        ...styles,
                                                        cursor: "pointer",
                                                        position: "relative",
                                                        transform: isSelected ? "scale(0.98)" : "scale(1)",
                                                        borderColor: isSelected ? "green" : undefined,
                                                        transition: "transform 0.15s ease, border-color 0.15s ease",
                                                    }}
                                                >
                                                    {isSelected && (
                                                        <ActionIcon
                                                            color="green"
                                                            variant="filled"
                                                            radius="xl"
                                                            size="sm"
                                                            style={{
                                                                position: "absolute",
                                                                top: 8,
                                                                left: 8,
                                                                zIndex: 10,
                                                            }}
                                                        >
                                                            <IconCheck size={16} />
                                                        </ActionIcon>
                                                    )}

                                                    <Stack align="center">
                                                        <Avatar
                                                            src={`${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${item.imagen || ""}?v=${process.env.NEXT_PUBLIC_APP_VERSION}`}
                                                            alt={item.codigo}
                                                            radius="xl"
                                                            size={90}
                                                        >
                                                            {item.marca?.substring(0, 2).toUpperCase()}
                                                        </Avatar>
                                                        <Title order={5} weight={500} align="center" style={{ wordBreak: "break-word" }}>
                                                            {`${item.marca} ${item.codigo}`}
                                                        </Title>
                                                        {item.categoria && (
                                                            <Text size="sm" color="dimmed">
                                                                {item.categoria}
                                                            </Text>
                                                        )}
                                                    </Stack>
                                                </Paper>
                                            )}
                                        </Transition>
                                    );
                                })}
                            </SimpleGrid>
                        </ScrollArea>
                    )}
                </Card>

                <Group position="apart">
                    <Text size="sm">{Array.from(selected).length} seleccionadas</Text>
                    <Group>
                        <Button variant="default" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={Array.from(selected).length === 0}>
                            Confirmar
                        </Button>
                    </Group>
                </Group>

                {/* Lista de seleccionados (vista resumen) */}
                <SimpleGrid cols={3} spacing="sm" mt="sm">
                    {Array.from(selected).map((id) => {
                        const item = items.find((d) => d.id === id) || {};
                        return (
                            <Card key={id} padding="sm" radius="md" withBorder>
                                <Group>
                                    <Avatar
                                        src={`${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${item.imagen || ""}?v=${process.env.NEXT_PUBLIC_APP_VERSION}`}
                                        alt={item.nombre}
                                        radius="xl"
                                    >
                                        {item.marca?.substring(0, 2).toUpperCase()}
                                    </Avatar>
                                    <Text>{item.nombre || id}</Text>
                                </Group>
                            </Card>
                        );
                    })}
                </SimpleGrid>
            </Stack>
        </Modal>
    );
}