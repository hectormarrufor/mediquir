"use client";

import { useEffect, useState } from "react";
import { 
    Container, Title, SimpleGrid, Paper, Text, Table, Badge, Stack, Group, Center, 
    Button, Modal, Avatar, ActionIcon, ScrollArea, Tooltip, Loader
} from "@mantine/core";
import { 
    IconShirt, IconShoe, IconAffiliate, IconExternalLink, 
    IconAlertCircle, IconEye, IconUsers 
} from "@tabler/icons-react";
import Link from "next/link";

export default function DotacionReportPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Estados para el Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [empleadosLista, setEmpleadosLista] = useState([]);
    
    // Contexto del modal (para el título)
    const [modalContext, setModalContext] = useState({ talla: "", categoria: "" });

    useEffect(() => {
        cargarReporte();
    }, []);

    const cargarReporte = () => {
        fetch("/api/rrhh/reporte-tallas")
            .then(res => res.json())
            .then(data => {
                setData(data);
                setLoading(false);
            });
    }

    // Función UNIFICADA para ver empleados (con talla X o sin talla)
    const handleVerDetalle = async (campo, valor, tituloCategoria) => {
        const esNulo = !valor || valor === "null";
        setModalContext({
            talla: esNulo ? "Sin Especificar" : valor,
            categoria: tituloCategoria,
            esNulo: esNulo
        });
        
        setModalOpen(true);
        setModalLoading(true);

        try {
            // Usamos encodeURIComponent para manejar tallas con caracteres raros si los hubiera
            const valorQuery = esNulo ? 'null' : encodeURIComponent(valor);
            const res = await fetch(`/api/rrhh/empleados-por-talla?campo=${campo}&valor=${valorQuery}`);
            const data = await res.json();
            setEmpleadosLista(data);
        } catch (error) {
            console.error("Error cargando empleados", error);
        } finally {
            setModalLoading(false);
        }
    };

    if (loading) return <Center h="50vh"><Loader /></Center>;
    if (!data) return <Center h="50vh"><Text>No hay datos disponibles</Text></Center>;

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="xl">Necesidades de Dotación (Personal Activo)</Title>

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
                <TallaCard
                    titulo="Calzado de Seguridad"
                    icon={<IconShoe size={24} />}
                    color="blue"
                    items={data.calzado}
                    keyName="tallaCalzado"
                    onVerDetalle={(talla) => handleVerDetalle("tallaCalzado", talla, "Calzado")}
                />

                <TallaCard
                    titulo="Camisas / Uniformes"
                    icon={<IconShirt size={24} />}
                    color="orange"
                    items={data.camisas}
                    keyName="tallaCamisa"
                    onVerDetalle={(talla) => handleVerDetalle("tallaCamisa", talla, "Camisas")}
                />

                <TallaCard
                    titulo="Pantalones"
                    icon={<IconAffiliate size={24} />}
                    color="teal"
                    items={data.pantalones}
                    keyName="tallaPantalon"
                    onVerDetalle={(talla) => handleVerDetalle("tallaPantalon", talla, "Pantalones")}
                />

                 <TallaCard
                    titulo="Bragas / Overoles"
                    icon={<IconAffiliate size={24} />}
                    color="grape"
                    items={data.bragas}
                    keyName="tallaBraga"
                    onVerDetalle={(talla) => handleVerDetalle("tallaBraga", talla, "Bragas")}
                />
            </SimpleGrid>

            {/* MODAL REUTILIZABLE */}
            <Modal 
                opened={modalOpen} 
                onClose={() => setModalOpen(false)} 
                title={
                    <Group gap="xs">
                        {modalContext.esNulo ? <IconAlertCircle color="orange" /> : <IconUsers color="#228be6" />}
                        <Text fw={700}>
                            {modalContext.esNulo 
                                ? `Empleados sin talla de ${modalContext.categoria}` 
                                : `Empleados con ${modalContext.categoria} Talla ${modalContext.talla}`
                            }
                        </Text>
                    </Group>
                }
                size="lg"
            >
                {modalLoading ? (
                    <Center p="xl"><Loader size="sm" /></Center>
                ) : empleadosLista.length === 0 ? (
                    <Text c="dimmed" ta="center" p="xl">No se encontraron empleados en este grupo.</Text>
                ) : (
                    <ScrollArea h={400}>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Empleado</Table.Th>
                                    <Table.Th>Cédula</Table.Th>
                                    <Table.Th style={{textAlign: 'right'}}>Perfil</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {empleadosLista.map(emp => (
                                    <Table.Tr key={emp.id}>
                                        <Table.Td>
                                            <Group gap="sm">
                                                <Avatar src={emp.imagen ? `${process.env.NEXT_PUBLIC_BLOB_BASE_URL}/${emp.imagen}` : null} radius="xl" size="sm" />
                                                <Text size="sm" fw={500}>{emp.nombre} {emp.apellido}</Text>
                                            </Group>
                                        </Table.Td>
                                        <Table.Td><Text size="sm">{emp.cedula}</Text></Table.Td>
                                        
                                        <Table.Td style={{textAlign: 'right'}}>
                                            <Button 
                                                component={Link} 
                                                href={modalContext.esNulo ? `/superuser/rrhh/empleados/${emp.id}/editar` : `/superuser/rrhh/empleados/${emp.id}`}
                                                variant="light" 
                                                size="xs"
                                                color={modalContext.esNulo ? "red" : "blue"}
                                                rightSection={<IconExternalLink size={14}/>}
                                            >
                                                {modalContext.esNulo ? "Asignar" : "Ver Perfil"}
                                            </Button>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                        <Text size="xs" c="dimmed" ta="right" mt="sm">Total: {empleadosLista.length} empleados</Text>
                    </ScrollArea>
                )}
            </Modal>
        </Container>
    );
}

// --- TARJETA INTELIGENTE ACTUALIZADA ---
function TallaCard({ titulo, icon, color, items, keyName, onVerDetalle }) {
    const totalItems = items?.reduce((acc, curr) => acc + parseInt(curr.total), 0) || 0;

    return (
        <Paper shadow="sm" p="md" withBorder radius="md" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Group mb="md" justify="space-between">
                <Group>
                    <Badge size="xl" circle color={color} variant="light">{icon}</Badge>
                    <Text fw={700} size="lg">{titulo}</Text>
                </Group>
                <Badge variant="outline" color={color}>{totalItems}</Badge>
            </Group>

            <ScrollArea h={250} type="auto">
                <Table verticalSpacing="xs" striped>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Talla</Table.Th>
                            <Table.Th ta="right">Cant.</Table.Th>
                            <Table.Th style={{width: 40}}></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {items?.map((item, index) => {
                            const isNull = !item[keyName] || item[keyName] === "null";
                            const valorTalla = isNull ? null : item[keyName];

                            return (
                                <Table.Tr key={index} bg={isNull ? 'red.0' : undefined}>
                                    <Table.Td>
                                        {isNull ? (
                                            <Text c="red" fw={700} size="sm">Sin Especificar</Text>
                                        ) : (
                                            <Text fw={600}>{valorTalla}</Text>
                                        )}
                                    </Table.Td>
                                    <Table.Td ta="right">
                                        <Badge variant={isNull ? "light" : "filled"} color={isNull ? "red" : "green"}>
                                            {item.total}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Tooltip size="lg" label="Ver lista de empleados">
                                            <ActionIcon 
                                                size="lg" 
                                                variant="subtle" 
                                                color={isNull ? "red" : "blue"}
                                                onClick={() => onVerDetalle(valorTalla)}
                                            >
                                               <IconEye size={20}  width={20}/>
                                            </ActionIcon>
                                        </Tooltip>
                                    </Table.Td>
                                </Table.Tr>
                            )
                        })}
                        {(!items || items.length === 0) && (
                            <Table.Tr>
                                <Table.Td colSpan={3} align="center"><Text c="dimmed" size="sm">No hay datos</Text></Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </ScrollArea>
        </Paper>
    );
}